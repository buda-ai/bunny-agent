import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readUIMessageStream, streamText, type UIMessage } from "ai";
import { buildSync } from "esbuild";
import { describe, expect, it } from "vitest";
import {
  isValidCitationContractMetadata,
  isValidWebSearchCallRecord,
  projectUIMessageOutputText,
  sliceByCodePointRange,
} from "../contracts.js";
import { createBunnyAgent } from "../provider/bunny-agent-provider";
import {
  ack,
  callOptions,
  capabilities,
  citationContract,
  failure,
  finish,
  recordedEvents,
  recordedSandbox,
  source,
  sourceId,
  success,
  terminal,
  text,
} from "./citation-fixtures";

function modelFor(events = recordedEvents()) {
  return createBunnyAgent({
    sandbox: recordedSandbox(events),
    daemonUrl: "http://127.0.0.1:3080",
  })("fixture-model", { runnerType: "pi", searchContractVersion: 1 });
}

async function finalMessage(events = recordedEvents()): Promise<UIMessage> {
  const result = streamText({
    model: modelFor(events),
    prompt: "test",
    maxRetries: 0,
  });
  let final: UIMessage | undefined;
  for await (const message of readUIMessageStream({
    stream: result.toUIMessageStream({ sendSources: true }),
  }))
    final = message;
  expect(final).toBeDefined();
  return final!;
}

