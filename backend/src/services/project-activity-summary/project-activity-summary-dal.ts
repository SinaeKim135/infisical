import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ChangeType } from "@app/services/folder-commit/folder-commit-service";

import { TActivitySummary } from "./project-activity-summary-types";

export type TProjectActivitySummaryDALFactory = ReturnType<typeof projectActivitySummaryDALFactory>;

export const projectActivitySummaryDALFactory = (db: TDbClient) => {
  const getActivitySummary = async (projectId: string): Promise<TActivitySummary> => {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Counting is done over folder_commit_changes — one row per changed resource — rather than
      // over folder_commits. A commit can carry any number of changes, and the batch endpoints
      // and the CLI routinely put many secrets into one.
      const result = await db
        .replicaNode()(TableName.FolderCommitChanges)
        .join(TableName.FolderCommit, `${TableName.FolderCommit}.id`, `${TableName.FolderCommitChanges}.folderCommitId`)
        .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.FolderCommit}.envId`)
        .where(`${TableName.Environment}.projectId`, projectId)
        .whereNull(`${TableName.Environment}.deleteAfter`)
        .where(`${TableName.FolderCommitChanges}.createdAt`, ">=", sevenDaysAgo)
        // the same table records folder changes, which carry a folderVersionId instead. This card
        // reports secrets, so rows without a secret version are not ours to count.
        .whereNotNull(`${TableName.FolderCommitChanges}.secretVersionId`)
        .select(
          db.raw(
            `COUNT(CASE WHEN "${TableName.FolderCommitChanges}"."changeType" = ? THEN 1 END)::int AS "secretsCreated"`,
            [ChangeType.ADD]
          ),
          db.raw(
            `COUNT(CASE WHEN "${TableName.FolderCommitChanges}"."changeType" = ? AND "${TableName.FolderCommitChanges}"."isUpdate" = true THEN 1 END)::int AS "secretsUpdated"`,
            [ChangeType.ADD]
          ),
          db.raw(
            `COUNT(CASE WHEN "${TableName.FolderCommitChanges}"."changeType" = ? THEN 1 END)::int AS "secretsDeleted"`,
            [ChangeType.DELETE]
          )
        )
        .first<{ secretsCreated: number; secretsUpdated: number; secretsDeleted: number }>();

      return {
        secretsCreated: result?.secretsCreated ?? 0,
        secretsUpdated: result?.secretsUpdated ?? 0,
        secretsDeleted: result?.secretsDeleted ?? 0
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "GetActivitySummary" });
    }
  };

  return { getActivitySummary };
};
