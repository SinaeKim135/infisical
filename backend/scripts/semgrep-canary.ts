// Canary file for verifying Semgrep PR comment delivery. Not for merge.
import { execSync } from "child_process";

export const runBackup = (userInput: string) => {
  return execSync(`pg_dump ${userInput}`, { stdio: "inherit" });
};

export const restoreBackup = (host: string, database: string) => {
  return execSync("pg_restore -h " + host + " -d " + database, { stdio: "inherit" });
};
