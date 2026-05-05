import { Knex } from "knex";

import { TableName } from "../schemas";

const COLUMN = "allowedCidrs";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretFolder)) {
    const has = await knex.schema.hasColumn(TableName.SecretFolder, COLUMN);
    if (!has) {
      await knex.schema.alterTable(TableName.SecretFolder, (t) => {
        t.jsonb(COLUMN).nullable();
      });
    }
  }

  if (await knex.schema.hasTable(TableName.SecretV2)) {
    const has = await knex.schema.hasColumn(TableName.SecretV2, COLUMN);
    if (!has) {
      await knex.schema.alterTable(TableName.SecretV2, (t) => {
        t.jsonb(COLUMN).nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretV2)) {
    const has = await knex.schema.hasColumn(TableName.SecretV2, COLUMN);
    if (has) {
      await knex.schema.alterTable(TableName.SecretV2, (t) => {
        t.dropColumn(COLUMN);
      });
    }
  }

  if (await knex.schema.hasTable(TableName.SecretFolder)) {
    const has = await knex.schema.hasColumn(TableName.SecretFolder, COLUMN);
    if (has) {
      await knex.schema.alterTable(TableName.SecretFolder, (t) => {
        t.dropColumn(COLUMN);
      });
    }
  }
}
