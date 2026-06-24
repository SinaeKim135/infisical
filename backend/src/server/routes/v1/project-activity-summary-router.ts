import { z } from "zod";

import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerProjectActivitySummaryRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:projectId/activity-summary",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "getProjectActivitySummary",
      tags: [ApiDocsTags.Secrets],
      description: "Get secret activity summary for the last 7 days",
      security: [{ bearerAuth: [] }],
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          secretsCreated: z.number(),
          secretsUpdated: z.number(),
          secretsDeleted: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.projectActivitySummary.getActivitySummary({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        projectId: req.params.projectId
      });
    }
  });
};
