const LINE_REGEX =
  /^\s*(?:export\s+)?([\w.:-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?$/;

export type TParsedEnvEntry = {
  key: string;
  value: string;
  comments: string[];
};

export const parseEnvFileContent = (content: string): TParsedEnvEntry[] => {
  const normalized = content.replace(/\r\n?/g, "\n");
  const result: TParsedEnvEntry[] = [];
  const seen = new Set<string>();

  let pendingComments: string[] = [];

  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      pendingComments = [];
      continue;
    }

    if (line.startsWith("#")) {
      pendingComments.push(line.replace(/^#\s?/, ""));
      continue;
    }

    const match = LINE_REGEX.exec(rawLine);
    if (!match) {
      pendingComments = [];
      continue;
    }

    const key = match[1];
    let value = (match[2] ?? "").trim();

    const quote = value[0];
    if (quote === '"' || quote === "'" || quote === "`") {
      value = value.replace(/^(['"`])([\s\S]*)\1$/m, "$2");
      if (quote === '"') {
        value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
      }
    }

    if (seen.has(key)) {
      const existing = result.find((entry) => entry.key === key);
      if (existing) {
        existing.value = value;
        existing.comments = pendingComments;
      }
    } else {
      seen.add(key);
      result.push({ key, value, comments: pendingComments });
    }

    pendingComments = [];
  }

  return result;
};
