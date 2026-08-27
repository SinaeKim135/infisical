import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.SecretV2, "archivedAt"))) {
    await knex.schema.alterTable(TableName.SecretV2, (t) => {
      t.datetime("archivedAt").nullable();
      // every read path filters on "not archived", so the index carries the common case
      t.index(["folderId", "archivedAt"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SecretV2, "archivedAt")) {
    await knex.schema.alterTable(TableName.SecretV2, (t) => {
      t.dropIndex(["folderId", "archivedAt"]);
      t.dropColumn("archivedAt");
    });
  }
}
