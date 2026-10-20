import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveSourceId } from "@bunny-agent/manager/contracts/source-id";
import {
  createFauxCore,
  fauxAssistantMessage,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import {
  createAgentSession,
  defineTool,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";
import { createCitationSessionRegistry } from "../citation-session-cache.js";
import { sourceReference } from "../source-registry.js";
import {
  extractToolResultText,
  PiAISDKStreamConverter,
} from "../stream-converter.js";

describe("real Pi session citation subscription", () => {
  it("executes an offline fixture tool, persists source entries, and does not emit after unsubscribe", async () => {
    const directory = mkdtempSync(join(tmpdir(), "pi-citation-subscription-"));
    const url = "https://example.com/fixture";
    const sourceId = deriveSourceId(url)!;
    const reference = sourceReference(sourceId);
    const token = `[[cite:${reference}]]`;
    const faux = createFauxCore({
      api: "faux-citation",
      provider: "faux-citation",
      models: [{ id: "fixture" }],
    });
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall("web_search", {}), {
        stopReason: "toolUse",
      }),
      fauxAssistantMessage(`A😀B ${token}`),
      fauxAssistantMessage(`After unsubscribe ${token}`),
    ]);
    const runtime = await ModelRuntime.create({
      modelsPath: null,
      allowModelNetwork: false,
    });
    runtime.registerProvider("faux-citation", {
      baseUrl: "http://localhost",
      apiKey: "fixture-key",
      api: "faux-citation",
      streamSimple: faux.streamSimple,
      models: [
        {
          id: "fixture",
          name: "fixture",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 20000,
          maxTokens: 2000,
        },
      ],
    });
    const model = runtime.getModel("faux-citation", "fixture")!;
    const manager = SessionManager.create(directory, directory);
    const registry = createCitationSessionRegistry(manager, true);
    const stream = new PiAISDKStreamConverter({
      sessionId: manager.getSessionId(),
      model,
      sourceRegistry: registry,
      searchContractVersion: 1,
      normalizeToolOutput: extractToolResultText,
      getUsageFromAgentEndMessages: () => undefined,
      getErrorFromAgentEndMessages: () => undefined,
    });
    const { session } = await createAgentSession({
      cwd: directory,
      model,
      modelRuntime: runtime,
      sessionManager: manager,
      noTools: "builtin",
      settingsManager: SettingsManager.inMemory({
        compaction: { enabled: false },
        retry: { enabled: false },
      }),
      customTools: [
        defineTool({
          name: "web_search",
          label: "web_search",
          description: "Offline citation fixture",
          parameters: Type.Object({}),
          execute: async (callId) => ({
            content: [{ type: "text", text: `Reference: ${reference}` }],
            details: {
              web_search: {
                schema_version: 1,
                type: "web_search_call",
                id: callId,
                status: "completed",
                provider: "fixture",
                action: {
                  type: "search",
                  query: "fixture",
                  sources: [
                    { type: "url", source_id: sourceId, url, title: "Fixture" },
                  ],
                },
                results: [{ source_id: sourceId, url, title: "Fixture" }],
                source_details: "available",
                truncated: false,
              },
            },
          }),
        }),
      ],
    });
    const lines: string[] = [];
    let notifications = 0;
    const unsubscribe = session.subscribe((event) => {
      notifications++;
      lines.push(...stream.handleEvent(event, false));
    });
    try {
      await session.prompt(
        "Use the offline search fixture and cite its explicit Reference.",
      );
      unsubscribe();
      const count = lines.length;
      const notificationCount = notifications;
      await session.prompt(
        "Emit a second response after the converter subscription is stopped.",
      );
      expect(lines).toHaveLength(count);
      expect(notifications).toBe(notificationCount);
    } finally {
      unsubscribe();
      session.dispose();
    }
    const events = lines
      .filter((line) => line !== "data: [DONE]\n\n")
      .map((line) => JSON.parse(line.slice(6)));
    expect(
      events
        .filter((event) => event.type === "text-delta")
        .map((event) => event.delta)
        .join(""),
    ).toBe("A😀B [1]");
    const terminal = events.find((event) => event.type === "text-end");
    expect(
      terminal.providerMetadata["bunny-agent"].citation_contract.annotations[0],
    ).toMatchObject({ start_index: 4, end_index: 7, url });
    expect(events.filter((event) => event.type === "source-url")).toHaveLength(
      1,
    );
    const restored = createCitationSessionRegistry(
      SessionManager.open(manager.getSessionFile()!),
      true,
    );
    expect(restored.resolve(sourceId)?.tool_call_ids.length).toBe(1);
    expect(restored.resolve(sourceId)?.source_id).toBe(sourceId);
    expect(restored.resolve(reference)?.source_id).toBe(sourceId);
  });
});
