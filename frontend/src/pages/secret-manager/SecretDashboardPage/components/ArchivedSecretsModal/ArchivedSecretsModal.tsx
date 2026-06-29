import { faRotateLeft, faTrash, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DeleteActionModal,
  EmptyState,
  IconButton,
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
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import {
  TArchivedSecret,
  useDeleteArchivedSecret,
  useGetArchivedSecrets,
  useRestoreSecret
} from "@app/hooks/api/secretArchive";

type Props = {
  projectId: string;
};

export const ArchivedSecretsModal = ({ projectId }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "archivedSecrets",
    "deletePermanently"
  ] as const);

  const isOpen = popUp.archivedSecrets.isOpen;
  const { data: archivedSecrets, isPending } = useGetArchivedSecrets(projectId, {
    enabled: isOpen
  });

  const restoreSecret = useRestoreSecret();
  const deleteArchivedSecret = useDeleteArchivedSecret();

  const handleRestore = async (secret: TArchivedSecret) => {
    try {
      await restoreSecret.mutateAsync({ secretId: secret.id, projectId });
      createNotification({
        type: "success",
        text: `Restored "${secret.key}" to ${secret.environmentName}`
      });
    } catch {
      createNotification({
        type: "error",
        text: `Failed to restore "${secret.key}". A secret with this key may already exist.`
      });
    }
  };

  const handleDeletePermanently = async () => {
    const secret = popUp.deletePermanently.data as TArchivedSecret;
    try {
      await deleteArchivedSecret.mutateAsync({ secretId: secret.id, projectId });
      createNotification({
        type: "success",
        text: `Permanently deleted "${secret.key}"`
      });
      handlePopUpClose("deletePermanently");
    } catch {
      createNotification({
        type: "error",
        text: `Failed to permanently delete "${secret.key}"`
      });
    }
  };

  return (
    <>
      <Tooltip content="Archived secrets">
        <IconButton
          variant="outline_bg"
          ariaLabel="Archived secrets"
          onClick={() => handlePopUpOpen("archivedSecrets")}
        >
          <FontAwesomeIcon icon={faTrash} />
        </IconButton>
      </Tooltip>
      <Modal
        isOpen={isOpen}
        onOpenChange={(state) => handlePopUpToggle("archivedSecrets", state)}
      >
        <ModalContent
          title="Archived Secrets"
          subTitle="Secrets that have been archived. Restore them or delete them permanently."
          className="max-w-3xl"
        >
          <TableContainer>
            <Table>
              <THead>
                <Tr>
                  <Th>Key</Th>
                  <Th>Environment</Th>
                  <Th>Archived</Th>
                  <Th aria-label="actions" />
                </Tr>
              </THead>
              <TBody>
                {isPending && <TableSkeleton columns={4} innerKey="archived-secrets" />}
                {!isPending &&
                  archivedSecrets?.map((secret) => (
                    <Tr key={secret.id}>
                      <Td className="max-w-xs truncate font-mono text-sm">{secret.key}</Td>
                      <Td>
                        <Badge variant="info">{secret.environmentName}</Badge>
                      </Td>
                      <Td className="text-sm text-mineshaft-300">
                        {new Date(secret.archivedAt).toLocaleString()}
                      </Td>
                      <Td>
                        <div className="flex items-center justify-end gap-2">
                          <ProjectPermissionCan
                            I={ProjectPermissionSecretActions.Edit}
                            a={ProjectPermissionSub.Secrets}
                            renderTooltip
                            allowedLabel="Restore"
                          >
                            {(isAllowed) => (
                              <IconButton
                                ariaLabel="Restore secret"
                                variant="outline_bg"
                                isDisabled={!isAllowed}
                                onClick={() => handleRestore(secret)}
                              >
                                <FontAwesomeIcon icon={faRotateLeft} />
                              </IconButton>
                            )}
                          </ProjectPermissionCan>
                          <ProjectPermissionCan
                            I={ProjectPermissionSecretActions.Delete}
                            a={ProjectPermissionSub.Secrets}
                            renderTooltip
                            allowedLabel="Delete permanently"
                          >
                            {(isAllowed) => (
                              <IconButton
                                ariaLabel="Delete secret permanently"
                                variant="outline_bg"
                                isDisabled={!isAllowed}
                                onClick={() => handlePopUpOpen("deletePermanently", secret)}
                              >
                                <FontAwesomeIcon icon={faTrashCan} className="text-red-500" />
                              </IconButton>
                            )}
                          </ProjectPermissionCan>
                        </div>
                      </Td>
                    </Tr>
                  ))}
              </TBody>
            </Table>
            {!isPending && !archivedSecrets?.length && (
              <EmptyState title="No archived secrets" icon={faTrash} />
            )}
          </TableContainer>
        </ModalContent>
      </Modal>
      <DeleteActionModal
        isOpen={popUp.deletePermanently.isOpen}
        deleteKey={(popUp.deletePermanently?.data as TArchivedSecret)?.key}
        title={`Permanently delete "${(popUp.deletePermanently?.data as TArchivedSecret)?.key}"?`}
        onChange={(state) => handlePopUpToggle("deletePermanently", state)}
        onDeleteApproved={handleDeletePermanently}
        buttonText="Delete Permanently"
        deletionMessage={
          <>
            This action cannot be undone. Type the secret key{" "}
            <span className="font-bold">
              &quot;{(popUp.deletePermanently?.data as TArchivedSecret)?.key}&quot;
            </span>{" "}
            to permanently delete it.
          </>
        }
      />
    </>
  );
};
