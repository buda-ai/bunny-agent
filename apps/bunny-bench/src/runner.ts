import { spawn } from "node:child_process";
import { runTBLiteTask } from "./datasets/tblite.js";
import type { Task, TaskResult } from "./types.js";

/**
 * Run a single task.
 * - TBLite tasks (id starts with "tblite-") use the Docker-based runner.
 * - Tasks with resumePrompt run a second turn with --resume <sessionId>.
 * - All other tasks use the plain agent CLI runner.
 */
export async function runTask(
  task: Task,
  opts: { runner?: string; model?: string; taskCwd?: string } = {},
): Promise<TaskResult> {
  const start = Date.now();

  // TBLite tasks need Docker — delegate to the dedicated runner.
  if (task.id.startsWith("tblite-")) {
    const taskName = task.id.replace(/^tblite-/, "");
    const result = await runTBLiteTask({
      taskName,
      agentCmd: opts.runner ?? "bunny",
      model: opts.model,
      taskCwd: opts.taskCwd,
      timeoutMs: task.timeoutMs,
    });
    return {
      task,
      output: result.output,
      passed: result.passed,
      durationMs: Date.now() - start,
      error: result.error,
    };
  }

  const cmdStr = opts.runner ?? "bunny";
  const parts = cmdStr.split(" ");
  const cmd = parts[0];
  // Append prompt as last arg (works for both "bunny --print" and custom runners)
  const args = [...parts.slice(1), task.prompt];
  if (opts.model) args.push("--model", opts.model);

  const taskCwd = opts.taskCwd ?? process.cwd();
  const projectRoot = process.env.BUNNY_PROJECT_ROOT ?? process.cwd();

  try {
    const { stdout, stderr } = await exec(cmd, args, {
      cwd: taskCwd,
      timeout: task.timeoutMs,
      env: {
        ...process.env,
        NODE_PATH: `${projectRoot}/node_modules`,
      } as Record<string, string>,
    });

    const output = stdout.trim() || stderr.trim();
    const passed = score(output, task.expected);

    // Two-turn session resume test
    if (passed && task.resumePrompt && task.resumeExpectedOutput) {
      const sessionId = extractSessionId(output);
      if (sessionId) {
        const resumeArgs = buildResumeArgs(parts, sessionId, task.resumePrompt);
        if (opts.model) resumeArgs.push("--model", opts.model);
        try {
          const resumeResult = await exec(cmd, resumeArgs, {
            cwd: taskCwd,
            timeout: task.timeoutMs,
            env: {
              ...process.env,
              NODE_PATH: `${projectRoot}/node_modules`,
            } as Record<string, string>,
          });
          const resumeOutput =
            resumeResult.stdout.trim() || resumeResult.stderr.trim();
          const resumePassed = score(resumeOutput, task.resumeExpectedOutput);
          return {
            task,
            output: resumeOutput,
            passed: resumePassed,
            durationMs: Date.now() - start,
          };
        } catch (e: unknown) {
          const error = e instanceof Error ? e.message : String(e);
          return {
            task,
            output: "",
            passed: false,
            durationMs: Date.now() - start,
            error: `resume turn failed: ${error}`,
          };
        }
      }
      // No sessionId found — mark as failed
      return {
        task,
        output,
        passed: false,
        durationMs: Date.now() - start,
        error: "no sessionId in output; cannot run resume turn",
      };
    }

    return { task, output, passed, durationMs: Date.now() - start };
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e);
    return {
      task,
      output: "",
      passed: false,
      durationMs: Date.now() - start,
      error,
    };
  }
}

/**
 * Extract the session ID emitted by the runner in its AI SDK UI stream output.
 * Matches `{"type":"message-metadata","messageMetadata":{"sessionId":"..."}}` and
 * simpler `{"sessionId":"..."}` or `{"messageMetadata":{"sessionId":"..."}}` shapes.
 */
function extractSessionId(output: string): string | undefined {
  for (const line of output.split("\n")) {
    const payload = line.replace(/^data:\s*/, "").trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const json = JSON.parse(payload);
      const sessionId =
        json?.messageMetadata?.sessionId ??
        json?.messageMetadata?.session_id ??
        json?.sessionId;
      if (sessionId && typeof sessionId === "string") return sessionId;
    } catch {
      // not valid JSON, skip
    }
  }
  return undefined;
}

/**
 * Build args for the resume turn.
 *
 * If the runner command uses `--` as a prompt separator (e.g. `bunny-agent run --runner pi --`)
 * the `--resume <id>` flag is inserted before `--`. Otherwise it is placed right before the prompt.
 */
function buildResumeArgs(
  parts: string[],
  sessionId: string,
  resumePrompt: string,
): string[] {
  const baseArgs = parts.slice(1); // without cmd
  const dashDashIdx = baseArgs.indexOf("--");
  if (dashDashIdx !== -1) {
    return [
      ...baseArgs.slice(0, dashDashIdx),
      "--resume",
      sessionId,
      "--",
      resumePrompt,
    ];
  }
  return [...baseArgs, "--resume", sessionId, resumePrompt];
}

function score(output: string, expected: string | RegExp): boolean {
  if (typeof expected === "string")
    return output.toLowerCase().includes(expected.toLowerCase());
  // Normalize hyphens → spaces, and strip thousands-separator commas in numbers
  const normalized = output.replace(/-/g, " ").replace(/(\d),(\d{3})/g, "$1$2");
  return expected.test(output) || expected.test(normalized);
}

function exec(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeout?: number; env?: Record<string, string> },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? (process.env as Record<string, string>),
      stdio: ["pipe", "pipe", "pipe"],
    });
    proc.stdin?.end();

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timer = opts.timeout
      ? setTimeout(() => {
          killed = true;
          proc.kill("SIGTERM");
          setTimeout(() => proc.kill("SIGKILL"), 2000);
        }, opts.timeout)
      : null;

    proc.stdout.on("data", (d) => {
      stdout += d;
    });
    proc.stderr.on("data", (d) => {
      stderr += d;
    });

    proc.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (killed) reject(new Error(`Timeout after ${opts.timeout}ms`));
      else if (code !== 0 && !stdout)
        reject(new Error(`Exit ${code}: ${stderr.slice(0, 200)}`));
      else resolve({ stdout, stderr });
    });

    proc.on("error", reject);
  });
}
