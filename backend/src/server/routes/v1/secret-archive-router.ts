import { z } from "zod";

import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const ArchivedSecretSchema = z.object({
  id: z.string(),
  key: z.string(),
  type: z.string(),
  folderId: z.string(),
  environment: z.string(),
  environmentName: z.string(),
  archivedAt: z.date()
});

const SecretRefSchema = z.object({
  id: z.string(),
  key: z.string(),
  type: z.string(),
  folderId: z.string(),
  archivedAt: z.date().nullable().optional()
});

const pickSecretRef = (secret: { id: string; key: string; type: string; folderId: string; archivedAt?: Date | null }) => ({
  id: secret.id,
  key: secret.key,
  type: secret.type,
  folderId: secret.folderId,
  archivedAt: secret.archivedAt ?? null
});

// Mounted at /api/v1/projects — lists the archived (soft-deleted) secrets of a project
export const registerProjectArchivedSecretsRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:projectId/secrets/archived",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listArchivedSecrets",
      tags: [ApiDocsTags.Secrets],
      description: "List archived (soft-deleted) secrets for a project",
      security: [{ bearerAuth: [] }],
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          secrets: ArchivedSecretSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.secretArchive.listArchivedSecrets({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        projectId: req.params.projectId
      });
    }
  });
};

// Mounted at /api/v1/secrets — per-secret archive lifecycle operations
export const registerSecretArchiveRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:secretId/archive",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "archiveSecret",
      tags: [ApiDocsTags.Secrets],
      description: "Archive (soft-delete) a secret so it can later be restored",
      security: [{ bearerAuth: [] }],
      params: z.object({
        secretId: z.string().trim()
      }),
      response: {
        200: z.object({
          secret: SecretRefSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { secret } = await server.services.secretArchive.archiveSecret({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        secretId: req.params.secretId
      });
      return { secret: pickSecretRef(secret) };
    }
  });

  server.route({
    method: "POST",
    url: "/:secretId/restore",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "restoreSecret",
      tags: [ApiDocsTags.Secrets],
      description: "Restore a previously archived secret",
      security: [{ bearerAuth: [] }],
      params: z.object({
        secretId: z.string().trim()
      }),
      response: {
        200: z.object({
          secret: SecretRefSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { secret } = await server.services.secretArchive.restoreSecret({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        secretId: req.params.secretId
      });
      return { secret: pickSecretRef(secret) };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:secretId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "deleteArchivedSecret",
      tags: [ApiDocsTags.Secrets],
      description: "Permanently delete an archived secret",
      security: [{ bearerAuth: [] }],
      params: z.object({
        secretId: z.string().trim()
      }),
      response: {
        200: z.object({
          secret: SecretRefSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { secret } = await server.services.secretArchive.deleteArchivedSecret({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        secretId: req.params.secretId
      });
      return { secret: pickSecretRef(secret) };
    }
  });
};
