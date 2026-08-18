import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { dashboardKeys } from "../dashboard/queries";
import { secretArchiveKeys } from "./queries";
import { TArchiveSecretDTO, TDeleteArchivedSecretDTO, TRestoreSecretDTO } from "./types";

const invalidateProjectSecretQueries = (
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
  secretPath?: string
) => {
  queryClient.invalidateQueries({ queryKey: secretArchiveKeys.list(projectId) });
  if (secretPath) {
    queryClient.invalidateQueries({
      queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath })
    });
  } else {
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all() });
  }
};

export const useArchiveSecret = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ secretId }: TArchiveSecretDTO) => {
      const { data } = await apiRequest.post(`/api/v1/secrets/${secretId}/archive`);
      return data;
    },
    onSuccess: (_, { projectId, secretPath }) =>
      invalidateProjectSecretQueries(queryClient, projectId, secretPath)
  });
};

export const useRestoreSecret = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ secretId }: TRestoreSecretDTO) => {
      const { data } = await apiRequest.post(`/api/v1/secrets/${secretId}/restore`);
      return data;
    },
    onSuccess: (_, { projectId }) => invalidateProjectSecretQueries(queryClient, projectId)
  });
};

export const useDeleteArchivedSecret = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ secretId }: TDeleteArchivedSecretDTO) => {
      const { data } = await apiRequest.delete(`/api/v1/secrets/${secretId}`);
      return data;
    },
    onSuccess: (_, { projectId }) =>
      queryClient.invalidateQueries({ queryKey: secretArchiveKeys.list(projectId) })
  });
};
