import { faClockRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { format } from "date-fns";

import {
  EmptyState,
  Modal,
  ModalContent,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { useGetWebhookDeliveries } from "@app/hooks/api";
import { TWebhook } from "@app/hooks/api/webhooks/types";

type Props = {
  isOpen?: boolean;
  webhook?: TWebhook;
  onOpenChange: (isOpen: boolean) => void;
};

export const WebhookDeliveriesModal = ({ isOpen, webhook, onOpenChange }: Props) => {
  const { data, isPending } = useGetWebhookDeliveries({ webhookId: webhook?.id ?? "" });

  const deliveries = data?.deliveries;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Delivery history"
        subTitle={
          webhook
            ? `Every request sent to this webhook, newest first. ${data?.totalCount ?? 0} total.`
            : undefined
        }
        className="max-w-3xl"
      >
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th className="w-1/4">Sent At</Th>
                <Th className="w-1/4">Event</Th>
                <Th className="w-1/6">Status</Th>
                <Th>Response</Th>
              </Tr>
            </THead>
            <TBody>
              {isPending && <TableSkeleton columns={4} innerKey="webhook-deliveries-loading" />}
              {!isPending && deliveries?.length === 0 && (
                <Tr>
                  <Td colSpan={4}>
                    <EmptyState title="No deliveries yet" icon={faClockRotateLeft} />
                  </Td>
                </Tr>
              )}
              {!isPending &&
                deliveries?.map((delivery) => (
                  <Tr key={delivery.id}>
                    <Td>{format(new Date(delivery.createdAt), "yyyy-MM-dd, hh:mm:ss aaa")}</Td>
                    <Td className="max-w-0">
                      <p className="truncate">{delivery.eventType}</p>
                    </Td>
                    <Td>
                      <Badge variant={delivery.status === "success" ? "success" : "danger"}>
                        {delivery.status}
                      </Badge>
                    </Td>
                    <Td className="max-w-0">
                      {delivery.errorMessage ? (
                        <Tooltip
                          className="max-w-2xl"
                          content={<span className="break-all">{delivery.errorMessage}</span>}
                        >
                          <p className="truncate text-red">
                            {delivery.statusCode ? `${delivery.statusCode} — ` : ""}
                            {delivery.errorMessage}
                          </p>
                        </Tooltip>
                      ) : (
                        <p className="truncate text-mineshaft-400">{delivery.statusCode ?? "-"}</p>
                      )}
                    </Td>
                  </Tr>
                ))}
            </TBody>
          </Table>
        </TableContainer>
      </ModalContent>
    </Modal>
  );
};
