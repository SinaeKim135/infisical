/**
 * Secret reference grammar helpers.
 *
 * A reference like `${dev.folder.KEY}` is split on dots into environment, path
 * segments and the trailing key. Because a dot is the separator, secret keys
 * that legitimately contain a dot (e.g. `app.db.host`) could not be referenced.
 *
 * These helpers add a backslash escape: an escaped dot (`\.`) is treated as a
 * literal character inside a token rather than a separator, so
 * `${dev.folder.app\.db\.host}` resolves to the key `app.db.host` at `/folder`.
 */

/**
 * Splits a raw interpolation body (the text between `${` and `}`) into its
 * dot-separated tokens, honouring `\.` as an escaped literal dot. Each returned
 * token is unescaped (`\.` -> `.`, `\\` -> `\`).
 */
export const parseReferenceTokens = (interpolationKey: string): string[] => {
  const tokens: string[] = [];
  let current = "";

  for (let i = 0; i < interpolationKey.length; i += 1) {
    const char = interpolationKey[i];

    if (char === "\\") {
      const next = interpolationKey[i + 1];
      if (next === "." || next === "\\") {
        current += next;
        i += 1;
        // eslint-disable-next-line no-continue
        continue;
      }
      // a lone backslash is kept as-is
      current += char;
      // eslint-disable-next-line no-continue
      continue;
    }

    if (char === ".") {
      tokens.push(current);
      current = "";
      // eslint-disable-next-line no-continue
      continue;
    }

    current += char;
  }

  tokens.push(current);
  return tokens;
};

/**
 * Escapes a secret key so it can be embedded as a single token inside a
 * reference — every literal dot and backslash is backslash-escaped. Used when
 * constructing a reference to a secret whose name contains dots.
 */
export const escapeReferenceToken = (token: string): string => token.replace(/\\/g, "\\\\").replace(/\./g, "\\.");
