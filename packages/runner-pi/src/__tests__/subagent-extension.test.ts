import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import subagentExtension, {
  getPiInvocation,
  type PiInvocation,
  type SubagentDetails,
} from "../extensions/subagent/index.js";
import { createFakeExtensionApi, type FakeApi } from "./fake-extension-api.js";

/* ------------------------------------------------------------------ */
/* Test harness                                                       */
/* ------------------------------------------------------------------ */

let tmp: string;
let bundledDir: string;
let cwd: string;
let userDir: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "bunny-subagent-ext-"));
  bundledDir = join(tmp, "agents");
  userDir = join(tmp, "user-agents");
  cwd = join(tmp, "work");
  mkdirSync(bundledDir, { recursive: true });
  mkdirSync(userDir, { recursive: true });
  mkdirSync(cwd, { recursive: true });
});

afterEach(() => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function writeAgent(name: string, body = "Be helpful.") {
  writeFileSync(
    join(bundledDir, `${name}.md`),
    `---\nname: ${name}\ndescription: ${name} agent\n---\n${body}`,
  );
}

/**
 * Build a tiny Node script that mimics `pi --mode json -p --no-session`:
 *   - emits the requested JSON events on stdout
 *   - optionally writes to stderr / exits with a non-zero code
 *
 * Returns an `invoke` function suitable for SubagentExtensionOptions.invoke
 * so the extension calls our fake instead of resolving the real pi binary.
 */
interface FakePiOptions {
  events?: object[];
  stderr?: string;
  exitCode?: number;
  /** If set, sleep this many ms before emitting (lets abort tests fire). */
  delayMs?: number;
}

function makeFakePiInvoke(opts: FakePiOptions = {}): (
  args: string[],
) => PiInvocation {
  const events = opts.events ?? [];
  const stderr = opts.stderr ?? "";
  const exitCode = opts.exitCode ?? 0;
  const delayMs = opts.delayMs ?? 0;

  // Inline JS executed by `node -e ...`. We pass the payload as a JSON env
  // var so quoting stays sane.
  const script = `
    const evs = JSON.parse(process.env.FAKE_PI_EVENTS || "[]");
    const stderrText = process.env.FAKE_PI_STDERR || "";
    const code = parseInt(process.env.FAKE_PI_EXIT || "0", 10);
    const delay = parseInt(process.env.FAKE_PI_DELAY || "0", 10);
    function emit() {
      for (const e of evs) process.stdout.write(JSON.stringify(e) + "\\n");
      if (stderrText) process.stderr.write(stderrText);
      process.exit(code);
    }
    if (delay > 0) setTimeout(emit, delay); else emit();
  `;

  return (_args: string[]) => ({
    command: process.execPath,
    args: ["-e", script],
  });
}

function setFakePiEnv(opts: FakePiOptions) {
  const env: Record<string, string> = {};
  env.FAKE_PI_EVENTS = JSON.stringify(opts.events ?? []);
  env.FAKE_PI_STDERR = opts.stderr ?? "";
  env.FAKE_PI_EXIT = String(opts.exitCode ?? 0);
  env.FAKE_PI_DELAY = String(opts.delayMs ?? 0);
  return env;
}

function buildSuccessEvents(text: string): object[] {
  return [
    {
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text }],
        usage: {
          input: 100,
          output: 50,
          cacheRead: 0,
          cacheWrite: 0,
          cost: { total: 0.001 },
          totalTokens: 150,
        },
        model: "fake-model",
        stopReason: "end",
      },
    },
  ];
}

async function executeSubagent(
  fake: FakeApi,
  params: Record<string, unknown>,
  ctxOverrides: Record<string, unknown> = {},
  signal?: AbortSignal,
  onUpdate?: (partial: unknown) => void,
) {
  const tool = fake.tools.get("subagent");
  if (!tool) throw new Error("subagent tool not registered");
  const ctx = { ...fake.ctx(), cwd, ...ctxOverrides };
  return tool.execute(
    "call-id",
    params,
    signal ?? new AbortController().signal,
    onUpdate ?? (() => {}),
    ctx,
  );
}

/* ------------------------------------------------------------------ */
/* getPiInvocation                                                    */
/* ------------------------------------------------------------------ */

