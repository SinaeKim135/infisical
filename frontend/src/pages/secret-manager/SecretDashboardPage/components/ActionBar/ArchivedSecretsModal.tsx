import { useState } from "react";
import { format } from "date-fns";
import { RotateCcw, Trash2 } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { useDeleteArchivedSecrets, useGetArchivedSecrets, useRestoreSecrets } from "@app/hooks/api";

type Props = {
  isOpen?: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  environment: string;
  secretPath: string;
};

export const ArchivedSecretsModal = ({
  isOpen,
  onOpenChange,
  projectId,
  environment,
  secretPath
}: Props) => {
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const { data: archivedSecrets, isPending } = useGetArchivedSecrets({
    projectId,
    environment,
    secretPath,
    enabled: Boolean(isOpen)
  });

  const { mutateAsync: restoreSecrets } = useRestoreSecrets();
  const { mutateAsync: deleteArchivedSecrets } = useDeleteArchivedSecrets();

  const handleRestore = async (secretKey: string) => {
    setPendingKey(secretKey);
    try {
      await restoreSecrets({ projectId, environment, secretPath, secretNames: [secretKey] });
      createNotification({ type: "success", text: `Restored ${secretKey}` });
    } catch (err) {
      createNotification({
        type: "error",
        text: (err as { message?: string })?.message ?? `Failed to restore ${secretKey}`
      });
    } finally {
      setPendingKey(null);
    }
  };

  const handleDeleteForever = async (secretKey: string) => {
    setPendingKey(secretKey);
    try {
      await deleteArchivedSecrets({ projectId, environment, secretPath, secretNames: [secretKey] });
      createNotification({ type: "success", text: `Permanently deleted ${secretKey}` });
    } catch (err) {
      createNotification({
        type: "error",
        text: (err as { message?: string })?.message ?? `Failed to delete ${secretKey}`
      });
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Trash</DialogTitle>
          <DialogDescription>
            Archived secrets at {secretPath}. They are hidden from the dashboard but can be
            restored. Deleting from here is permanent.
          </DialogDescription>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/3">Secret</TableHead>
              <TableHead>Archived</TableHead>
              <TableHead className="w-48" aria-label="actions" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 3 }).map((_, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <TableRow key={`archived-skeleton-${i}`}>
                  {Array.from({ length: 3 }).map((__, j) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <td key={`archived-skeleton-cell-${j}`} className="px-3 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </TableRow>
              ))}
            {!isPending && archivedSecrets?.length === 0 && (
              <TableRow>
                <TableCell colSpan={3}>
                  <Empty className="border-0">
                    <EmptyHeader>
                      <EmptyTitle>Trash is empty</EmptyTitle>
                      <EmptyDescription>Deleted secrets will appear here</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
            {!isPending &&
              archivedSecrets?.map((secret) => (
                <TableRow key={secret.id}>
                  <TableCell>{secret.secretKey}</TableCell>
                  <TableCell>{format(new Date(secret.archivedAt), "MMM d, yyyy h:mm a")}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="xs"
                        variant="outline"
                        isPending={pendingKey === secret.secretKey}
                        onClick={() => handleRestore(secret.secretKey)}
                      >
                        <RotateCcw />
                        Restore
                      </Button>
                      <Button
                        size="xs"
                        variant="danger"
                        isPending={pendingKey === secret.secretKey}
                        onClick={() => handleDeleteForever(secret.secretKey)}
                      >
                        <Trash2 />
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
};
