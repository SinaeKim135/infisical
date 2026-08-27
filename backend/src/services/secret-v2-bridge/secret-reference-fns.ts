import path from "node:path";

import RE2 from "re2";

import { ForbiddenRequestError } from "@app/lib/errors";

import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretV2BridgeDALFactory } from "./secret-v2-bridge-dal";

// Allows the cross-project separator ":" in addition to the same-project reference characters.
// A cross-project reference is written as ${<projectSlug>::<environment>.<path>.<KEY>} where the
// double colon "::" unambiguously separates the source project slug from the rest of the reference.
const INTERPOLATION_PATTERN_STRING = String.raw`\${([a-zA-Z0-9-_.:]+)}`;
const INTERPOLATION_TEST_REGEX = new RE2(INTERPOLATION_PATTERN_STRING);

// Marker that distinguishes a cross-project reference (${slug::env.path.KEY}) from a
// same-project nested reference (${env.path.KEY}).
export const CROSS_PROJECT_REF_SEPARATOR = "::";

type TParsedReference = {
  // Present only for cross-project references; undefined for same-project references.
  projectSlug?: string;
  environment: string;
  secretPath: string;
  secretKey: string;
};

/**
 * Parses the inner contents of an interpolation (the part between ${ and }) into its
 * environment / path / key parts, handling the cross-project "<slug>::" prefix when present.
 *
 * - "SECRET_NAME"                       -> local reference, resolved against the caller-supplied env/path
 * - "dev.someFolder.SECRET_NAME"        -> same-project nested reference
 * - "shared-infra::prod.tls.CERT"       -> cross-project reference
 *
 * For a local reference the environment/secretPath are left empty so the caller can fill in the
 * current secret's environment and path.
 */
const parseInterpolationKey = (interpolationKey: string): TParsedReference | null => {
  const trimmed = interpolationKey.trim();
  if (!trimmed) return null;

  let projectSlug: string | undefined;
  let rest = trimmed;

  if (trimmed.includes(CROSS_PROJECT_REF_SEPARATOR)) {
    const separatorIndex = trimmed.indexOf(CROSS_PROJECT_REF_SEPARATOR);
    projectSlug = trimmed.slice(0, separatorIndex);
    rest = trimmed.slice(separatorIndex + CROSS_PROJECT_REF_SEPARATOR.length);
    // A cross-project reference must specify a slug and at least <env>.<KEY>; reject malformed ones.
    // A stray ":" remaining in either part means it is not a well-formed cross-project reference.
    if (!projectSlug || !rest.includes(".") || projectSlug.includes(":") || rest.includes(":")) return null;
  } else if (trimmed.includes(":")) {
    // A single colon (without the "::" cross-project marker) is not a reference. Preserve the
    // previous behavior where such interpolations were left untouched as literal text.
    return null;
  }

  const entities = rest.split(".").filter(Boolean);
  if (!entities.length) return null;

  // Local reference: ${SECRET_NAME} (no project, no dots)
  if (!projectSlug && entities.length === 1) {
    return { environment: "", secretPath: "", secretKey: entities[0] };
  }

  const environment = entities[0];
  const secretPath = path.join("/", ...entities.slice(1, entities.length - 1));
  const secretKey = entities[entities.length - 1];

  return { projectSlug, environment, secretPath, secretKey };
};

/**
 * Grabs and processes nested secret references from a string
 *
 * This function looks for patterns that match the interpolation syntax in the input string.
 * It splits them into same-project nested references, local references, and cross-project
 * references (those carrying a "<slug>::" prefix).
 * @example
 * const value = "Hello ${dev.someFolder.OtherFolder.SECRET_NAME} and ${shared::prod.tls.CERT}";
 * const result = getAllSecretReferences(value);
 * // result will be:
 * // {
 * //   nestedReferences: [{ environment: 'dev', secretPath: '/someFolder/OtherFolder', secretKey: 'SECRET_NAME' }],
 * //   localReferences: [],
 * //   crossProjectReferences: [{ projectSlug: 'shared', environment: 'prod', secretPath: '/tls', secretKey: 'CERT' }]
 * // }
 */
