import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionSecretActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";

import { TProjectActivitySummaryDALFactory } from "./project-activity-summary-dal";
import { TGetActivitySummaryDTO } from "./project-activity-summary-types";

type TProjectActivitySummaryServiceFactoryDep = {
  projectActivitySummaryDAL: TProjectActivitySummaryDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TProjectActivitySummaryServiceFactory = ReturnType<typeof projectActivitySummaryServiceFactory>;

export const projectActivitySummaryServiceFactory = ({
  projectActivitySummaryDAL,
  permissionService
}: TProjectActivitySummaryServiceFactoryDep) => {
  const getActivitySummary = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId
  }: TGetActivitySummaryDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretActions.DescribeSecret,
      ProjectPermissionSub.Secrets
    );

    return projectActivitySummaryDAL.getActivitySummary(projectId);
  };

  return { getActivitySummary };
};
