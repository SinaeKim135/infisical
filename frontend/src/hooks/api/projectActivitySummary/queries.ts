import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TActivitySummary } from "./types";

export const projectActivitySummaryKeys = {
  all: ["projectActivitySummary"] as const,
  byProject: (projectId: string) => [...projectActivitySummaryKeys.all, projectId] as const
};

export const useGetProjectActivitySummary = (projectId: string) =>
  useQuery({
    queryKey: projectActivitySummaryKeys.byProject(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TActivitySummary>(
        `/api/v1/projects/${projectId}/activity-summary`
      );
      return data;
    },
    enabled: Boolean(projectId)
  });
