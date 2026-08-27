import {
  Badge,
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
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useGetSharedSecretAccessLogs } from "@app/hooks/api/secretSharing";
import { TSharedSecret } from "@app/hooks/api/secretSharing/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["accessHistory"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["accessHistory"]>, state?: boolean) => void;
};

export const AccessHistoryDrawer = ({ popUp, handlePopUpToggle }: Props) => {
  const sharedSecret = popUp.accessHistory.data as TSharedSecret | undefined;
  const { data, isPending } = useGetSharedSecretAccessLogs({
    sharedSecretId: sharedSecret?.id ?? ""
  });

  const accessLogs = data?.accessLogs;

  return (
    <Dialog
      open={popUp?.accessHistory?.isOpen}
      onOpenChange={(isOpen) => handlePopUpToggle("accessHistory", isOpen)}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Access History</DialogTitle>
          <DialogDescription>
            Every attempt to open this link, newest first. {data?.totalCount ?? 0} total.
          </DialogDescription>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/4">When</TableHead>
              <TableHead className="w-1/4">Opened By</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 4 }).map((_, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <TableRow key={`access-log-skeleton-${i}`}>
                  {Array.from({ length: 4 }).map((__, j) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <td key={`access-log-skeleton-cell-${j}`} className="px-3 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </TableRow>
              ))}
            {!isPending && accessLogs?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Empty className="border-0">
                    <EmptyHeader>
                      <EmptyTitle>Not opened yet</EmptyTitle>
                      <EmptyDescription>
                        Attempts to open this link will appear here
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
            {!isPending &&
              accessLogs?.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{new Date(log.createdAt).toLocaleString("en-US")}</TableCell>
                  <TableCell>
                    {log.actorEmail || <span className="text-muted">Anonymous</span>}
                  </TableCell>
                  <TableCell>
                    {log.ipAddress || <span className="text-muted">&mdash;</span>}
                  </TableCell>
                  <TableCell>
                    {log.success ? (
                      <Badge variant="success">Opened</Badge>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="danger">Denied</Badge>
                        </TooltipTrigger>
                        <TooltipContent>{log.failureReason || "Denied"}</TooltipContent>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
};
