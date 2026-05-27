/**
 * Subagent extension for runner-pi (headless port of pi-mono v0.74's
 * examples/extensions/subagent/index.ts).
 *
 * Exposes a `subagent` tool the LLM can call with one of three shapes:
 *   - single   { agent, task }
 *   - parallel { tasks: [{agent, task}, ...] }
 *   - chain    { chain: [{agent, task}, ...] }   (with {previous} placeholder)
 *
 * Each invocation spawns `pi --mode json -p --no-session` as a child
 * process, parses its JSON-line stream, and surfaces structured progress
 * via `onUpdate` so the host can render live status.
 *
 * Differences vs upstream:
 *   - Bundled default agents (scout/planner/reviewer/worker) ship inside
 *     the package; they appear automatically alongside user agents from
 *     ~/.bunny/agent/agents.
 *   - No TUI renderCall/renderResult — Bunny renders the streaming
 *     details payload itself.
 *   - ctx.ui.confirm path removed (headless). Project-local agents
 *     require an explicit agentScope override and skip bundled defaults
 *     so untrusted repos can't shadow them.
 *   - getPiInvocation resolves `pi` from this package's installed
 *     @earendil-works/pi-coding-agent dependency instead of relying on
 *     the launching process's argv.
 *   - Child process inherits options.env (API keys, base URLs) merged
 *     with process.env so spawn works in daemons that pass keys via
 *     PiRunnerOptions.env without setting them on the parent process.
 */

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
  type AgentConfig,
  type AgentScope,
  discoverAgents,
  ensureUserAgentsDir,
} from "./agents-loader.js";

const MAX_PARALLEL_TASKS = 8;
const MAX_CONCURRENCY = 4;
const PER_TASK_OUTPUT_CAP = 50 * 1024;

/* -------------------------------------------------------------------------- */
/* Result types                                                               */
/* -------------------------------------------------------------------------- */

interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  turns: number;
}

export interface SingleResult {
  agent: string;
  agentSource: "bundled" | "user" | "project" | "unknown";
  task: string;
  exitCode: number;
  messages: Message[];
  stderr: string;
  usage: UsageStats;
  model?: string;
  stopReason?: string;
  errorMessage?: string;
  step?: number;
}

export interface SubagentDetails {
  mode: "single" | "parallel" | "chain";
  agentScope: AgentScope;
  projectAgentsDir: string | null;
  results: SingleResult[];
}

type OnUpdateCallback = (
  partial: AgentToolResult<SubagentDetails>,
) => void;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getFinalOutput(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant") {
      for (const part of msg.content) {
        if (part.type === "text") return part.text;
      }
    }
  }
  return "";
}

function isFailedResult(r: SingleResult): boolean {
  return (
    r.exitCode !== 0 ||
    r.stopReason === "error" ||
    r.stopReason === "aborted"
  );
}

function getResultOutput(r: SingleResult): string {
  if (isFailedResult(r)) {
    return (
      r.errorMessage ||
      r.stderr ||
      getFinalOutput(r.messages) ||
      "(no output)"
    );
  }
  return getFinalOutput(r.messages) || "(no output)";
}

