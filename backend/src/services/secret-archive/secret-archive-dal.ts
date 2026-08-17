import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TSecretsV2 } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

import { TArchivedSecret } from "./secret-archive-types";

export type TSecretArchiveDALFactory = ReturnType<typeof secretArchiveDALFactory>;

export const secretArchiveDALFactory = (db: TDbClient) => {
  // resolves the owning project (+ environment) of a secret regardless of its archived state
  const findSecretWithProject = async (secretId: string, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.SecretV2)
        .where(`${TableName.SecretV2}.id`, secretId)
        .join(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.SecretV2}.folderId`)
        .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`)
        .select(
          db.ref("id").withSchema(TableName.SecretV2).as("id"),
          db.ref("key").withSchema(TableName.SecretV2).as("key"),
          db.ref("type").withSchema(TableName.SecretV2).as("type"),
          db.ref("folderId").withSchema(TableName.SecretV2).as("folderId"),
          db.ref("archivedAt").withSchema(TableName.SecretV2).as("archivedAt"),
          db.ref("projectId").withSchema(TableName.Environment).as("projectId"),
          db.ref("slug").withSchema(TableName.Environment).as("environment")
        )
        .first<{
          id: string;
          key: string;
          type: string;
          folderId: string;
          archivedAt: Date | null;
          projectId: string;
          environment: string;
        }>();

      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindSecretWithProject" });
    }
  };

  const findArchivedByProjectId = async (projectId: string, tx?: Knex): Promise<TArchivedSecret[]> => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.SecretV2)
        .join(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.SecretV2}.folderId`)
        .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`)
        .where(`${TableName.Environment}.projectId`, projectId)
        .whereNotNull(`${TableName.SecretV2}.archivedAt`)
        // overrides (personal copies) are tied to their shared secret, so only surface shared rows
        .whereNull(`${TableName.SecretV2}.userId`)
        .select(
          db.ref("id").withSchema(TableName.SecretV2).as("id"),
          db.ref("key").withSchema(TableName.SecretV2).as("key"),
          db.ref("type").withSchema(TableName.SecretV2).as("type"),
          db.ref("folderId").withSchema(TableName.SecretV2).as("folderId"),
          db.ref("archivedAt").withSchema(TableName.SecretV2).as("archivedAt"),
          db.ref("slug").withSchema(TableName.Environment).as("environment"),
          db.ref("name").withSchema(TableName.Environment).as("environmentName")
        )
        .orderBy(`${TableName.SecretV2}.archivedAt`, "desc");

      return docs as TArchivedSecret[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindArchivedByProjectId" });
    }
  };

  // checks whether an active (non-archived) secret already occupies the given key in a folder
  const findActiveByFolderKey = async (
    folderId: string,
    key: string,
    type: string,
    tx?: Knex
  ): Promise<TSecretsV2 | undefined> => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.SecretV2)
        .where({ folderId, key, type })
        .whereNull("userId")
        .whereNull("archivedAt")
        .first();
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindActiveByFolderKey" });
    }
  };

  const setArchivedAt = async (secretId: string, archivedAt: Date | null, tx?: Knex) => {
    try {
      const [doc] = await (tx || db)(TableName.SecretV2).where({ id: secretId }).update({ archivedAt }).returning("*");
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "SetArchivedAt" });
    }
  };

  const deletePermanently = async (secretId: string, tx?: Knex) => {
    try {
      const [doc] = await (tx || db)(TableName.SecretV2).where({ id: secretId }).delete().returning("*");
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "DeleteArchivedSecret" });
    }
  };

  return {
    findSecretWithProject,
    findArchivedByProjectId,
    findActiveByFolderKey,
    setArchivedAt,
    deletePermanently
  };
};
