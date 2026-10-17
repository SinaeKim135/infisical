import { Knex } from "knex";

import { TableName } from "../schemas";

// Adds near-real-time deprovisioning support for OIDC group membership.
// - oidc_configs gains per-org reconciliation settings + last-sync status fields.
// - user_aliases gains an encrypted OIDC refresh token so the recurring
//   reconciliation job can re-fetch a user's current group claims from the IdP
//   without requiring the user to log in again.
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.OidcConfig)) {
    const hasReconciliationEnabled = await knex.schema.hasColumn(
      TableName.OidcConfig,
      "groupMembershipReconciliationEnabled"
    );
    const hasReconciliationInterval = await knex.schema.hasColumn(
      TableName.OidcConfig,
      "groupMembershipReconciliationIntervalMinutes"
    );
    const hasLastReconciliationAt = await knex.schema.hasColumn(TableName.OidcConfig, "lastGroupReconciliationAt");
    const hasLastReconciliationStatus = await knex.schema.hasColumn(
      TableName.OidcConfig,
      "lastGroupReconciliationStatus"
    );
    const hasLastReconciliationMessage = await knex.schema.hasColumn(
      TableName.OidcConfig,
      "lastGroupReconciliationMessage"
    );

    await knex.schema.alterTable(TableName.OidcConfig, (t) => {
      if (!hasReconciliationEnabled) t.boolean("groupMembershipReconciliationEnabled").notNullable().defaultTo(false);
      if (!hasReconciliationInterval)
        t.integer("groupMembershipReconciliationIntervalMinutes").notNullable().defaultTo(15);
      if (!hasLastReconciliationAt) t.datetime("lastGroupReconciliationAt").nullable();
      if (!hasLastReconciliationStatus) t.string("lastGroupReconciliationStatus").nullable();
      if (!hasLastReconciliationMessage) t.text("lastGroupReconciliationMessage").nullable();
    });
  }

  if (await knex.schema.hasTable(TableName.UserAliases)) {
    if (!(await knex.schema.hasColumn(TableName.UserAliases, "encryptedRefreshToken"))) {
      await knex.schema.alterTable(TableName.UserAliases, (t) => {
        t.binary("encryptedRefreshToken").nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.OidcConfig)) {
    const hasReconciliationEnabled = await knex.schema.hasColumn(
      TableName.OidcConfig,
      "groupMembershipReconciliationEnabled"
    );
    const hasReconciliationInterval = await knex.schema.hasColumn(
      TableName.OidcConfig,
      "groupMembershipReconciliationIntervalMinutes"
    );
    const hasLastReconciliationAt = await knex.schema.hasColumn(TableName.OidcConfig, "lastGroupReconciliationAt");
    const hasLastReconciliationStatus = await knex.schema.hasColumn(
      TableName.OidcConfig,
      "lastGroupReconciliationStatus"
    );
    const hasLastReconciliationMessage = await knex.schema.hasColumn(
      TableName.OidcConfig,
      "lastGroupReconciliationMessage"
    );

    await knex.schema.alterTable(TableName.OidcConfig, (t) => {
      if (hasReconciliationEnabled) t.dropColumn("groupMembershipReconciliationEnabled");
      if (hasReconciliationInterval) t.dropColumn("groupMembershipReconciliationIntervalMinutes");
      if (hasLastReconciliationAt) t.dropColumn("lastGroupReconciliationAt");
      if (hasLastReconciliationStatus) t.dropColumn("lastGroupReconciliationStatus");
      if (hasLastReconciliationMessage) t.dropColumn("lastGroupReconciliationMessage");
    });
  }

  if (await knex.schema.hasTable(TableName.UserAliases)) {
    if (await knex.schema.hasColumn(TableName.UserAliases, "encryptedRefreshToken")) {
      await knex.schema.alterTable(TableName.UserAliases, (t) => {
        t.dropColumn("encryptedRefreshToken");
      });
    }
  }
}