function truncateParallelOutput(output: string): string {
  const byteLength = Buffer.byteLength(output, "utf8");
  if (byteLength <= PER_TASK_OUTPUT_CAP) return output;
  let truncated = output.slice(0, PER_TASK_OUTPUT_CAP);
  while (Buffer.byteLength(truncated, "utf8") > PER_TASK_OUTPUT_CAP) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}\n\n[Output truncated: ${byteLength - Buffer.byteLength(truncated, "utf8")} bytes omitted. Full output preserved in tool details.]`;
}

async function mapWithConcurrencyLimit<TIn, TOut>(
  items: TIn[],
  concurrency: number,
  fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: TOut[] = new Array(items.length);
  let nextIndex = 0;
  const workers = new Array(limit).fill(null).map(async () => {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) return;
      results[current] = await fn(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

async function writePromptToTempFile(
  agentName: string,
  prompt: string,
): Promise<{ dir: string; filePath: string }> {
  const dir = await mkdtemp(join(tmpdir(), "bunny-subagent-"));
  const safeName = agentName.replace(/[^\w.-]+/g, "_");
  const filePath = join(dir, `prompt-${safeName}.md`);
  await writeFile(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
  return { dir, filePath };
}

/**
 * Resolve the `pi` CLI shipped with our @earendil-works/pi-coding-agent
 * dependency. Falls back to a literal "pi" PATH lookup if resolution
 * fails (e.g. when running from a bundle that strips node_modules).
 */
export interface PiInvocation {
  command: string;
  args: string[];
}

/**
 * Default resolver. Uses `import.meta.resolve` (sync since Node 20.6) which
 * cooperates with package "exports" maps that block `./package.json` reads,
 * unlike the createRequire-based path. Returns either a `file://` URL or a
 * plain absolute path; both are normalized in {@link getPiInvocation}.
 */
function defaultResolver(specifier: string): string {
  // import.meta.resolve is typed as Promise<string> in older lib.dom but is
  // synchronous in Node 20.6+. Cast through unknown to silence that.
  const resolved = (import.meta.resolve as unknown as (s: string) => string)(
    specifier,
  );
  return resolved;
}

function urlOrPathToFilePath(value: string): string {
  if (value.startsWith("file://")) return fileURLToPath(value);
  return value;
}

export function getPiInvocation(
  args: string[],
  resolver: (specifier: string) => string = defaultResolver,
): PiInvocation {
  // pi-coding-agent's package.json blocks ./package.json subpath imports via
  // the exports map, so resolving the main entry and walking up two levels
  // (dist/index.js → dist → package root) is the only universal strategy.
  try {
    const raw = resolver("@earendil-works/pi-coding-agent");
    const mainEntry = urlOrPathToFilePath(raw);
    const pkgRoot = dirname(dirname(mainEntry));
    const cliJs = join(pkgRoot, "dist", "cli.js");
    if (existsSync(cliJs)) {
      return { command: process.execPath, args: [cliJs, ...args] };
    }
  } catch {
    // fall through
  }
  return { command: "pi", args };
}

/* -------------------------------------------------------------------------- */
/* Single-agent execution                                                     */
/* -------------------------------------------------------------------------- */

interface RunSingleAgentDeps {
  /** Override pi resolution for testing. */
  invoke?: (args: string[]) => PiInvocation;
  /** Additional env variables merged into the child process env. */
  childEnv?: Record<string, string>;
  /** Override the bunny agent dir passed to the child via env. */
  bunnyAgentDir?: string;
}

