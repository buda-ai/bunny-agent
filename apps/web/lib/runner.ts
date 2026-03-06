import type { RunnerType } from "@sandagent/sdk";

export type { RunnerType } from "@sandagent/sdk";

export const RUNNER_OPTIONS: { value: RunnerType; label: string }[] = [
  { value: "claude", label: "Claude (Anthropic)" },
  { value: "pi", label: "Pi" },
  { value: "codex", label: "Codex" },
  { value: "gemini", label: "Gemini" },
  { value: "opencode", label: "OpenCode" },
];

export const DEFAULT_RUNNER: RunnerType = "claude";
