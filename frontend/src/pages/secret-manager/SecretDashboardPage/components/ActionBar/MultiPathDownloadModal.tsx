import { useState } from "react";
import { subject } from "@casl/ability";
import { faArrowDown, faArrowUp, faDownload, faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, IconButton, Input, Modal, ModalContent } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { fetchProjectSecretsMultiPath } from "@app/hooks/api/secrets/queries";

type Props = {
  isOpen?: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  environment: string;
  secretPath: string;
};

const normalizePath = (path: string) => {
  const trimmed = path.trim();
  if (!trimmed) return "";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash !== "/" && withLeadingSlash.endsWith("/")
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
};

/**
 * Downloads a merged .env assembled from multiple secret paths.
 * Paths are applied in order — when the same key exists in several paths,
 * the value from the path lower in the list wins.
 */
export const MultiPathDownloadModal = ({
  isOpen,
  onOpenChange,
  projectId,
  environment,
  secretPath
}: Props) => {
  const [paths, setPaths] = useState<string[]>([normalizePath(secretPath) || "/"]);
  const [pathInput, setPathInput] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

  const handleAddPath = () => {
    const normalized = normalizePath(pathInput);
    if (!normalized) return;
    if (paths.includes(normalized)) {
      createNotification({ type: "info", text: "That path is already in the list" });
      return;
    }
    if (paths.length >= 10) {
      createNotification({ type: "error", text: "A maximum of 10 paths can be merged" });
      return;
    }
    setPaths([...paths, normalized]);
    setPathInput("");
  };

  const handleMovePath = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= paths.length) return;
    const next = [...paths];
    [next[index], next[target]] = [next[target], next[index]];
    setPaths(next);
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const { secrets, merge } = await fetchProjectSecretsMultiPath({
        projectId,
        environment,
        secretPaths: paths,
        viewSecretValue: true,
        expandSecretReferences: true,
        includeImports: false
      });

      const file = secrets
        .sort((a, b) => a.secretKey.toLowerCase().localeCompare(b.secretKey.toLowerCase()))
        .reduce(
          (prev, { secretKey, secretValue, secretComment }) =>
            secretComment
              ? `${prev}# ${secretComment}\n${secretKey}=${secretValue ?? ""}\n`
              : `${prev}${secretKey}=${secretValue ?? ""}\n`,
          ""
        );

      const blob = new Blob([file], { type: "text/plain;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${environment}-merged.env`;
      a.click();
      window.URL.revokeObjectURL(url);

      const overriddenCount = merge?.overrides?.length ?? 0;
      createNotification({
        type: "success",
        text: `Downloaded ${secrets.length} secrets from ${paths.length} paths${
          overriddenCount ? ` (${overriddenCount} key${overriddenCount > 1 ? "s" : ""} overridden by later paths)` : ""
        }`
      });
      onOpenChange(false);
    } catch {
      createNotification({
        type: "error",
        text: "Failed to download merged secrets. Check that you have access to every path in the list."
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Download merged .env from multiple paths"
        subTitle="Secrets from every path below are merged into one file. When the same key exists in several paths, the value from the path lower in the list wins."
      >
        <div className="flex items-center gap-2">
          <Input
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            placeholder="/team-a/service"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddPath();
              }
            }}
          />
          <Button leftIcon={<FontAwesomeIcon icon={faPlus} />} variant="outline_bg" onClick={handleAddPath}>
            Add path
          </Button>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {paths.map((path, index) => (
            <div
              key={path}
              className="flex items-center justify-between rounded-md border border-mineshaft-600 bg-mineshaft-800 px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs text-mineshaft-400">#{index + 1}</span>
                <span className="font-mono text-sm text-mineshaft-100">{path}</span>
                {index === paths.length - 1 && paths.length > 1 && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">highest precedence</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <IconButton
                  ariaLabel="Move path up"
                  variant="plain"
                  size="xs"
                  isDisabled={index === 0}
                  onClick={() => handleMovePath(index, -1)}
                >
                  <FontAwesomeIcon icon={faArrowUp} />
                </IconButton>
                <IconButton
                  ariaLabel="Move path down"
                  variant="plain"
                  size="xs"
                  isDisabled={index === paths.length - 1}
                  onClick={() => handleMovePath(index, 1)}
                >
                  <FontAwesomeIcon icon={faArrowDown} />
                </IconButton>
                <IconButton
                  ariaLabel="Remove path"
                  variant="plain"
                  size="xs"
                  isDisabled={paths.length === 1}
                  onClick={() => setPaths(paths.filter((el) => el !== path))}
                >
                  <FontAwesomeIcon icon={faXmark} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center gap-2">
          <ProjectPermissionCan
            I={ProjectPermissionActions.Read}
            a={subject(ProjectPermissionSub.Secrets, {
              environment,
              secretPath,
              secretName: "*",
              secretTags: ["*"]
            })}
          >
            {(isAllowed) => (
              <Button
                leftIcon={<FontAwesomeIcon icon={faDownload} />}
                onClick={handleDownload}
                isLoading={isDownloading}
                isDisabled={!isAllowed || !paths.length}
              >
                Download merged .env
              </Button>
            )}
          </ProjectPermissionCan>
          <Button variant="plain" colorSchema="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
};
