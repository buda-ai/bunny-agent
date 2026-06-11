/**
 * Minimal fake ExtensionAPI for testing extensions in isolation.
 * Captures registrations and lets tests fire events synthetically.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";

type Handler = (event: unknown, ctx: ExtensionContext) => Promise<unknown> | unknown;

export interface SentMessage {
  message: { customType?: string; content: unknown; display?: boolean };
  options?: { triggerTurn?: boolean };
}

export interface AppendedEntry {
  customType: string;
  data: unknown;
}

export interface FakeApi {
  api: ExtensionAPI;
  tools: Map<string, ToolDefinition>;
  commands: Map<string, { description?: string; handler: Handler }>;
  flags: Map<string, { type: "boolean" | "string"; default?: boolean | string }>;
  flagValues: Map<string, boolean | string | undefined>;
  handlers: Map<string, Handler[]>;
  sentMessages: SentMessage[];
  sentUserMessages: Array<{ content: unknown }>;
  appendedEntries: AppendedEntry[];
  activeTools: string[];
  fire(event: string, payload: unknown, ctx?: Partial<ExtensionContext>): Promise<unknown[]>;
  setFlag(name: string, value: boolean | string | undefined): void;
  setSessionEntries(entries: unknown[]): void;
  ctx(): ExtensionContext;
}

export function createFakeExtensionApi(): FakeApi {
  const tools = new Map<string, ToolDefinition>();
  const commands = new Map<string, { description?: string; handler: Handler }>();
  const flags = new Map<string, { type: "boolean" | "string"; default?: boolean | string }>();
  const flagValues = new Map<string, boolean | string | undefined>();
  const handlers = new Map<string, Handler[]>();
  const sentMessages: SentMessage[] = [];
  const sentUserMessages: Array<{ content: unknown }> = [];
  const appendedEntries: AppendedEntry[] = [];
  let activeTools: string[] = [];
  let sessionEntries: unknown[] = [];

  const fakeCtx: ExtensionContext = {
    cwd: "/tmp/fake",
    hasUI: false,
    sessionManager: {
      getBranch: () => sessionEntries as never,
      getEntries: () => sessionEntries as never,
    } as never,
    ui: {} as never,
    modelRegistry: {} as never,
    model: undefined,
    isIdle: () => true,
    signal: undefined,
    abort: () => {},
    hasPendingMessages: () => false,
    shutdown: () => {},
    getContextUsage: () => undefined,
    compact: () => {},
    getSystemPrompt: () => "",
  };

  const api: ExtensionAPI = {
    on: ((event: string, handler: Handler) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    }) as ExtensionAPI["on"],

    registerTool: ((tool: ToolDefinition) => {
      tools.set(tool.name, tool);
    }) as ExtensionAPI["registerTool"],

    registerCommand: ((
      name: string,
      options: { description?: string; handler: Handler },
    ) => {
      commands.set(name, {
        description: options.description,
        handler: options.handler,
      });
    }) as ExtensionAPI["registerCommand"],

    registerShortcut: () => {},

    registerFlag: ((
      name: string,
      options: { type: "boolean" | "string"; default?: boolean | string },
    ) => {
      flags.set(name, { type: options.type, default: options.default });
      if (!flagValues.has(name) && options.default !== undefined) {
        flagValues.set(name, options.default);
      }
    }) as ExtensionAPI["registerFlag"],

    getFlag: ((name: string) => flagValues.get(name)) as ExtensionAPI["getFlag"],

    registerMessageRenderer: () => {},

    sendMessage: ((message: SentMessage["message"], options?: SentMessage["options"]) => {
      sentMessages.push({ message, options });
    }) as ExtensionAPI["sendMessage"],

    sendUserMessage: ((content: unknown) => {
      sentUserMessages.push({ content });
    }) as ExtensionAPI["sendUserMessage"],

    appendEntry: ((customType: string, data: unknown) => {
      appendedEntries.push({ customType, data });
    }) as ExtensionAPI["appendEntry"],

    setSessionName: () => {},
    getSessionName: () => undefined,
    setLabel: () => {},
    exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }) as never,

    getActiveTools: () => [...activeTools],
    getAllTools: () => [],
    setActiveTools: ((names: string[]) => {
      activeTools = [...names];
    }) as ExtensionAPI["setActiveTools"],
    getCommands: () => [],

    setModel: async () => true,
    getModel: () => undefined,
    getThinkingLevel: () => undefined,
    setThinkingLevel: () => {},
  } as unknown as ExtensionAPI;

  return {
    api,
    tools,
    commands,
    flags,
    flagValues,
    handlers,
    sentMessages,
    sentUserMessages,
    appendedEntries,
    get activeTools() {
      return activeTools;
    },
    setFlag(name, value) {
      flagValues.set(name, value);
    },
    setSessionEntries(entries) {
      sessionEntries = entries;
    },
    ctx() {
      return fakeCtx;
    },
    async fire(event, payload, ctxOverrides) {
      const list = handlers.get(event) ?? [];
      const ctx = { ...fakeCtx, ...ctxOverrides } as ExtensionContext;
      const results: unknown[] = [];
      for (const h of list) {
        results.push(await h(payload, ctx));
      }
      return results;
    },
  } as FakeApi;
}
