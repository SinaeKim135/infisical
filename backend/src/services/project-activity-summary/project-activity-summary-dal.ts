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

      // Counting is done over folder_commits, so a change that touches several resources at
      // once is reported as the single operation the user performed.
      const result = await db
        .replicaNode()(TableName.FolderCommitChanges)
        .join(TableName.FolderCommit, `${TableName.FolderCommit}.id`, `${TableName.FolderCommitChanges}.folderCommitId`)
        .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.FolderCommit}.envId`)
        .where(`${TableName.Environment}.projectId`, projectId)
        .whereNull(`${TableName.Environment}.deleteAfter`)
        .where(`${TableName.FolderCommitChanges}.createdAt`, ">=", sevenDaysAgo)
        .select(
          db.raw(
            `COUNT(DISTINCT CASE WHEN "${TableName.FolderCommitChanges}"."changeType" = ? THEN "${TableName.FolderCommit}"."id" END)::int AS "secretsCreated"`,
            [ChangeType.ADD]
          ),
          db.raw(
            `COUNT(DISTINCT CASE WHEN "${TableName.FolderCommitChanges}"."changeType" = ? AND "${TableName.FolderCommitChanges}"."isUpdate" = true THEN "${TableName.FolderCommit}"."id" END)::int AS "secretsUpdated"`,
            [ChangeType.ADD]
          ),
          db.raw(
            `COUNT(DISTINCT CASE WHEN "${TableName.FolderCommitChanges}"."changeType" = ? THEN "${TableName.FolderCommit}"."id" END)::int AS "secretsDeleted"`,
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
