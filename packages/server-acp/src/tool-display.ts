import { isAbsolute, resolve } from "node:path";
import type {
  ContentBlock,
  PlanEntry,
  ToolCallContent,
  ToolCallLocation,
  ToolKind,
} from "@agentclientprotocol/sdk";

export const recordOf = (
  value: unknown,
): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

export function toolKind(name: string): ToolKind {
  const key = name.toLowerCase().replace(/[\s_-]/g, "");
  if (/^(read|readfile|list|ls|find|glob)/.test(key)) return "read";
  if (/^(grep|search|websearch|ripgrep)/.test(key)) return "search";
  if (/^(write|edit|multiedit|applypatch|replace|notebookedit)/.test(key))
    return "edit";
  if (/^(delete|remove|unlink)/.test(key)) return "delete";
  if (/^(move|rename)/.test(key)) return "move";
  if (/^(bash|shell|execute|exec|terminal|runcommand)/.test(key))
    return "execute";
  if (/^(fetch|webfetch|browse)/.test(key)) return "fetch";
  if (/^(todo|plan|updateplan|task|agent)/.test(key)) return "think";
  return "other";
}

export function toolDisplay(
  name: string,
  input: unknown,
  cwd?: string,
): {
  title: string;
  kind: ToolKind;
  locations?: ToolCallLocation[];
  content?: ToolCallContent[];
} {
  const value = recordOf(input) ?? {};
  const kind = toolKind(name);
  const path = [value.file_path, value.path, value.filePath].find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.length > 0,
  );
  const location =
    path && (isAbsolute(path) ? path : cwd ? resolve(cwd, path) : undefined);
  const detail =
    path ??
    [
      value.command,
      value.query,
      value.pattern,
      value.url,
      value.description,
    ].find(
      (candidate): candidate is string =>
        typeof candidate === "string" && candidate.length > 0,
    );
  const title = detail ? `${name}: ${detail.slice(0, 160)}` : name;
  const oldText = value.old_string ?? value.oldText;
  const newText = value.new_string ?? value.newText ?? value.content;
  const content: ToolCallContent[] | undefined =
    kind === "edit" && path && typeof newText === "string"
      ? [
          {
            type: "diff",
            path: location ?? path,
            ...(typeof oldText === "string" ? { oldText } : {}),
            newText,
          },
        ]
      : undefined;
  return {
    title,
    kind,
    ...(location ? { locations: [{ path: location }] } : {}),
    ...(content ? { content } : {}),
  };
}

export function contentBlock(value: unknown): ContentBlock | undefined {
  const item = recordOf(value);
  if (!item) return undefined;
  if (item.type === "text" && typeof item.text === "string")
    return item as ContentBlock;
  if (
    (item.type === "image" || item.type === "audio") &&
    typeof item.data === "string" &&
    typeof item.mimeType === "string"
  )
    return item as ContentBlock;
  if (
    item.type === "resource_link" &&
    typeof item.uri === "string" &&
    typeof item.name === "string"
  ) {
    return item as ContentBlock;
  }
  if (item.type === "resource" && recordOf(item.resource))
    return item as ContentBlock;
  return undefined;
}

/** Structured output is preferred; the untouched raw result is kept separately. */
export function toolContents(output: unknown): ToolCallContent[] {
  const value = recordOf(output);
  const candidates = Array.isArray(output)
    ? output
    : Array.isArray(value?.content)
      ? value.content
      : [];
  const contents = candidates.flatMap((candidate): ToolCallContent[] => {
    const item = recordOf(candidate);
    if (!item) return [];
    if (
      item.type === "diff" &&
      typeof item.path === "string" &&
      typeof item.newText === "string"
    ) {
      return [item as unknown as ToolCallContent];
    }
    if (item.type === "terminal" && typeof item.terminalId === "string") {
      return [item as unknown as ToolCallContent];
    }
    if (item.type === "content" && contentBlock(item.content))
      return [item as unknown as ToolCallContent];
    const block = contentBlock(item);
    return block ? [{ type: "content", content: block }] : [];
  });
  if (contents.length > 0) return contents;
  const text =
    typeof output === "string" ? output : JSON.stringify(output ?? null);
  return [{ type: "content", content: { type: "text", text } }];
}

export function planEntries(input: unknown): PlanEntry[] | undefined {
  const value = recordOf(input);
  const entries = value?.todos ?? value?.plan;
  if (!Array.isArray(entries)) return undefined;
  return entries.flatMap((entry): PlanEntry[] => {
    const item = recordOf(entry);
    if (!item) return [];
    const description = item.content ?? item.step ?? item.subject;
    if (typeof description !== "string") return [];
    const status =
      item.status === "completed"
        ? "completed"
        : item.status === "in_progress"
          ? "in_progress"
          : "pending";
    return [
      {
        content:
          status === "in_progress" && typeof item.activeForm === "string"
            ? item.activeForm
            : description,
        status,
        priority:
          item.priority === "high" || item.priority === "low"
            ? item.priority
            : "medium",
      },
    ];
  });
}
