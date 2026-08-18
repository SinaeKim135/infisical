import { ChangeEvent, useState } from "react";
import {
  faCircleCheck,
  faFileImport,
  faTriangleExclamation,
  faUpload
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AxiosError } from "axios";

import { createNotification } from "@app/components/notifications";
import { Button } from "@app/components/v2";
import {
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
import { useBulkImportSecrets } from "@app/hooks/api";
import {
  BulkImportFormat,
  BulkImportItemAction,
  TBulkImportSecretsResponse
} from "@app/hooks/api/secrets/types";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  environment: string;
  secretPath: string;
};

const FORMAT_OPTIONS: { value: BulkImportFormat; label: string }[] = [
  { value: BulkImportFormat.Env, label: ".env" },
  { value: BulkImportFormat.Csv, label: "CSV" },
  { value: BulkImportFormat.Json, label: "JSON" }
];

const detectFormatFromFileName = (name: string): BulkImportFormat => {
  const lower = name.toLowerCase();
  if (lower.endsWith(".json")) return BulkImportFormat.Json;
  if (lower.endsWith(".csv")) return BulkImportFormat.Csv;
  return BulkImportFormat.Env;
};

const actionBadge = (action: BulkImportItemAction) => {
  if (action === BulkImportItemAction.Create) return <Badge variant="success">create</Badge>;
  if (action === BulkImportItemAction.Overwrite) return <Badge variant="warning">overwrite</Badge>;
  return <Badge variant="neutral">skip</Badge>;
};

const PLACEHOLDER_BY_FORMAT: Record<BulkImportFormat, string> = {
  [BulkImportFormat.Json]:
    '{ "API_KEY": "value" }  or  [{ "environment": "prod", "path": "/svc", "key": "K", "value": "v" }]',
  [BulkImportFormat.Csv]: "key,value,environment,path\nAPI_KEY,value,prod,/svc",
  [BulkImportFormat.Env]: "API_KEY=value\nDB_URL=postgres://..."
};

const MAX_PREVIEW_ROWS = 200;

