import { useState } from "react";
import { FolderDownIcon } from "lucide-react";

import { IconButton, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { ProjectEnv } from "@app/hooks/api/types";
import { MultiPathDownloadModal } from "@app/pages/secret-manager/SecretDashboardPage/components/ActionBar/MultiPathDownloadModal";

type Props = {
  secretPath: string;
  environments: ProjectEnv[];
  projectId: string;
};

export const MultiPathDownloadEnvButton = ({ environments, projectId, secretPath }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const isSingleEnv = environments.length === 1;

  return (
    <>
      <Tooltip>
        <TooltipTrigger>
          <IconButton
            variant="outline"
            size="md"
            isDisabled={!isSingleEnv}
            onClick={() => setIsOpen(true)}
          >
            <FolderDownIcon />
          </IconButton>
        </TooltipTrigger>
        <TooltipContent>
          {isSingleEnv
            ? "Download a merged .env from several paths"
            : "Select a single environment to download secrets"}
        </TooltipContent>
      </Tooltip>
      {isSingleEnv && (
        <MultiPathDownloadModal
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          projectId={projectId}
          environment={environments[0].slug}
          secretPath={secretPath}
        />
      )}
    </>
  );
};
