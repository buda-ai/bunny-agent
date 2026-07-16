import { BunnyAgent } from "@bunny-agent/manager";
import { afterEach, describe, expect, it } from "vitest";
import { SandockSandbox } from "../sandock-sandbox.js";

/**
 * Live integration against a REAL Sandock service (sandock.ai by default,
 * or SANDOCK_BASE_URL). Creates and destroys real cloud sandboxes.
 *
 * Opt-in: needs BUNNY_INTEGRATION=1 AND SANDOCK_API_KEY (a repo secret in
 * CI — forks without the secret skip cleanly). The LLM turn uses the
 * deterministic mock-ai-server, so no LLM key and no token cost.
 */
const LIVE =
  process.env.BUNNY_INTEGRATION === "1" && !!process.env.SANDOCK_API_KEY;

const MOCK_BASE_URL =
  process.env.MOCK_OPENAI_BASE_URL ??
  "https://mock-ai-server.vika.workers.dev/v1";
const MOCK_MARKER = "mock-ai-server";

describe.skipIf(!LIVE)("live: SandockSandbox × sandock.ai", () => {
  let sandbox: SandockSandbox | null = null;

  afterEach(async () => {
    // Always tear the cloud sandbox down, even when an assertion failed.
    await sandbox
      ?.getHandle()
      ?.destroy()
      .catch(() => {});
    sandbox = null;
  }, 120_000); // destroying a real cloud sandbox can exceed the 10s default

  it("adapter round trip: attach → exec → upload → readFile", async () => {
    sandbox = new SandockSandbox({
      baseUrl: process.env.SANDOCK_BASE_URL,
      name: "bunny-ci-roundtrip",
    });
    const handle = await sandbox.attach();
    expect(handle.getSandboxId()).toBeTruthy();

    let out = "";
    for await (const chunk of handle.exec([
      "sh",
      "-c",
      "echo live-$((6*7)) && uname -s",
    ])) {
      out += new TextDecoder().decode(chunk);
    }
    expect(out).toContain("live-42");
    expect(out).toContain("Linux");

    await handle.upload([{ path: "ci.txt", content: "sandock-live-ci" }], ".");
    const content = await handle.readFile("ci.txt");
    expect(content).toContain("sandock-live-ci");
  }, 300_000);

  it("full BunnyAgent turn through the bootstrapped runner + mock LLM", async () => {
    sandbox = new SandockSandbox({
      baseUrl: process.env.SANDOCK_BASE_URL,
      name: "bunny-ci-e2e",
    });
    const agent = new BunnyAgent({
      sandbox,
      // pi runner: multi-provider, speaks the OpenAI protocol the mock implements
      runner: { runnerType: "pi", model: "openai:gpt-4o-mini", maxTurns: 1 },
      env: {
        OPENAI_API_KEY: "mock", // any value; the mock ignores it
        OPENAI_BASE_URL: MOCK_BASE_URL,
      },
    });
    const stream = await agent.stream({
      messages: [{ role: "user", content: "Say hello." }],
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
    // Join text-delta events — SSE chunking can split the marker mid-word.
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
    expect(text).toContain(MOCK_MARKER);
  }, 300_000);
});
