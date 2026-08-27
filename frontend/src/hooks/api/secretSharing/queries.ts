import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TBrandingConfig,
  TGetSecretRequestByIdResponse,
  TGetSharedSecretAccessLogsDTO,
  TSharedSecret,
  TSharedSecretAccessLog,
  TSharedSecretPublicDetails
} from "./types";

export const secretSharingKeys = {
  allSharedSecrets: () => ["sharedSecrets"] as const,
  specificSharedSecrets: ({ offset, limit }: { offset: number; limit: number }) =>
    [...secretSharingKeys.allSharedSecrets(), { offset, limit }] as const,
  allSecretRequests: () => ["secretRequests"] as const,
  specificSecretRequests: ({ offset, limit }: { offset: number; limit: number }) =>
    [...secretSharingKeys.allSecretRequests(), { offset, limit }] as const,
  getSharedSecretDetails: (id: string) => ["shared-secret", id] as const,
  getSecretRequestById: (arg: { id: string }) => ["secret-request", arg] as const,
  brandingAssets: () => ["brandingAssets"] as const,
  sharedSecretBranding: (id: string) => ["shared-secret-branding", id] as const,
  sharedSecretAccessLogs: ({ sharedSecretId, limit, offset }: TGetSharedSecretAccessLogsDTO) =>
    ["shared-secret-access-logs", { sharedSecretId, limit, offset }] as const
};

export const useGetSharedSecretAccessLogs = ({
  sharedSecretId,
  limit = 25,
  offset = 0
}: TGetSharedSecretAccessLogsDTO) =>
  useQuery({
    queryKey: secretSharingKeys.sharedSecretAccessLogs({ sharedSecretId, limit, offset }),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        accessLogs: TSharedSecretAccessLog[];
        totalCount: number;
      }>(`/api/v1/shared-secrets/${sharedSecretId}/access-logs`, { params: { limit, offset } });
      return data;
    },
    enabled: Boolean(sharedSecretId)
  });

export const useGetSharedSecrets = ({
  offset = 0,
  limit = 25
}: {
  offset: number;
  limit: number;
}) => {
  return useQuery({
    queryKey: secretSharingKeys.specificSharedSecrets({ offset, limit }),
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit)
      });

      const { data } = await apiRequest.get<{ secrets: TSharedSecret[]; totalCount: number }>(
        "/api/v1/shared-secrets",
        {
          params
        }
      );
      return data;
    }
  });
};

export const useGetSecretRequests = ({
  offset = 0,
  limit = 25
}: {
  offset: number;
  limit: number;
}) => {
  return useQuery({
    queryKey: secretSharingKeys.specificSecretRequests({ offset, limit }),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ secrets: TSharedSecret[]; totalCount: number }>(
        "/api/v1/shared-secrets/requests",
        {
          params: {
            offset: String(offset),
            limit: String(limit)
          }
        }
      );
      return data;
    }
  });
};
export const useGetSharedSecretById = ({ sharedSecretId }: { sharedSecretId: string }) => {
  return useQuery({
    queryKey: secretSharingKeys.getSharedSecretDetails(sharedSecretId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TSharedSecretPublicDetails>(
        `/api/v1/shared-secrets/${sharedSecretId}`
      );
      return data;
    },
    enabled: Boolean(sharedSecretId)
  });
};

export const useGetSecretRequestById = ({ secretRequestId }: { secretRequestId: string }) => {
  return useQuery({
    queryKey: secretSharingKeys.getSecretRequestById({ id: secretRequestId }),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGetSecretRequestByIdResponse>(
        `/api/v1/shared-secrets/requests/${secretRequestId}`
      );

      return data;
    }
  });
};

export const useGetBrandingConfig = () => {
  return useQuery({
    queryKey: secretSharingKeys.brandingAssets(),
    queryFn: async () => {
      const { data } = await apiRequest.get<TBrandingConfig>("/api/v1/shared-secrets/branding");
      return data;
    }
  });
};

export const useGetSharedSecretBranding = ({ sharedSecretId }: { sharedSecretId: string }) => {
  return useQuery({
    queryKey: secretSharingKeys.sharedSecretBranding(sharedSecretId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TBrandingConfig>("/api/v1/shared-secrets/branding", {
        params: { sharedSecretId }
      });
      return data;
    },
    enabled: Boolean(sharedSecretId)
  });
};
