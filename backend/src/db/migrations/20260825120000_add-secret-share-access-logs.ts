import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.SecretSharing, "notifyOnAccess"))) {
    await knex.schema.alterTable(TableName.SecretSharing, (t) => {
      t.boolean("notifyOnAccess").notNullable().defaultTo(false);
    });
  }

  if (!(await knex.schema.hasTable(TableName.SecretShareAccessLog))) {
    await knex.schema.createTable(TableName.SecretShareAccessLog, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("sharedSecretId").notNullable();
      t.foreign("sharedSecretId").references("id").inTable(TableName.SecretSharing);
      t.index("sharedSecretId");

      t.string("actorEmail").nullable();
      t.string("ipAddress").nullable();
      t.string("userAgent", 1024).nullable();

      t.boolean("success").notNullable();
      t.string("failureReason").nullable();

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.SecretShareAccessLog);
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretShareAccessLog)) {
    await dropOnUpdateTrigger(knex, TableName.SecretShareAccessLog);
    await knex.schema.dropTable(TableName.SecretShareAccessLog);
  }

  if (await knex.schema.hasColumn(TableName.SecretSharing, "notifyOnAccess")) {
    await knex.schema.alterTable(TableName.SecretSharing, (t) => {
      t.dropColumn("notifyOnAccess");
    });
  }
}
