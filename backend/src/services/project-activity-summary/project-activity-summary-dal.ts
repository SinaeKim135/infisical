import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

import { TActivitySummary } from "./project-activity-summary-types";

export type TProjectActivitySummaryDALFactory = ReturnType<typeof projectActivitySummaryDALFactory>;

export const projectActivitySummaryDALFactory = (db: TDbClient) => {
  const getActivitySummary = async (projectId: string): Promise<TActivitySummary> => {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const result = await db
        .replicaNode()(TableName.SecretVersionV2)
        .join(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.SecretVersionV2}.folderId`)
        .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`)
        .leftJoin(TableName.SecretV2, `${TableName.SecretV2}.id`, `${TableName.SecretVersionV2}.secretId`)
        .where(`${TableName.Environment}.projectId`, projectId)
        .whereNull(`${TableName.Environment}.deleteAfter`)
        .where(`${TableName.SecretVersionV2}.createdAt`, ">=", sevenDaysAgo)
        .select(
          db.raw(
            `COUNT(DISTINCT CASE WHEN "${TableName.SecretVersionV2}"."version" = 1 THEN "${TableName.SecretVersionV2}"."secretId" END)::int AS "secretsCreated"`
          ),
          db.raw(
            `COUNT(CASE WHEN "${TableName.SecretVersionV2}"."version" > 1 AND "${TableName.SecretV2}"."id" IS NOT NULL THEN 1 END)::int AS "secretsUpdated"`
          ),
          db.raw(
            `COUNT(DISTINCT CASE WHEN "${TableName.SecretV2}"."id" IS NULL THEN "${TableName.SecretVersionV2}"."secretId" END)::int AS "secretsDeleted"`
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
