import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TWebhookDeliveryLogDALFactory = ReturnType<typeof webhookDeliveryLogDALFactory>;

export const webhookDeliveryLogDALFactory = (db: TDbClient) => {
  const webhookDeliveryLogOrm = ormify(db, TableName.WebhookDeliveryLog);

  const findByWebhookId = async (
    webhookId: string,
    { limit, offset }: { limit: number; offset: number },
    tx?: Knex
  ) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.WebhookDeliveryLog)
        .where({ webhookId })
        .select(selectAllTableCols(TableName.WebhookDeliveryLog))
        .orderBy("createdAt", "desc")
        .limit(limit)
        .offset(offset);

      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find webhook delivery logs" });
    }
  };

  const countByWebhookId = async (webhookId: string, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.WebhookDeliveryLog)
        .where({ webhookId })
        .count("*")
        .first<{ count: string } | undefined>();

      return parseInt(doc?.count ?? "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count webhook delivery logs" });
    }
  };

  return { ...webhookDeliveryLogOrm, findByWebhookId, countByWebhookId };
};