describe("getPiInvocation", () => {
  it("resolves to dist/cli.js when pi-coding-agent package is installed", () => {
    const fakePkgRoot = join(tmp, "fake-pi");
    mkdirSync(join(fakePkgRoot, "dist"), { recursive: true });
    writeFileSync(join(fakePkgRoot, "package.json"), "{}");
    writeFileSync(join(fakePkgRoot, "dist", "cli.js"), "// fake");
    writeFileSync(join(fakePkgRoot, "dist", "index.js"), "// fake");

    const result = getPiInvocation(["--help"], (spec) => {
      if (spec === "@earendil-works/pi-coding-agent") {
        return join(fakePkgRoot, "dist", "index.js");
      }
      throw new Error("unexpected resolve: " + spec);
    });
    expect(result.command).toBe(process.execPath);
    expect(result.args).toEqual([join(fakePkgRoot, "dist", "cli.js"), "--help"]);
  });

  it("accepts file:// URLs from import.meta.resolve", () => {
    const fakePkgRoot = join(tmp, "fake-pi-url");
    mkdirSync(join(fakePkgRoot, "dist"), { recursive: true });
    writeFileSync(join(fakePkgRoot, "dist", "cli.js"), "// fake");
    writeFileSync(join(fakePkgRoot, "dist", "index.js"), "// fake");

    const result = getPiInvocation(["x"], (spec) => {
      if (spec === "@earendil-works/pi-coding-agent") {
        // Mimic import.meta.resolve which returns file:// URLs.
        return `file://${join(fakePkgRoot, "dist", "index.js")}`;
      }
      throw new Error("unexpected");
    });
    expect(result.command).toBe(process.execPath);
    expect(result.args[0]).toBe(join(fakePkgRoot, "dist", "cli.js"));
  });

  it("falls back to literal `pi` when resolution fails", () => {
    const result = getPiInvocation(["--help"], () => {
      throw new Error("module not found");
    });
    expect(result.command).toBe("pi");
    expect(result.args).toEqual(["--help"]);
  });

  it("falls back to literal `pi` when resolved cli.js does not exist", () => {
    const fakePkgRoot = join(tmp, "fake-pi-no-cli");
    mkdirSync(join(fakePkgRoot, "dist"), { recursive: true });
    writeFileSync(join(fakePkgRoot, "dist", "index.js"), "// fake");
    // No dist/cli.js created.

    const result = getPiInvocation(["x"], (spec) => {
      if (spec === "@earendil-works/pi-coding-agent") {
        return join(fakePkgRoot, "dist", "index.js");
      }
      throw new Error("unexpected");
    });
    expect(result.command).toBe("pi");
  });
});

/* ------------------------------------------------------------------ */
/* Tool registration + parameter validation                           */
/* ------------------------------------------------------------------ */

describe("subagentExtension", () => {
  it("registers a subagent tool with the expected metadata", () => {
    const fake = createFakeExtensionApi();
    subagentExtension({ bundledAgentsDir: bundledDir })(fake.api);
    const tool = fake.tools.get("subagent");
    expect(tool).toBeDefined();
    expect(tool?.label).toBe("Subagent");
    expect(tool?.description).toMatch(/Delegate tasks/);
  });

  it("rejects invocations with no mode selected", async () => {
    writeAgent("worker");
    const fake = createFakeExtensionApi();
    subagentExtension({ bundledAgentsDir: bundledDir })(fake.api);
    const r = (await executeSubagent(fake, {})) as {
      content: { type: string; text: string }[];
      details: SubagentDetails;
    };
    expect(r.content[0].text).toMatch(/Invalid parameters/);
    expect(r.details.results).toEqual([]);
  });

  it("rejects invocations with multiple modes selected", async () => {
    writeAgent("worker");
    const fake = createFakeExtensionApi();
    subagentExtension({ bundledAgentsDir: bundledDir })(fake.api);
    const r = (await executeSubagent(fake, {
      agent: "worker",
      task: "x",
      tasks: [{ agent: "worker", task: "y" }],
    })) as { content: { type: string; text: string }[] };
    expect(r.content[0].text).toMatch(/Provide exactly one of/);
  });

  it("rejects parallel arrays larger than the cap", async () => {
    writeAgent("worker");
    const fake = createFakeExtensionApi();
    subagentExtension({ bundledAgentsDir: bundledDir })(fake.api);
    const tasks = Array.from({ length: 9 }, (_v, i) => ({
      agent: "worker",
      task: `t${i}`,
    }));
    const r = (await executeSubagent(fake, { tasks })) as {
      content: { type: string; text: string }[];
    };
    expect(r.content[0].text).toMatch(/Too many parallel tasks/);
  });
});

