import { join } from "node:path";
import type { Context } from "@earendil-works/pi-ai";
import {
  createFauxCore,
  fauxAssistantMessage,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import {
  createAgentSession,
  type InlineExtension,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { createPiResourceLoader } from "../pi-runner.js";

/**
 * Run one prompt in a real pi session where a faux model calls `toolName`
 * once and then finishes. Returns the tool result message the model saw next
 * and every session entry pi persisted, both serialized.
 */
export async function runFauxToolCall(options: {
  cwd: string;
  toolName: string;
  args?: Parameters<typeof fauxToolCall>[1];
  customTools?: ToolDefinition[];
  extensions?: InlineExtension[];
  abortAfterMs?: number;
}): Promise<{ seenResult: string; persisted: string }> {
  const faux = createFauxCore({
    api: "faux-session",
    provider: "faux-session",
    models: [{ id: "faux-model", contextWindow: 100_000, maxTokens: 1_000 }],
  });
  let seenResult = "";
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall(options.toolName, options.args ?? {}, { id: "call-1" }),
      { stopReason: "toolUse" },
    ),
    (context: Context) => {
      seenResult = JSON.stringify(context.messages.at(-1));
      return fauxAssistantMessage("done");
    },
  ]);
  const modelRuntime = await ModelRuntime.create({
    modelsPath: null,
    allowModelNetwork: false,
  });
  modelRuntime.registerProvider("faux-session", {
    baseUrl: "http://localhost",
    apiKey: "test-key",
    api: "faux-session",
    streamSimple: faux.streamSimple,
    models: [
      {
        id: "faux-model",
        name: "faux-model",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 100_000,
        maxTokens: 1_000,
      },
    ],
  });
  const agentDir = join(options.cwd, "agent");
  const resourceLoader = await createPiResourceLoader({
    cwd: options.cwd,
    agentDir,
    extensionFactories: options.extensions,
  });
  const sessionManager = SessionManager.inMemory(options.cwd);
  const { session } = await createAgentSession({
    cwd: options.cwd,
    agentDir,
    model: modelRuntime.getModel("faux-session", "faux-model"),
    modelRuntime,
    resourceLoader,
    sessionManager,
    settingsManager: SettingsManager.inMemory({ retry: { enabled: false } }),
    noTools: "builtin",
    customTools: options.customTools,
  });
  try {
    await session.bindExtensions({ mode: "print" });
    if (options.abortAfterMs !== undefined) {
      setTimeout(() => void session.abort(), options.abortAfterMs);
    }
    await session.prompt("go");
  } finally {
    session.dispose();
  }
  return { seenResult, persisted: JSON.stringify(sessionManager.getEntries()) };
}
