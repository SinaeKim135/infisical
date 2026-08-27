import { z } from "zod";

import { removeTrailingSlash } from "@app/lib/fn";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerPersonalOverrideRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listMyPersonalOverrides",
      description:
        "List every personal override the calling user has in a project, with the environment and path each one lives at.",
      querystring: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          overrides: z
            .object({
              id: z.string(),
              secretKey: z.string(),
              environment: z.string(),
              environmentName: z.string(),
              secretPath: z.string(),
              divergedAt: z.date()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.secretV2Bridge.getMyPersonalOverrides({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.query.projectId
      });
    }
  });

  server.route({
    method: "POST",
    url: "/reset",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "resetMyPersonalOverrides",
      description: "Reset personal overrides back to the shared value by deleting the personal rows at a given path.",
      body: z.object({
        projectId: z.string().trim(),
        environment: z.string().trim(),
        secretPath: z.string().trim().default("/").transform(removeTrailingSlash),
        secretKeys: z.string().array().min(1)
      }),
      response: {
        200: z.object({
          resetCount: z.number(),
          secretKeys: z.string().array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.secretV2Bridge.resetPersonalOverrides({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });
    }
  });
};
