import { dedupeBulkImportItems, normalizeSecretPath, parseBulkImport } from "./secret-bulk-import-fns";
import { BulkImportFormat } from "./secret-bulk-import-types";

const DEFAULT_ENV = "dev";
const DEFAULT_PATH = "/";

describe("normalizeSecretPath", () => {
  test.each([
    [undefined, "/"],
    ["", "/"],
    ["/", "/"],
    ["foo", "/foo"],
    ["/foo/", "/foo"],
    ["/foo/bar/", "/foo/bar"],
    ["  /foo  ", "/foo"]
  ])("normalizes %p -> %p", (input, expected) => {
    expect(normalizeSecretPath(input)).toBe(expected);
  });
});

describe("parseBulkImport - env", () => {
  test("parses simple KEY=VALUE pairs", () => {
    const { items, parseErrors } = parseBulkImport({
      format: BulkImportFormat.Env,
      data: "FOO=bar\nBAZ=qux",
      defaultEnvironment: DEFAULT_ENV,
      defaultSecretPath: DEFAULT_PATH
    });
    expect(parseErrors).toHaveLength(0);
    expect(items).toEqual([
      { environment: "dev", secretPath: "/", secretKey: "FOO", secretValue: "bar" },
      { environment: "dev", secretPath: "/", secretKey: "BAZ", secretValue: "qux" }
    ]);
  });

  test("handles export prefix, comments, blank lines, and quotes", () => {
    const { items, parseErrors } = parseBulkImport({
      format: BulkImportFormat.Env,
      data: ['# a comment', 'export FOO="quoted value"', "", "BAR='single'", "  ", "EMPTY="].join("\n"),
      defaultEnvironment: DEFAULT_ENV,
      defaultSecretPath: DEFAULT_PATH
    });
    expect(parseErrors).toHaveLength(0);
    expect(items).toEqual([
      { environment: "dev", secretPath: "/", secretKey: "FOO", secretValue: "quoted value" },
      { environment: "dev", secretPath: "/", secretKey: "BAR", secretValue: "single" },
      { environment: "dev", secretPath: "/", secretKey: "EMPTY", secretValue: "" }
    ]);
  });

  test("records parse errors for malformed lines and invalid keys", () => {
    const { items, parseErrors } = parseBulkImport({
      format: BulkImportFormat.Env,
      data: ["VALID=1", "no_separator_here", "BAD:KEY=2"].join("\n"),
      defaultEnvironment: DEFAULT_ENV,
      defaultSecretPath: DEFAULT_PATH
    });
    expect(items).toHaveLength(1);
    expect(items[0].secretKey).toBe("VALID");
    expect(parseErrors).toHaveLength(2);
    expect(parseErrors[0]).toMatchObject({ line: 2, message: "Missing '=' separator" });
    expect(parseErrors[1].line).toBe(3);
    expect(parseErrors[1].message).toContain("Invalid secret key");
  });
});

describe("parseBulkImport - json", () => {
  test("parses a flat object against the default env + path", () => {
    const { items, parseErrors } = parseBulkImport({
      format: BulkImportFormat.Json,
      data: JSON.stringify({ FOO: "bar", COUNT: 5, FLAG: true }),
      defaultEnvironment: DEFAULT_ENV,
      defaultSecretPath: "/api"
    });
    expect(parseErrors).toHaveLength(0);
    expect(items).toEqual([
      { environment: "dev", secretPath: "/api", secretKey: "FOO", secretValue: "bar", secretComment: undefined },
      { environment: "dev", secretPath: "/api", secretKey: "COUNT", secretValue: "5", secretComment: undefined },
      { environment: "dev", secretPath: "/api", secretKey: "FLAG", secretValue: "true", secretComment: undefined }
    ]);
  });

  test("parses a structured array with per-item environment and path overrides", () => {
    const { items, parseErrors } = parseBulkImport({
      format: BulkImportFormat.Json,
      data: JSON.stringify([
        { key: "A", value: "1", environment: "prod", path: "/svc/" },
        { secretKey: "B", secretValue: "2", comment: "note" },
        { key: "C", value: "3" }
      ]),
      defaultEnvironment: DEFAULT_ENV,
      defaultSecretPath: DEFAULT_PATH
    });
    expect(parseErrors).toHaveLength(0);
    expect(items).toEqual([
      { environment: "prod", secretPath: "/svc", secretKey: "A", secretValue: "1", secretComment: undefined },
      { environment: "dev", secretPath: "/", secretKey: "B", secretValue: "2", secretComment: "note" },
      { environment: "dev", secretPath: "/", secretKey: "C", secretValue: "3", secretComment: undefined }
    ]);
  });

  test("rejects non-primitive values and invalid JSON", () => {
    const objectValue = parseBulkImport({
      format: BulkImportFormat.Json,
      data: JSON.stringify({ FOO: { nested: true } }),
      defaultEnvironment: DEFAULT_ENV,
      defaultSecretPath: DEFAULT_PATH
    });
    expect(objectValue.items).toHaveLength(0);
    expect(objectValue.parseErrors[0].message).toContain("must be a string, number, or boolean");

    const broken = parseBulkImport({
      format: BulkImportFormat.Json,
      data: "{not valid json",
      defaultEnvironment: DEFAULT_ENV,
      defaultSecretPath: DEFAULT_PATH
    });
    expect(broken.items).toHaveLength(0);
    expect(broken.parseErrors[0].message).toContain("Invalid JSON");
  });
});

