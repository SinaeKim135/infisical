import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useGetIdentityAccessTokens, useRevokeIdentityAccessToken } from "@app/hooks/api";
import { IdentityAccessTokenSummary } from "@app/hooks/api/identities/types";
import { usePopUp } from "@app/hooks/usePopUp";

type Props = {
  identityId: string;
};

const formatTimestamp = (value: string | null) => (value ? new Date(value).toLocaleString() : "—");

const describeUsage = (token: IdentityAccessTokenSummary) =>
  token.accessTokenNumUsesLimit > 0
    ? `${token.accessTokenNumUses} / ${token.accessTokenNumUsesLimit}`
    : `${token.accessTokenNumUses}`;

export const IdentityAccessTokensSection = ({ identityId }: Props) => {
  const { data: tokens = [], isPending } = useGetIdentityAccessTokens(identityId);
  const { mutateAsync: revokeAccessToken } = useRevokeIdentityAccessToken();
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "revokeAccessToken"
  ] as const);

  const onRevoke = async () => {
    const { tokenId } = popUp.revokeAccessToken.data as { tokenId: string };

    try {
      await revokeAccessToken({ identityId, tokenId });
      createNotification({ text: "Successfully revoked access token", type: "success" });
    } catch {
      createNotification({ text: "Failed to revoke access token", type: "error" });
    }

    handlePopUpClose("revokeAccessToken");
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Access Tokens</CardTitle>
          <CardDescription>
            Tokens this identity currently holds, whichever auth method issued them. Revoking one
            leaves the others working.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Auth method</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last renewed</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Uses</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending && (
                <TableRow>
                  <TableCell colSpan={7}>Loading tokens...</TableCell>
                </TableRow>
              )}
              {!isPending && tokens.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>This identity has no access tokens.</TableCell>
                </TableRow>
              )}
              {tokens.map((token) => (
                <TableRow key={token.id}>
                  <TableCell>{token.authMethod}</TableCell>
                  <TableCell>{formatTimestamp(token.createdAt)}</TableCell>
                  <TableCell>{formatTimestamp(token.accessTokenLastRenewedAt)}</TableCell>
                  <TableCell>
                    {token.expiresAt ? formatTimestamp(token.expiresAt) : "Never"}
                  </TableCell>
                  <TableCell>{describeUsage(token)}</TableCell>
                  <TableCell>
                    {token.isAccessTokenRevoked ? (
                      <Badge variant="danger">Revoked</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {!token.isAccessTokenRevoked && (
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => handlePopUpOpen("revokeAccessToken", { tokenId: token.id })}
                      >
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <DeleteActionModal
        isOpen={popUp.revokeAccessToken.isOpen}
        title="Revoke this access token?"
        subTitle="Anything still authenticating with it will stop working immediately. The identity's other tokens are unaffected."
        onChange={(isOpen) => handlePopUpToggle("revokeAccessToken", isOpen)}
        deleteKey="confirm"
        buttonText="Revoke"
        onDeleteApproved={onRevoke}
      />
    </>
  );
};
