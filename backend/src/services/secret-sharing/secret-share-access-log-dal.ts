import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TSecretShareAccessLogDALFactory = ReturnType<typeof secretShareAccessLogDALFactory>;

export const secretShareAccessLogDALFactory = (db: TDbClient) => {
  const accessLogOrm = ormify(db, TableName.SecretShareAccessLog);

  const findBySharedSecretId = async (
    sharedSecretId: string,
    { limit, offset }: { limit: number; offset: number },
    tx?: Knex
  ) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.SecretShareAccessLog)
        .where({ sharedSecretId })
        .select(selectAllTableCols(TableName.SecretShareAccessLog))
        .orderBy("createdAt", "desc")
        .limit(limit)
        .offset(offset);

      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find shared secret access logs" });
    }
  };

  const countBySharedSecretId = async (sharedSecretId: string, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.SecretShareAccessLog)
        .where({ sharedSecretId })
        .count("*")
        .first<{ count: string } | undefined>();

      return parseInt(doc?.count ?? "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count shared secret access logs" });
    }
  };

  return { ...accessLogOrm, findBySharedSecretId, countBySharedSecretId };
};