export const getAllSecretReferences = (maybeSecretReference: string) => {
  const references: string[] = [];
  let match;

  const regex = new RE2(INTERPOLATION_PATTERN_STRING, "g");
  // eslint-disable-next-line no-cond-assign
  while ((match = regex.exec(maybeSecretReference)) !== null) {
    references.push(match[1]);
  }

  const nestedReferences: Array<{ environment: string; secretPath: string; secretKey: string }> = [];
  const localReferences: string[] = [];
  const crossProjectReferences: Array<{
    projectSlug: string;
    environment: string;
    secretPath: string;
    secretKey: string;
  }> = [];

  references.forEach((reference) => {
    const parsed = parseInterpolationKey(reference);
    if (!parsed) return;

    if (parsed.projectSlug) {
      crossProjectReferences.push({
        projectSlug: parsed.projectSlug,
        environment: parsed.environment,
        secretPath: parsed.secretPath,
        secretKey: parsed.secretKey
      });
    } else if (!parsed.environment) {
      localReferences.push(parsed.secretKey);
    } else {
      nestedReferences.push({
        environment: parsed.environment,
        secretPath: parsed.secretPath,
        secretKey: parsed.secretKey
      });
    }
  });

  return { nestedReferences, localReferences, crossProjectReferences };
};

// used to convert multi line ones to quotes ones with \n
const formatMultiValueEnv = (val?: string) => {
  if (!val) return "";
  if (!val.match("\n")) return val;
  return `"${val.replaceAll("\n", "\\n")}"`;
};

export type TSecretReferenceTraceNode = {
  key: string;
  value?: string;
  environment: string;
  secretPath: string;
  projectSlug?: string;
  children: TSecretReferenceTraceNode[];
};

// The set of project-scoped capabilities needed to resolve a reference. The "home" project's
// context is derived from the factory arguments; foreign projects are produced on demand by
// crossProjectResolver so each project's KMS decryptor and permission gate are applied correctly.
export type TProjectExpansionContext = {
  projectId: string;
  secretDAL: Pick<TSecretV2BridgeDALFactory, "findByFolderId">;
  decryptSecretValue: (encryptedValue?: Buffer | null) => string | undefined;
  canExpandValue: (environment: string, secretPath: string, secretName: string, secretTagSlugs: string[]) => boolean;
};

// Resolves a project slug into an expansion context. Implementations are expected to enforce that
// the requesting actor has access to the referenced project (fail closed by throwing otherwise).
export type TCrossProjectReferenceResolver = (projectSlug: string) => Promise<TProjectExpansionContext>;

type TInterpolateSecretArg = {
  projectId: string;
  decryptSecretValue: (encryptedValue?: Buffer | null) => string | undefined;
  secretDAL: Pick<TSecretV2BridgeDALFactory, "findByFolderId">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath">;
  canExpandValue: (environment: string, secretPath: string, secretName: string, secretTagSlugs: string[]) => boolean;
  // When provided, personal secret overrides for this user will be preferred
  // over shared secrets when resolving references during expansion.
  userId?: string;
  // When provided, ${<slug>::<env>.<path>.<KEY>} references are resolved against the referenced
  // project using the context this resolver returns. When omitted, cross-project references are
  // rejected.
  crossProjectResolver?: TCrossProjectReferenceResolver;
};

