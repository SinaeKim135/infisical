import { useMemo, useState } from "react";

import {
  Badge,
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
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useGetSecretsDrift } from "@app/hooks/api/secretDrift";
import { SecretDriftStatus } from "@app/hooks/api/secretDrift/types";

type Props = {
  projectId: string;
  secretPath: string;
  environments: { slug: string; name: string }[];
};

const STATUS_LABEL: Record<SecretDriftStatus, string> = {
  [SecretDriftStatus.Same]: "Same",
  [SecretDriftStatus.Different]: "Different",
  [SecretDriftStatus.Missing]: "Missing"
};

const STATUS_VARIANT: Record<SecretDriftStatus, "success" | "warning" | "danger"> = {
  [SecretDriftStatus.Same]: "success",
  [SecretDriftStatus.Different]: "warning",
  [SecretDriftStatus.Missing]: "danger"
};

export const EnvironmentDriftView = ({ projectId, secretPath, environments }: Props) => {
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [onlyDrifting, setOnlyDrifting] = useState(true);

  const chosen = useMemo(
    () => environments.filter((env) => picked[env.slug]).map((env) => env.slug),
    [environments, picked]
  );

  const { data: report, isPending } = useGetSecretsDrift(
    { projectId, environments: chosen, secretPath },
    chosen.length >= 2
  );

  const rows = useMemo(() => {
    if (!report) return [];
    return onlyDrifting ? report.rows.filter((row) => row.isDrifting) : report.rows;
  }, [report, onlyDrifting]);

  const nameBySlug = useMemo(
    () => Object.fromEntries(environments.map((env) => [env.slug, env.name])),
    [environments]
  );

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Compare Environments</CardTitle>
        <CardDescription>
          Catch &ldquo;works in staging, fails in prod&rdquo; before a deploy. Values are never
          shown — only whether two environments agree.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-center gap-4">
          {environments.map((env) => (
            <div key={env.slug} className="flex items-center gap-2">
              <Checkbox
                id={`drift-env-${env.slug}`}
                isChecked={Boolean(picked[env.slug])}
                onCheckedChange={(checked) =>
                  setPicked((prev) => ({ ...prev, [env.slug]: Boolean(checked) }))
                }
              />
              <span className="text-sm">{env.name}</span>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <Switch
              id="drift-only"
              checked={onlyDrifting}
              onCheckedChange={setOnlyDrifting}
              variant="org"
            />
            <span className="text-sm text-mineshaft-300">Only drifting keys</span>
          </div>
        </div>

        {chosen.length < 2 && (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>Pick at least two environments</EmptyTitle>
              <EmptyDescription>The report compares one path across environments</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {chosen.length >= 2 && (
          <>
            {report && (
              <p className="mb-2 text-sm text-mineshaft-300">
                {report.driftingCount} drifting key{report.driftingCount === 1 ? "" : "s"} at{" "}
                {secretPath}
              </p>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/3">Secret</TableHead>
                  {chosen.map((slug) => (
                    <TableHead key={slug}>{nameBySlug[slug] ?? slug}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPending &&
                  Array.from({ length: 4 }).map((_, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableRow key={`drift-skeleton-${i}`}>
                      {Array.from({ length: chosen.length + 1 }).map((__, j) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <td key={`drift-skeleton-cell-${j}`} className="px-3 py-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </TableRow>
                  ))}
                {!isPending && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={chosen.length + 1}>
                      <Empty className="border-0">
                        <EmptyHeader>
                          <EmptyTitle>No drift</EmptyTitle>
                          <EmptyDescription>
                            Every key holds the same value across the chosen environments
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                )}
                {!isPending &&
                  rows.map((row) => (
                    <TableRow key={row.secretKey}>
                      <TableCell>{row.secretKey}</TableCell>
                      {row.cells.map((cell) => (
                        <TableCell key={`${row.secretKey}-${cell.environment}`}>
                          <Badge variant={STATUS_VARIANT[cell.status]}>
                            {STATUS_LABEL[cell.status]}
                          </Badge>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
};
