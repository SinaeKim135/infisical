import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const hasConsecutiveFailures = await knex.schema.hasColumn(TableName.Webhook, "consecutiveFailures");
  const hasAutoDisabledAt = await knex.schema.hasColumn(TableName.Webhook, "autoDisabledAt");

  await knex.schema.alterTable(TableName.Webhook, (t) => {
    if (!hasConsecutiveFailures) {
      t.integer("consecutiveFailures").notNullable().defaultTo(0);
    }
    if (!hasAutoDisabledAt) {
      t.datetime("autoDisabledAt").nullable();
    }
  });

  if (!(await knex.schema.hasTable(TableName.WebhookDeliveryLog))) {
    await knex.schema.createTable(TableName.WebhookDeliveryLog, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("webhookId").notNullable();
      t.foreign("webhookId").references("id").inTable(TableName.Webhook).onDelete("CASCADE");
      t.index("webhookId");

      t.string("status").notNullable(); // "success" | "failed"
      t.integer("statusCode").nullable();
      t.string("eventType").notNullable();
      t.text("errorMessage").nullable();

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.WebhookDeliveryLog);
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.WebhookDeliveryLog)) {
    await dropOnUpdateTrigger(knex, TableName.WebhookDeliveryLog);
    await knex.schema.dropTable(TableName.WebhookDeliveryLog);
  }

  const hasConsecutiveFailures = await knex.schema.hasColumn(TableName.Webhook, "consecutiveFailures");
  const hasAutoDisabledAt = await knex.schema.hasColumn(TableName.Webhook, "autoDisabledAt");

  await knex.schema.alterTable(TableName.Webhook, (t) => {
    if (hasConsecutiveFailures) {
      t.dropColumn("consecutiveFailures");
    }
    if (hasAutoDisabledAt) {
      t.dropColumn("autoDisabledAt");
    }
  });
}
