import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TWebhookAttemptDALFactory = ReturnType<typeof webhookAttemptDALFactory>;

export const webhookAttemptDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.WebhookAttempt);
  return orm;
};
