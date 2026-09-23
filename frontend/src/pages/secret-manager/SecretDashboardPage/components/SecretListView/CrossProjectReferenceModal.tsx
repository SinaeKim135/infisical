import { useMemo, useState } from "react";

import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { useProject } from "@app/context";
import { useGetUserProjects } from "@app/hooks/api/projects/queries";
import { ProjectType } from "@app/hooks/api/projects/types";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onInsert: (reference: string) => void;
};

const buildReference = (
  projectSlug: string,
  environment: string,
  secretPath: string,
  key: string
) => {
  const pathSegments = secretPath
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const dottedPath = pathSegments.join(".");
  const inner = `${projectSlug}::${environment}${dottedPath ? `.${dottedPath}` : ""}.${key}`;
  return `\${${inner}}`;
};

export const CrossProjectReferenceModal = ({ isOpen, onOpenChange, onInsert }: Props) => {
  const { currentProject } = useProject();
  const { data: projects, isPending } = useGetUserProjects();

  const [projectSlug, setProjectSlug] = useState("");
  const [environment, setEnvironment] = useState("");
  const [secretPath, setSecretPath] = useState("/");
  const [secretKey, setSecretKey] = useState("");

  // Only Secret Manager projects (other than the current one) can be referenced.
  const referenceableProjects = useMemo(
    () =>
      (projects ?? []).filter(
        (project) => project.type === ProjectType.SecretManager && project.id !== currentProject?.id
      ),
    [projects, currentProject?.id]
  );

  const selectedProject = referenceableProjects.find((project) => project.slug === projectSlug);
  const environments = selectedProject?.environments ?? [];

  const isValid = Boolean(projectSlug && environment && secretKey.trim());
  const preview = isValid
    ? buildReference(projectSlug, environment, secretPath || "/", secretKey.trim())
    : "";

  const reset = () => {
    setProjectSlug("");
    setEnvironment("");
    setSecretPath("/");
    setSecretKey("");
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const handleInsert = () => {
    if (!isValid) return;
    onInsert(buildReference(projectSlug, environment, secretPath || "/", secretKey.trim()));
    reset();
    onOpenChange(false);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={handleOpenChange}>
      <ModalContent
        title="Insert cross-project reference"
        subTitle="Reference a secret stored in another project. The reference is resolved at read time, and only if you have read access to it in the source project."
      >
        <div className="flex flex-col gap-y-3">
          <FormControl label="Source project">
            <Select
              value={projectSlug}
              onValueChange={(slug) => {
                setProjectSlug(slug);
                setEnvironment("");
              }}
              placeholder={isPending ? "Loading projects..." : "Select a project"}
              className="w-full"
              isDisabled={isPending || referenceableProjects.length === 0}
            >
              {referenceableProjects.map((project) => (
                <SelectItem key={project.id} value={project.slug}>
                  {project.name}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
          <FormControl label="Environment">
            <Select
              value={environment}
              onValueChange={setEnvironment}
              placeholder="Select an environment"
              className="w-full"
              isDisabled={!selectedProject}
            >
              {environments.map((env) => (
                <SelectItem key={env.id} value={env.slug}>
                  {env.name}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
          <FormControl
            label="Secret path"
            helperText="Folder path within the environment, e.g. /tls or /"
          >
            <Input
              value={secretPath}
              onChange={(e) => setSecretPath(e.target.value)}
              placeholder="/"
            />
          </FormControl>
          <FormControl label="Secret key">
            <Input
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder="CERTIFICATE"
            />
          </FormControl>
          {referenceableProjects.length === 0 && !isPending && (
            <p className="text-sm text-mineshaft-400">
              No other Secret Manager projects are available to reference.
            </p>
          )}
          {preview && (
            <FormControl label="Reference">
              <Input value={preview} isReadOnly className="font-mono" />
            </FormControl>
          )}
        </div>
        <div className="mt-6 flex items-center gap-2">
          <Button onClick={handleInsert} isDisabled={!isValid}>
            Insert reference
          </Button>
          <Button variant="plain" colorSchema="secondary" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
};