async function runSingleAgent(
  defaultCwd: string,
  agents: AgentConfig[],
  agentName: string,
  task: string,
  cwd: string | undefined,
  step: number | undefined,
  signal: AbortSignal | undefined,
  onUpdate: OnUpdateCallback | undefined,
  makeDetails: (results: SingleResult[]) => SubagentDetails,
  deps: RunSingleAgentDeps,
): Promise<SingleResult> {
  const agent = agents.find((a) => a.name === agentName);

  if (!agent) {
    const available = agents.map((a) => `"${a.name}"`).join(", ") || "none";
    return {
      agent: agentName,
      agentSource: "unknown",
      task,
      exitCode: 1,
      messages: [],
      stderr: `Unknown agent: "${agentName}". Available agents: ${available}.`,
      usage: emptyUsage(),
      step,
    };
  }

  const args: string[] = ["--mode", "json", "-p", "--no-session"];
  if (agent.model) args.push("--model", agent.model);
  if (agent.tools && agent.tools.length > 0) {
    args.push("--tools", agent.tools.join(","));
  }

  let tmpPromptDir: string | null = null;
  let tmpPromptPath: string | null = null;

  const currentResult: SingleResult = {
    agent: agentName,
    agentSource: agent.source,
    task,
    exitCode: 0,
    messages: [],
    stderr: "",
    usage: emptyUsage(),
    model: agent.model,
    step,
  };

  const emitUpdate = () => {
    if (onUpdate) {
      onUpdate({
        content: [
          {
            type: "text",
            text: getFinalOutput(currentResult.messages) || "(running...)",
          },
        ],
        details: makeDetails([currentResult]),
      });
    }
  };

  try {
    if (agent.systemPrompt.trim()) {
      const tmp = await writePromptToTempFile(agent.name, agent.systemPrompt);
      tmpPromptDir = tmp.dir;
      tmpPromptPath = tmp.filePath;
      args.push("--append-system-prompt", tmpPromptPath);
    }

    args.push(`Task: ${task}`);
    let wasAborted = false;

    const exitCode = await new Promise<number>((resolve) => {
      const invocation = (deps.invoke ?? getPiInvocation)(args);
      const childEnv: NodeJS.ProcessEnv = {
        ...process.env,
        ...(deps.childEnv ?? {}),
      };
      // Point the child at our agent dir so it sees the same agents/skills
      // tree as the host runner-pi (~/.bunny/agent by default).
      if (deps.bunnyAgentDir) {
        childEnv.PI_AGENT_DIR = deps.bunnyAgentDir;
      }
      const proc = spawn(invocation.command, invocation.args, {
        cwd: cwd ?? defaultCwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: childEnv,
      });
      let buffer = "";

      const processLine = (line: string) => {
        if (!line.trim()) return;
        let event: any;
        try {
          event = JSON.parse(line);
        } catch {
          return;
        }
        if (event.type === "message_end" && event.message) {
          const msg = event.message as Message;
          currentResult.messages.push(msg);
          if (msg.role === "assistant") {
            currentResult.usage.turns++;
            const usage = (msg as any).usage;
            if (usage) {
              currentResult.usage.input += usage.input || 0;
              currentResult.usage.output += usage.output || 0;
              currentResult.usage.cacheRead += usage.cacheRead || 0;
              currentResult.usage.cacheWrite += usage.cacheWrite || 0;
              currentResult.usage.cost += usage.cost?.total || 0;
              currentResult.usage.contextTokens = usage.totalTokens || 0;
            }
            if (!currentResult.model && (msg as any).model) {
              currentResult.model = (msg as any).model;
            }
            if ((msg as any).stopReason) {
              currentResult.stopReason = (msg as any).stopReason;
            }
            if ((msg as any).errorMessage) {
              currentResult.errorMessage = (msg as any).errorMessage;
            }
          }
          emitUpdate();
        }
        if (event.type === "tool_result_end" && event.message) {
          currentResult.messages.push(event.message as Message);
          emitUpdate();
        }
      };

      proc.stdout?.on("data", (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) processLine(line);
      });
      proc.stderr?.on("data", (data: Buffer) => {
        currentResult.stderr += data.toString();
      });
      // ChildProcessByStdio extends ChildProcess (EventEmitter) but the
      // narrowed return-type from spawn loses EventEmitter members under our
      // tsconfig; cast to access lifecycle events.
      const procEvents = proc as unknown as NodeJS.EventEmitter;
      procEvents.on("close", (code: number | null) => {
        if (buffer.trim()) processLine(buffer);
        resolve(code ?? 0);
      });
      procEvents.on("error", (err: Error) => {
        currentResult.stderr += `\n[spawn error] ${err.message}`;
        resolve(1);
      });

      if (signal) {
        const killProc = () => {
          wasAborted = true;
          try {
            proc.kill("SIGTERM");
          } catch {
            /* ignore */
          }
          setTimeout(() => {
            if (!proc.killed) {
              try {
                proc.kill("SIGKILL");
              } catch {
                /* ignore */
              }
            }
          }, 5000);
        };
        if (signal.aborted) killProc();
        else signal.addEventListener("abort", killProc, { once: true });
      }
    });

    currentResult.exitCode = exitCode;
    if (wasAborted) {
      currentResult.stopReason = currentResult.stopReason ?? "aborted";
    }
    return currentResult;
  } finally {
    if (tmpPromptPath) {
      try {
        await rm(tmpPromptPath, { force: true });
      } catch {
        /* ignore */
      }
    }
    if (tmpPromptDir) {
      try {
        await rm(tmpPromptDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

function emptyUsage(): UsageStats {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    contextTokens: 0,
    turns: 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Schema                                                                     */
/* -------------------------------------------------------------------------- */

const TaskItem = Type.Object({
  agent: Type.String({ description: "Name of the agent to invoke" }),
  task: Type.String({ description: "Task to delegate to the agent" }),
  cwd: Type.Optional(
    Type.String({ description: "Working directory for the agent process" }),
  ),
});

const ChainItem = Type.Object({
  agent: Type.String({ description: "Name of the agent to invoke" }),
  task: Type.String({
    description:
      "Task with optional {previous} placeholder for the prior step's output",
  }),
  cwd: Type.Optional(
    Type.String({ description: "Working directory for the agent process" }),
  ),
});

const AgentScopeSchema = Type.Union(
  [
    Type.Literal("user"),
    Type.Literal("project"),
    Type.Literal("both"),
  ],
  {
    description:
      'Which agent directories to use. Default: "user" (bundled defaults + ~/.bunny/agent/agents). Use "both" to also include project-local agents from .bunny/agents or .pi/agents.',
    default: "user",
  },
);

const SubagentParams = Type.Object({
  agent: Type.Optional(
    Type.String({ description: "Name of the agent to invoke (single mode)" }),
  ),
  task: Type.Optional(
    Type.String({ description: "Task to delegate (single mode)" }),
  ),
  tasks: Type.Optional(
    Type.Array(TaskItem, {
      description:
        "Array of {agent, task} pairs for parallel execution (max 8)",
    }),
  ),
  chain: Type.Optional(
    Type.Array(ChainItem, {
      description:
        "Array of {agent, task} steps run sequentially. Use {previous} to reference prior step output.",
    }),
  ),
  agentScope: Type.Optional(AgentScopeSchema),
  cwd: Type.Optional(
    Type.String({
      description: "Working directory override for single-mode invocation",
    }),
  ),
});

/* -------------------------------------------------------------------------- */
/* Extension factory                                                          */
/* -------------------------------------------------------------------------- */

export interface SubagentExtensionOptions {
  /** Override pi resolution (tests). */
  invoke?: (args: string[]) => PiInvocation;
  /** Extra env passed to every spawned child (e.g. ANTHROPIC_API_KEY). */
  childEnv?: Record<string, string>;
  /** Bunny agent dir surfaced to the child via PI_AGENT_DIR. Defaults to ~/.bunny/agent. */
  bunnyAgentDir?: string;
  /** Override bundled-agent location (tests). */
  bundledAgentsDir?: string;
}

export default function subagentExtension(
  options: SubagentExtensionOptions = {},
): (pi: ExtensionAPI) => void {
  return (pi: ExtensionAPI) => {
    // Make sure ~/.bunny/agent/agents exists so users have a place to drop
    // their own *.md alongside the bundled defaults.
    ensureUserAgentsDir();

    const bunnyAgentDir =
      options.bunnyAgentDir ?? join(homedir(), ".bunny", "agent");

    pi.registerTool({
      name: "subagent",
      label: "Subagent",
      description: [
        "Delegate tasks to specialized subagents with isolated context windows.",
        "Modes: single ({agent, task}), parallel ({tasks: [{agent, task}, ...]}), chain ({chain: [{agent, task}, ...]} with {previous} placeholder).",
        "Default agent scope is 'user' (bundled defaults + ~/.bunny/agent/agents). Pass agentScope='both' to also include project-local agents from .bunny/agents or .pi/agents — only do this for trusted repositories.",
      ].join(" "),
      parameters: SubagentParams,

      async execute(_toolCallId, params, signal, onUpdate, ctx) {
        const agentScope: AgentScope = params.agentScope ?? "user";
        const discovery = discoverAgents({
          cwd: ctx.cwd,
          scope: agentScope,
          bundledDir: options.bundledAgentsDir,
        });
        const agents = discovery.agents;

        const hasChain = (params.chain?.length ?? 0) > 0;
        const hasTasks = (params.tasks?.length ?? 0) > 0;
        const hasSingle = Boolean(params.agent && params.task);
        const modeCount =
          Number(hasChain) + Number(hasTasks) + Number(hasSingle);

        const makeDetails =
          (mode: "single" | "parallel" | "chain") =>
          (results: SingleResult[]): SubagentDetails => ({
            mode,
            agentScope,
            projectAgentsDir: discovery.projectAgentsDir,
            results,
          });

        if (modeCount !== 1) {
          const available =
            agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
          return {
            content: [
              {
                type: "text",
                text: `Invalid parameters. Provide exactly one of {agent+task}, tasks, chain.\nAvailable agents: ${available}`,
              },
            ],
            details: makeDetails("single")([]),
          };
        }

        const deps: RunSingleAgentDeps = {
          invoke: options.invoke,
          childEnv: options.childEnv,
          bunnyAgentDir,
        };

        if (params.chain && params.chain.length > 0) {
          return executeChain(
            ctx.cwd,
            agents,
            params.chain,
            signal,
            onUpdate,
            makeDetails,
            deps,
          );
        }
        if (params.tasks && params.tasks.length > 0) {
          return executeParallel(
            ctx.cwd,
            agents,
            params.tasks,
            signal,
            onUpdate,
            makeDetails,
            deps,
          );
        }
        if (params.agent && params.task) {
          return executeSingle(
            ctx.cwd,
            agents,
            params.agent,
            params.task,
            params.cwd,
            signal,
            onUpdate,
            makeDetails,
            deps,
          );
        }

        const available =
          agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
        return {
          content: [
            {
              type: "text",
              text: `Invalid parameters. Available agents: ${available}`,
            },
          ],
          details: makeDetails("single")([]),
        };
      },
    });
  };
}

/* -------------------------------------------------------------------------- */
/* Mode handlers (extracted for clarity + testability)                        */
/* -------------------------------------------------------------------------- */

async function executeSingle(
  cwd: string,
  agents: AgentConfig[],
  agentName: string,
  task: string,
  taskCwd: string | undefined,
  signal: AbortSignal | undefined,
  onUpdate: OnUpdateCallback | undefined,
  makeDetails: (
    mode: "single" | "parallel" | "chain",
  ) => (results: SingleResult[]) => SubagentDetails,
  deps: RunSingleAgentDeps,
): Promise<AgentToolResult<SubagentDetails>> {
  const result = await runSingleAgent(
    cwd,
    agents,
    agentName,
    task,
    taskCwd,
    undefined,
    signal,
    onUpdate,
    makeDetails("single"),
    deps,
  );
  if (isFailedResult(result)) {
    return {
      content: [
        {
          type: "text",
          text: `Agent ${result.stopReason || "failed"}: ${getResultOutput(result)}`,
        },
      ],
      details: makeDetails("single")([result]),
    };
  }
  return {
    content: [
      {
        type: "text",
        text: getFinalOutput(result.messages) || "(no output)",
      },
    ],
    details: makeDetails("single")([result]),
  };
}

async function executeChain(
  cwd: string,
  agents: AgentConfig[],
  chain: Array<{ agent: string; task: string; cwd?: string }>,
  signal: AbortSignal | undefined,
  onUpdate: OnUpdateCallback | undefined,
  makeDetails: (
    mode: "single" | "parallel" | "chain",
  ) => (results: SingleResult[]) => SubagentDetails,
  deps: RunSingleAgentDeps,
): Promise<AgentToolResult<SubagentDetails>> {
  const results: SingleResult[] = [];
  let previousOutput = "";

  for (let i = 0; i < chain.length; i++) {
    const step = chain[i];
    const taskWithContext = step.task.replace(/\{previous\}/g, previousOutput);

    const chainUpdate: OnUpdateCallback | undefined = onUpdate
      ? (partial) => {
          const cur = partial.details?.results[0];
          if (cur) {
            onUpdate({
              content: partial.content,
              details: makeDetails("chain")([...results, cur]),
            });
          }
        }
      : undefined;

    const result = await runSingleAgent(
      cwd,
      agents,
      step.agent,
      taskWithContext,
      step.cwd,
      i + 1,
      signal,
      chainUpdate,
      makeDetails("chain"),
      deps,
    );
    results.push(result);

    if (isFailedResult(result)) {
      return {
        content: [
          {
            type: "text",
            text: `Chain stopped at step ${i + 1} (${step.agent}): ${getResultOutput(result)}`,
          },
        ],
        details: makeDetails("chain")(results),
      };
    }
    previousOutput = getFinalOutput(result.messages);
  }
  return {
    content: [
      {
        type: "text",
        text:
          getFinalOutput(results[results.length - 1].messages) ||
          "(no output)",
      },
    ],
    details: makeDetails("chain")(results),
  };
}

async function executeParallel(
  cwd: string,
  agents: AgentConfig[],
  tasks: Array<{ agent: string; task: string; cwd?: string }>,
  signal: AbortSignal | undefined,
  onUpdate: OnUpdateCallback | undefined,
  makeDetails: (
    mode: "single" | "parallel" | "chain",
  ) => (results: SingleResult[]) => SubagentDetails,
  deps: RunSingleAgentDeps,
): Promise<AgentToolResult<SubagentDetails>> {
  if (tasks.length > MAX_PARALLEL_TASKS) {
    return {
      content: [
        {
          type: "text",
          text: `Too many parallel tasks (${tasks.length}). Max is ${MAX_PARALLEL_TASKS}.`,
        },
      ],
      details: makeDetails("parallel")([]),
    };
  }

  const allResults: SingleResult[] = tasks.map((t) => ({
    agent: t.agent,
    agentSource: "unknown",
    task: t.task,
    // -1 sentinel = still running, used by the host UI for spinner state.
    exitCode: -1,
    messages: [],
    stderr: "",
    usage: emptyUsage(),
  }));

  const emitParallel = () => {
    if (!onUpdate) return;
    const running = allResults.filter((r) => r.exitCode === -1).length;
    const done = allResults.length - running;
    onUpdate({
      content: [
        {
          type: "text",
          text: `Parallel: ${done}/${allResults.length} done, ${running} running...`,
        },
      ],
      details: makeDetails("parallel")([...allResults]),
    });
  };

  const results = await mapWithConcurrencyLimit(
    tasks,
    MAX_CONCURRENCY,
    async (t, index) => {
      const result = await runSingleAgent(
        cwd,
        agents,
        t.agent,
        t.task,
        t.cwd,
        undefined,
        signal,
        (partial) => {
          if (partial.details?.results[0]) {
            allResults[index] = partial.details.results[0];
            emitParallel();
          }
        },
        makeDetails("parallel"),
        deps,
      );
      allResults[index] = result;
      emitParallel();
      return result;
    },
  );

  const successCount = results.filter((r) => !isFailedResult(r)).length;
  const summaries = results.map((r) => {
    const output = truncateParallelOutput(getResultOutput(r));
    const status = isFailedResult(r)
      ? `failed${r.stopReason && r.stopReason !== "end" ? ` (${r.stopReason})` : ""}`
      : "completed";
    return `### [${r.agent}] ${status}\n\n${output}`;
  });
  return {
    content: [
      {
        type: "text",
        text: `Parallel: ${successCount}/${results.length} succeeded\n\n${summaries.join("\n\n---\n\n")}`,
      },
    ],
    details: makeDetails("parallel")(results),
  };
}
