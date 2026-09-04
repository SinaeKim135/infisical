import { mergeSecretsByPathPrecedence, normalizeSecretPaths } from "./secret-multi-path-fns";

describe("normalizeSecretPaths", () => {
  test("trims, adds leading slash and strips trailing slash", () => {
    expect(normalizeSecretPaths([" shared/ ", "/team-a/", "/svc"])).toEqual(["/shared", "/team-a", "/svc"]);
  });

  test("keeps root path as-is", () => {
    expect(normalizeSecretPaths(["/"])).toEqual(["/"]);
  });

  test("de-duplicates preserving first appearance order", () => {
    expect(normalizeSecretPaths(["/shared", "/svc", "/shared"])).toEqual(["/shared", "/svc"]);
  });

  test("drops empty entries", () => {
    expect(normalizeSecretPaths(["", "  ", "/svc"])).toEqual(["/svc"]);
  });

  test("throws when nothing valid remains", () => {
    expect(() => normalizeSecretPaths(["", "  "])).toThrow("At least one valid secret path");
  });

  test("throws above the path cap", () => {
    const paths = Array.from({ length: 11 }, (_, i) => `/p${i}`);
    expect(() => normalizeSecretPaths(paths)).toThrow("maximum of 10");
  });
});

describe("mergeSecretsByPathPrecedence", () => {
  const secret = (secretKey: string, value: string, type = "shared") => ({
    secretKey,
    type,
    secretValue: value
  });

  test("later path wins on key conflicts", () => {
    const { secrets, overrides } = mergeSecretsByPathPrecedence([
      { path: "/shared", secrets: [secret("LOG_LEVEL", "info"), secret("DB_HOST", "shared-db")] },
      { path: "/svc", secrets: [secret("LOG_LEVEL", "debug")] }
    ]);

    const logLevel = secrets.find((el) => el.secretKey === "LOG_LEVEL");
    expect(logLevel?.secretValue).toBe("debug");
    expect(logLevel?.secretPath).toBe("/svc");
    expect(secrets).toHaveLength(2);
    expect(overrides).toEqual([
      { secretKey: "LOG_LEVEL", type: "shared", winningPath: "/svc", overriddenPaths: ["/shared"] }
    ]);
  });

  test("non-conflicting keys from all paths are preserved with source annotation", () => {
    const { secrets, overrides } = mergeSecretsByPathPrecedence([
      { path: "/shared", secrets: [secret("A", "1")] },
      { path: "/svc", secrets: [secret("B", "2")] }
    ]);

    expect(secrets.map((el) => [el.secretKey, el.secretPath])).toEqual([
      ["A", "/shared"],
      ["B", "/svc"]
    ]);
    expect(overrides).toHaveLength(0);
  });

  test("shared and personal secrets merge independently", () => {
    const { secrets, overrides } = mergeSecretsByPathPrecedence([
      { path: "/shared", secrets: [secret("TOKEN", "shared-a", "shared")] },
      { path: "/svc", secrets: [secret("TOKEN", "personal-b", "personal")] }
    ]);

    // personal TOKEN in a later path must not displace the shared TOKEN
    expect(secrets).toHaveLength(2);
    expect(overrides).toHaveLength(0);
  });

  test("tracks every shadowed path across three levels", () => {
    const { overrides } = mergeSecretsByPathPrecedence([
      { path: "/a", secrets: [secret("K", "1")] },
      { path: "/b", secrets: [secret("K", "2")] },
      { path: "/c", secrets: [secret("K", "3")] }
    ]);

    expect(overrides).toEqual([{ secretKey: "K", type: "shared", winningPath: "/c", overriddenPaths: ["/a", "/b"] }]);
  });

  test("keeps an existing secretPath annotation if already present", () => {
    const { secrets } = mergeSecretsByPathPrecedence([
      { path: "/a", secrets: [{ secretKey: "K", type: "shared", secretPath: "/a/nested" }] }
    ]);
    expect(secrets[0].secretPath).toBe("/a/nested");
  });
});
