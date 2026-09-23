import { subject } from "@casl/ability";
import { Knex } from "knex";

import { ActionProjectType, SecretType, TableName } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { logger } from "@app/lib/logger";

import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretFolderServiceFactory } from "../secret-folder/secret-folder-service";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { TSecretV2BridgeServiceFactory } from "../secret-v2-bridge/secret-v2-bridge-service";
import { SecretUpdateMode } from "../secret-v2-bridge/secret-v2-bridge-types";
import { dedupeBulkImportItems, normalizeSecretPath, parseBulkImport } from "./secret-bulk-import-fns";
import {
  BulkImportItemAction,
  TBulkImportDryRunResult,
  TBulkImportItemPreview,
  TBulkImportParseError,
  TBulkImportResult,
  TBulkImportSecretsDTO,
  TParsedBulkImportItem
} from "./secret-bulk-import-types";

type TSecretBulkImportServiceFactoryDep = {
  secretV2BridgeService: Pick<TSecretV2BridgeServiceFactory, "updateManySecret">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "find" | "transaction">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath">;
  folderService: Pick<TSecretFolderServiceFactory, "createFolder">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TSecretBulkImportServiceFactory = ReturnType<typeof secretBulkImportServiceFactory>;

// guard rail so a single request cannot try to push an unbounded number of secrets through one transaction
const MAX_BULK_IMPORT_SECRETS = 10_000;

export const secretBulkImportServiceFactory = ({
  secretV2BridgeService,
  secretV2BridgeDAL,
  folderDAL,
  folderService,
  projectEnvDAL,
  permissionService
}: TSecretBulkImportServiceFactoryDep) => {
  // result of resolving the existing keys at a single environment + path
  type TFolderState = { folderExists: boolean; existingKeys: Set<string> };

  type TBuildPlan = {
    preview: TBulkImportItemPreview[];
    parseErrors: TBulkImportParseError[];
    foldersToCreate: Set<string>;
    // env slug -> the items that should actually be written (create + allowed overwrite)
    writeByEnv: Map<string, TParsedBulkImportItem[]>;
    created: number;
    overwritten: number;
    skipped: number;
  };

  const buildPlan = async ({
    items,
    permission,
    envBySlug,
    overwriteExisting,
    getFolderState
  }: {
    items: TParsedBulkImportItem[];
    permission: Awaited<ReturnType<TPermissionServiceFactory["getProjectPermission"]>>["permission"];
    envBySlug: Map<string, { id: string; slug: string }>;
    overwriteExisting: boolean;
    getFolderState: (envSlug: string, secretPath: string, keys: string[]) => Promise<TFolderState>;
  }): Promise<TBuildPlan> => {
    const preview: TBulkImportItemPreview[] = [];
    const parseErrors: TBulkImportParseError[] = [];
    const foldersToCreate = new Set<string>();
    const writeByEnv = new Map<string, TParsedBulkImportItem[]>();
    let created = 0;
    let overwritten = 0;
    let skipped = 0;

    const addToWrite = (envSlug: string, item: TParsedBulkImportItem) => {
      const existing = writeByEnv.get(envSlug);
      if (existing) existing.push(item);
      else writeByEnv.set(envSlug, [item]);
    };

    const itemsByEnvPath = groupBy(items, (item) => `${item.environment}::${item.secretPath}`);

    for (const groupKey of Object.keys(itemsByEnvPath)) {
      const group = itemsByEnvPath[groupKey];
      const { environment, secretPath } = group[0];
      const envRow = envBySlug.get(environment);

      if (!envRow) {
        group.forEach((item) => {
          parseErrors.push({
            raw: `${environment}:${secretPath}:${item.secretKey}`,
            message: `Environment "${environment}" not found`
          });
        });
        // eslint-disable-next-line no-continue
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const { folderExists, existingKeys } = await getFolderState(
        envRow.slug,
        secretPath,
        group.map((item) => item.secretKey)
      );

      if (!folderExists) foldersToCreate.add(`${environment}:${secretPath}`);

      for (const item of group) {
        const exists = existingKeys.has(item.secretKey);
        const isAllowed = permission.can(
          exists ? ProjectPermissionSecretActions.Edit : ProjectPermissionSecretActions.Create,
          subject(ProjectPermissionSub.Secrets, {
            environment,
            secretPath,
            secretName: item.secretKey,
            secretTags: [] as string[]
          })
        );

        if (!isAllowed) {
          skipped += 1;
          preview.push({
            environment,
            secretPath,
            secretKey: item.secretKey,
            action: BulkImportItemAction.Skip,
            reason: "Insufficient permission"
          });
          // eslint-disable-next-line no-continue
          continue;
        }

        if (exists) {
          if (overwriteExisting) {
            overwritten += 1;
            preview.push({ environment, secretPath, secretKey: item.secretKey, action: BulkImportItemAction.Overwrite });
            addToWrite(environment, item);
          } else {
            skipped += 1;
            preview.push({
              environment,
              secretPath,
              secretKey: item.secretKey,
              action: BulkImportItemAction.Skip,
              reason: "Secret already exists"
            });
          }
        } else {
          created += 1;
          preview.push({ environment, secretPath, secretKey: item.secretKey, action: BulkImportItemAction.Create });
          addToWrite(environment, item);
        }
      }
    }

    return { preview, parseErrors, foldersToCreate, writeByEnv, created, overwritten, skipped };
  };

  // create any missing folders (in their own committed transactions) before secrets are written.
  // empty folders left behind on a later failure are harmless; this keeps folder creation out of the
  // secret write transaction, which is what guarantees the secret writes are all-or-nothing.
  const ensureFoldersExist = async ({
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    paths
  }: {
    projectId: string;
    actor: TBulkImportSecretsDTO["actor"];
    actorId: string;
    actorAuthMethod: TBulkImportSecretsDTO["actorAuthMethod"];
    actorOrgId: string;
    paths: { environment: string; secretPath: string }[];
  }) => {
    for (const { environment, secretPath } of paths) {
      if (secretPath === "/") {
        // eslint-disable-next-line no-continue
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
      if (folder) {
        // eslint-disable-next-line no-continue
        continue;
      }

      const segments = secretPath.split("/").filter(Boolean);
      const name = segments[segments.length - 1];
      const parentPath = normalizeSecretPath(segments.slice(0, -1).join("/"));

      try {
        // createFolder also creates any missing intermediate segments of parentPath
        // eslint-disable-next-line no-await-in-loop
        await folderService.createFolder({
          projectId,
          actor,
          actorId,
          actorAuthMethod,
          actorOrgId,
          environment,
          path: parentPath,
          name
        });
      } catch (err) {
        // a sibling path may have already created this folder; ignore that and only that
        if (err instanceof BadRequestError) {
          logger.info(`bulkImportSecrets: folder already exists [environment=${environment}] [path=${secretPath}]`);
          // eslint-disable-next-line no-continue
          continue;
        }
        throw err;
      }
    }
  };

  const bulkImportSecrets = async (
    dto: TBulkImportSecretsDTO
  ): Promise<TBulkImportDryRunResult | TBulkImportResult> => {
    const { projectId, actor, actorId, actorAuthMethod, actorOrgId, dryRun, overwriteExisting } = dto;

    const { items: parsedItems, parseErrors } = parseBulkImport({
      format: dto.format,
      data: dto.data,
      defaultEnvironment: dto.defaultEnvironment,
      defaultSecretPath: dto.defaultSecretPath
    });

    const items = dedupeBulkImportItems(parsedItems);

    if (items.length > MAX_BULK_IMPORT_SECRETS) {
      throw new BadRequestError({
        message: `Bulk import is limited to ${MAX_BULK_IMPORT_SECRETS} secrets per request, received ${items.length}`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    // resolve the distinct environment slugs referenced by the payload
    const distinctEnvSlugs = [...new Set(items.map((item) => item.environment))];
    const envBySlug = new Map<string, { id: string; slug: string }>();
    for (const slug of distinctEnvSlugs) {
      // eslint-disable-next-line no-await-in-loop
      const env = await projectEnvDAL.findOne({ projectId, slug });
      if (env) envBySlug.set(slug, env);
    }

    if (dryRun) {
      const plan = await buildPlan({
        items,
        permission,
        envBySlug,
        overwriteExisting,
        getFolderState: async (envSlug, secretPath, keys) => {
          const folder = await folderDAL.findBySecretPath(projectId, envSlug, secretPath);
          if (!folder) return { folderExists: false, existingKeys: new Set<string>() };
          const existing = await secretV2BridgeDAL.find({
            folderId: folder.id,
            type: SecretType.Shared,
            $in: { [`${TableName.SecretV2}.key` as "key"]: keys }
          });
          return { folderExists: true, existingKeys: new Set(existing.map((el) => el.key)) };
        }
      });

      return {
        dryRun: true,
        secretsToCreate: plan.created,
        secretsToOverwrite: plan.overwritten,
        secretsToSkip: plan.skipped,
        foldersToCreate: [...plan.foldersToCreate],
        parseErrors: [...parseErrors, ...plan.parseErrors],
        items: plan.preview
      };
    }

    // ---- real import ----
    // 1. pre-create any missing folders (committed) so the secret write transaction can resolve them
    const validPaths = items
      .filter((item) => envBySlug.has(item.environment))
      .map((item) => ({ environment: item.environment, secretPath: item.secretPath }));
    const distinctValidPaths = Array.from(
      new Map(validPaths.map((p) => [`${p.environment}::${p.secretPath}`, p])).values()
    );
    await ensureFoldersExist({
      projectId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      paths: distinctValidPaths
    });

    // 2. classify + write inside a single transaction => all-or-nothing for the secret writes
    const plan = await secretV2BridgeDAL.transaction(async (tx: Knex) => {
      const builtPlan = await buildPlan({
        items,
        permission,
        envBySlug,
        overwriteExisting,
        getFolderState: async (envSlug, secretPath, keys) => {
          const folder = await folderDAL.findBySecretPath(projectId, envSlug, secretPath, tx);
          if (!folder) return { folderExists: false, existingKeys: new Set<string>() };
          const existing = await secretV2BridgeDAL.find(
            {
              folderId: folder.id,
              type: SecretType.Shared,
              $in: { [`${TableName.SecretV2}.key` as "key"]: keys }
            },
            { tx }
          );
          return { folderExists: true, existingKeys: new Set(existing.map((el) => el.key)) };
        }
      });

      for (const [envSlug, writeItems] of builtPlan.writeByEnv.entries()) {
        if (!writeItems.length) {
          // eslint-disable-next-line no-continue
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        await secretV2BridgeService.updateManySecret({
          actor,
          actorId,
          actorAuthMethod,
          actorOrgId,
          projectId,
          environment: envSlug,
          secretPath: "/",
          mode: SecretUpdateMode.Upsert,
          secrets: writeItems.map((item) => ({
            secretKey: item.secretKey,
            secretValue: item.secretValue,
            secretComment: item.secretComment,
            secretPath: item.secretPath
          })),
          tx
        });
      }

      return builtPlan;
    });

    return {
      dryRun: false,
      imported: plan.created + plan.overwritten,
      created: plan.created,
      overwritten: plan.overwritten,
      skipped: plan.skipped,
      parseErrors: [...parseErrors, ...plan.parseErrors],
      items: plan.preview
    };
  };

  return { bulkImportSecrets };
};