/* ------------------------------------------------------------------ */
/* Single mode                                                        */
/* ------------------------------------------------------------------ */

describe("single mode", () => {
  it("returns the assistant's final text and updates usage stats", async () => {
    writeAgent("worker");
    const fake = createFakeExtensionApi();
    const events = buildSuccessEvents("DONE");

    subagentExtension({
      bundledAgentsDir: bundledDir,
      invoke: makeFakePiInvoke({ events }),
      childEnv: setFakePiEnv({ events }),
    })(fake.api);

    const r = (await executeSubagent(fake, {
      agent: "worker",
      task: "ship it",
    })) as {
      content: { type: string; text: string }[];
      details: SubagentDetails;
    };

    expect(r.content[0].text).toBe("DONE");
    expect(r.details.mode).toBe("single");
    expect(r.details.results).toHaveLength(1);
    const single = r.details.results[0];
    expect(single.agent).toBe("worker");
    expect(single.exitCode).toBe(0);
    expect(single.usage.turns).toBe(1);
    expect(single.usage.input).toBe(100);
    expect(single.usage.output).toBe(50);
    expect(single.usage.contextTokens).toBe(150);
    expect(single.usage.cost).toBeCloseTo(0.001);
    expect(single.model).toBe("fake-model");
  });

  it("returns unknown-agent error without spawning", async () => {
    writeAgent("worker");
    const fake = createFakeExtensionApi();
    const invoke = vi.fn(makeFakePiInvoke({ events: [] }));

    subagentExtension({ bundledAgentsDir: bundledDir, invoke })(fake.api);

    const r = (await executeSubagent(fake, {
      agent: "ghost",
      task: "x",
    })) as {
      content: { type: string; text: string }[];
      details: SubagentDetails;
    };

    expect(r.content[0].text).toMatch(/Agent failed/);
    expect(r.details.results[0].stderr).toMatch(/Unknown agent/);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("non-zero exit becomes a failure result with the stderr message", async () => {
    writeAgent("worker");
    const fake = createFakeExtensionApi();

    subagentExtension({
      bundledAgentsDir: bundledDir,
      invoke: makeFakePiInvoke({ exitCode: 2, stderr: "boom" }),
      childEnv: setFakePiEnv({ exitCode: 2, stderr: "boom" }),
    })(fake.api);

    const r = (await executeSubagent(fake, {
      agent: "worker",
      task: "fail",
    })) as {
      content: { type: string; text: string }[];
      details: SubagentDetails;
    };

    expect(r.content[0].text).toMatch(/Agent failed/);
    expect(r.details.results[0].exitCode).toBe(2);
    expect(r.details.results[0].stderr).toContain("boom");
  });

  it("emits onUpdate callbacks while streaming JSON events", async () => {
    writeAgent("worker");
    const fake = createFakeExtensionApi();
    const events = buildSuccessEvents("partial then final");
    const updates: unknown[] = [];

    subagentExtension({
      bundledAgentsDir: bundledDir,
      invoke: makeFakePiInvoke({ events }),
      childEnv: setFakePiEnv({ events }),
    })(fake.api);

    await executeSubagent(
      fake,
      { agent: "worker", task: "x" },
      {},
      undefined,
      (partial) => updates.push(partial),
    );

    expect(updates.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* Chain mode                                                         */
/* ------------------------------------------------------------------ */

describe("chain mode", () => {
  it("substitutes {previous} into the next task and returns last output", async () => {
    writeAgent("scout");
    writeAgent("planner");
    const fake = createFakeExtensionApi();

    // Stage two distinct outputs by switching env between calls.
    let call = 0;
    const events1 = buildSuccessEvents("scout-output");
    const events2 = buildSuccessEvents("planner-output using scout-output");

    const invoke = (_args: string[]): PiInvocation => {
      call++;
      const events = call === 1 ? events1 : events2;
      const script = `
        const e = ${JSON.stringify(events)};
        for (const ev of e) process.stdout.write(JSON.stringify(ev) + "\\n");
        process.exit(0);
      `;
      return { command: process.execPath, args: ["-e", script] };
    };

    subagentExtension({ bundledAgentsDir: bundledDir, invoke })(fake.api);

    const r = (await executeSubagent(fake, {
      chain: [
        { agent: "scout", task: "find" },
        { agent: "planner", task: "use {previous}" },
      ],
    })) as {
      content: { type: string; text: string }[];
      details: SubagentDetails;
    };

    expect(r.content[0].text).toBe("planner-output using scout-output");
    expect(r.details.results).toHaveLength(2);
    expect(r.details.results[1].task).toBe("use scout-output");
  });

  it("stops at the first failing step", async () => {
    writeAgent("scout");
    writeAgent("planner");
    const fake = createFakeExtensionApi();

    let call = 0;
    const invoke = (_args: string[]): PiInvocation => {
      call++;
      const events = call === 1 ? buildSuccessEvents("ok") : [];
      const exit = call === 1 ? 0 : 3;
      const script = `
        const e = ${JSON.stringify(events)};
        for (const ev of e) process.stdout.write(JSON.stringify(ev) + "\\n");
        process.stderr.write(${call === 1 ? "''" : "'planner died'"});
        process.exit(${exit});
      `;
      return { command: process.execPath, args: ["-e", script] };
    };

    subagentExtension({ bundledAgentsDir: bundledDir, invoke })(fake.api);

    const r = (await executeSubagent(fake, {
      chain: [
        { agent: "scout", task: "find" },
        { agent: "planner", task: "die" },
      ],
    })) as {
      content: { type: string; text: string }[];
      details: SubagentDetails;
    };

    expect(r.content[0].text).toMatch(/Chain stopped at step 2/);
    expect(r.details.results).toHaveLength(2);
    expect(r.details.results[1].exitCode).toBe(3);
  });
});

/* ------------------------------------------------------------------ */
/* Parallel mode                                                      */
/* ------------------------------------------------------------------ */

describe("parallel mode", () => {
  it("runs multiple tasks and aggregates summaries", async () => {
    writeAgent("worker");
    const fake = createFakeExtensionApi();

    const invoke = (_args: string[]): PiInvocation => {
      const events = buildSuccessEvents("done");
      const script = `
        const e = ${JSON.stringify(events)};
        for (const ev of e) process.stdout.write(JSON.stringify(ev) + "\\n");
        process.exit(0);
      `;
      return { command: process.execPath, args: ["-e", script] };
    };

    subagentExtension({ bundledAgentsDir: bundledDir, invoke })(fake.api);

    const r = (await executeSubagent(fake, {
      tasks: [
        { agent: "worker", task: "a" },
        { agent: "worker", task: "b" },
        { agent: "worker", task: "c" },
      ],
    })) as {
      content: { type: string; text: string }[];
      details: SubagentDetails;
    };

    expect(r.content[0].text).toMatch(/Parallel: 3\/3 succeeded/);
    expect(r.details.results).toHaveLength(3);
    for (const single of r.details.results) {
      expect(single.exitCode).toBe(0);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Abort propagation                                                  */
/* ------------------------------------------------------------------ */

describe("abort", () => {
  it("kills the subprocess when the abort signal fires", async () => {
    writeAgent("worker");
    const fake = createFakeExtensionApi();

    // Long-running fake that would otherwise wait 30s before exiting.
    const invoke = (_args: string[]): PiInvocation => {
      const script = `setTimeout(() => process.exit(0), 30_000);`;
      return { command: process.execPath, args: ["-e", script] };
    };

    subagentExtension({ bundledAgentsDir: bundledDir, invoke })(fake.api);

    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 50);

    const start = Date.now();
    const r = (await executeSubagent(
      fake,
      { agent: "worker", task: "long" },
      {},
      ctrl.signal,
    )) as { details: SubagentDetails };
    const elapsed = Date.now() - start;

    // Should resolve within ~1s (kill is SIGTERM); the 30s sleep is gone.
    expect(elapsed).toBeLessThan(5000);
    expect(r.details.results[0].stopReason).toBe("aborted");
  });
});

/* ------------------------------------------------------------------ */
/* Subscription                                                       */
/* ------------------------------------------------------------------ */

describe("extension wiring", () => {
  it("does not subscribe to lifecycle events (subagent is a tool-only extension)", () => {
    const fake = createFakeExtensionApi();
    subagentExtension({ bundledAgentsDir: bundledDir })(fake.api);
    expect(fake.handlers.size).toBe(0);
    expect(fake.commands.size).toBe(0);
  });
});
