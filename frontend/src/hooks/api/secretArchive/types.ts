export type TArchivedSecret = {
  id: string;
  key: string;
  type: string;
  folderId: string;
  environment: string;
  environmentName: string;
  archivedAt: string;
};

export type TArchiveSecretDTO = {
  secretId: string;
  projectId: string;
  environment: string;
  secretPath: string;
};

export type TRestoreSecretDTO = {
  secretId: string;
  projectId: string;
};

export type TDeleteArchivedSecretDTO = {
  secretId: string;
  projectId: string;
};
