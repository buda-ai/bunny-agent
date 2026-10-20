import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import type {
  BunnyAgentCodingRunBody,
  ExecOptions,
  SandboxAdapter,
  SandboxHandle,
} from "@bunny-agent/manager";
import { describe, expect, it, vi } from "vitest";
import { createBunnyAgent } from "../provider/bunny-agent-provider";
import {
  ack,
  callOptions,
  capabilities,
  finish,
  sse,
} from "./citation-fixtures";

function fixture(supported: boolean) {
  const calls: BunnyAgentCodingRunBody[] = [];
  const health = {
    ok: true,
    data: {
      status: "ok",
      ...(supported
        ? { capabilities: { searchContracts: { pi: capabilities } } }
        : {}),
    },
  };
  const handle: SandboxHandle = {
    getSandboxId: () => (supported ? "new-sandbox" : "old-sandbox"),
    getVolumes: () => null,
    getWorkdir: () => "/workspace",
    exec: vi.fn(async function* (_args: string[], _opts?: ExecOptions) {
      yield new TextEncoder().encode(`${JSON.stringify(health)}\n200`);
    }),
    upload: async () => {},
    readFile: async () => "",
    destroy: async () => {},
    streamCodingRun: vi.fn(async function* (body) {
      calls.push(body);
      yield* sse([
        ...(body.searchContractVersion === 1 ? [ack] : []),
        { type: "text-start", id: "answer" },
        { type: "text-delta", id: "answer", delta: "hello" },
        { type: "text-end", id: "answer" },
        finish,
      ]);
    }),
  };
  const attach = vi.fn(async () => handle);
  const sandbox: SandboxAdapter = {
    attach,
    getHandle: () => handle,
    getWorkdir: () => "/workspace",
  };
  return { sandbox, handle, attach, calls };
}

async function drain(stream: ReadableStream<LanguageModelV3StreamPart>) {
  const reader = stream.getReader();
  const parts: LanguageModelV3StreamPart[] = [];
  while (true) {
    const next = await reader.read();
    if (next.done) return parts;
    parts.push(next.value);
  }
}

describe("automatic pre-execution search contract negotiation", () => {
  it.each([
    true,
    false,
  ])("executes exactly once against a capable=%s daemon", async (supported) => {
    const f = fixture(supported);
    const model = createBunnyAgent({
      sandbox: f.sandbox,
      daemonUrl: "http://127.0.0.1:3080",
      logger: false,
    })("fixture-model", { runnerType: "pi", searchContractVersion: "auto" });
    const result = await model.doStream(callOptions);
    expect((await drain(result.stream)).some((p) => p.type === "error")).toBe(
      false,
    );
    expect(f.handle.exec).toHaveBeenCalledTimes(1);
    expect(f.attach).toHaveBeenCalledTimes(1);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].searchContractVersion).toBe(supported ? 1 : undefined);
    expect(JSON.stringify(f.calls[0])).not.toContain('"auto"');
  });

  it("keeps omitted and explicit version settings free of discovery", async () => {
    for (const version of [undefined, 1] as const) {
      const f = fixture(true);
      const model = createBunnyAgent({
        sandbox: f.sandbox,
        daemonUrl: "http://127.0.0.1:3080",
        logger: false,
      })("fixture", { runnerType: "pi", searchContractVersion: version });
      await drain((await model.doStream(callOptions)).stream);
      expect(f.handle.exec).not.toHaveBeenCalled();
      expect(f.calls).toHaveLength(1);
      expect(f.calls[0].searchContractVersion).toBe(version);
    }
  });

  it.each([
    "claude",
    "codex",
    "gemini",
    "opencode",
  ] as const)("keeps auto on %s legacy without probing", async (runnerType) => {
    const f = fixture(true);
    const model = createBunnyAgent({
      sandbox: f.sandbox,
      daemonUrl: "http://127.0.0.1:3080",
      logger: false,
    })("fixture", { runnerType, searchContractVersion: "auto" });
    await drain((await model.doStream(callOptions)).stream);
    expect(f.handle.exec).not.toHaveBeenCalled();
    expect(f.calls[0].searchContractVersion).toBeUndefined();
  });

  it("does not send auto or a version flag through the CLI-only path", async () => {
    const f = fixture(false);
    const command = vi.fn(async function* (_args: string[]) {
      yield* sse([finish]);
    });
    f.handle.exec = command;
    const model = createBunnyAgent({
      sandbox: f.sandbox,
      runnerType: "pi",
      searchContractVersion: "auto",
      logger: false,
    })("fixture");
    await drain((await model.doStream(callOptions)).stream);
    expect(command).toHaveBeenCalledTimes(1);
    expect(command.mock.calls[0][0]).not.toContain("--search-contract-version");
  });

  it("fails before coding execution on discovery errors and does not silently retry", async () => {
    const f = fixture(false);
    f.handle.exec = vi.fn(async function* () {
      yield new TextEncoder().encode("{}\n503");
    });
    const model = createBunnyAgent({
      sandbox: f.sandbox,
      daemonUrl: "http://127.0.0.1:3080",
      searchContractVersion: "auto",
      runnerType: "pi",
      logger: false,
    })("fixture");
    await expect(model.doStream(callOptions)).rejects.toThrow("HTTP 503");
    expect(f.calls).toHaveLength(0);
    expect(f.handle.exec).toHaveBeenCalledTimes(1);
  });

  it("does not attach or execute for pre-canceled auto requests", async () => {
    const f = fixture(true);
    const model = createBunnyAgent({
      sandbox: f.sandbox,
      daemonUrl: "http://127.0.0.1:3080",
      searchContractVersion: "auto",
      runnerType: "pi",
      logger: false,
    })("fixture");
    await expect(
      model.doStream({ ...callOptions, abortSignal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(f.attach).not.toHaveBeenCalled();
    expect(f.calls).toHaveLength(0);
  });

  it("retains the strict acknowledgement requirement after successful auto negotiation", async () => {
    const f = fixture(true);
    f.handle.streamCodingRun = async function* (body) {
      f.calls.push(body);
      yield* sse([finish]);
    };
    const model = createBunnyAgent({
      sandbox: f.sandbox,
      daemonUrl: "http://127.0.0.1:3080",
      searchContractVersion: "auto",
      runnerType: "pi",
      logger: false,
    })("fixture");
    const parts = await drain((await model.doStream(callOptions)).stream);
    expect(parts.some((p) => p.type === "error")).toBe(true);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].searchContractVersion).toBe(1);
  });

  it("isolates overlapping auto calls on the same model and executes on the discovered handle", async () => {
    const capable = fixture(true);
    const legacy = fixture(false);
    const sandbox: SandboxAdapter = {
      attach: vi
        .fn()
        .mockResolvedValueOnce(capable.handle)
        .mockResolvedValueOnce(legacy.handle),
      getHandle: () => null,
    };
    const model = createBunnyAgent({
      sandbox,
      daemonUrl: "http://127.0.0.1:3080",
      searchContractVersion: "auto",
      runnerType: "pi",
      logger: false,
    })("fixture");
    const results = await Promise.all([
      model.doStream(callOptions),
      model.doStream(callOptions),
    ]);
    for (const result of results)
      expect((await drain(result.stream)).some((p) => p.type === "error")).toBe(
        false,
      );
    expect(sandbox.attach).toHaveBeenCalledTimes(2);
    expect(capable.calls[0].searchContractVersion).toBe(1);
    expect(legacy.calls[0].searchContractVersion).toBeUndefined();
    expect(capable.calls).toHaveLength(1);
    expect(legacy.calls).toHaveLength(1);
  });
});
