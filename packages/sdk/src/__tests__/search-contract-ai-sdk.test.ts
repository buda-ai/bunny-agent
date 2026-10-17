import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { SandboxAdapter, SandboxHandle } from "@bunny-agent/manager";
import { buildSync } from "esbuild";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBunnyAgent } from "../provider/bunny-agent-provider";
import {
  assertSearchContractAiSdkSupport,
  supportsSearchContractUiMetadata,
} from "../provider/search-contract-ai-sdk";

const installed = vi.hoisted(() => ({ version: "6.0.264" }));
vi.mock("node:module", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:module")>();
  return {
    ...actual,
    createRequire: (url: string | URL) =>
      new Proxy(actual.createRequire(url), {
        apply(target, thisArg, args) {
          return args[0] === "ai/package.json"
            ? installed
            : Reflect.apply(target, thisArg, args);
        },
      }),
  };
});
beforeEach(() => {
  installed.version = "6.0.264";
});

function sandbox() {
  const handle: SandboxHandle = {
    getSandboxId: () => null,
    getVolumes: () => null,
    getWorkdir: () => "/workspace",
    exec: async function* () {},
    upload: async () => {},
    readFile: async () => "",
    destroy: async () => {},
    streamCodingRun: async function* () {
      yield new TextEncoder().encode(
        'data: {"type":"finish","finishReason":"stop"}\n\ndata: [DONE]\n\n',
      );
    },
  };
  const attach = vi.fn(async () => handle);
  return {
    adapter: {
      attach,
      getHandle: () => handle,
      getWorkdir: () => "/workspace",
    } satisfies SandboxAdapter,
    attach,
  };
}
const prompt = [
  { role: "user" as const, content: [{ type: "text" as const, text: "test" }] },
];

describe("AI SDK compatibility for opt-in citations", () => {
  it.each([
    "6.0.264",
    "6.0.265",
    "6.1.0",
    "6.0.264+build.1",
  ])("accepts supported stable peer %s", (version) => {
    expect(supportsSearchContractUiMetadata(version)).toBe(true);
  });
  it.each([
    "6.0.105",
    "6.0.263",
    "5.0.264",
    "7.0.0",
    "6.0.264-beta.1",
    "unknown",
  ])("rejects unsupported or unverified peer %s", (version) => {
    expect(supportsSearchContractUiMetadata(version)).toBe(false);
  });
  it("checks the actual peer module version", async () => {
    await expect(assertSearchContractAiSdkSupport()).resolves.toBeUndefined();
    installed.version = "6.0.105";
    await expect(assertSearchContractAiSdkSupport()).rejects.toThrow(
      "found ai@6.0.105",
    );
  });
  it.each([
    "6.0.264",
    "6.0.105",
  ])("loads peer JSON after ES2022 bundling (%s)", (version) => {
    const directory = mkdtempSync(join(tmpdir(), "bunny-search-peer-"));
    const peer = join(directory, "node_modules", "ai");
    mkdirSync(peer, { recursive: true });
    writeFileSync(
      join(peer, "package.json"),
      JSON.stringify({ name: "ai", version }),
    );
    const entry = join(directory, "guard.mjs");
    const compiled = buildSync({
      entryPoints: [
        fileURLToPath(
          new URL("../provider/search-contract-ai-sdk.ts", import.meta.url),
        ),
      ],
      bundle: true,
      write: false,
      platform: "node",
      format: "esm",
      target: "es2022",
    }).outputFiles[0].text;
    writeFileSync(entry, compiled);
    const script = `import {assertSearchContractAiSdkSupport} from ${JSON.stringify(pathToFileURL(entry).href)}; try { await assertSearchContractAiSdkSupport(); console.log("supported"); } catch(error) { console.log(error.message); }`;
    const output = execFileSync(
      process.execPath,
      ["--input-type=module", "--eval", script],
      {
        encoding: "utf8",
        env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=256" },
      },
    );
    expect(output.trim()).toBe(
      version === "6.0.264"
        ? "supported"
        : "searchContractVersion: 1 requires ai >=6.0.264 <7.0.0 to preserve structured tool-result metadata; found ai@6.0.105.",
    );
  });
  it("rejects v1 on an old peer before attaching or starting a request", async () => {
    installed.version = "6.0.105";
    const test = sandbox();
    const model = createBunnyAgent({
      sandbox: test.adapter,
      daemonUrl: "http://127.0.0.1:3080",
      logger: false,
    })("gpt-5", { runnerType: "pi", searchContractVersion: 1 });
    await expect(model.doStream({ prompt })).rejects.toThrow(
      "requires ai >=6.0.264",
    );
    expect(test.attach).not.toHaveBeenCalled();
  });
  it("preserves legacy execution on the same old peer", async () => {
    installed.version = "6.0.105";
    const test = sandbox();
    const model = createBunnyAgent({
      sandbox: test.adapter,
      daemonUrl: "http://127.0.0.1:3080",
      logger: false,
    })("gpt-5", { runnerType: "pi" });
    const response = await model.doStream({ prompt });
    const reader = response.stream.getReader();
    while (!(await reader.read()).done) {
      /* Drain the local fixture. */
    }
    expect(test.attach).toHaveBeenCalledOnce();
  });
});
