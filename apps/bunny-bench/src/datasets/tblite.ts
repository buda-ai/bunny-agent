import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";
import type { Task } from "../types.js";

interface TBLiteRow {
  task_name: string;
  instruction: string;
  docker_image: string;
  category: string;
  difficulty: string;
  tags: string;
  agent_timeout_sec: number | string;
  test_sh: string;
  environment_tar: string;
  tests_tar: string;
}

function loadTBLiteData(): TBLiteRow[] {
  const candidates = [
    join(process.cwd(), "data", "tblite.json"),
    join(new URL("../data/tblite.json", import.meta.url).pathname),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8")) as TBLiteRow[];
  }
  throw new Error(
    "TBLite data not found. Run: python scripts/download-datasets.py --datasets tblite\n" +
      `Searched: ${candidates.join(", ")}`,
  );
}

const DIFFICULTY_TIMEOUT: Record<string, number> = {
  easy: 300_000,
  medium: 600_000,
  hard: 900_000,
  "very-hard": 1200_000,
  expert: 1200_000,
};

export function loadTBLiteTasks(opts: { difficulties?: string[]; limit?: number } = {}): Task[] {
  const rows = loadTBLiteData();
  let filtered = rows;
  if (opts.difficulties) {
    const d = opts.difficulties.map((s) => s.toLowerCase());
    filtered = rows.filter((r) => d.includes(r.difficulty.toLowerCase()));
  }
  if (opts.limit) filtered = filtered.slice(0, opts.limit);

  return filtered.map((r): Task => ({
    id: `tblite-${r.task_name}`,
    name: r.task_name,
    // Prompt wraps original instruction with Docker exec context.
    // The bunny-bench runner starts the container before invoking the agent;
    // the container name is injected here.
    prompt: r.instruction,
    // Pass/fail is determined by test_sh, not by string matching.
    // We use a sentinel that the Docker runner replaces with the actual result.
    expected: /TBLITE_PASS/,
    category: "tool:code",
    timeoutMs: DIFFICULTY_TIMEOUT[r.difficulty.toLowerCase()] ?? 600_000,
  }));
}

export const TBLITE_EASY: Task[] = loadTBLiteTasks({ difficulties: ["easy"] });
export const TBLITE_MEDIUM: Task[] = loadTBLiteTasks({ difficulties: ["medium"] });
export const TBLITE_ALL: Task[] = loadTBLiteTasks();

// ---------------------------------------------------------------------------
// Docker runner helpers — used by the TBLite-aware runTask override
// ---------------------------------------------------------------------------

export interface TBLiteRunnerOpts {
  taskName: string;
  agentCmd: string;
  model?: string;
  taskCwd?: string;
  timeoutMs?: number;
}

export interface TBLiteResult {
  passed: boolean;
  output: string;
  error?: string;
}

/**
 * Run a TBLite task using Docker:
 * 1. Pull and start the task's Docker container
 * 2. Extract environment_tar into the container workdir
 * 3. Run the agent with a prompt that tells it to use `docker exec <name>` for bash
 * 4. Upload tests_tar and run test_sh inside the container
 * 5. Read /logs/verifier/reward.txt to determine pass/fail
 */
export async function runTBLiteTask(opts: TBLiteRunnerOpts): Promise<TBLiteResult> {
  const rows = loadTBLiteData();
  const row = rows.find((r) => r.task_name === opts.taskName);
  if (!row) return { passed: false, output: "", error: `Task not found: ${opts.taskName}` };

  const containerName = `bunny-tblite-${row.task_name}-${Date.now()}`;
  const workdir = opts.taskCwd ?? `/tmp/bunny-tblite/${row.task_name}`;
  mkdirSync(workdir, { recursive: true });

  try {
    // 1. Start container detached
    const startResult = spawnSync(
      "docker",
      ["run", "-d", "--name", containerName, "--rm", row.docker_image, "sleep", "3600"],
      { encoding: "utf8" },
    );
    if (startResult.status !== 0) {
      return { passed: false, output: "", error: `docker run failed: ${startResult.stderr}` };
    }

    // 2. Extract environment_tar into container (if present)
    if (row.environment_tar) {
      const tarPath = join(workdir, "env.tar.gz");
      writeFileSync(tarPath, Buffer.from(row.environment_tar, "base64"));
      spawnSync("docker", ["cp", tarPath, `${containerName}:/tmp/env.tar.gz`], { encoding: "utf8" });
      spawnSync(
        "docker",
        ["exec", containerName, "bash", "-c", "cd /tmp && tar xzf env.tar.gz 2>/dev/null; true"],
        { encoding: "utf8" },
      );
    }

    // 3. Build agent prompt — wrap original instruction with docker exec context
    const agentPrompt =
      `You are operating inside a Docker container named "${containerName}".\n` +
      `To run commands, use: docker exec ${containerName} bash -c 'YOUR_COMMAND'\n` +
      `To write files into the container: docker exec ${containerName} bash -c 'cat > /path/file << EOF\\n...\\nEOF'\n` +
      `\n--- TASK ---\n${row.instruction}`;

    // 4. Run the agent
    const parts = opts.agentCmd.split(" ");
    const agentArgs = [...parts.slice(1), agentPrompt];
    if (opts.model) agentArgs.push("--model", opts.model);

    const agentResult = spawnSync(parts[0], agentArgs, {
      encoding: "utf8",
      timeout: opts.timeoutMs ?? 300_000,
      cwd: workdir,
      env: { ...process.env } as Record<string, string>,
    });
    const agentOutput = agentResult.stdout + agentResult.stderr;

    // 5. Upload tests_tar
    if (row.tests_tar) {
      const testsTarPath = join(workdir, "tests.tar.gz");
      writeFileSync(testsTarPath, Buffer.from(row.tests_tar, "base64"));
      spawnSync("docker", ["exec", containerName, "mkdir", "-p", "/tests", "/logs/verifier"], {
        encoding: "utf8",
      });
      spawnSync("docker", ["cp", testsTarPath, `${containerName}:/tmp/tests.tar.gz`], {
        encoding: "utf8",
      });
      spawnSync(
        "docker",
        ["exec", containerName, "bash", "-c", "cd /tests && tar xzf /tmp/tests.tar.gz 2>/dev/null; true"],
        { encoding: "utf8" },
      );
    }

    // 6. Write and run test_sh
    const testShPath = join(workdir, "test.sh");
    writeFileSync(testShPath, row.test_sh);
    spawnSync("docker", ["cp", testShPath, `${containerName}:/tmp/test.sh`], { encoding: "utf8" });
    spawnSync("docker", ["exec", containerName, "mkdir", "-p", "/logs/verifier"], { encoding: "utf8" });
    const testResult = spawnSync(
      "docker",
      ["exec", containerName, "bash", "/tmp/test.sh"],
      { encoding: "utf8", timeout: 120_000 },
    );

    // 7. Read reward
    const rewardResult = spawnSync(
      "docker",
      ["exec", containerName, "cat", "/logs/verifier/reward.txt"],
      { encoding: "utf8" },
    );
    const reward = rewardResult.stdout.trim();
    const passed = reward === "1";

    return { passed, output: agentOutput + `\n[test exit ${testResult.status}] reward=${reward}` };
  } finally {
    // Always clean up the container
    spawnSync("docker", ["rm", "-f", containerName], { encoding: "utf8" });
  }
}
