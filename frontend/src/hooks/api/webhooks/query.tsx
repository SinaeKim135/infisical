import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TGetWebhookDeliveriesDto, TWebhook, TWebhookDelivery } from "./types";

export const queryKeys = {
  getWebhooks: (workspaceId: string) => ["webhooks", { workspaceId }],
  getWebhookDeliveries: ({ webhookId, limit, offset }: TGetWebhookDeliveriesDto) => [
    "webhook-deliveries",
    { webhookId, limit, offset }
  ]
};

const fetchWebhooks = async (projectId: string) => {
  const { data } = await apiRequest.get<{ webhooks: TWebhook[] }>("/api/v1/webhooks", {
    params: {
      projectId
    }
  });

  return data.webhooks;
};

export const useGetWebhooks = (projectId: string) =>
  useQuery({
    queryKey: queryKeys.getWebhooks(projectId),
    queryFn: () => fetchWebhooks(projectId),
    enabled: Boolean(projectId)
  });

const fetchWebhookDeliveries = async ({ webhookId, limit, offset }: TGetWebhookDeliveriesDto) => {
  const { data } = await apiRequest.get<{ deliveries: TWebhookDelivery[]; totalCount: number }>(
    `/api/v1/webhooks/${webhookId}/deliveries`,
    {
      params: { limit, offset }
    }
  );

  return data;
};

export const useGetWebhookDeliveries = ({
  webhookId,
  limit = 20,
  offset = 0
}: TGetWebhookDeliveriesDto) =>
  useQuery({
    queryKey: queryKeys.getWebhookDeliveries({ webhookId, limit, offset }),
    queryFn: () => fetchWebhookDeliveries({ webhookId, limit, offset }),
    enabled: Boolean(webhookId)
  });
