import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { PiAISDKStreamConverter } from "../stream-converter.js";

function makeConverter() {
  return new PiAISDKStreamConverter({
    sessionId: "sess",
    model: { id: "gpt-5.4", provider: "openai" },
    normalizeToolOutput: (r) => JSON.stringify(r),
    getUsageFromAgentEndMessages: () => undefined,
    getErrorFromAgentEndMessages: () => undefined,
  });
}

function textStart(): AgentSessionEvent {
  return {
    type: "message_update",
    // biome-ignore lint/suspicious/noExplicitAny: shape validated by runtime, partial for test
    message: {} as any,
    // biome-ignore lint/suspicious/noExplicitAny: shape validated by runtime, partial for test
    assistantMessageEvent: { type: "text_start" } as any,
  } as AgentSessionEvent;
}

function textDelta(delta: string): AgentSessionEvent {
  return {
    type: "message_update",
    // biome-ignore lint/suspicious/noExplicitAny: shape validated by runtime, partial for test
    message: {} as any,
    // biome-ignore lint/suspicious/noExplicitAny: shape validated by runtime, partial for test
    assistantMessageEvent: { type: "text_delta", delta } as any,
  } as AgentSessionEvent;
}

function deltasOf(chunks: string[]): string[] {
  return chunks
    .map((c) => c.replace(/^data: /, "").replace(/\n\n$/, ""))
    .filter((s) => s && s !== "[DONE]")
    .map((s) => {
      try {
        return JSON.parse(s) as { type: string; delta?: string };
      } catch {
        return { type: "unparseable" };
      }
    })
    .filter((e) => e.type === "text-delta")
    .map((e) => e.delta ?? "");
}

describe("PiAISDKStreamConverter text-delta passthrough", () => {
  it("preserves leading/trailing newlines in a single delta", () => {
    const conv = makeConverter();
    conv.handleEvent(textStart(), false);
    const chunks = conv.handleEvent(textDelta("\n\n### Heading\n\n"), false);
    expect(deltasOf(chunks)).toEqual(["\n\n### Heading\n\n"]);
  });

  it("preserves markdown separators across fragmented GPT-style deltas", () => {
    // Reproduces the real trace: GPT streams "。" / "\n\n---\n\n" / "## " / "先说" separately.
    // Before the fix, redactSecrets().trim() stripped the newlines, giving "。---##先说".
    const conv = makeConverter();
    conv.handleEvent(textStart(), false);
    const fragments = ["。", "\n\n---\n\n", "## ", "先说"];
    const deltas: string[] = [];
    for (const delta of fragments) {
      const chunks = conv.handleEvent(textDelta(delta), false);
      deltas.push(...deltasOf(chunks));
    }
    expect(deltas.join("")).toBe("。\n\n---\n\n## 先说");
  });
});
