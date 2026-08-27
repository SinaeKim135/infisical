import { FilePlusIcon, PencilIcon, TrashIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, Skeleton } from "@app/components/v3";
import { useGetProjectActivitySummary } from "@app/hooks/api/projectActivitySummary";

type Props = {
  projectId: string;
};

export const ActivitySummaryCard = ({ projectId }: Props) => {
  const { data, isLoading } = useGetProjectActivitySummary(projectId);

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-5 w-64" />
        ) : (
          <div className="flex items-center gap-6 text-sm text-mineshaft-200">
            <div className="flex items-center gap-1.5">
              <FilePlusIcon size={14} className="text-green-500" />
              <span className="font-medium text-mineshaft-50">{data?.secretsCreated ?? 0}</span>
              created
            </div>
            <div className="flex items-center gap-1.5">
              <PencilIcon size={14} className="text-yellow-500" />
              <span className="font-medium text-mineshaft-50">{data?.secretsUpdated ?? 0}</span>
              updated
            </div>
            <div className="flex items-center gap-1.5">
              <TrashIcon size={14} className="text-red-500" />
              <span className="font-medium text-mineshaft-50">{data?.secretsDeleted ?? 0}</span>
              deleted
            </div>
            <span className="text-xs text-mineshaft-400">this week</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
