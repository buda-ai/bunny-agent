import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRunner, resolveSearchContractCapabilities } from "../runner.js";

type RunnerOptions = Record<string, unknown>;

const piRun = vi.fn((_userInput: unknown) => (async function* () {})());
const createPiRunner = vi.fn((_options: RunnerOptions) => ({ run: piRun }));
const codexRun = vi.fn((_userInput: unknown) => (async function* () {})());
const createCodexRunner = vi.fn((_options: RunnerOptions) => ({
  run: codexRun,
}));
const claudeRun = vi.fn((_userInput: unknown) => (async function* () {})());
const createClaudeRunner = vi.fn((_options: RunnerOptions) => ({
  run: claudeRun,
}));

vi.mock("@bunny-agent/runner-pi", () => ({
  createPiRunner: (options: RunnerOptions) => createPiRunner(options),
}));
vi.mock("@bunny-agent/runner-codex", () => ({
  createCodexRunner: (options: RunnerOptions) => createCodexRunner(options),
}));
vi.mock("@bunny-agent/runner-claude", () => ({
  createClaudeRunner: (options: RunnerOptions) => createClaudeRunner(options),
}));
vi.mock("@bunny-agent/runner-gemini", () => ({ createGeminiRunner: vi.fn() }));
vi.mock("@bunny-agent/runner-opencode", () => ({
  createOpenCodeRunner: vi.fn(),
}));
vi.mock("@bunny-agent/runner-copilot", () => ({
  createCopilotRunner: vi.fn(),
}));

async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const chunk of stream) out.push(chunk);
  return out;
}

function parseSseEvents(chunks: string[]): unknown[] {
  return chunks
    .join("")
    .split("\n\n")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("data:"))
    .map((part) => part.slice(5).trim())
    .filter((payload) => payload !== "[DONE]" && payload !== "")
    .map((payload) => JSON.parse(payload));
}

describe("searchContractVersion selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unsupported version before any runner dispatch", async () => {
    const stream = createRunner({
      runner: "pi",
      model: "gpt-5",
      userInput: "hi",
      cwd: "/tmp",
      autoInject: false,
      searchContractVersion: 2 as unknown as number,
    });
    const events = parseSseEvents(await collect(stream));

    expect(createPiRunner).not.toHaveBeenCalled();
    expect(events).toEqual([
      { type: "error", errorText: expect.stringContaining("Unsupported") },
      { type: "finish", finishReason: "error" },
    ]);
  });

  it("rejects an explicit v1 selection for a runner without support", async () => {
    const stream = createRunner({
      runner: "claude",
      model: "claude-sonnet-4-20250514",
      userInput: "hi",
      cwd: "/tmp",
      autoInject: false,
      searchContractVersion: 1,
    });
    const events = parseSseEvents(await collect(stream));

    expect(createClaudeRunner).not.toHaveBeenCalled();
    expect(events[0]).toEqual({
      type: "error",
      errorText: expect.stringContaining('"claude"'),
    });
  });

  it("does not require an acknowledgement when the version is unspecified (legacy default unchanged)", async () => {
    createRunner({
      runner: "pi",
      model: "gpt-5",
      userInput: "hi",
      cwd: "/tmp",
      autoInject: false,
    });

    expect(createPiRunner).toHaveBeenCalledTimes(1);
    expect(
      createPiRunner.mock.calls[0][0].searchContractVersion,
    ).toBeUndefined();
  });

  it("emits an honest capability acknowledgement before pi dispatch for v1", async () => {
    const stream = createRunner({
      runner: "pi",
      model: "gpt-5",
      userInput: "hi",
      cwd: "/tmp",
      autoInject: false,
      searchContractVersion: 1,
    });
    const events = parseSseEvents(await collect(stream));

    expect(createPiRunner).toHaveBeenCalledTimes(1);
    expect(createPiRunner.mock.calls[0][0].searchContractVersion).toBe(1);
    expect(events[0]).toEqual({
      type: "message-metadata",
      messageMetadata: {
        searchContract: {
          version: 1,
          structured_retrieval: true,
          native_annotations: false,
          explicit_source_marker_annotations: true,
        },
      },
    });
  });

  it("emits an honest unavailable-detail acknowledgement for codex v1", async () => {
    const stream = createRunner({
      runner: "codex",
      model: "gpt-5-codex",
      userInput: "hi",
      cwd: "/tmp",
      autoInject: false,
      searchContractVersion: 1,
    });
    const events = parseSseEvents(await collect(stream));

    expect(createCodexRunner).toHaveBeenCalledTimes(1);
    expect(createCodexRunner.mock.calls[0][0].searchContractVersion).toBe(1);
    expect(events[0]).toEqual({
      type: "message-metadata",
      messageMetadata: {
        searchContract: {
          version: 1,
          structured_retrieval: false,
          native_annotations: false,
          explicit_source_marker_annotations: false,
        },
      },
    });
  });

  it("keeps concurrent legacy and v1 requests isolated", async () => {
    const legacyStream = createRunner({
      runner: "pi",
      model: "gpt-5",
      userInput: "legacy turn",
      cwd: "/tmp",
      autoInject: false,
    });
    const v1Stream = createRunner({
      runner: "pi",
      model: "gpt-5",
      userInput: "v1 turn",
      cwd: "/tmp",
      autoInject: false,
      searchContractVersion: 1,
    });

    const legacyEvents = parseSseEvents(await collect(legacyStream));
    const v1Events = parseSseEvents(await collect(v1Stream));

    expect(legacyEvents).toEqual([]); // no acknowledgement chunk for legacy
    expect(v1Events[0]).toMatchObject({ type: "message-metadata" });
    expect(createPiRunner).toHaveBeenCalledTimes(2);
    expect(
      createPiRunner.mock.calls[0][0].searchContractVersion,
    ).toBeUndefined();
    expect(createPiRunner.mock.calls[1][0].searchContractVersion).toBe(1);
  });
});

describe("resolveSearchContractCapabilities", () => {
  it("throws for a runner with no declared capability mapping", () => {
    expect(() => resolveSearchContractCapabilities("claude", 1)).toThrow();
  });
});
