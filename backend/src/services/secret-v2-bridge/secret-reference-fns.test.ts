/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, test } from "vitest";

import { expandSecretReferencesFactory, getAllSecretReferences } from "./secret-reference-fns";

describe("getAllSecretReferences", () => {
  test("classifies local, same-project nested, and cross-project references", () => {
    const value =
      "local ${LOCAL_KEY} nested ${dev.folder.SUB.NESTED_KEY} cross ${shared-infra::prod.tls.CERT} root ${prod.ROOT_KEY}";

    const { localReferences, nestedReferences, crossProjectReferences } = getAllSecretReferences(value);

    expect(localReferences).toEqual(["LOCAL_KEY"]);
    expect(nestedReferences).toEqual([
      { environment: "dev", secretPath: "/folder/SUB", secretKey: "NESTED_KEY" },
      { environment: "prod", secretPath: "/", secretKey: "ROOT_KEY" }
    ]);
    expect(crossProjectReferences).toEqual([
      { projectSlug: "shared-infra", environment: "prod", secretPath: "/tls", secretKey: "CERT" }
    ]);
  });

  test("supports a cross-project reference at the environment root (no path)", () => {
    const { crossProjectReferences } = getAllSecretReferences("${other::staging.API_KEY}");
    expect(crossProjectReferences).toEqual([
      { projectSlug: "other", environment: "staging", secretPath: "/", secretKey: "API_KEY" }
    ]);
  });

  test("does not treat a single colon interpolation as a reference (backward compatible)", () => {
    const { localReferences, nestedReferences, crossProjectReferences } = getAllSecretReferences("${host:5432}");
    expect(localReferences).toEqual([]);
    expect(nestedReferences).toEqual([]);
    expect(crossProjectReferences).toEqual([]);
  });

  test("rejects a malformed cross-project reference without env.key", () => {
    const { crossProjectReferences, localReferences } = getAllSecretReferences("${slug::ONLYKEY}");
    expect(crossProjectReferences).toEqual([]);
    expect(localReferences).toEqual([]);
  });
});

type TMockSecret = {
  key: string;
  value: string;
  userId?: string | null;
  tags?: { slug: string }[];
};

// Builds folder/secret DAL stubs from a nested fixture keyed by projectId -> environment -> path -> secrets.
const buildMockDals = (fixture: Record<string, Record<string, Record<string, TMockSecret[]>>>) => {
  const folderDAL = {
    findBySecretPath: (async (projectId: any, environment: any, secretPath: any) => {
      const secrets = fixture[projectId]?.[environment]?.[secretPath];
      if (!secrets) return undefined;
      return { id: `${projectId}:${environment}:${secretPath}` };
    }) as any
  };

  const secretDAL = {
    findByFolderId: (async ({ folderId }: any) => {
      const [projectId, environment, secretPath] = folderId.split(":");
      const secrets = fixture[projectId]?.[environment]?.[secretPath] || [];
      return secrets.map((s) => ({
        key: s.key,
        // encode plain text as a fake buffer; decrypt just reads it back
        encryptedValue: Buffer.from(s.value),
        userId: s.userId ?? null,
        tags: s.tags ?? []
      }));
    }) as any
  };

  return { folderDAL, secretDAL };
};

const decryptSecretValue = (value?: Buffer | null) => (value ? value.toString() : undefined);

describe("expandSecretReferencesFactory cross-project", () => {
  test("resolves a cross-project reference through the referenced project's context", async () => {
    const { folderDAL, secretDAL } = buildMockDals({
      home: { dev: { "/": [{ key: "SMTP_URL", value: "${shared::prod.mail.SMTP}" }] } },
      shared: { prod: { "/mail": [{ key: "SMTP", value: "smtp://mail.example.com" }] } }
    });

    const { expandSecretReferences } = expandSecretReferencesFactory({
      projectId: "home",
      decryptSecretValue,
      secretDAL,
      folderDAL,
      canExpandValue: () => true,
      crossProjectResolver: async (slug) => {
        expect(slug).toBe("shared");
        return {
          projectId: "shared",
          secretDAL,
          decryptSecretValue,
          canExpandValue: () => true
        };
      }
    });

    const expanded = await expandSecretReferences({
      value: "${shared::prod.mail.SMTP}",
      environment: "dev",
      secretPath: "/",
      secretKey: "SMTP_URL"
    });

    expect(expanded).toBe("smtp://mail.example.com");
  });

  test("throws when the actor cannot read the referenced cross-project secret", async () => {
    const { folderDAL, secretDAL } = buildMockDals({
      home: { dev: { "/": [{ key: "X", value: "${shared::prod.mail.SMTP}" }] } },
      shared: { prod: { "/mail": [{ key: "SMTP", value: "secret" }] } }
    });

    const { expandSecretReferences } = expandSecretReferencesFactory({
      projectId: "home",
      decryptSecretValue,
      secretDAL,
      folderDAL,
      canExpandValue: () => true,
      crossProjectResolver: async () => ({
        projectId: "shared",
        secretDAL,
        decryptSecretValue,
        canExpandValue: () => false // no read access in the referenced project
      })
    });

    await expect(
      expandSecretReferences({
        value: "${shared::prod.mail.SMTP}",
        environment: "dev",
        secretPath: "/",
        secretKey: "X"
      })
    ).rejects.toThrow(/do not have permission/i);
  });

  test("leaves a cross-project reference untouched when no resolver is configured", async () => {
    const { folderDAL, secretDAL } = buildMockDals({
      home: { dev: { "/": [{ key: "X", value: "${shared::prod.mail.SMTP}" }] } }
    });

    const { expandSecretReferences } = expandSecretReferencesFactory({
      projectId: "home",
      decryptSecretValue,
      secretDAL,
      folderDAL,
      canExpandValue: () => true
    });

    const expanded = await expandSecretReferences({
      value: "${shared::prod.mail.SMTP}",
      environment: "dev",
      secretPath: "/",
      secretKey: "X"
    });

    // Without a resolver the reference is left as literal text rather than throwing.
    expect(expanded).toBe("${shared::prod.mail.SMTP}");
  });

  test("stops on a circular reference that spans two projects without infinite looping", async () => {
    // home/A -> shared/B -> home/A (cycle)
    const { folderDAL, secretDAL } = buildMockDals({
      home: { dev: { "/": [{ key: "A", value: "${shared::prod.B}" }] } },
      shared: { prod: { "/": [{ key: "B", value: "${home::dev.A}" }] } }
    });

    const { expandSecretReferences } = expandSecretReferencesFactory({
      projectId: "home",
      decryptSecretValue,
      secretDAL,
      folderDAL,
      canExpandValue: () => true,
      crossProjectResolver: async (slug) => ({
        projectId: slug,
        secretDAL,
        decryptSecretValue,
        canExpandValue: () => true
      })
    });

    // Should resolve without hanging; the cross-project cycle is detected and expansion stops,
    // leaving an unresolved reference in place rather than looping forever.
    const expanded = await expandSecretReferences({
      value: "${shared::prod.B}",
      environment: "dev",
      secretPath: "/",
      secretKey: "A"
    });

    expect(typeof expanded).toBe("string");
    expect(expanded).toMatch(/\$\{.*::.*\}/);
  });
});
