import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { personalOverrideKeys } from "./queries";
import { TResetPersonalOverridesDTO } from "./types";

export const useResetPersonalOverrides = () => {
  const queryClient = useQueryClient();

  return useMutation<{ resetCount: number }, { message: string }, TResetPersonalOverridesDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post("/api/v1/personal-overrides/reset", dto);
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: personalOverrideKeys.list(projectId) });
    }
  });
};