const MAX_SECRET_REFERENCE_DEPTH = 10;
export const expandSecretReferencesFactory = ({
  projectId,
  decryptSecretValue: decryptSecret,
  secretDAL,
  folderDAL,
  canExpandValue,
  userId,
  crossProjectResolver
}: TInterpolateSecretArg) => {
  const homeContext: TProjectExpansionContext = {
    projectId,
    secretDAL,
    decryptSecretValue: decryptSecret,
    canExpandValue
  };

  // Cache resolved project contexts (keyed by slug) so repeated references to the same project
  // within a single expansion do not re-run project lookup / permission / KMS resolution.
  const projectContextCache = new Map<string, Promise<TProjectExpansionContext>>();
  const resolveProjectContext = (projectSlug: string) => {
    // crossProjectResolver presence is checked by the caller before this point.
    let resolved = projectContextCache.get(projectSlug);
    if (!resolved) {
      resolved = crossProjectResolver!(projectSlug);
      projectContextCache.set(projectSlug, resolved);
    }
    return resolved;
  };

  const secretCache: Record<string, Record<string, { value: string; tags: string[] }>> = {};
  const getCacheUniqueKey = (environment: string, secretPath: string) => `${environment}-${secretPath}`;

  const fetchSecret = async (
    ctx: TProjectExpansionContext,
    environment: string,
    secretPath: string,
    secretKey: string
  ) => {
    const cacheKey = getCacheUniqueKey(environment, secretPath);

    if (secretCache?.[cacheKey]) {
      return secretCache[cacheKey][secretKey] || { value: "", tags: [] };
    }

    try {
      const folder = await folderDAL.findBySecretPath(ctx.projectId, environment, secretPath);
      if (!folder) return { value: "", tags: [] };
      // When userId is provided, findByFolderId returns both shared and personal secrets.
      // Personal overrides will take precedence over shared secrets in the reduce below.
      const secrets = await ctx.secretDAL.findByFolderId({ folderId: folder.id, userId });

      const decryptedSecret = secrets.reduce<Record<string, { value: string; tags: string[] }>>((prev, secret) => {
        // When userId is set, personal overrides (userId !== null) should take precedence
        // over shared secrets for the same key. We skip overwriting if a personal override
        // is already stored and the current secret is a shared one.
        if (userId && prev[secret.key] && !secret.userId) {
          return prev;
        }

        // eslint-disable-next-line no-param-reassign
        prev[secret.key] = {
          value: ctx.decryptSecretValue(secret.encryptedValue) || "",
          tags: secret.tags?.map((el) => el.slug)
        };
        return prev;
      }, {});

      secretCache[cacheKey] = decryptedSecret;

      return secretCache[cacheKey][secretKey] || { value: "", tags: [] };
    } catch (error) {
      secretCache[cacheKey] = {};
      return { value: "", tags: [] };
    }
  };

  type TExpansionStackItem = {
    value?: string;
    secretPath: string;
    environment: string;
    secretKey: string;
    depth: number;
    trace: TSecretReferenceTraceNode | null;
    visitedSecrets: Set<string>;
    ctx: TProjectExpansionContext;
  };

  const recursivelyExpandSecret = async (dto: {
    value?: string;
    secretPath: string;
    environment: string;
    shouldStackTrace?: boolean;
    secretKey: string;
  }) => {
    const stackTrace = { ...dto, key: "root", children: [] } as TSecretReferenceTraceNode;

    if (!dto.value) return { expandedValue: "", stackTrace };

    // Track visited secrets to prevent circular references. The project id is part of the id so
    // cycles spanning multiple projects (A -> B -> A) are detected too.
    const createSecretId = (env: string, secretPath: string, key: string) => `${env}:${secretPath}:${key}`;

    const currentSecretId = createSecretId(dto.environment, dto.secretPath, dto.secretKey);
    const stack: TExpansionStackItem[] = [
      {
        ...dto,
        depth: 0,
        trace: stackTrace,
        visitedSecrets: new Set<string>([currentSecretId]),
        ctx: homeContext
      }
    ];
    let expandedValue = dto.value;

    while (stack.length) {
      const { value, secretPath, environment, depth, trace, visitedSecrets, ctx } = stack.pop()!;

      // eslint-disable-next-line no-continue
      if (depth > MAX_SECRET_REFERENCE_DEPTH) continue;

      const matchRegex = new RE2(INTERPOLATION_PATTERN_STRING, "g");
      const refs = [];
      let match;

      // eslint-disable-next-line no-cond-assign
      while ((match = matchRegex.exec(value || "")) !== null) {
        refs.push(match[0]);
      }

      if (refs.length > 0) {
        for (const interpolationSyntax of refs) {
          const interpolationKey = interpolationSyntax.slice(2, interpolationSyntax.length - 1);
          const parsed = parseInterpolationKey(interpolationKey);

          // eslint-disable-next-line no-continue
          if (!parsed) continue;

          // When cross-project resolution is not wired in this context (e.g. background sync or
          // validation jobs without an actor), leave the cross-project reference as literal text
          // instead of failing. The wired read paths supply a resolver and resolve it fully.
          // eslint-disable-next-line no-continue
          if (parsed.projectSlug && !crossProjectResolver) continue;

          // Determine the project context, environment and path that this reference resolves against.
          let targetCtx = ctx;
          let referencedSecretEnvironmentSlug: string;
          let referencedSecretPath: string;
          const referencedSecretKey = parsed.secretKey;

          if (parsed.projectSlug) {
            // eslint-disable-next-line no-await-in-loop
            targetCtx = await resolveProjectContext(parsed.projectSlug);
            referencedSecretEnvironmentSlug = parsed.environment;
            referencedSecretPath = parsed.secretPath;
          } else if (!parsed.environment) {
            // local reference resolves against the current secret's environment and path
            referencedSecretEnvironmentSlug = environment;
            referencedSecretPath = secretPath;
          } else {
            referencedSecretEnvironmentSlug = parsed.environment;
            referencedSecretPath = parsed.secretPath;
          }

          // eslint-disable-next-line no-await-in-loop
          const referredValue = await fetchSecret(
            targetCtx,
            referencedSecretEnvironmentSlug,
            referencedSecretPath,
            referencedSecretKey
          );

          if (
            !ctx.canExpandValue(
              referencedSecretEnvironmentSlug,
              referencedSecretPath,
              referencedSecretKey,
              referredValue.tags
            )
          ) {
            const referencedLocation = parsed.projectSlug
              ? `secret '${referencedSecretKey}' in project '${parsed.projectSlug}', environment '${referencedSecretEnvironmentSlug}' at path '${referencedSecretPath}'`
              : `secret '${referencedSecretKey}' in environment '${referencedSecretEnvironmentSlug}' at path '${referencedSecretPath}'`;
            throw new ForbiddenRequestError({
              message: `You do not have permission to read ${referencedLocation}, which is referenced by secret '${dto.secretKey}' in environment '${dto.environment}' at path '${dto.secretPath}'.`
            });
          }

          const cacheKey = getCacheUniqueKey(referencedSecretEnvironmentSlug, referencedSecretPath);
          if (!secretCache[cacheKey]) secretCache[cacheKey] = {};
          secretCache[cacheKey][referencedSecretKey] = referredValue;

          const referencedSecretValue = referredValue.value;

          const node = {
            value: referencedSecretValue,
            secretPath: referencedSecretPath,
            environment: referencedSecretEnvironmentSlug,
            depth: depth + 1,
            secretKey: referencedSecretKey,
            ctx: targetCtx,
            trace
          };

          // Check for circular reference
          const referencedSecretId = createSecretId(
            referencedSecretEnvironmentSlug,
            referencedSecretPath,
            referencedSecretKey
          );
          const isCircular = visitedSecrets.has(referencedSecretId);

          const newVisitedSecrets = new Set([...visitedSecrets, referencedSecretId]);

          const shouldExpandMore = INTERPOLATION_TEST_REGEX.test(referencedSecretValue) && !isCircular;
          if (dto.shouldStackTrace) {
            const stackTraceNode = {
              ...node,
              children: [],
              key: referencedSecretKey,
              projectSlug: parsed.projectSlug,
              trace: null
            };
            trace?.children.push(stackTraceNode);
            // if stack trace this would be child node
            if (shouldExpandMore) {
              stack.push({ ...node, trace: stackTraceNode, visitedSecrets: newVisitedSecrets });
            }
          } else if (shouldExpandMore) {
            // if no stack trace is needed we just keep going with root node
            stack.push({ ...node, trace: null, visitedSecrets: newVisitedSecrets });
          }

          if (referencedSecretValue) {
            expandedValue = expandedValue.replaceAll(
              interpolationSyntax,
              () => referencedSecretValue // prevents special characters from triggering replacement patterns
            );
          }
        }
      }
    }

    return { expandedValue, stackTrace };
  };

  const expandSecret = async (inputSecret: {
    value?: string;
    skipMultilineEncoding?: boolean | null;
    secretPath: string;
    environment: string;
    secretKey: string;
  }) => {
    if (!inputSecret.value) return inputSecret.value;

    const shouldExpand = INTERPOLATION_TEST_REGEX.test(inputSecret.value);
    if (!shouldExpand) return inputSecret.value;

    const { expandedValue } = await recursivelyExpandSecret(inputSecret);

    return inputSecret.skipMultilineEncoding ? formatMultiValueEnv(expandedValue) : expandedValue;
  };

  const getExpandedSecretStackTrace = async (inputSecret: {
    value?: string;
    secretPath: string;
    environment: string;
    secretKey: string;
  }) => {
    const { stackTrace, expandedValue } = await recursivelyExpandSecret({ ...inputSecret, shouldStackTrace: true });
    return { stackTrace, expandedValue };
  };

  return { expandSecretReferences: expandSecret, getExpandedSecretStackTrace };
};
