import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.SecretV2, "archivedAt"))) {
    await knex.schema.alterTable(TableName.SecretV2, (t) => {
      t.timestamp("archivedAt");
      t.index("archivedAt");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SecretV2, "archivedAt")) {
    await knex.schema.alterTable(TableName.SecretV2, (t) => {
      t.dropIndex("archivedAt");
      t.dropColumn("archivedAt");
    });
  }
}
