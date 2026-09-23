import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { removeTrailingSlash } from "@app/lib/fn";
import { secretsLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import {
  BulkImportFormat,
  BulkImportItemAction
} from "@app/services/secret-bulk-import/secret-bulk-import-types";

const BulkImportParseErrorSchema = z.object({
  line: z.number().optional(),
  raw: z.string().optional(),
  message: z.string()
});

const BulkImportPreviewItemSchema = z.object({
  environment: z.string(),
  secretPath: z.string(),
  secretKey: z.string(),
  action: z.nativeEnum(BulkImportItemAction),
  reason: z.string().optional()
});

export const registerSecretBulkImportRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      hide: false,
      operationId: "bulkImportSecretsV4",
      tags: [ApiDocsTags.Secrets],
      description:
        "Bulk import secrets from a raw .env, CSV, or JSON payload, optionally across multiple environments and folders. Use dryRun to preview create/overwrite counts and parse errors without writing anything.",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        projectId: z.string().trim(),
        environment: z.string().trim().describe("Default environment slug applied to items that do not specify one"),
        secretPath: z
          .string()
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe("Default secret path applied to items that do not specify one"),
        format: z.nativeEnum(BulkImportFormat),
        data: z.string().describe("Raw file contents to parse"),
        dryRun: z
          .boolean()
          .default(false)
          .describe("When true, parse and classify the payload without writing any secrets"),
        overwriteExisting: z
          .boolean()
          .default(false)
          .describe("When true, secrets that already exist are overwritten; otherwise they are skipped")
      }),
      response: {
        200: z.object({
          dryRun: z.boolean(),
          // dry-run fields
          secretsToCreate: z.number().optional(),
          secretsToOverwrite: z.number().optional(),
          secretsToSkip: z.number().optional(),
          foldersToCreate: z.string().array().optional(),
          // import fields
          imported: z.number().optional(),
          created: z.number().optional(),
          overwritten: z.number().optional(),
          skipped: z.number().optional(),
          // shared fields
          parseErrors: BulkImportParseErrorSchema.array(),
          items: BulkImportPreviewItemSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.secretBulkImport.bulkImportSecrets({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.body.projectId,
        defaultEnvironment: req.body.environment,
        defaultSecretPath: req.body.secretPath,
        format: req.body.format,
        data: req.body.data,
        dryRun: req.body.dryRun,
        overwriteExisting: req.body.overwriteExisting
      });

      if (!result.dryRun) {
        await server.services.auditLog.createAuditLog({
          projectId: req.body.projectId,
          ...req.auditLogInfo,
          event: {
            type: EventType.SECRET_BULK_IMPORT,
            metadata: {
              defaultEnvironment: req.body.environment,
              defaultSecretPath: req.body.secretPath,
              format: req.body.format,
              created: result.created,
              overwritten: result.overwritten,
              skipped: result.skipped,
              parseErrorCount: result.parseErrors.length
            }
          }
        });
      }

      return result;
    }
  });
};
