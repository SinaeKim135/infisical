import { TProjectPermission } from "@app/lib/types";

export enum BulkImportFormat {
  Env = "env",
  Csv = "csv",
  Json = "json"
}

export enum BulkImportItemAction {
  Create = "create",
  Overwrite = "overwrite",
  Skip = "skip"
}

// a single secret resolved from the uploaded/pasted payload
export type TParsedBulkImportItem = {
  environment: string;
  secretPath: string;
  secretKey: string;
  secretValue: string;
  secretComment?: string;
};

// a row that could not be parsed/validated out of the raw input
export type TBulkImportParseError = {
  line?: number;
  raw?: string;
  message: string;
};

export type TParseBulkImportInput = {
  format: BulkImportFormat;
  data: string;
  defaultEnvironment: string;
  defaultSecretPath: string;
};

export type TParseBulkImportResult = {
  items: TParsedBulkImportItem[];
  parseErrors: TBulkImportParseError[];
};

export type TBulkImportItemPreview = {
  environment: string;
  secretPath: string;
  secretKey: string;
  action: BulkImportItemAction;
  // populated when action === Skip to explain why (conflict / permission)
  reason?: string;
};

export type TBulkImportDryRunResult = {
  dryRun: true;
  secretsToCreate: number;
  secretsToOverwrite: number;
  secretsToSkip: number;
  // "<environment>:<path>" entries that would be created as part of the import
  foldersToCreate: string[];
  parseErrors: TBulkImportParseError[];
  items: TBulkImportItemPreview[];
};

export type TBulkImportResult = {
  dryRun: false;
  imported: number;
  created: number;
  overwritten: number;
  skipped: number;
  parseErrors: TBulkImportParseError[];
  items: TBulkImportItemPreview[];
};

export type TBulkImportSecretsDTO = Omit<TProjectPermission, "projectId"> & {
  projectId: string;
  defaultEnvironment: string;
  defaultSecretPath: string;
  format: BulkImportFormat;
  data: string;
  dryRun: boolean;
  overwriteExisting: boolean;
};
