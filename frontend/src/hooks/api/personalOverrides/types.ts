export type TPersonalOverride = {
  id: string;
  secretKey: string;
  environment: string;
  environmentName: string;
  secretPath: string;
  divergedAt: string;
};

export type TResetPersonalOverridesDTO = {
  projectId: string;
  environment: string;
  secretPath: string;
  secretKeys: string[];
};
