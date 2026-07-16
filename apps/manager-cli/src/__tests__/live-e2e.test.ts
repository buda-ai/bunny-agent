import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { BunnyAgent } from "@bunny-agent/manager";
import { LocalMachine } from "@bunny-agent/sandbox-local";
import { SrtSandbox } from "@bunny-agent/sandbox-srt";
import { describe, expect, it } from "vitest";

/**
 * Live end-to-end tests: a REAL BunnyAgent.stream() turn — sandbox attach,
 * runner-cli spawn, an actual HTTP round trip to an LLM endpoint — using the
 * deterministic mock-ai-server (OpenAI protocol, always replies with fixed
 * prose mentioning "mock-ai-server"), so no real key and no token cost.
 *
 * Opt-in via BUNNY_INTEGRATION=1 (set by .github/workflows/integration.yml);
 * skipped otherwise so `pnpm -r test` stays offline-friendly on dev machines.
 */
const LIVE = process.env.BUNNY_INTEGRATION === "1";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const RUNNER_BUNDLE = path.join(REPO_ROOT, "apps/runner-cli/dist/bundle.mjs");
const RUNNER_CMD = [process.execPath, RUNNER_BUNDLE, "run"];

const MOCK_BASE_URL =
  process.env.MOCK_OPENAI_BASE_URL ??
  "https://mock-ai-server.vika.workers.dev/v1";
const MOCK_HOST = new URL(MOCK_BASE_URL).hostname;
const MOCK_MARKER = "mock-ai-server";

/** pi runner: multi-provider, speaks the OpenAI protocol the mock implements. */
const RUNNER = { runnerType: "pi", model: "openai:gpt-4o-mini", maxTurns: 1 };
const MOCK_ENV = {
  OPENAI_API_KEY: "mock", // any value; the mock ignores it
  OPENAI_BASE_URL: MOCK_BASE_URL,
};

/** Same platform probe as sandbox-srt's own tests: srt needs bwrap with
 *  user-namespace permission, socat, and ripgrep on Linux; Seatbelt ships
 *  with macOS. */
const srtAvailable = (() => {
  if (process.platform === "darwin") return true;
  if (process.platform !== "linux") return false;
  try {
    execFileSync("bwrap", ["--ro-bind", "/", "/", "true"], {
      stdio: "ignore",
      timeout: 10000,
    });
    execFileSync("socat", ["-V"], { stdio: "ignore", timeout: 10000 });
    execFileSync("rg", ["--version"], { stdio: "ignore", timeout: 10000 });
    return true;
  } catch {
    return false;
  }
})();

async function streamToText(
  agent: BunnyAgent,
  prompt: string,
): Promise<string> {
  const stream = await agent.stream({
    messages: [{ role: "user", content: prompt }],
  });
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value);
    if (raw.length > 500_000) break;
  }
  return extractAssistantText(raw);
}

/** Join the AI SDK stream's `text-delta` events — the SSE chunking can split
 *  a word (even the assertion marker) across deltas, so matching on the raw
 *  stream text is not reliable. */
function extractAssistantText(raw: string): string {
  let text = "";
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data: {")) continue;
    try {
      const event = JSON.parse(line.slice(6)) as {
        type?: string;
        delta?: string;
      };
      if (event.type === "text-delta" && typeof event.delta === "string") {
        text += event.delta;
      }
    } catch {
      // partial/non-JSON line — ignore
    }
  }
  return text;
}

describe.skipIf(!LIVE)("live e2e: BunnyAgent × mock LLM", () => {
  it("runner bundle exists (run `pnpm -r build` first)", () => {
    expect(fs.existsSync(RUNNER_BUNDLE)).toBe(true);
  });

  it("LocalMachine: full turn through the real runner", async () => {
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "live-e2e-local-"));
    const agent = new BunnyAgent({
      sandbox: new LocalMachine({ workdir, runnerCommand: RUNNER_CMD }),
      runner: RUNNER,
      env: MOCK_ENV,
    });
    try {
      const raw = await streamToText(agent, "Say hello.");
      expect(raw).toContain(MOCK_MARKER);
    } finally {
      await agent.destroy().catch(() => {});
      fs.rmSync(workdir, { recursive: true, force: true });
    }
  }, 180_000);

  describe.skipIf(!srtAvailable)("SrtSandbox", () => {
    it("full turn through the real runner, inside OS-level isolation", async () => {
      const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "live-e2e-srt-"));
      const agent = new BunnyAgent({
        sandbox: new SrtSandbox({
          workdir,
          runnerCommand: RUNNER_CMD,
          isolation: {
            // ONLY the mock endpoint is reachable — the turn completing at
            // all also proves the srt allowlist lets the LLM call through.
            allowedDomains: [MOCK_HOST],
            // pi/runner session + config writes outside the workdir
            // (pi stores sessions under ~/.bunny/agent/sessions)
            allowWrite: ["~/.bunny", "~/.config", "~/.cache"],
          },
        }),
        runner: RUNNER,
        env: {
          ...MOCK_ENV,
          // srt removes the network namespace and injects HTTP(S)_PROXY for
          // its host-side proxies. curl honors those; Node's fetch (undici)
          // does not — unless Node's built-in env-proxy support is enabled.
          // Requires Node >= 24 for the spawned runner.
          NODE_USE_ENV_PROXY: "1",
        },
      });
      try {
        const raw = await streamToText(agent, "Say hello.");
        expect(raw).toContain(MOCK_MARKER);
      } finally {
        await agent.destroy().catch(() => {});
        fs.rmSync(workdir, { recursive: true, force: true });
      }
    }, 180_000);
  });
});
