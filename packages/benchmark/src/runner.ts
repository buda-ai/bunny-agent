/**
 * Agent CLI Runners
 *
 * Executes benchmark tasks using various agent CLIs:
 * - sandagent: SandAgent CLI
 * - gemini-cli: Google Gemini CLI
 * - claudecode: Anthropic Claude Code CLI
 * - codex-cli: OpenAI Codex CLI
 *
 * Reference implementations:
 * - claude_code_agent.py: Uses -p --output-format json --dangerously-skip-permissions
 * - codex_agent.py: Uses exec --full-auto --output-last-message
 * - gemini_agent.py: Uses -p --output-format json
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AgentRunner,
  BenchmarkResult,
  GaiaLevel,
  GaiaTask,
  RunnerConfig,
} from "./types.js";

/**
 * Default configurations for each runner
 * Reference: Python agent implementations
 */
const DEFAULT_RUNNER_CONFIGS: Record<AgentRunner, Partial<RunnerConfig>> = {
  sandagent: {
    command: "sandagent",
    args: ["run", "--"],
    timeout: 300000, // 5 minutes
  },
  "gemini-cli": {
    // gemini -p <prompt> --output-format json
    command: "gemini",
    args: ["-p"],
    timeout: 300000,
  },
  claudecode: {
    // claude -p <prompt> --output-format json --dangerously-skip-permissions
    command: "claude",
    args: ["-p"],
    timeout: 300000,
  },
  "codex-cli": {
    // codex exec --full-auto --color never <prompt>
    command: "codex",
    args: ["exec", "--full-auto", "--color", "never"],
    timeout: 300000,
  },
};

/**
 * Build the command arguments for a specific runner
 * No shell escaping needed since we don't use shell: true
 */
function buildRunnerCommand(
  runner: AgentRunner,
  task: GaiaTask,
  config: RunnerConfig,
): { command: string; args: string[] } {
  const baseCommand = config.command ?? DEFAULT_RUNNER_CONFIGS[runner].command!;

  // Build prompt with file context if present
  let prompt = task.question;
  if (task.files && task.files.length > 0) {
    const fileInfo = task.files
      .map((f) => `[Attached file: ${f.name} at ${f.path}]`)
      .join("\n");
    prompt = `${fileInfo}\n\n${task.question}`;
  }

  switch (runner) {
    case "sandagent":
      return {
        command: baseCommand,
        args: ["run", "--", prompt],
      };

    case "gemini-cli":
      // Gemini CLI: gemini -p <prompt> --output-format json
      // Reference: gemini_agent.py
      return {
        command: baseCommand,
        args: ["-p", prompt, "--output-format", "json"],
      };

    case "claudecode":
      // Claude Code: claude -p <prompt> --output-format json --tools default --dangerously-skip-permissions
      // Reference: claude_code_agent.py
      return {
        command: baseCommand,
        args: [
          "-p",
          prompt,
          "--output-format",
          "text",
          "--tools",
          "default",
          "--dangerously-skip-permissions",
          "--no-session-persistence",
        ],
      };

    case "codex-cli":
      // Codex CLI: codex exec --full-auto --color never <prompt>
      // Reference: codex_agent.py
      return {
        command: baseCommand,
        args: ["exec", "--full-auto", "--color", "never", prompt],
      };

    default:
      throw new Error(`Unknown runner: ${runner}`);
  }
}

/**
 * Execute a command and capture output
 * Does NOT use shell: true to avoid escaping issues
 */
function executeCommand(
  command: string,
  args: string[],
  options: {
    env?: Record<string, string>;
    cwd?: string;
    timeout?: number;
  } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      env: { ...process.env, ...options.env },
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'], // Explicitly pipe all stdio streams
      // Note: No shell: true - pass args directly to avoid escaping issues
    });
    
    // Close stdin immediately since we don't need to provide input
    proc.stdin?.end();

    let stdout = "";
    let stderr = "";
    let killed = false;

    // Set up timeout manually since we're not using shell
    const timeoutId = options.timeout
      ? setTimeout(() => {
          killed = true;
          proc.kill("SIGTERM");
          // Give it a moment, then force kill
          setTimeout(() => proc.kill("SIGKILL"), 1000);
        }, options.timeout)
      : null;

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (killed) {
        resolve({
          stdout,
          stderr: stderr + `\nProcess killed after timeout (${options.timeout}ms)`,
          exitCode: -1,
        });
      } else {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      }
    });

    proc.on("error", (err) => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(err);
    });
  });
}

/**
 * Normalize answer for comparison
 */
export function normalizeAnswer(answer: string): string {
  return answer
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "");
}

/**
 * Check if an answer is correct
 */
export function checkAnswer(
  agentAnswer: string,
  expectedAnswer: string,
): boolean {
  const normalizedAgent = normalizeAnswer(agentAnswer);
  const normalizedExpected = normalizeAnswer(expectedAnswer);

  // Empty agent answer is always incorrect
  if (normalizedAgent.length === 0) {
    return false;
  }

  // Exact match
  if (normalizedAgent === normalizedExpected) {
    return true;
  }

  // Contains match (agent answer contains expected, or vice versa)
  if (
    normalizedAgent.includes(normalizedExpected) ||
    normalizedExpected.includes(normalizedAgent)
  ) {
    return true;
  }

  return false;
}

/**
 * Try to parse a string as JSON
 */
function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Extract content from JSON response (for CLI tools with --output-format json)
 * Reference: Python agents' _extract_content_from_json methods
 */
