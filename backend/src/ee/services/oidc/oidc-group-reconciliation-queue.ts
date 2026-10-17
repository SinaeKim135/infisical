import { TOidcConfigDALFactory } from "@app/ee/services/oidc/oidc-config-dal";
import { TOidcConfigServiceFactory } from "@app/ee/services/oidc/oidc-config-service";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { JOB_SCHEDULER_PREFIX, QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

type TOidcGroupReconciliationQueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  oidcConfigDAL: Pick<TOidcConfigDALFactory, "find">;
  oidcConfigService: Pick<TOidcConfigServiceFactory, "reconcileOidcGroupMembershipsForOrg">;
};

export type TOidcGroupReconciliationQueueServiceFactory = ReturnType<typeof oidcGroupReconciliationQueueServiceFactory>;

// Base tick cadence for the reconciliation scheduler. Each org is only actually
// reconciled once its configured per-org interval has elapsed since its last run,
// so the tick just needs to be frequent enough to honor the smallest interval.
const RECONCILIATION_TICK_CRON = "* * * * *"; // every minute

export const oidcGroupReconciliationQueueServiceFactory = ({
  queueService,
  oidcConfigDAL,
  oidcConfigService
}: TOidcGroupReconciliationQueueServiceFactoryDep) => {
  const appCfg = getConfig();

  const init = async () => {
    if (appCfg.isSecondaryInstance) {
      return;
    }

    queueService.start(QueueName.OidcGroupMembershipReconciliation, async () => {
      try {
        const configs = await oidcConfigDAL.find({
          isActive: true,
          manageGroupMemberships: true,
          groupMembershipReconciliationEnabled: true
        });

        const now = Date.now();
        const dueConfigs = configs.filter((cfg) => {
          const intervalMs = Math.max(1, cfg.groupMembershipReconciliationIntervalMinutes) * 60 * 1000;
          if (!cfg.lastGroupReconciliationAt) return true;
          return now - new Date(cfg.lastGroupReconciliationAt).getTime() >= intervalMs;
        });

        if (!dueConfigs.length) return;

        logger.info(
          `${QueueName.OidcGroupMembershipReconciliation}: reconciling ${dueConfigs.length} organization(s)`
        );

        for await (const cfg of dueConfigs) {
          try {
            const summary = await oidcConfigService.reconcileOidcGroupMembershipsForOrg(cfg.orgId);
            logger.info(
              `${QueueName.OidcGroupMembershipReconciliation}: reconciled [orgId=${cfg.orgId}] [status=${summary.status}] [removed=${summary.membershipsRemoved}] [checked=${summary.checked}]`
            );
          } catch (error) {
            logger.error(
              error,
              `${QueueName.OidcGroupMembershipReconciliation}: org reconciliation failed [orgId=${cfg.orgId}]`
            );
          }
        }
      } catch (error) {
        logger.error(error, `${QueueName.OidcGroupMembershipReconciliation}: queue task failed`);
        throw error;
      }
    });

    await queueService.upsertJobScheduler(
      QueueName.OidcGroupMembershipReconciliation,
      `${JOB_SCHEDULER_PREFIX}:${QueueJobs.OidcGroupMembershipReconciliation}`,
      { pattern: RECONCILIATION_TICK_CRON },
      { name: QueueJobs.OidcGroupMembershipReconciliation }
    );
  };

  return { init };
};
