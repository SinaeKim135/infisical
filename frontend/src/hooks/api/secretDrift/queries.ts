import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TGetSecretsDriftDTO, TSecretDriftReport } from "./types";

export const secretDriftKeys = {
  report: ({ projectId, environments, secretPath }: TGetSecretsDriftDTO) =>
    [{ projectId, environments, secretPath }, "secrets-drift"] as const
};

export const useGetSecretsDrift = (
  { projectId, environments, secretPath }: TGetSecretsDriftDTO,
  enabled = true
) =>
  useQuery({
    queryKey: secretDriftKeys.report({ projectId, environments, secretPath }),
    queryFn: async () => {
      const { data } = await apiRequest.get<TSecretDriftReport>("/api/v1/dashboard/secrets-drift", {
        params: { projectId, secretPath, environments: environments.join(",") }
      });
      return data;
    },
    enabled: enabled && Boolean(projectId) && environments.length >= 2
  });
