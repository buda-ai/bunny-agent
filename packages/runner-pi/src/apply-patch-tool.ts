/**
 * `apply_patch` tool for bunny-agent's pi runner.
 *
 * GPT-5.1 and the Codex model family are trained heavily against OpenAI's
 * `apply_patch` tool: a context-addressed diff format ("V4A") delimited by
 * `*** Begin Patch` / `*** Update File: ...` / `*** End Patch`, exposed as a
 * built-in tool type in the Responses API and as a shell-level command in
 * Codex CLI. When a harness doesn't expose this tool, these models still
 * reach for it by habit — either emitting a bare tool call the harness
 * doesn't recognize, or piping `apply_patch <<'PATCH'` through the bash
 * tool, which fails in any sandbox that doesn't happen to ship that binary
 * (see the sandbox behavior this was written to fix: the model retries via
 * bash, gets "not installed", then falls back to write — three tool calls
 * for what should be one). Registering a native tool named `apply_patch`
 * lets that training prior work for us instead of against us.
 *
 * The bash-heredoc habit (including chained forms like
 * `cd x && apply_patch <<'PATCH'`) is covered separately by the real
 * `apply_patch` shell command — see `apply-patch-bin.ts` and
 * `apply-patch-shim.ts`. The V4A engine shared by both lives in
 * `apply-patch-core.ts`.
 */

import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { applyPatch, formatPatchResult } from "./apply-patch-core.js";

// Historical import site: the engine used to live in this file. Keep the
// re-export so existing importers and tests stay valid.
export {
  type ApplyPatchResult,
  applyPatch,
  PatchParseError,
} from "./apply-patch-core.js";

const applyPatchSchema = {
  type: "object",
  properties: {
    input: {
      type: "string",
      description:
        "The full patch text, in the apply_patch / V4A format: " +
        "'*** Begin Patch' ... one or more of '*** Update File: <path>' / " +
        "'*** Add File: <path>' / '*** Delete File: <path>' sections (update hunks use " +
        "'@@' markers with context lines prefixed by a space, removed lines by '-', " +
        "added lines by '+') ... '*** End Patch'.",
    },
  },
  required: ["input"],
  additionalProperties: false,
};

export function buildApplyPatchTool(cwd: string): ToolDefinition {
  return {
    name: "apply_patch",
    label: "apply patch",
    description:
      "Apply a context-addressed patch (V4A format) that updates, adds, or deletes one or more files. " +
      "Prefer this over bash or single-line edits for multi-hunk or multi-file changes.",
    promptSnippet:
      "apply_patch(input) - apply a *** Begin Patch / *** End Patch diff to update, add, or delete files",
    promptGuidelines: [
      "Use apply_patch for file creation, edits, deletes, and renames instead of shelling out to a patch CLI.",
      "Each update hunk needs enough unchanged context lines (prefixed with a space) to locate it uniquely in the file.",
      "Use '*** Move to: <path>' right after '*** Update File: <path>' to rename/move a file while editing it.",
    ],
    // biome-ignore lint/suspicious/noExplicitAny: plain JSON Schema compatible with TypeBox TSchema
    parameters: applyPatchSchema as any,
    async execute(_toolCallId, params, _signal, _onUpdate) {
      const input = (params as Record<string, unknown>).input as string;
      try {
        const result = applyPatch(cwd, input);
        const summary = formatPatchResult(result);
        return {
          content: [
            {
              type: "text" as const,
              text: summary || "Patch applied (no file changes detected).",
            },
          ],
          details: undefined,
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: `Patch error: ${msg}` }],
          details: undefined,
        };
      }
    },
  };
}
