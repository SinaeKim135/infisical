export enum SecretDriftStatus {
  Same = "same",
  Different = "different",
  Missing = "missing"
}

export type TSecretDriftCell = {
  environment: string;
  status: SecretDriftStatus;
};

export type TSecretDriftRow = {
  secretKey: string;
  isDrifting: boolean;
  cells: TSecretDriftCell[];
};

export type TSecretDriftReport = {
  environments: string[];
  secretPath: string;
  driftingCount: number;
  rows: TSecretDriftRow[];
};

export type TGetSecretsDriftDTO = {
  projectId: string;
  environments: string[];
  secretPath: string;
};
