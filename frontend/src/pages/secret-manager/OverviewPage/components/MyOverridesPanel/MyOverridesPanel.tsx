import { useMemo, useState } from "react";
import { format } from "date-fns";
import { RotateCcw } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  useGetMyPersonalOverrides,
  useResetPersonalOverrides
} from "@app/hooks/api/personalOverrides";

type Props = {
  projectId: string;
};

export const MyOverridesPanel = ({ projectId }: Props) => {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const { data: overrides, isPending } = useGetMyPersonalOverrides(projectId);
  const { mutateAsync: resetOverrides, isPending: isResetting } = useResetPersonalOverrides();

  const selectedIds = useMemo(
    () =>
      Object.entries(selected)
        .filter(([, checked]) => checked)
        .map(([id]) => id),
    [selected]
  );

  const handleReset = async () => {
    if (!overrides) return;

    const chosen = overrides.filter((el) => selected[el.id]);
    if (!chosen.length) return;

    // one call per (environment, path) — the reset endpoint deletes personal rows at one path
    const groups = new Map<
      string,
      { environment: string; secretPath: string; secretKeys: string[] }
    >();
    chosen.forEach((el) => {
      const groupKey = `${el.environment}:${el.secretPath}`;
      const group = groups.get(groupKey) ?? {
        environment: el.environment,
        secretPath: el.secretPath,
        secretKeys: []
      };
      group.secretKeys.push(el.secretKey);
      groups.set(groupKey, group);
    });

    try {
      await Promise.all(
        [...groups.values()].map((group) => resetOverrides({ projectId, ...group }))
      );
      setSelected({});
      createNotification({
        type: "success",
        text: `Reset ${chosen.length} override${chosen.length === 1 ? "" : "s"} to the shared value`
      });
    } catch (err) {
      createNotification({
        type: "error",
        text: (err as { message?: string })?.message ?? "Failed to reset overrides"
      });
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>My Overrides</CardTitle>
        <CardDescription>
          Secrets you have personally overridden in this project. Only you can see these values.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {selectedIds.length > 0 && (
          <div className="mb-3 flex items-center justify-between rounded-md border border-mineshaft-600 px-3 py-2">
            <span className="text-sm text-mineshaft-300">{selectedIds.length} selected</span>
            <Button size="xs" variant="outline" isPending={isResetting} onClick={handleReset}>
              <RotateCcw />
              Reset to shared value
            </Button>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" aria-label="select" />
              <TableHead className="w-1/3">Secret</TableHead>
              <TableHead>Environment</TableHead>
              <TableHead>Path</TableHead>
              <TableHead>Diverged</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 3 }).map((_, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <TableRow key={`override-skeleton-${i}`}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <td key={`override-skeleton-cell-${j}`} className="px-3 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </TableRow>
              ))}
            {!isPending && overrides?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Empty className="border-0">
                    <EmptyHeader>
                      <EmptyTitle>No overrides</EmptyTitle>
                      <EmptyDescription>Secrets you override will be listed here</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
            {!isPending &&
              overrides?.map((override) => (
                <TableRow key={override.id}>
                  <TableCell>
                    <Checkbox
                      id={`override-${override.id}`}
                      isChecked={Boolean(selected[override.id])}
                      onCheckedChange={(checked) =>
                        setSelected((prev) => ({ ...prev, [override.id]: Boolean(checked) }))
                      }
                    />
                  </TableCell>
                  <TableCell>{override.secretKey}</TableCell>
                  <TableCell>
                    <Badge variant="neutral">{override.environmentName}</Badge>
                  </TableCell>
                  <TableCell>{override.secretPath}</TableCell>
                  <TableCell>
                    {format(new Date(override.divergedAt), "MMM d, yyyy h:mm a")}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
