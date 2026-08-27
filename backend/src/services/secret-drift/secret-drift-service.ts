import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { PersonalOverridesBehavior } from "@app/services/secret/secret-types";
import { TSecretV2BridgeServiceFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-service";

import { SecretDriftStatus, TGetSecretsDriftDTO, TSecretDriftRow } from "./secret-drift-types";

type TSecretDriftServiceFactoryDep = {
  secretV2BridgeService: Pick<TSecretV2BridgeServiceFactory, "getSecretsMultiEnv">;
};

export type TSecretDriftServiceFactory = ReturnType<typeof secretDriftServiceFactory>;

export const secretDriftServiceFactory = ({ secretV2BridgeService }: TSecretDriftServiceFactoryDep) => {
  // The report says whether two environments disagree, never what either of them holds, so
  // comparison is done on a digest of the decrypted value rather than on the value itself.
  const $digest = (value: string) => crypto.nativeCrypto.createHash("sha256").update(value).digest("hex");

  const getSecretsDrift = async ({
    projectId,
    environments,
    secretPath,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TGetSecretsDriftDTO) => {
    if (environments.length < 2) {
      throw new BadRequestError({ message: "At least two environments are required to compare" });
    }

    // Read through the existing permission-filtered multi-environment path so a key the caller
    // cannot see never reaches the report. Personal overrides are a single user's private value
    // and would make the same path read differently per viewer, so they stay out of the comparison.
    const readParams = {
      projectId,
      environments,
      path: secretPath,
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      personalOverridesBehavior: PersonalOverridesBehavior.NeverInclude
    };

    const secrets = await secretV2BridgeService.getSecretsMultiEnv(readParams);

    // key -> environment -> digest
    const digestsByKey = new Map<string, Map<string, string>>();

    secrets.forEach((secret) => {
      // a value the caller is not allowed to read comes back masked; digesting the mask would
      // compare placeholders rather than values, so those keys are left out
      if (secret.secretValueHidden) return;

      const byEnvironment = digestsByKey.get(secret.secretKey) ?? new Map<string, string>();
      byEnvironment.set(secret.environment, $digest(secret.secretValue));
      digestsByKey.set(secret.secretKey, byEnvironment);
    });

    const rows: TSecretDriftRow[] = [...digestsByKey.entries()]
      .map(([secretKey, byEnvironment]) => {
        const presentDigests = environments
          .map((environment) => byEnvironment.get(environment))
          .filter((el): el is string => Boolean(el));

        const isSameEverywhere = presentDigests.length === environments.length && new Set(presentDigests).size === 1;

        const cells = environments.map((environment) => {
          const digest = byEnvironment.get(environment);

          if (!digest) return { environment, status: SecretDriftStatus.Missing };

          return {
            environment,
            status: isSameEverywhere ? SecretDriftStatus.Same : SecretDriftStatus.Different
          };
        });

        return {
          secretKey,
          isDrifting: !isSameEverywhere,
          cells
        };
      })
      .sort((a, b) => a.secretKey.localeCompare(b.secretKey));

    return {
      environments,
      secretPath,
      rows,
      driftingCount: rows.filter((el) => el.isDrifting).length
    };
  };

  return { getSecretsDrift };
};