describe("SDK canonical runner events through final AI SDK messages", () => {
  it("uses valid canonical retrieval/citation fixtures", () => {
    expect(isValidWebSearchCallRecord(success)).toBe(true);
    expect(isValidWebSearchCallRecord(failure)).toBe(true);
    expect(
      isValidCitationContractMetadata(citationContract, {
        text,
        sources: [source],
      }),
    ).toBe(true);
    expect(sliceByCodePointRange(text, 4, 7)).toBe("[1]");
  });

  it("retains exact text identity, acknowledgement, associations, and merged fields in the completed message", async () => {
    const message = await finalMessage();
    expect(message.metadata).toBeUndefined();
    const textParts = message.parts.filter((part) => part.type === "text");
    expect(textParts).toHaveLength(1);
    expect(textParts[0]).toEqual({
      type: "text",
      text,
      state: "done",
      providerMetadata: {
        other: { start: true, terminal: true },
        "bunny-agent": {
          sessionId: "session-fixture",
          textPartId: "runner-text-42",
          searchContract: capabilities,
          citation_contract: citationContract,
          startField: "retained",
          terminalField: "retained",
        },
      },
    });
    expect(message.parts.filter((part) => part.type === "source-url")).toEqual([
      { type: "source-url", sourceId, url: source.url, title: source.title },
    ]);
    expect(projectUIMessageOutputText(message)).toEqual([
      {
        textPartId: "runner-text-42",
        output_text: {
          type: "output_text",
          text,
          annotations: citationContract.annotations,
        },
        bindings: citationContract.bindings,
        searchContract: capabilities,
      },
    ]);
  });

  it("retains structured success and output-error result metadata in actual final tool parts", async () => {
    const message = await finalMessage();
    const tools = message.parts.filter((part) => part.type === "dynamic-tool");
    expect(tools).toHaveLength(2);
    expect.soft(tools[0]).toMatchObject({
      state: "output-available",
      output: success,
      resultProviderMetadata: {
        other: { input: true, output: true },
        "bunny-agent": {
          searchContract: capabilities,
          sessionId: "session-fixture",
          usage: { requests: 1 },
          toolField: "retained",
        },
      },
    });
    expect.soft(tools[1]).toMatchObject({
      state: "output-error",
      errorText: "Web search rate limit exceeded.",
      resultProviderMetadata: {
        other: { input: true, output: true },
        "bunny-agent": {
          search_result: failure,
          searchContract: capabilities,
          usage: { requests: 1 },
          sessionId: "session-fixture",
          toolField: "retained",
        },
      },
    });
    expect(JSON.parse(JSON.stringify(tools[1]))).not.toHaveProperty("output");
  });

  it("preserves V3 tool metadata and stream/generate parity without inventing error output", async () => {
    const streamed = await modelFor().doStream(callOptions);
    const parts = [];
    const reader = streamed.stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const generated = await modelFor().doGenerate(callOptions);
    const streamTools = parts.filter((part) => part.type === "tool-result");
    expect(streamTools).toHaveLength(2);
    expect(streamTools[1]).toMatchObject({
      isError: true,
      result: failure.error.message,
      providerMetadata: {
        other: { input: true, output: true },
        "bunny-agent": {
          search_result: failure,
          searchContract: capabilities,
          usage: { requests: 1 },
        },
      },
    });
    expect(
      generated.content.filter((part) => part.type === "tool-result"),
    ).toEqual(streamTools);
    expect(generated.content.filter((part) => part.type === "source")).toEqual(
      parts.filter((part) => part.type === "source"),
    );
    const generatedText = generated.content.filter(
      (part) => part.type === "text",
    );
    expect(generatedText).toHaveLength(1);
    expect(projectUIMessageOutputText({ parts: generatedText })).toEqual(
      projectUIMessageOutputText(await finalMessage()),
    );
    expect(generated.providerMetadata?.["bunny-agent"]).toMatchObject({
      searchContract: capabilities,
      sessionId: "session-fixture",
      unrelatedFinish: "retained",
    });
    expect(parts.filter((part) => part.type === "finish")).toHaveLength(1);
    expect(parts.filter((part) => part.type === "text-end")).toHaveLength(1);
    expect(parts.filter((part) => part.type === "source")).toHaveLength(1);
  });

  it("rehydrates completed message JSON and projects canonical output in a genuinely fresh process", async () => {
    const message = await finalMessage();
    const expected = projectUIMessageOutputText(message);
    // Bundle the public source entry for browsers. The fresh child receives
    // only this stateless browser module and the serialized completed message.
    const entry = fileURLToPath(new URL("../contracts.ts", import.meta.url));
    const manager = fileURLToPath(
      new URL("../../../manager/src/contracts/index.ts", import.meta.url),
    );
    const bundle = buildSync({
      entryPoints: [entry],
      bundle: true,
      write: false,
      platform: "browser",
      format: "esm",
      alias: { "@bunny-agent/manager/contracts": manager },
    });
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`;
    const script = `
      const { projectUIMessageOutputText } = await import(${JSON.stringify(moduleUrl)});
      let json = "";
      for await (const chunk of process.stdin) json += chunk;
      const message = JSON.parse(json);
      process.stdout.write(JSON.stringify({ projection: projectUIMessageOutputText(message), message }));
    `;
    const result = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        input: JSON.stringify(message),
        encoding: "utf8",
        env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=2048" },
      },
    );
    expect(JSON.parse(result)).toEqual({
      projection: expected,
      message: JSON.parse(JSON.stringify(message)),
    });
  });

  it("does not emit unsafe, uncited, mismatched, or malformed-v1 sources", async () => {
    const malformed = {
      ...citationContract,
      annotations: [{ ...citationContract.annotations[0], end_index: 999 }],
    };
    const message = await finalMessage([
      ack,
      { type: "text-start", id: "runner-text-42" },
      { type: "text-delta", id: "runner-text-42", delta: text },
      { type: "source-url", sourceId, url: source.url },
      {
        ...terminal,
        providerMetadata: { "bunny-agent": { citation_contract: malformed } },
      },
      finish,
    ]);
    expect(message.parts.filter((part) => part.type === "source-url")).toEqual(
      [],
    );
    expect(() => projectUIMessageOutputText(message)).toThrow(TypeError);
  });

  it("supports recorded native annotations with honest capabilities", async () => {
    const nativeCapabilities = {
      ...capabilities,
      native_annotations: true,
      explicit_source_marker_annotations: false,
    };
    const native = {
      ...citationContract,
      bindings: [{ ...citationContract.bindings[0], origin: "provider" }],
    };
    const events = recordedEvents().map((event) =>
      event === ack
        ? {
            ...ack,
            messageMetadata: {
              ...ack.messageMetadata,
              searchContract: nativeCapabilities,
            },
          }
        : event === terminal
          ? {
              ...terminal,
              providerMetadata: {
                "bunny-agent": { citation_contract: native },
              },
            }
          : event,
    );
    const projection = projectUIMessageOutputText(await finalMessage(events));
    expect(projection[0].bindings[0].origin).toBe("provider");
    expect(projection[0].searchContract).toEqual(nativeCapabilities);
    expect(projection[0].output_text.annotations).toEqual(
      citationContract.annotations,
    );
  });
});
