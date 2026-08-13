import { escapeReferenceToken, parseReferenceTokens } from "./secret-reference-parse-fns";

describe("parseReferenceTokens", () => {
  test("splits plain env.path.key on dots", () => {
    expect(parseReferenceTokens("dev.folder.API_KEY")).toEqual(["dev", "folder", "API_KEY"]);
  });

  test("keeps a single local key as one token", () => {
    expect(parseReferenceTokens("API_KEY")).toEqual(["API_KEY"]);
  });

  test("treats an escaped dot as a literal inside the key", () => {
    expect(parseReferenceTokens("dev.folder.app\\.db\\.host")).toEqual(["dev", "folder", "app.db.host"]);
  });

  test("a fully-escaped local key stays a single token", () => {
    expect(parseReferenceTokens("app\\.db\\.host")).toEqual(["app.db.host"]);
  });

  test("mixes escaped and unescaped dots correctly", () => {
    expect(parseReferenceTokens("prod.a\\.b.c\\.d")).toEqual(["prod", "a.b", "c.d"]);
  });

  test("unescapes an escaped backslash", () => {
    expect(parseReferenceTokens("dev.key\\\\name")).toEqual(["dev", "key\\name"]);
  });

  test("keeps a lone backslash as-is", () => {
    expect(parseReferenceTokens("dev.key\\name")).toEqual(["dev", "key\\name"]);
  });
});

describe("escapeReferenceToken", () => {
  test("escapes every dot in a key", () => {
    expect(escapeReferenceToken("app.db.host")).toBe("app\\.db\\.host");
  });

  test("escapes backslashes before dots", () => {
    expect(escapeReferenceToken("a\\b.c")).toBe("a\\\\b\\.c");
  });

  test("round-trips through parseReferenceTokens as one token", () => {
    const key = "some.dotted.key";
    expect(parseReferenceTokens(escapeReferenceToken(key))).toEqual([key]);
  });
});
