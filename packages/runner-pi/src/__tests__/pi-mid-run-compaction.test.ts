import type { AssistantMessage, Context } from "@earendil-works/pi-ai";
import {
  createFauxCore,
  fauxAssistantMessage,
  fauxToolCall,
  isContextOverflow,
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

const CONTEXT_WINDOW = 20_000;
const TOOL_OUTPUT = "x".repeat(4_000); // ~1k tokens per tool result
const TOOL_CALLS_BEFORE_DONE = 40; // ~40k tokens total without compaction

function estimatePromptTokens(context: Context): number {
  return Math.ceil(JSON.stringify(context.messages).length / 4);
}

// Pi >= 0.84.4 compacts between tool execution and the next assistant
// response within one run (upstream #6879). This guards against regressions
// of that behavior across upgrades.
describe("Pi mid-run compaction", () => {
  it("compacts between turns so a single long prompt stays within the context window", async () => {
    const faux = createFauxCore({
      api: "faux-mid-run",
      provider: "faux-mid-run",
      models: [
        { id: "faux-model", contextWindow: CONTEXT_WINDOW, maxTokens: 2_000 },
      ],
    });

    const promptSizes: number[] = [];
    let agentCalls = 0;
    let summaryCalls = 0;
    const respond = (context: Context): AssistantMessage => {
      // pi >= 0.86 carries the system prompt as a leading system message, so
      // detect summarization requests from the serialized context.
      if (JSON.stringify(context).includes("context summarization assistant")) {
        summaryCalls++;
        return fauxAssistantMessage("## Goal\nsummary");
      }
      promptSizes.push(estimatePromptTokens(context));
      agentCalls++;
      if (agentCalls <= TOOL_CALLS_BEFORE_DONE) {
        return fauxAssistantMessage(fauxToolCall("big_output", {}), {
          stopReason: "toolUse",
        });
      }
      return fauxAssistantMessage("done");
    };
    faux.setResponses(
      Array.from({ length: 128 }, () => (context: Context) => respond(context)),
    );

    const modelRuntime = await ModelRuntime.create({
      modelsPath: null,
      allowModelNetwork: false,
    });
    modelRuntime.registerProvider("faux-mid-run", {
      baseUrl: "http://localhost",
      apiKey: "test-key",
      api: "faux-mid-run",
      streamSimple: faux.streamSimple,
      models: [
        {
          id: "faux-model",
          name: "faux-model",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: CONTEXT_WINDOW,
          maxTokens: 2_000,
        },
      ],
    });
    const model = modelRuntime.getModel("faux-mid-run", "faux-model");
    expect(model).toBeDefined();

    const sessionManager = SessionManager.inMemory("/tmp");
    const { session } = await createAgentSession({
      cwd: "/tmp",
      model,
      modelRuntime,
      sessionManager,
      settingsManager: SettingsManager.inMemory({
        compaction: {
          enabled: true,
          reserveTokens: 4_000,
          keepRecentTokens: 2_000,
        },
        retry: { enabled: false },
      }),
      noTools: "builtin",
      customTools: [
        defineTool({
          name: "big_output",
          label: "big_output",
          description: "Returns a large output",
          parameters: Type.Object({}),
          execute: async () => ({
            content: [{ type: "text", text: TOOL_OUTPUT }],
            details: undefined,
          }),
        }),
      ],
    });

    try {
      await session.prompt("run the tool repeatedly");
    } finally {
      session.dispose();
    }

    expect(agentCalls).toBe(TOOL_CALLS_BEFORE_DONE + 1);
    expect(summaryCalls).toBeGreaterThan(0);
    expect(
      sessionManager.getEntries().some((entry) => entry.type === "compaction"),
    ).toBe(true);
    expect(Math.max(...promptSizes)).toBeLessThan(CONTEXT_WINDOW);
  });
});

// Bunny patch: patches/@earendil-works__pi-ai@*.patch
describe("Pi overflow detection patch", () => {
  it("recognizes gateway 'Context Window exceeded' errors as context overflow", () => {
    const message = {
      role: "assistant",
      content: [],
      stopReason: "error",
      errorMessage:
        '400: {"message":"ContextWindowExceededError: Context Window exceeded for given call. No models have context window large enough for this call.\\nModel=openai/gpt-6.1-sol, Max Input Tokens=922000, Got=1061104","type":null,"param":null,"code":"400"}',
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    } as unknown as AssistantMessage;
    expect(isContextOverflow(message)).toBe(true);
  });
});
