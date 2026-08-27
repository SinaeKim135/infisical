import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TPersonalOverride } from "./types";

export const personalOverrideKeys = {
  list: (projectId: string) => [{ projectId }, "personal-overrides"] as const
};

export const useGetMyPersonalOverrides = (projectId: string, enabled = true) =>
  useQuery({
    queryKey: personalOverrideKeys.list(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ overrides: TPersonalOverride[] }>(
        "/api/v1/personal-overrides",
        { params: { projectId } }
      );
      return data.overrides;
    },
    enabled: enabled && Boolean(projectId)
  });
