import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.Webhook)) {
    const hasMaxRetriesCol = await knex.schema.hasColumn(TableName.Webhook, "maxRetries");
    if (!hasMaxRetriesCol) {
      await knex.schema.alterTable(TableName.Webhook, (t) => {
        t.integer("maxRetries").notNullable().defaultTo(5);
      });
    }
  }

  if (!(await knex.schema.hasTable(TableName.WebhookAttempt))) {
    await knex.schema.createTable(TableName.WebhookAttempt, (t) => {
      t.uuid("id").primary().defaultTo(knex.fn.uuid());
      t.uuid("webhookId").notNullable();
      t.string("status", 32).notNullable().defaultTo("pending");
      t.integer("attemptNumber").notNullable().defaultTo(1);
      t.integer("statusCode").nullable();
      t.text("errorMessage").nullable();
      t.jsonb("payload").nullable();
      t.timestamp("nextRetryAt", { useTz: true }).nullable();
      t.timestamps(true, true, true);

      t.foreign("webhookId").references("id").inTable(TableName.Webhook).onDelete("CASCADE");
      t.index(["webhookId", "createdAt"]);
      t.index(["status", "nextRetryAt"]);
    });

    await createOnUpdateTrigger(knex, TableName.WebhookAttempt);
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.WebhookAttempt)) {
    await knex.schema.dropTable(TableName.WebhookAttempt);
    await dropOnUpdateTrigger(knex, TableName.WebhookAttempt);
  }

  if (await knex.schema.hasTable(TableName.Webhook)) {
    const hasMaxRetriesCol = await knex.schema.hasColumn(TableName.Webhook, "maxRetries");
    if (hasMaxRetriesCol) {
      await knex.schema.alterTable(TableName.Webhook, (t) => {
        t.dropColumn("maxRetries");
      });
    }
  }
}