function extractContentFromJson(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }

  if (typeof payload === "object" && payload !== null) {
    const obj = payload as Record<string, unknown>;

    // Try common content fields
    const contentFields = ["content", "text", "output", "message", "response", "result"];
    for (const field of contentFields) {
      if (typeof obj[field] === "string") {
        return obj[field] as string;
      }
    }

    // If it's a structured response, stringify it
    return JSON.stringify(payload);
  }

  return String(payload);
}

/**
 * Detect API errors in output
 */
function detectApiError(output: string): string | undefined {
  const errorPatterns = [
    /API Error:[^\n]+/i,
    /Error:.*unauthorized/i,
    /Error:.*rate limit/i,
    /Error:.*quota exceeded/i,
    /violate.*Usage Policy/i,
    /Missing bearer or basic authentication/i,
    /401 Unauthorized/i,
    /ProjectIdRequiredError/i,
  ];

  for (const pattern of errorPatterns) {
    const match = output.match(pattern);
    if (match) {
      return match[0];
    }
  }
  return undefined;
}

/**
 * Extract the final answer from agent output
 * Agents often include explanation before the answer
 */
function extractFinalAnswer(output: string): string {
  // First try to parse as JSON (for --output-format json responses)
  const jsonResult = tryParseJson(output);
  if (jsonResult) {
    const content = extractContentFromJson(jsonResult);
    // If content is different from stringified JSON, use it
    if (content !== JSON.stringify(jsonResult)) {
      return content.trim();
    }
  }

  // Look for common answer patterns
  const patterns = [
    /(?:final answer|answer)[:\s]+(.+?)(?:\n|$)/i,
    /(?:the answer is)[:\s]+(.+?)(?:\n|$)/i,
    /(?:result)[:\s]+(.+?)(?:\n|$)/i,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  // If no pattern found, return the last non-empty line
  const lines = output
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines[lines.length - 1] ?? output.trim();
}

/**
 * Run a single benchmark task with a specific runner
 */
export async function runTask(
  task: GaiaTask,
  config: RunnerConfig,
): Promise<BenchmarkResult> {
  const startTime = Date.now();
  const { command, args } = buildRunnerCommand(config.runner, task, config);

  try {
    const result = await executeCommand(command, args, {
      env: config.env,
      cwd: config.cwd,
      timeout: config.timeout ?? DEFAULT_RUNNER_CONFIGS[config.runner].timeout,
    });

    const durationMs = Date.now() - startTime;
    const rawOutput = result.stdout;

    // Check for API errors in stdout or stderr
    const apiError = detectApiError(rawOutput) || detectApiError(result.stderr);
    if (apiError) {
      return {
        taskId: task.id,
        question: task.question,
        level: task.level,
        files: task.files?.map((f) => f.name),
        answer: "",
        expectedAnswer: task.answer,
        correct: false,
        durationMs,
        rawOutput,
        error: apiError,
      };
    }

    const answer = extractFinalAnswer(rawOutput);
    // If command failed (non-zero exit code), mark as incorrect
    const correct = result.exitCode === 0 && checkAnswer(answer, task.answer);

    return {
      taskId: task.id,
      question: task.question,
      level: task.level,
      files: task.files?.map((f) => f.name),
      answer,
      expectedAnswer: task.answer,
      correct,
      durationMs,
      rawOutput,
      error: result.exitCode !== 0 ? result.stderr : undefined,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    return {
      taskId: task.id,
      question: task.question,
      level: task.level,
      files: task.files?.map((f) => f.name),
      answer: "",
      expectedAnswer: task.answer,
      correct: false,
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if a runner is available on the system
 */
export async function isRunnerAvailable(runner: AgentRunner): Promise<boolean> {
  const command = DEFAULT_RUNNER_CONFIGS[runner].command!;

  try {
    const result = await executeCommand("which", [command], { timeout: 5000 });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Ensure codex-cli is logged in with OPENAI_API_KEY
 */
export async function ensureCodexLogin(): Promise<boolean> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("⚠️  OPENAI_API_KEY not set, codex-cli may fail to authenticate");
    return false;
  }

  // Check if already logged in
  const statusResult = await executeCommand("codex", ["login", "status"], { timeout: 5000 });
  if (statusResult.exitCode === 0) {
    return true; // Already logged in
  }

  // Login with API key via stdin using spawn directly
  console.log("🔑 Logging in to codex-cli with OPENAI_API_KEY...");
  
  return new Promise((resolve) => {
    const proc = spawn("codex", ["login", "--with-api-key"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        console.log("✅ codex-cli login successful");
        resolve(true);
      } else {
        console.error("❌ codex-cli login failed:", stderr);
        resolve(false);
      }
    });

    proc.on("error", (err) => {
      console.error("❌ codex-cli login error:", err.message);
      resolve(false);
    });

    // Write API key to stdin and close it
    proc.stdin.write(apiKey);
    proc.stdin.end();
  });
}

/**
 * Get available runners on the system
 */
export async function getAvailableRunners(): Promise<AgentRunner[]> {
  const runners: AgentRunner[] = [
    "sandagent",
    "gemini-cli",
    "claudecode",
    "codex-cli",
  ];
  const available: AgentRunner[] = [];

  for (const runner of runners) {
    if (await isRunnerAvailable(runner)) {
      available.push(runner);
    }
  }

  return available;
}

/**
 * Create a runner configuration
 */
export function createRunnerConfig(
  runner: AgentRunner,
  overrides?: Partial<RunnerConfig>,
): RunnerConfig {
  return {
    runner,
    ...DEFAULT_RUNNER_CONFIGS[runner],
    ...overrides,
  };
}
