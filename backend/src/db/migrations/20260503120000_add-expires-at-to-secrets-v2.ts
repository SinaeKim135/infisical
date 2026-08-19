import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.SecretV2, "expiresAt"))) {
    await knex.schema.alterTable(TableName.SecretV2, (t) => {
      t.datetime("expiresAt").nullable();
      t.index("expiresAt");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SecretV2, "expiresAt")) {
    await knex.schema.alterTable(TableName.SecretV2, (t) => {
      t.dropIndex("expiresAt");
      t.dropColumn("expiresAt");
    });
  }
}
