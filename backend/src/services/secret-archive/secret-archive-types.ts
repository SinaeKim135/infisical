import { TProjectPermission } from "@app/lib/types";

export type TListArchivedSecretsDTO = TProjectPermission;

// by-secret-id operations don't know the projectId up front — it is resolved from the secret
export type TSecretArchiveActor = Omit<TProjectPermission, "projectId">;

export type TArchiveSecretDTO = { secretId: string } & TSecretArchiveActor;

export type TRestoreSecretDTO = { secretId: string } & TSecretArchiveActor;

export type TDeleteArchivedSecretDTO = { secretId: string } & TSecretArchiveActor;

export type TArchivedSecret = {
  id: string;
  key: string;
  type: string;
  folderId: string;
  environment: string;
  environmentName: string;
  archivedAt: Date;
};
