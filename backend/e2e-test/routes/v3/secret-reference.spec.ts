import { createFolder, deleteFolder } from "e2e-test/testUtils/folders";
import { createSecretImport, deleteSecretImport } from "e2e-test/testUtils/secret-imports";
import { createSecretV2, deleteSecretV2, getSecretByNameV2, getSecretsV2 } from "e2e-test/testUtils/secrets";

import { seedData1 } from "@app/db/seed-data";

describe("Secret expansion", () => {
  const projectId = seedData1.projectV3.id;

  beforeAll(async () => {
    const prodRootFolder = await createFolder({
      authToken: jwtAuthToken,
      environmentSlug: "prod",
      workspaceId: projectId,
      secretPath: "/",
      name: "deep"
    });

    await createFolder({
      authToken: jwtAuthToken,
      environmentSlug: "prod",
      workspaceId: projectId,
      secretPath: "/deep",
      name: "nested"
    });

    return async () => {
      await deleteFolder({
        authToken: jwtAuthToken,
        secretPath: "/",
        id: prodRootFolder.id,
        workspaceId: projectId,
        environmentSlug: "prod"
      });
    };
  });

  test("Local secret reference", async () => {
    const secrets = [
      {
        environmentSlug: seedData1.environment.slug,
        workspaceId: projectId,
        secretPath: "/",
        authToken: jwtAuthToken,
        key: "HELLO",
        value: "world"
      },
      {
        environmentSlug: seedData1.environment.slug,
        workspaceId: projectId,
        secretPath: "/",
        authToken: jwtAuthToken,
        key: "TEST",
        // eslint-disable-next-line
        value: "hello ${HELLO}"
      }
    ];

    for (const secret of secrets) {
      // eslint-disable-next-line no-await-in-loop
      await createSecretV2(secret);
    }

    const expandedSecret = await getSecretByNameV2({
      environmentSlug: seedData1.environment.slug,
      workspaceId: projectId,
      secretPath: "/",
      authToken: jwtAuthToken,
      key: "TEST"
    });
    expect(expandedSecret.secretValue).toBe("hello world");

    const listSecrets = await getSecretsV2({
      environmentSlug: seedData1.environment.slug,
      workspaceId: projectId,
      secretPath: "/",
      authToken: jwtAuthToken
    });
    expect(listSecrets.secrets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          secretKey: "TEST",
          secretValue: "hello world"
        })
      ])
    );

    await Promise.all(secrets.map((el) => deleteSecretV2(el)));
  });

  test("Cross environment secret reference", async () => {
    const secrets = [
      {
        environmentSlug: "prod",
        workspaceId: projectId,
        secretPath: "/deep",
        authToken: jwtAuthToken,
        key: "DEEP_KEY_1",
        value: "testing"
      },
      {
        environmentSlug: "prod",
        workspaceId: projectId,
        secretPath: "/deep/nested",
        authToken: jwtAuthToken,
        key: "NESTED_KEY_1",
        value: "reference"
      },
      {
        environmentSlug: "prod",
        workspaceId: projectId,
        secretPath: "/deep/nested",
        authToken: jwtAuthToken,
        key: "NESTED_KEY_2",
        // eslint-disable-next-line
        value: "secret ${NESTED_KEY_1}"
      },
      {
        environmentSlug: seedData1.environment.slug,
        workspaceId: projectId,
        secretPath: "/",
        authToken: jwtAuthToken,
        key: "KEY",
        // eslint-disable-next-line
        value: "hello ${prod.deep.DEEP_KEY_1} ${prod.deep.nested.NESTED_KEY_2}"
      }
    ];

    for (const secret of secrets) {
      // eslint-disable-next-line no-await-in-loop
      await createSecretV2(secret);
    }

    const expandedSecret = await getSecretByNameV2({
      environmentSlug: seedData1.environment.slug,
      workspaceId: projectId,
      secretPath: "/",
      authToken: jwtAuthToken,
      key: "KEY"
    });
    expect(expandedSecret.secretValue).toBe("hello testing secret reference");

    const listSecrets = await getSecretsV2({
      environmentSlug: seedData1.environment.slug,
      workspaceId: projectId,
      secretPath: "/",
      authToken: jwtAuthToken
    });
    expect(listSecrets.secrets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          secretKey: "KEY",
          secretValue: "hello testing secret reference"
        })
      ])
    );

    await Promise.all(secrets.map((el) => deleteSecretV2(el)));
  });

  test("Literal '::' in a secret value is preserved, not treated as a cross-project reference", async () => {
    // A value that merely *contains* "::" (a JDBC-style template) is not a cross-project
    // reference. Widening the interpolation character class to include ":" made the resolver
    // treat "db" as a project slug, which fails closed and 403s the whole folder read.
    const secret = {
      environmentSlug: "prod",
      workspaceId: projectId,
      secretPath: "/",
      authToken: jwtAuthToken,
      key: "JDBC_TEMPLATE",
      // eslint-disable-next-line
      value: "jdbc:${db::main.host}/mydb"
    };

    await createSecretV2(secret);

    try {
      const listSecrets = await getSecretsV2({
        environmentSlug: "prod",
        workspaceId: projectId,
        secretPath: "/",
        authToken: jwtAuthToken
      });

      expect(listSecrets.secrets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            secretKey: "JDBC_TEMPLATE",
            // eslint-disable-next-line
            secretValue: "jdbc:${db::main.host}/mydb"
          })
        ])
      );
      expect(listSecrets.secrets.length).toBeGreaterThanOrEqual(1);
    } finally {
      await deleteSecretV2(secret);
    }
  });

  test("Cross-project reference resolves the referenced project's value, not a same-named local secret", async () => {
    // The referenced ("source") project owns SHARED_KEY. The consumer project defines its own
    // SHARED_KEY with a different value at the same environment + path, so a per-request cache
    // keyed only on environment+secretPath cannot tell the two apart.
    const createProjectResponse = await testServer.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        projectName: "cross-ref-source",
        slug: "cross-ref-source-project",
        type: "secret-manager"
      }
    });
    expect(createProjectResponse.statusCode).toBe(200);
    const sourceProject = JSON.parse(createProjectResponse.payload).project as {
      id: string;
      name: string;
      slug: string;
      type: string;
    };
    expect(sourceProject.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(sourceProject.name).toBe("cross-ref-source");
    expect(sourceProject.slug).toBe("cross-ref-source-project");
    expect(sourceProject.type).toBe("secret-manager");

    const sourceSecret = {
      environmentSlug: "dev",
      workspaceId: sourceProject.id,
      secretPath: "/",
      authToken: jwtAuthToken,
      key: "SHARED_KEY",
      value: "value-from-source-project"
    };

    const consumerSecrets = [
      {
        environmentSlug: seedData1.environment.slug,
        workspaceId: projectId,
        secretPath: "/",
        authToken: jwtAuthToken,
        key: "SHARED_KEY",
        value: "value-from-consumer-project"
      },
      {
        environmentSlug: seedData1.environment.slug,
        workspaceId: projectId,
        secretPath: "/",
        authToken: jwtAuthToken,
        key: "CROSS_REF",
        value: `\${${sourceProject.slug}::dev.SHARED_KEY}`
      },
      {
        environmentSlug: seedData1.environment.slug,
        workspaceId: projectId,
        secretPath: "/",
        authToken: jwtAuthToken,
        key: "LOCAL_REF",
        // eslint-disable-next-line
        value: "${SHARED_KEY}"
      }
    ];

    try {
      await createSecretV2(sourceSecret);
      for (const secret of consumerSecrets) {
        // eslint-disable-next-line no-await-in-loop
        await createSecretV2(secret);
      }

      const listSecrets = await getSecretsV2({
        environmentSlug: seedData1.environment.slug,
        workspaceId: projectId,
        secretPath: "/",
        authToken: jwtAuthToken
      });

      // The cross-project reference must read the source project's value...
      expect(listSecrets.secrets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            secretKey: "CROSS_REF",
            secretValue: "value-from-source-project"
          })
        ])
      );

      // ...and must not displace the consumer project's own same-named secret.
      expect(listSecrets.secrets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            secretKey: "LOCAL_REF",
            secretValue: "value-from-consumer-project"
          })
        ])
      );
    } finally {
      await Promise.all(consumerSecrets.map((el) => deleteSecretV2(el)));
      const deleteProjectResponse = await testServer.inject({
        method: "DELETE",
        url: `/api/v1/projects/${sourceProject.id}`,
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        }
      });
      expect(deleteProjectResponse.statusCode).toBe(200);
    }
  });

  test("Non replicated secret import secret expansion on local reference and nested reference", async () => {
    const secrets = [
      {
        environmentSlug: "prod",
        workspaceId: projectId,
        secretPath: "/deep",
        authToken: jwtAuthToken,
        key: "DEEP_KEY_1",
        value: "testing"
      },
      {
        environmentSlug: "prod",
        workspaceId: projectId,
        secretPath: "/deep/nested",
        authToken: jwtAuthToken,
        key: "NESTED_KEY_1",
        value: "reference"
      },
      {
        environmentSlug: "prod",
        workspaceId: projectId,
        secretPath: "/deep/nested",
        authToken: jwtAuthToken,
        key: "NESTED_KEY_2",
        // eslint-disable-next-line
        value: "secret ${NESTED_KEY_1} ${prod.deep.DEEP_KEY_1}"
      },
      {
        environmentSlug: seedData1.environment.slug,
        workspaceId: projectId,
        secretPath: "/",
        authToken: jwtAuthToken,
        key: "KEY",
        // eslint-disable-next-line
        value: "hello world"
      }
    ];

    for (const secret of secrets) {
      // eslint-disable-next-line no-await-in-loop
      await createSecretV2(secret);
    }

    const secretImportFromProdToDev = await createSecretImport({
      environmentSlug: seedData1.environment.slug,
      workspaceId: projectId,
      secretPath: "/",
      authToken: jwtAuthToken,
      importEnv: "prod",
      importPath: "/deep/nested"
    });

    const listSecrets = await getSecretsV2({
      environmentSlug: seedData1.environment.slug,
      workspaceId: projectId,
      secretPath: "/",
      authToken: jwtAuthToken
    });
    expect(listSecrets.imports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          secretPath: "/deep/nested",
          environment: "prod",
          secrets: expect.arrayContaining([
            expect.objectContaining({
              secretKey: "NESTED_KEY_1",
              secretValue: "reference"
            }),
            expect.objectContaining({
              secretKey: "NESTED_KEY_2",
              secretValue: "secret reference testing"
            })
          ])
        })
      ])
    );

    await Promise.all(secrets.map((el) => deleteSecretV2(el)));
    await deleteSecretImport({
      environmentSlug: seedData1.environment.slug,
      workspaceId: projectId,
      authToken: jwtAuthToken,
      id: secretImportFromProdToDev.id,
      secretPath: "/"
    });
  });

  test(
    "Replicated secret import secret expansion on local reference and nested reference",
    async () => {
      const secrets = [
        {
          environmentSlug: "prod",
          workspaceId: projectId,
          secretPath: "/deep",
          authToken: jwtAuthToken,
          key: "DEEP_KEY_1",
          value: "testing"
        },
        {
          environmentSlug: "prod",
          workspaceId: projectId,
          secretPath: "/deep/nested",
          authToken: jwtAuthToken,
          key: "NESTED_KEY_1",
          value: "reference"
        },
        {
          environmentSlug: "prod",
          workspaceId: projectId,
          secretPath: "/deep/nested",
          authToken: jwtAuthToken,
          key: "NESTED_KEY_2",
          // eslint-disable-next-line
          value: "secret ${NESTED_KEY_1} ${prod.deep.DEEP_KEY_1}"
        },
        {
          environmentSlug: seedData1.environment.slug,
          workspaceId: projectId,
          secretPath: "/",
          authToken: jwtAuthToken,
          key: "KEY",
          // eslint-disable-next-line
          value: "hello world"
        }
      ];

      for (const secret of secrets) {
        // eslint-disable-next-line no-await-in-loop
        await createSecretV2(secret);
      }

      const secretImportFromProdToDev = await createSecretImport({
        environmentSlug: seedData1.environment.slug,
        workspaceId: projectId,
        secretPath: "/",
        authToken: jwtAuthToken,
        importEnv: "prod",
        importPath: "/deep/nested",
        isReplication: true
      });

      // wait for 5 second for  replication to finish
      await new Promise((resolve) => {
        setTimeout(resolve, 5000); // time to breathe for db
      });

      const listSecrets = await getSecretsV2({
        environmentSlug: seedData1.environment.slug,
        workspaceId: projectId,
        secretPath: "/",
        authToken: jwtAuthToken
      });
      expect(listSecrets.imports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            secretPath: "/deep/nested",
            environment: "prod",
            secrets: expect.arrayContaining([
              expect.objectContaining({
                secretKey: "NESTED_KEY_1",
                secretValue: "reference"
              }),
              expect.objectContaining({
                secretKey: "NESTED_KEY_2",
                secretValue: "secret reference testing"
              })
            ])
          })
        ])
      );

      await Promise.all(secrets.map((el) => deleteSecretV2(el)));
      await deleteSecretImport({
        environmentSlug: seedData1.environment.slug,
        workspaceId: projectId,
        authToken: jwtAuthToken,
        id: secretImportFromProdToDev.id,
        secretPath: "/"
      });
    },
    { timeout: 10000 }
  );
});
