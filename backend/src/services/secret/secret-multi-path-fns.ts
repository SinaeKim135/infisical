import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";

export const MAX_MULTI_PATH_SECRET_PATHS = 10;

/**
 * Normalizes a list of secret paths for multi-path fetching:
 * - trims whitespace and drops empty entries
 * - ensures a leading slash and strips trailing slashes
 * - de-duplicates while preserving the order of first appearance
 *   (precedence is positional, so a repeated path adds nothing new)
 *
 * Throws when no valid path remains or when the path count exceeds
 * MAX_MULTI_PATH_SECRET_PATHS.
 */
export const normalizeSecretPaths = (paths: string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const rawPath of paths) {
    const trimmed = rawPath.trim();
    if (!trimmed) {
      // eslint-disable-next-line no-continue
      continue;
    }
    const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    const path = withLeadingSlash === "/" ? "/" : removeTrailingSlash(withLeadingSlash);
    if (!seen.has(path)) {
      seen.add(path);
      normalized.push(path);
    }
  }

  if (!normalized.length) {
    throw new BadRequestError({ message: "At least one valid secret path must be provided" });
  }

  if (normalized.length > MAX_MULTI_PATH_SECRET_PATHS) {
    throw new BadRequestError({
      message: `A maximum of ${MAX_MULTI_PATH_SECRET_PATHS} secret paths can be fetched per request, received ${normalized.length}`
    });
  }

  return normalized;
};

type TMergeableSecret = {
  secretKey: string;
  type?: string | null;
  secretPath?: string;
};

export type TSecretPathGroup<T extends TMergeableSecret> = {
  path: string;
  secrets: T[];
};

export type TMultiPathOverride = {
  secretKey: string;
  type: string;
  winningPath: string;
  overriddenPaths: string[];
};

/**
 * Merges per-path secret lists with positional precedence: when the same
 * key appears in multiple paths, the entry from the LATER path in the list
 * wins. Shared and personal secrets are merged independently (a personal
 * secret in a later path never displaces a shared secret from an earlier
 * one, and vice versa) so that per-path override semantics computed by the
 * secret service are preserved.
 *
 * Every merged secret is annotated with the path it was sourced from.
 */
export const mergeSecretsByPathPrecedence = <T extends TMergeableSecret>(
  groupsInOrder: TSecretPathGroup<T>[]
): { secrets: T[]; overrides: TMultiPathOverride[] } => {
  const mergedByUnit = new Map<string, { secret: T; path: string }>();
  const shadowedPathsByUnit = new Map<string, string[]>();

  for (const group of groupsInOrder) {
    for (const secret of group.secrets) {
      const type = secret.type ?? "shared";
      const unitKey = `${type}:${secret.secretKey}`;

      const existing = mergedByUnit.get(unitKey);
      if (existing) {
        const shadowed = shadowedPathsByUnit.get(unitKey) ?? [];
        shadowed.push(existing.path);
        shadowedPathsByUnit.set(unitKey, shadowed);
      }

      mergedByUnit.set(unitKey, {
        secret: { ...secret, secretPath: secret.secretPath ?? group.path },
        path: group.path
      });
    }
  }

  const overrides: TMultiPathOverride[] = [];
  for (const [unitKey, winner] of mergedByUnit.entries()) {
    const shadowed = shadowedPathsByUnit.get(unitKey);
    if (shadowed?.length) {
      const [type, ...keyParts] = unitKey.split(":");
      overrides.push({
        secretKey: keyParts.join(":"),
        type,
        winningPath: winner.path,
        overriddenPaths: shadowed
      });
    }
  }

  return {
    secrets: [...mergedByUnit.values()].map((el) => el.secret),
    overrides
  };
};
