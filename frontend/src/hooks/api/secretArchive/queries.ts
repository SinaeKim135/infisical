import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TArchivedSecret } from "./types";

export const secretArchiveKeys = {
  all: ["archived-secrets"] as const,
  list: (projectId: string) => [...secretArchiveKeys.all, projectId] as const
};

export const fetchArchivedSecrets = async (projectId: string) => {
  const { data } = await apiRequest.get<{ secrets: TArchivedSecret[] }>(
    `/api/v1/projects/${projectId}/secrets/archived`
  );
  return data.secrets;
};

export const useGetArchivedSecrets = (
  projectId: string,
  options?: Omit<
    UseQueryOptions<
      TArchivedSecret[],
      unknown,
      TArchivedSecret[],
      ReturnType<typeof secretArchiveKeys.list>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: secretArchiveKeys.list(projectId),
    queryFn: () => fetchArchivedSecrets(projectId),
    ...options,
    enabled: Boolean(projectId) && (options?.enabled ?? true)
  });
