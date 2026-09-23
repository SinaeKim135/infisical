import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionSecretActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TSecretArchiveDALFactory } from "./secret-archive-dal";
import {
  TArchiveSecretDTO,
  TDeleteArchivedSecretDTO,
  TListArchivedSecretsDTO,
  TRestoreSecretDTO
} from "./secret-archive-types";

type TSecretArchiveServiceFactoryDep = {
  secretArchiveDAL: TSecretArchiveDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TSecretArchiveServiceFactory = ReturnType<typeof secretArchiveServiceFactory>;

export const secretArchiveServiceFactory = ({
  secretArchiveDAL,
  permissionService
}: TSecretArchiveServiceFactoryDep) => {
  const resolveSecretPermission = async (
    secretId: string,
    actor: TArchiveSecretDTO["actor"],
    actorId: string,
    actorAuthMethod: TArchiveSecretDTO["actorAuthMethod"],
    actorOrgId: string
  ) => {
    const secret = await secretArchiveDAL.findSecretWithProject(secretId);
    if (!secret) throw new NotFoundError({ message: `Secret with ID '${secretId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: secret.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    return { secret, permission };
  };

  const listArchivedSecrets = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId
  }: TListArchivedSecretsDTO) => {
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

    const secrets = await secretArchiveDAL.findArchivedByProjectId(projectId);
    return { secrets };
  };

  // soft-delete: hide the secret from the normal listing but keep it restorable
  const archiveSecret = async ({ secretId, actor, actorId, actorOrgId, actorAuthMethod }: TArchiveSecretDTO) => {
    const { secret, permission } = await resolveSecretPermission(secretId, actor, actorId, actorAuthMethod, actorOrgId);

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionSecretActions.Delete, ProjectPermissionSub.Secrets);

    if (secret.archivedAt) {
      throw new BadRequestError({ message: "Secret is already archived" });
    }

    const archivedSecret = await secretArchiveDAL.setArchivedAt(secretId, new Date());
    return { secret: archivedSecret };
  };

  const restoreSecret = async ({ secretId, actor, actorId, actorOrgId, actorAuthMethod }: TRestoreSecretDTO) => {
    const { secret, permission } = await resolveSecretPermission(secretId, actor, actorId, actorAuthMethod, actorOrgId);

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionSecretActions.Edit, ProjectPermissionSub.Secrets);

    if (!secret.archivedAt) {
      throw new BadRequestError({ message: "Secret is not archived" });
    }

    // a new secret may have taken over this key while it was archived — block the conflicting restore
    const conflicting = await secretArchiveDAL.findActiveByFolderKey(secret.folderId, secret.key, secret.type);
    if (conflicting) {
      throw new BadRequestError({
        message: `Cannot restore: an active secret with key '${secret.key}' already exists. Rename or remove it first.`
      });
    }

    const restoredSecret = await secretArchiveDAL.setArchivedAt(secretId, null);
    return { secret: restoredSecret };
  };

  const deleteArchivedSecret = async ({
    secretId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TDeleteArchivedSecretDTO) => {
    const { secret, permission } = await resolveSecretPermission(secretId, actor, actorId, actorAuthMethod, actorOrgId);

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionSecretActions.Delete, ProjectPermissionSub.Secrets);

    if (!secret.archivedAt) {
      throw new BadRequestError({ message: "Only archived secrets can be permanently deleted" });
    }

    const deletedSecret = await secretArchiveDAL.deletePermanently(secretId);
    return { secret: deletedSecret };
  };

  return {
    listArchivedSecrets,
    archiveSecret,
    restoreSecret,
    deleteArchivedSecret
  };
};
