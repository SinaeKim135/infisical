import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { dashboardKeys } from "@app/hooks/api/dashboard/queries";
import { secretKeys } from "@app/hooks/api/secrets/queries";

import { SecretTagsResponse, TModifySecretTagsDTO } from "./types";

const useInvalidateSecretTagQueries = () => {
  const queryClient = useQueryClient();

  return ({ projectId, environment, secretPath }: TModifySecretTagsDTO) => {
    queryClient.invalidateQueries({
      queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath })
    });
    queryClient.invalidateQueries({
      queryKey: secretKeys.getProjectSecret({ projectId, environment, secretPath })
    });
  };
};

export const useAttachSecretTags = () => {
  const invalidate = useInvalidateSecretTagQueries();

  return useMutation({
    mutationFn: async ({ secretKey, ...dto }: TModifySecretTagsDTO) => {
      const { data } = await apiRequest.post<SecretTagsResponse>(
        `/api/v4/secrets/${secretKey}/tags`,
        dto
      );
      return data;
    },
    onSuccess: (_, dto) => invalidate(dto)
  });
};

export const useDetachSecretTags = () => {
  const invalidate = useInvalidateSecretTagQueries();

  return useMutation({
    mutationFn: async ({ secretKey, ...dto }: TModifySecretTagsDTO) => {
      const { data } = await apiRequest.delete<SecretTagsResponse>(
        `/api/v4/secrets/${secretKey}/tags`,
        { data: dto }
      );
      return data;
    },
    onSuccess: (_, dto) => invalidate(dto)
  });
};
