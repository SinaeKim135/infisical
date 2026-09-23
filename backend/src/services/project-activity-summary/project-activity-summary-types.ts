import { TProjectPermission } from "@app/lib/types";

export type TGetActivitySummaryDTO = TProjectPermission;

export type TActivitySummary = {
  secretsCreated: number;
  secretsUpdated: number;
  secretsDeleted: number;
};