describe("parseBulkImport - csv", () => {
  test("parses with a header and maps known columns", () => {
    const { items, parseErrors } = parseBulkImport({
      format: BulkImportFormat.Csv,
      data: ["key,value,comment", "FOO,bar,a comment", "BAZ,qux,"].join("\n"),
      defaultEnvironment: DEFAULT_ENV,
      defaultSecretPath: DEFAULT_PATH
    });
    expect(parseErrors).toHaveLength(0);
    expect(items).toEqual([
      { environment: "dev", secretPath: "/", secretKey: "FOO", secretValue: "bar", secretComment: "a comment" },
      { environment: "dev", secretPath: "/", secretKey: "BAZ", secretValue: "qux", secretComment: "" }
    ]);
  });

  test("supports environment + path columns and quoted values containing the delimiter", () => {
    const { items, parseErrors } = parseBulkImport({
      format: BulkImportFormat.Csv,
      data: ["environment,path,key,value", 'prod,/db,DSN,"postgres://a,b/c"', "staging,svc,TOKEN,xyz"].join("\n"),
      defaultEnvironment: DEFAULT_ENV,
      defaultSecretPath: DEFAULT_PATH
    });
    expect(parseErrors).toHaveLength(0);
    expect(items).toEqual([
      { environment: "prod", secretPath: "/db", secretKey: "DSN", secretValue: "postgres://a,b/c", secretComment: undefined },
      { environment: "staging", secretPath: "/svc", secretKey: "TOKEN", secretValue: "xyz", secretComment: undefined }
    ]);
  });

  test("auto-detects a semicolon delimiter and reports a missing key column", () => {
    const semicolon = parseBulkImport({
      format: BulkImportFormat.Csv,
      data: ["key;value", "FOO;bar"].join("\n"),
      defaultEnvironment: DEFAULT_ENV,
      defaultSecretPath: DEFAULT_PATH
    });
    expect(semicolon.parseErrors).toHaveLength(0);
    expect(semicolon.items[0]).toMatchObject({ secretKey: "FOO", secretValue: "bar" });

    const noKey = parseBulkImport({
      format: BulkImportFormat.Csv,
      data: ["foo,bar", "1,2"].join("\n"),
      defaultEnvironment: DEFAULT_ENV,
      defaultSecretPath: DEFAULT_PATH
    });
    expect(noKey.items).toHaveLength(0);
    expect(noKey.parseErrors[0].message).toContain('must include a "key" column');
  });
});

describe("dedupeBulkImportItems", () => {
  test("keeps the last occurrence per environment + path + key", () => {
    const deduped = dedupeBulkImportItems([
      { environment: "dev", secretPath: "/", secretKey: "FOO", secretValue: "1" },
      { environment: "dev", secretPath: "/", secretKey: "FOO", secretValue: "2" },
      { environment: "prod", secretPath: "/", secretKey: "FOO", secretValue: "3" }
    ]);
    expect(deduped).toEqual([
      { environment: "dev", secretPath: "/", secretKey: "FOO", secretValue: "2" },
      { environment: "prod", secretPath: "/", secretKey: "FOO", secretValue: "3" }
    ]);
  });
});
