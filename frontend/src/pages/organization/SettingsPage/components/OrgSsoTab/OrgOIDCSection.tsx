import { useEffect, useState } from "react";
import { faInfoCircle, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, FormControl, Input, Switch, Tooltip } from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { useGetOIDCConfig } from "@app/hooks/api";
import { useUpdateOIDCConfig } from "@app/hooks/api/oidcConfig/mutations";
import { usePopUp } from "@app/hooks/usePopUp";

import { OIDCModal } from "./OIDCModal";

export const OrgOIDCSection = (): JSX.Element => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();

  const { data, isPending } = useGetOIDCConfig(currentOrg?.id ?? "");
  const { mutateAsync } = useUpdateOIDCConfig();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addOIDC",
    "upgradePlan"
  ] as const);

  const handleOIDCToggle = async (value: boolean) => {
    if (!currentOrg?.id) return;

    if (!subscription?.oidcSSO) {
      handlePopUpOpen("upgradePlan");
      return;
    }

    await mutateAsync({
      organizationId: currentOrg?.id,
      isActive: value
    });

    createNotification({
      text: `Successfully ${value ? "enabled" : "disabled"} OIDC SSO`,
      type: "success"
    });
  };

  const handleOIDCGroupManagement = async (value: boolean) => {
    if (!currentOrg?.id) return;

    if (!subscription?.oidcSSO) {
      handlePopUpOpen("upgradePlan");
      return;
    }

    await mutateAsync({
      organizationId: currentOrg?.id,
      manageGroupMemberships: value
    });

    createNotification({
      text: `Successfully ${value ? "enabled" : "disabled"} OIDC group membership mapping`,
      type: "success"
    });
  };

  const [reconciliationInterval, setReconciliationInterval] = useState<string>("15");

  useEffect(() => {
    if (data?.groupMembershipReconciliationIntervalMinutes) {
      setReconciliationInterval(String(data.groupMembershipReconciliationIntervalMinutes));
    }
  }, [data?.groupMembershipReconciliationIntervalMinutes]);

  const handleReconciliationToggle = async (value: boolean) => {
    if (!currentOrg?.id) return;

    if (!subscription?.oidcSSO) {
      handlePopUpOpen("upgradePlan");
      return;
    }

    await mutateAsync({
      organizationId: currentOrg?.id,
      groupMembershipReconciliationEnabled: value
    });

    createNotification({
      text: `Successfully ${value ? "enabled" : "disabled"} near-real-time group deprovisioning`,
      type: "success"
    });
  };

  const getReconciliationStatusColor = (status?: string | null) => {
    if (status === "success") return "text-green";
    if (status === "failed") return "text-red";
    return "text-yellow";
  };

  const handleReconciliationIntervalSave = async () => {
    if (!currentOrg?.id) return;

    const parsed = Number(reconciliationInterval);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 1440) {
      createNotification({
        text: "Reconciliation interval must be between 1 and 1440 minutes",
        type: "error"
      });
      return;
    }

    await mutateAsync({
      organizationId: currentOrg?.id,
      groupMembershipReconciliationIntervalMinutes: parsed
    });

    createNotification({
      text: "Successfully updated reconciliation interval",
      type: "success"
    });
  };

  const addOidcButtonClick = async () => {
    if (subscription?.oidcSSO && currentOrg) {
      handlePopUpOpen("addOIDC");
    } else {
      handlePopUpOpen("upgradePlan");
    }
  };

  const isGoogleOAuthEnabled = currentOrg.googleSsoAuthEnforced;

  return (
    <div className="mb-4 rounded-lg border-mineshaft-600 bg-mineshaft-900">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xl font-medium text-gray-200">OIDC</p>
          <p className="mb-2 text-gray-400">Manage OIDC authentication configuration</p>
        </div>

        {!isPending && (
          <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Sso}>
            {(isAllowed) => (
              <Button onClick={addOidcButtonClick} colorSchema="secondary" isDisabled={!isAllowed}>
                Manage
              </Button>
            )}
          </OrgPermissionCan>
        )}
      </div>
      {data && (
        <div className="py-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-md text-mineshaft-100">Enable OIDC</h2>
            {!isPending && (
              <OrgPermissionCan
                I={OrgPermissionActions.Edit}
                a={OrgPermissionSubjects.Sso}
                tooltipProps={{
                  className: "max-w-sm",
                  side: "left"
                }}
                allowedLabel={
                  isGoogleOAuthEnabled
                    ? "You cannot enable OIDC SSO while Google OAuth is enforced. Disable Google OAuth enforcement to enable OIDC SSO."
                    : undefined
                }
                renderTooltip={isGoogleOAuthEnabled}
              >
                {(isAllowed) => (
                  <div>
                    <Switch
                      id="enable-oidc-sso"
                      onCheckedChange={(value) => handleOIDCToggle(value)}
                      isChecked={data ? data.isActive : false}
                      isDisabled={!isAllowed || isGoogleOAuthEnabled}
                    />
                  </div>
                )}
              </OrgPermissionCan>
            )}
          </div>
          <p className="text-sm text-mineshaft-300">
            Allow members to authenticate into Infisical with OIDC
          </p>
        </div>
      )}
      <div className="py-4">
        <div className="mb-2 flex justify-between">
          <div className="text-md flex items-center text-mineshaft-100">
            <span>OIDC Group Membership Mapping</span>
            <Tooltip
              className="max-w-lg"
              content={
                <>
                  <p>
                    When this feature is enabled, Infisical will automatically sync group
                    memberships between the OIDC provider and Infisical. Users will be added to
                    Infisical groups that match their OIDC group names, and removed from any
                    Infisical groups not present in their groups claim. When enabled, manual
                    management of Infisical group memberships will be disabled.
                  </p>
                  <p className="mt-4">
                    To use this feature you must include group claims in the OIDC token.
                  </p>
                  <a
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-mineshaft-300"
                    href="https://infisical.com/docs/documentation/platform/sso/overview"
                  >
                    See your OIDC provider docs for details.
                  </a>
                  <p className="mt-4 text-yellow">
                    <FontAwesomeIcon className="mr-1" icon={faWarning} />
                    Group membership changes in the OIDC provider only sync with Infisical when a
                    user logs in via OIDC. For example, if you remove a user from a group in the
                    OIDC provider, this change will not be reflected in Infisical until their next
                    OIDC login. To ensure this behavior, Infisical recommends enabling Enforce OIDC
                    SSO.
                  </p>
                </>
              }
            >
              <FontAwesomeIcon
                icon={faInfoCircle}
                size="sm"
                className="mt-0.5 ml-1 inline-block text-mineshaft-400"
              />
            </Tooltip>
          </div>
          <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
            {(isAllowed) => (
              <Switch
                id="enforce-org-auth"
                isChecked={data?.manageGroupMemberships ?? false}
                onCheckedChange={(value) => handleOIDCGroupManagement(value)}
                isDisabled={!isAllowed}
              />
            )}
          </OrgPermissionCan>
        </div>
        <p className="text-sm text-mineshaft-300">
          Infisical will manage user group memberships based on the OIDC provider
        </p>
      </div>
      {data?.manageGroupMemberships && (
        <div className="py-4">
          <div className="mb-2 flex justify-between">
            <div className="text-md flex items-center text-mineshaft-100">
              <span>Near-Real-Time Group Deprovisioning</span>
              <Tooltip
                className="max-w-lg"
                content={
                  <>
                    <p>
                      When enabled, Infisical periodically re-fetches each user&apos;s group
                      membership from the OIDC provider and reconciles their access — without
                      waiting for the user to log in again. If a user is removed from a mapped group
                      in the provider, their project/org access is revoked promptly and their cached
                      permissions are invalidated.
                    </p>
                    <p className="mt-4">
                      This requires the provider to issue a refresh token (the{" "}
                      <code>offline_access</code> scope is requested automatically once enabled).
                      Users who have not logged in since enabling this feature are reconciled on
                      their next login.
                    </p>
                  </>
                }
              >
                <FontAwesomeIcon
                  icon={faInfoCircle}
                  size="sm"
                  className="mt-0.5 ml-1 inline-block text-mineshaft-400"
                />
              </Tooltip>
            </div>
            <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
              {(isAllowed) => (
                <Switch
                  id="enable-oidc-reconciliation"
                  isChecked={data?.groupMembershipReconciliationEnabled ?? false}
                  onCheckedChange={(value) => handleReconciliationToggle(value)}
                  isDisabled={!isAllowed}
                />
              )}
            </OrgPermissionCan>
          </div>
          <p className="text-sm text-mineshaft-300">
            Revoke access on a recurring schedule when users are removed from groups in the OIDC
            provider
          </p>

          {data?.groupMembershipReconciliationEnabled && (
            <div className="mt-4">
              <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
                {(isAllowed) => (
                  <div className="flex items-end gap-2">
                    <FormControl
                      label="Reconciliation interval (minutes)"
                      className="mb-0 max-w-xs"
                      helperText="How often group membership is reconciled (1–1440 minutes)."
                    >
                      <Input
                        type="number"
                        min={1}
                        max={1440}
                        value={reconciliationInterval}
                        isDisabled={!isAllowed}
                        onChange={(e) => setReconciliationInterval(e.target.value)}
                      />
                    </FormControl>
                    <Button
                      variant="outline_bg"
                      isDisabled={!isAllowed}
                      onClick={() => handleReconciliationIntervalSave()}
                    >
                      Save
                    </Button>
                  </div>
                )}
              </OrgPermissionCan>

              <div className="mt-4 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-3">
                <p className="text-sm font-medium text-mineshaft-100">Last sync status</p>
                {data?.lastGroupReconciliationAt ? (
                  <div className="mt-1 text-sm text-mineshaft-300">
                    <p>
                      <span className="text-mineshaft-400">Status: </span>
                      <span className={getReconciliationStatusColor(data.lastGroupReconciliationStatus)}>
                        {data.lastGroupReconciliationStatus ?? "unknown"}
                      </span>
                    </p>
                    <p>
                      <span className="text-mineshaft-400">Last run: </span>
                      {new Date(data.lastGroupReconciliationAt).toLocaleString()}
                    </p>
                    {data.lastGroupReconciliationMessage && (
                      <p className="mt-1 text-mineshaft-400">{data.lastGroupReconciliationMessage}</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-mineshaft-400">
                    Reconciliation has not run yet. The first run will occur within the configured
                    interval.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <OIDCModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Your current plan does not include access to OIDC SSO. To unlock this feature, please upgrade to Infisical Pro plan."
      />
    </div>
  );
};
