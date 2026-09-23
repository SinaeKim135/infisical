/**
 * Secret reference helpers (mirror of the backend grammar).
 *
 * References use dots as environment/path/key separators, e.g.
 * `${dev.folder.KEY}`. A secret key that itself contains a dot must be
 * escaped so the dot is not read as a separator.
 */

/**
 * Escapes a secret key so it can be embedded as a single token inside a
 * `${...}` reference — every backslash and dot is backslash-escaped.
 */
export const escapeSecretReferenceKey = (key: string): string =>
  key.replace(/\\/g, "\\\\").replace(/\./g, "\\.");
