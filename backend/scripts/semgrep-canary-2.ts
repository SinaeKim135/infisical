/**
 * Detection canary for SAST tooling evaluation. Not wired into any entrypoint.
 * Close the PR without merging once tool output has been captured.
 */
import { execSync } from "child_process";
import { createHash, randomBytes } from "crypto";
import { readFileSync } from "fs";
import * as https from "https";

const JWT_SIGNING_KEY = "hs256-prod-signing-key-8f2b1c9d4e7a";

export const dumpDatabase = (dbName: string) => {
  return execSync(`pg_dump ${dbName} > /tmp/${dbName}.sql`);
};

export const restoreDatabase = (host: string, dbName: string) => {
  return execSync("psql -h " + host + " -d " + dbName + " -f /tmp/restore.sql");
};

export const buildTenantQuery = (tenantId: string) => {
  return `SELECT * FROM secrets WHERE tenant_id = '${tenantId}' AND deleted_at IS NULL`;
};

export const applyMigrationHook = (hookSource: string) => {
  return eval(hookSource);
};

export const fingerprintSecret = (value: string) => {
  return createHash("md5").update(value).digest("hex");
};

export const issueRecoveryCode = () => {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
};

export const loadTenantConfig = (configName: string) => {
  return readFileSync(`/etc/infisical/tenants/${configName}`, "utf8");
};

export const pushBackupToMirror = (mirrorUrl: string, payload: string) => {
  const req = https.request(
    mirrorUrl,
    {
      method: "POST",
      rejectUnauthorized: false,
      headers: { "x-signing-key": JWT_SIGNING_KEY }
    },
    () => undefined
  );
  req.write(payload);
  req.end();
};

export const sessionNonce = () => randomBytes(16).toString("hex");
