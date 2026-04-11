import { spawn } from "node:child_process";
import type { Task, TaskResult } from "./types.js";
import { runTBLiteTask } from "./datasets/tblite.js";

/**
 * Run a single task.
 * - TBLite tasks (id starts with "tblite-") use the Docker-based runner.
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
    return { task, output: result.output, passed: result.passed, durationMs: Date.now() - start, error: result.error };
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
    return { task, output, passed, durationMs: Date.now() - start };
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e);
    return { task, output: "", passed: false, durationMs: Date.now() - start, error };
  }
}

function score(output: string, expected: string | RegExp): boolean {
  if (typeof expected === "string")
    return output.toLowerCase().includes(expected.toLowerCase());
  return expected.test(output);
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

    proc.stdout.on("data", (d) => { stdout += d; });
    proc.stderr.on("data", (d) => { stderr += d; });

    proc.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (killed) reject(new Error(`Timeout after ${opts.timeout}ms`));
      else if (code !== 0 && !stdout) reject(new Error(`Exit ${code}: ${stderr.slice(0, 200)}`));
      else resolve({ stdout, stderr });
    });

    proc.on("error", reject);
  });
}
