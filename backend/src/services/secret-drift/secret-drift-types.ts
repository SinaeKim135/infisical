import { TProjectPermission } from "@app/lib/types";

export enum SecretDriftStatus {
  Same = "same",
  Different = "different",
  Missing = "missing"
}

export type TGetSecretsDriftDTO = {
  projectId: string;
  environments: string[];
  secretPath: string;
} & Omit<TProjectPermission, "projectId">;

export type TSecretDriftCell = {
  environment: string;
  status: SecretDriftStatus;
};

export type TSecretDriftRow = {
  secretKey: string;
  isDrifting: boolean;
  cells: TSecretDriftCell[];
};
