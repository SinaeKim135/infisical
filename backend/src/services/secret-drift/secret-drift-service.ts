import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { PersonalOverridesBehavior } from "@app/services/secret/secret-types";
import { TSecretV2BridgeServiceFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-service";

import { SecretDriftStatus, TGetSecretsDriftDTO, TSecretDriftRow } from "./secret-drift-types";

type TSecretDriftServiceFactoryDep = {
  secretV2BridgeService: Pick<TSecretV2BridgeServiceFactory, "getSecretsMultiEnv">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TSecretDriftServiceFactory = ReturnType<typeof secretDriftServiceFactory>;

export const secretDriftServiceFactory = ({ secretV2BridgeService, kmsService }: TSecretDriftServiceFactoryDep) => {
  const $digest = (value: Buffer | string) => crypto.nativeCrypto.createHash("sha256").update(value).digest("hex");

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

    // The report must never hold a plaintext value longer than it has to, so each value is put
    // back into its encrypted form and the comparison runs on that.
    const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    // key -> environment -> digest
    const digestsByKey = new Map<string, Map<string, string>>();

    secrets.forEach((secret) => {
      // a value the caller is not allowed to read comes back masked; digesting the mask would
      // compare placeholders rather than values, so those keys are left out
      if (secret.secretValueHidden) return;

      const byEnvironment = digestsByKey.get(secret.secretKey) ?? new Map<string, string>();
      byEnvironment.set(
        secret.environment,
        $digest(secretManagerEncryptor({ plainText: Buffer.from(secret.secretValue) }).cipherTextBlob)
      );
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
