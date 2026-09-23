import { removeTrailingSlash } from "@app/lib/fn";
import { SecretNameSchema } from "@app/server/lib/schemas";

import {
  BulkImportFormat,
  TBulkImportParseError,
  TParsedBulkImportItem,
  TParseBulkImportInput,
  TParseBulkImportResult
} from "./secret-bulk-import-types";

export const normalizeSecretPath = (rawPath?: string) => {
  const trimmed = (rawPath || "").trim();
  if (!trimmed || trimmed === "/") return "/";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return removeTrailingSlash(withLeadingSlash);
};

const isValidSecretKey = (key: string) => SecretNameSchema.safeParse(key).success;

// coerce primitive JSON values into the string a secret value must be.
// objects/arrays/null are rejected (returns null) so the caller can record a parse error.
const coerceJsonValue = (value: unknown): string | null => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
};

// strip a single layer of matching single/double quotes from a value
const stripWrappingQuotes = (value: string) => {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
};

const parseEnv = (data: string, defaultEnvironment: string, defaultSecretPath: string): TParseBulkImportResult => {
  const items: TParsedBulkImportItem[] = [];
  const parseErrors: TBulkImportParseError[] = [];

  data.split(/\r?\n/).forEach((rawLine, idx) => {
    const line = rawLine.trim();
    // skip blank lines and full-line comments
    if (!line || line.startsWith("#")) return;

    const withoutExport = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separatorIdx = withoutExport.indexOf("=");
    if (separatorIdx === -1) {
      parseErrors.push({ line: idx + 1, raw: rawLine, message: "Missing '=' separator" });
      return;
    }

    const key = withoutExport.slice(0, separatorIdx).trim();
    const value = stripWrappingQuotes(withoutExport.slice(separatorIdx + 1).trim());

    if (!isValidSecretKey(key)) {
      parseErrors.push({ line: idx + 1, raw: rawLine, message: `Invalid secret key "${key}"` });
      return;
    }

    items.push({
      environment: defaultEnvironment,
      secretPath: defaultSecretPath,
      secretKey: key,
      secretValue: value
    });
  });

  return { items, parseErrors };
};

const parseJson = (data: string, defaultEnvironment: string, defaultSecretPath: string): TParseBulkImportResult => {
  const items: TParsedBulkImportItem[] = [];
  const parseErrors: TBulkImportParseError[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch (err) {
    return {
      items,
      parseErrors: [{ message: `Invalid JSON: ${(err as Error).message}` }]
    };
  }

  const pushItem = (
    rawKey: unknown,
    rawValue: unknown,
    environment: string,
    secretPath: string,
    comment: unknown,
    locator: TBulkImportParseError
  ) => {
    if (typeof rawKey !== "string" || !isValidSecretKey(rawKey)) {
      parseErrors.push({ ...locator, message: `Invalid secret key "${String(rawKey)}"` });
      return;
    }
    const value = coerceJsonValue(rawValue);
    if (value === null) {
      parseErrors.push({ ...locator, message: `Value for "${rawKey}" must be a string, number, or boolean` });
      return;
    }
    items.push({
      environment,
      secretPath,
      secretKey: rawKey,
      secretValue: value,
      secretComment: typeof comment === "string" ? comment : undefined
    });
  };

  if (Array.isArray(parsed)) {
    // structured array: each row may override environment / path
    parsed.forEach((row, idx) => {
      if (!row || typeof row !== "object") {
        parseErrors.push({ line: idx + 1, message: "Each array entry must be an object" });
        return;
      }
      const record = row as Record<string, unknown>;
      const key = record.secretKey ?? record.key;
      const value = record.secretValue ?? record.value;
      const environment =
        typeof record.environment === "string"
          ? record.environment
          : typeof record.env === "string"
            ? record.env
            : defaultEnvironment;
      const pathValue = record.secretPath ?? record.path;
      const secretPath = typeof pathValue === "string" ? normalizeSecretPath(pathValue) : defaultSecretPath;
      const comment = record.secretComment ?? record.comment;
      pushItem(key, value, environment, secretPath, comment, { line: idx + 1 });
    });
  } else if (parsed && typeof parsed === "object") {
    // flat object: { KEY: value } targeting the default environment + path
    Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
      pushItem(key, value, defaultEnvironment, defaultSecretPath, undefined, { raw: key });
    });
  } else {
    parseErrors.push({ message: "JSON payload must be an object or an array" });
  }

  return { items, parseErrors };
};

