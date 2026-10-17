import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";
import { createBunnyAgent } from "../provider/bunny-agent-provider";
import {
  ack,
  callOptions,
  capabilities,
  finish,
  sandboxFor,
  source,
  sourceId,
  sse,
  terminal,
  text,
} from "./citation-fixtures";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function collect(stream: ReadableStream<LanguageModelV3StreamPart>) {
  const reader = stream.getReader();
  const parts: LanguageModelV3StreamPart[] = [];
  while (true) {
    const next = await reader.read();
    if (next.done) return parts;
    parts.push(next.value);
  }
}

describe("request-local SDK invocation state", () => {
  it("isolates overlapping acknowledged and unacknowledged calls on the SAME model instance", async () => {
    const enteredA = deferred();
    const enteredB = deferred();
    const releaseA = deferred();
    const releaseB = deferred();
    let invocation = 0;
    const model = createBunnyAgent({
      daemonUrl: "http://127.0.0.1:3080",
      sandbox: sandboxFor(async function* () {
        const isA = invocation++ === 0;
        const sessionId = isA ? "session-A" : "session-B";
        yield* sse([
          isA
            ? {
                ...ack,
                messageMetadata: { sessionId, searchContract: capabilities },
              }
            : { type: "message-metadata", messageMetadata: { sessionId } },
          {
            type: "tool-input-available",
            toolCallId: "shared-tool-id",
            toolName: isA ? "tool-A" : "tool-B",
            input: {},
            providerExecuted: true,
          },
          { type: "text-start", id: "runner-text-42" },
          { type: "text-delta", id: "runner-text-42", delta: text },
          { type: "source-url", sourceId, url: source.url },
        ]);
        (isA ? enteredA : enteredB).resolve();
        await (isA ? releaseA : releaseB).promise;
        yield* sse([
          {
            type: "tool-output-available",
            toolCallId: "shared-tool-id",
            output: sessionId,
          },
          isA
            ? terminal
            : {
                ...terminal,
                providerMetadata: {
                  ...terminal.providerMetadata,
                  "bunny-agent": {
                    ...terminal.providerMetadata["bunny-agent"],
                    searchContract: capabilities,
                    textPartId: "not-the-runner-id",
                  },
                },
              },
          finish,
        ]);
      }),
    })("fixture-model", { runnerType: "pi", searchContractVersion: 1 });

    const a = await model.doStream(callOptions);
    const collectedA = collect(a.stream);
    await enteredA.promise;
    const b = await model.doStream(callOptions);
    const collectedB = collect(b.stream);
    await enteredB.promise;
    releaseA.resolve();
    const partsA = await collectedA;
    releaseB.resolve();
    const partsB = await collectedB;

    expect(invocation).toBe(2); // no automatic retries
    expect(partsA.filter((part) => part.type === "source")).toHaveLength(1);
    expect(partsB.filter((part) => part.type === "source")).toHaveLength(0);
    expect(partsA.find((part) => part.type === "text-end")).toMatchObject({
      providerMetadata: {
        "bunny-agent": {
          sessionId: "session-A",
          textPartId: "runner-text-42",
          searchContract: capabilities,
        },
      },
    });
    expect(partsB.find((part) => part.type === "text-end")).toMatchObject({
      providerMetadata: {
        "bunny-agent": { sessionId: "session-B", textPartId: "runner-text-42" },
      },
    });
    expect(
      partsB.find((part) => part.type === "text-end")?.providerMetadata?.[
        "bunny-agent"
      ],
    ).not.toHaveProperty("searchContract");
    expect(partsA.find((part) => part.type === "tool-result")).toMatchObject({
      toolName: "tool-A",
      result: "session-A",
    });
    expect(partsB.find((part) => part.type === "tool-result")).toMatchObject({
      toolName: "tool-B",
      result: "session-B",
    });
    expect(partsA.find((part) => part.type === "finish")).toMatchObject({
      finishReason: { unified: "stop" },
    });
    expect(partsB.find((part) => part.type === "finish")).toMatchObject({
      finishReason: { unified: "error", raw: "search-contract-unacknowledged" },
    });
  });
});