export const BulkImportSecretsModal = ({
  isOpen,
  onOpenChange,
  projectId,
  environment,
  secretPath
}: Props) => {
  const [format, setFormat] = useState<BulkImportFormat>(BulkImportFormat.Env);
  const [data, setData] = useState("");
  const [fileName, setFileName] = useState("");
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [preview, setPreview] = useState<TBulkImportSecretsResponse | null>(null);
  const [result, setResult] = useState<TBulkImportSecretsResponse | null>(null);

  const { mutateAsync, isPending } = useBulkImportSecrets();

  const resetState = () => {
    setFormat(BulkImportFormat.Env);
    setData("");
    setFileName("");
    setOverwriteExisting(false);
    setPreview(null);
    setResult(null);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) resetState();
    onOpenChange(open);
  };

  // any change to the inputs invalidates a previously computed preview
  const invalidatePreview = () => {
    setPreview(null);
    setResult(null);
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // allow re-uploading the same file
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      setData(text);
      setFileName(file.name);
      setFormat(detectFormatFromFileName(file.name));
      invalidatePreview();
    } catch {
      createNotification({ type: "error", text: "Failed to read the selected file" });
    }
  };

  const runMutation = (dryRun: boolean) =>
    mutateAsync({
      projectId,
      environment,
      secretPath,
      format,
      data,
      dryRun,
      overwriteExisting
    });

  const handlePreview = async () => {
    if (!data.trim()) {
      createNotification({ type: "error", text: "Paste or upload a file before previewing" });
      return;
    }
    try {
      const res = await runMutation(true);
      setResult(null);
      setPreview(res);
    } catch (err) {
      const message =
        (err as AxiosError<{ message: string }>)?.response?.data?.message ??
        "Failed to generate import preview";
      createNotification({ type: "error", text: message });
    }
  };

  const handleImport = async () => {
    try {
      const res = await runMutation(false);
      setResult(res);
      setPreview(null);
      createNotification({
        type: "success",
        text: `Imported ${res.imported ?? 0} secret(s): ${res.created ?? 0} created, ${
          res.overwritten ?? 0
        } overwritten, ${res.skipped ?? 0} skipped`
      });
    } catch (err) {
      const message =
        (err as AxiosError<{ message: string }>)?.response?.data?.message ?? "Failed to import secrets";
      createNotification({ type: "error", text: message });
    }
  };

  const hasImportableItems =
    (preview?.secretsToCreate ?? 0) > 0 || (preview?.secretsToOverwrite ?? 0) > 0;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Import Secrets</DialogTitle>
          <DialogDescription>
            Upload or paste a .env, CSV, or JSON file to import many secrets at once. Preview the
            changes before importing — nothing is written until you confirm.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm text-mineshaft-200">
              <FontAwesomeIcon icon={faCircleCheck} className="text-green-500" />
              Import complete
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="success">{result.created ?? 0} created</Badge>
              <Badge variant="warning">{result.overwritten ?? 0} overwritten</Badge>
              <Badge variant="neutral">{result.skipped ?? 0} skipped</Badge>
              {result.parseErrors.length > 0 && (
                <Badge variant="danger">{result.parseErrors.length} parse error(s)</Badge>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline_bg" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-mineshaft-300">Format</span>
              <div className="flex gap-2">
                {FORMAT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setFormat(option.value);
                      invalidatePreview();
                    }}
                    className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                      format === option.value
                        ? "border-primary-500 bg-mineshaft-600 text-mineshaft-100"
                        : "border-mineshaft-600 bg-mineshaft-800 text-mineshaft-300 hover:bg-mineshaft-700"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-mineshaft-600 bg-mineshaft-800 px-3 py-1.5 text-sm text-mineshaft-200 hover:bg-mineshaft-700">
                <FontAwesomeIcon icon={faUpload} />
                Upload file
                <input
                  type="file"
                  accept=".env,.txt,.csv,.json"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
              {fileName && <span className="text-xs text-mineshaft-400">{fileName}</span>}
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-mineshaft-300">Or paste contents</span>
              <textarea
                value={data}
                onChange={(e) => {
                  setData(e.target.value);
                  invalidatePreview();
                }}
                spellCheck={false}
                placeholder={PLACEHOLDER_BY_FORMAT[format]}
                className="h-40 w-full resize-none rounded-md border border-mineshaft-600 bg-mineshaft-900 p-3 font-mono text-xs text-mineshaft-100 outline-none placeholder:text-mineshaft-500 focus:border-primary-500"
              />
            </div>

            <div className="rounded-md border border-mineshaft-600 bg-mineshaft-800 px-3 py-2 text-xs text-mineshaft-300">
              Default target:{" "}
              <span className="text-mineshaft-100">
                {environment} : {secretPath}
              </span>
              . CSV/JSON rows may override the environment and path per item.
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-mineshaft-200">
              <input
                type="checkbox"
                checked={overwriteExisting}
                onChange={(e) => {
                  setOverwriteExisting(e.target.checked);
                  invalidatePreview();
                }}
                className="h-4 w-4 accent-primary-500"
              />
              Overwrite secrets that already exist (otherwise they are skipped)
            </label>

            {preview && (
              <div className="flex flex-col gap-3 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="success">{preview.secretsToCreate ?? 0} to create</Badge>
                  <Badge variant="warning">{preview.secretsToOverwrite ?? 0} to overwrite</Badge>
                  <Badge variant="neutral">{preview.secretsToSkip ?? 0} to skip</Badge>
                  {(preview.foldersToCreate?.length ?? 0) > 0 && (
                    <Badge variant="info">
                      {preview.foldersToCreate?.length} new folder(s)
                    </Badge>
                  )}
                  {preview.parseErrors.length > 0 && (
                    <Badge variant="danger">{preview.parseErrors.length} parse error(s)</Badge>
                  )}
                </div>

                {preview.parseErrors.length > 0 && (
                  <div className="max-h-28 overflow-y-auto rounded border border-red/30 bg-red/5 p-2 text-xs text-red-300">
                    <div className="mb-1 flex items-center gap-1 font-medium">
                      <FontAwesomeIcon icon={faTriangleExclamation} />
                      Parse errors
                    </div>
                    {preview.parseErrors.slice(0, MAX_PREVIEW_ROWS).map((error) => (
                      <div key={`${error.line ?? ""}-${error.raw ?? ""}-${error.message}`}>
                        {error.line ? `Line ${error.line}: ` : ""}
                        {error.message}
                      </div>
                    ))}
                  </div>
                )}

                {preview.items.length > 0 && (
                  <div className="max-h-44 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-mineshaft-400">
                        <tr>
                          <th className="py-1 pr-2 font-medium">Action</th>
                          <th className="py-1 pr-2 font-medium">Environment</th>
                          <th className="py-1 pr-2 font-medium">Path</th>
                          <th className="py-1 font-medium">Key</th>
                        </tr>
                      </thead>
                      <tbody className="text-mineshaft-200">
                        {preview.items.slice(0, MAX_PREVIEW_ROWS).map((item) => (
                          <tr
                            key={`${item.environment}-${item.secretPath}-${item.secretKey}`}
                            className="border-t border-mineshaft-700"
                          >
                            <td className="py-1 pr-2">{actionBadge(item.action)}</td>
                            <td className="py-1 pr-2">{item.environment}</td>
                            <td className="py-1 pr-2 font-mono">{item.secretPath}</td>
                            <td className="py-1 font-mono">{item.secretKey}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {preview.items.length > MAX_PREVIEW_ROWS && (
                      <div className="pt-1 text-xs text-mineshaft-400">
                        Showing first {MAX_PREVIEW_ROWS} of {preview.items.length} items
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline_bg" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="outline_bg"
                isLoading={isPending && !preview}
                onClick={handlePreview}
              >
                Preview
              </Button>
              <Button
                colorSchema="primary"
                leftIcon={<FontAwesomeIcon icon={faFileImport} />}
                isLoading={isPending && Boolean(preview)}
                isDisabled={!preview || !hasImportableItems}
                onClick={handleImport}
              >
                Import
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