const CSV_DELIMITERS = [",", ";", "\t", "|"];

const detectDelimiter = (headerLine: string) => {
  let best = ",";
  let bestCount = -1;
  CSV_DELIMITERS.forEach((delimiter) => {
    const count = headerLine.split(delimiter).length - 1;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  });
  return best;
};

// minimal RFC-4180-ish single-row parser handling quoted fields and escaped quotes
const parseCsvRow = (row: string, delimiter: string): string[] => {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < row.length; i += 1) {
    const char = row[i];
    if (inQuotes) {
      if (char === '"') {
        if (row[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
};

const CSV_COLUMN_ALIASES: Record<string, string[]> = {
  key: ["key", "secretkey", "name"],
  value: ["value", "secretvalue"],
  comment: ["comment", "secretcomment"],
  environment: ["environment", "env"],
  path: ["path", "secretpath"]
};

const resolveColumnIndex = (header: string[], field: keyof typeof CSV_COLUMN_ALIASES) => {
  const aliases = CSV_COLUMN_ALIASES[field];
  return header.findIndex((column) => aliases.includes(column.toLowerCase()));
};

const parseCsv = (data: string, defaultEnvironment: string, defaultSecretPath: string): TParseBulkImportResult => {
  const items: TParsedBulkImportItem[] = [];
  const parseErrors: TBulkImportParseError[] = [];

  const lines = data.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { items, parseErrors: [{ message: "CSV is empty" }] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const header = parseCsvRow(lines[0], delimiter);

  const keyIdx = resolveColumnIndex(header, "key");
  if (keyIdx === -1) {
    return { items, parseErrors: [{ message: 'CSV must include a "key" column (aliases: secretKey, name)' }] };
  }
  const valueIdx = resolveColumnIndex(header, "value");
  const commentIdx = resolveColumnIndex(header, "comment");
  const envIdx = resolveColumnIndex(header, "environment");
  const pathIdx = resolveColumnIndex(header, "path");

  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvRow(lines[i], delimiter);
    const key = cells[keyIdx] ?? "";

    if (!isValidSecretKey(key)) {
      parseErrors.push({ line: i + 1, raw: lines[i], message: `Invalid secret key "${key}"` });
      // eslint-disable-next-line no-continue
      continue;
    }

    const environment = envIdx !== -1 && cells[envIdx] ? cells[envIdx] : defaultEnvironment;
    const secretPath = pathIdx !== -1 && cells[pathIdx] ? normalizeSecretPath(cells[pathIdx]) : defaultSecretPath;

    items.push({
      environment,
      secretPath,
      secretKey: key,
      secretValue: valueIdx !== -1 ? (cells[valueIdx] ?? "") : "",
      secretComment: commentIdx !== -1 ? cells[commentIdx] : undefined
    });
  }

  return { items, parseErrors };
};

export const parseBulkImport = ({
  format,
  data,
  defaultEnvironment,
  defaultSecretPath
}: TParseBulkImportInput): TParseBulkImportResult => {
  const normalizedDefaultPath = normalizeSecretPath(defaultSecretPath);
  switch (format) {
    case BulkImportFormat.Json:
      return parseJson(data, defaultEnvironment, normalizedDefaultPath);
    case BulkImportFormat.Csv:
      return parseCsv(data, defaultEnvironment, normalizedDefaultPath);
    case BulkImportFormat.Env:
    default:
      return parseEnv(data, defaultEnvironment, normalizedDefaultPath);
  }
};

// dedupe by environment + path + key, keeping the last occurrence (mirrors bulk update semantics)
export const dedupeBulkImportItems = (items: TParsedBulkImportItem[]): TParsedBulkImportItem[] => {
  const seen = new Map<string, TParsedBulkImportItem>();
  items.forEach((item) => {
    seen.set(`${item.environment}::${item.secretPath}::${item.secretKey}`, item);
  });
  return Array.from(seen.values());
};
