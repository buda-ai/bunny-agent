import type {
  JSONObject,
  LanguageModelV3FunctionTool,
  LanguageModelV3ProviderTool,
} from "@ai-sdk/provider";
import type { ToolRef } from "@bunny-agent/manager";
import type { Tool } from "ai";

const BUNNY_PROVIDER_OPTIONS_KEY = "bunny-agent";

type BunnyProviderOptions = {
  runtime?: JSONObject;
};

type BunnyToolRuntime = Extract<
  ToolRef["runtime"],
  { type: "http" | "module" }
>;

/**
 * AI SDK helper for tools that the sandbox runner should call by HTTP.
 *
 * This is still used with the standard AI SDK `streamText`:
 * `import { streamText } from "ai"`.
 */
export function bunnyHttpTool<INPUT, OUTPUT>(
  input: Omit<Tool<INPUT, OUTPUT>, "execute" | "outputSchema"> & {
    endpoint: {
      url: string;
      headers?: Record<string, string>;
    };
  },
): Tool<INPUT, never> {
  return {
    type: "function" as const,
    description: input.description,
    title: input.title,
    providerOptions: withBunnyProviderOptions(input.providerOptions, {
      runtime: {
        type: "http",
        url: input.endpoint.url,
        ...(input.endpoint.headers ? { headers: input.endpoint.headers } : {}),
      },
    }),
    inputSchema: input.inputSchema,
    inputExamples: input.inputExamples,
    needsApproval: input.needsApproval,
    strict: input.strict,
    onInputStart: input.onInputStart,
    onInputDelta: input.onInputDelta,
    onInputAvailable: input.onInputAvailable,
  } satisfies Tool<INPUT, never>;
}

/**
 * AI SDK helper for tools implemented by a module already present in the
 * sandbox filesystem.
 */
export function bunnySandboxTool<INPUT, OUTPUT>(
  input: Omit<Tool<INPUT, OUTPUT>, "execute" | "outputSchema"> & {
    module: string;
    exportName?: string;
  },
): Tool<INPUT, never> {
  return {
    type: "function" as const,
    description: input.description,
    title: input.title,
    providerOptions: withBunnyProviderOptions(input.providerOptions, {
      runtime: {
        type: "module",
        module: input.module,
        ...(input.exportName ? { exportName: input.exportName } : {}),
      },
    }),
    inputSchema: input.inputSchema,
    inputExamples: input.inputExamples,
    needsApproval: input.needsApproval,
    strict: input.strict,
    onInputStart: input.onInputStart,
    onInputDelta: input.onInputDelta,
    onInputAvailable: input.onInputAvailable,
  } satisfies Tool<INPUT, never>;
}

export function compileToolRefsFromLanguageModelTools(
  tools:
    | Array<LanguageModelV3FunctionTool | LanguageModelV3ProviderTool>
    | undefined,
): ToolRef[] | undefined {
  if (!tools || tools.length === 0) return undefined;

  const toolRefs: ToolRef[] = [];

  for (const tool of tools) {
    if (tool.type !== "function") {
      continue;
    }

    const runtime = getBunnyRuntime(tool);
    if (!runtime) {
      throw new Error(
        `[bunny-agent] Tool "${tool.name}" was passed through AI SDK streamText, ` +
          "but Bunny cannot access host-side tool({ execute }) callbacks at the provider boundary. " +
          "Use bunnyHttpTool(...) for an endpoint tool or bunnySandboxTool(...) for a sandbox-local module.",
      );
    }

    toolRefs.push({
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: tool.inputSchema as Record<string, unknown>,
      runtime,
    });
  }

  return toolRefs.length > 0 ? toolRefs : undefined;
}

function getBunnyRuntime(
  tool: LanguageModelV3FunctionTool,
): BunnyToolRuntime | undefined {
  const options = tool.providerOptions?.[BUNNY_PROVIDER_OPTIONS_KEY] as
    | BunnyProviderOptions
    | undefined;
  const runtime = options?.runtime;
  if (!isRecord(runtime) || typeof runtime.type !== "string") {
    return undefined;
  }
  if (runtime.type === "http" && typeof runtime.url === "string") {
    return {
      type: "http",
      url: runtime.url,
      ...(isStringRecord(runtime.headers) ? { headers: runtime.headers } : {}),
    };
  }
  if (runtime.type === "module" && typeof runtime.module === "string") {
    return {
      type: "module",
      module: runtime.module,
      ...(typeof runtime.exportName === "string"
        ? { exportName: runtime.exportName }
        : {}),
    };
  }
  return undefined;
}

function withBunnyProviderOptions(
  providerOptions: Tool<any, any>["providerOptions"],
  bunnyOptions: BunnyProviderOptions,
): Tool<any, any>["providerOptions"] {
  return {
    ...(providerOptions ?? {}),
    [BUNNY_PROVIDER_OPTIONS_KEY]: {
      ...((providerOptions?.[BUNNY_PROVIDER_OPTIONS_KEY] as
        | object
        | undefined) ?? {}),
      ...bunnyOptions,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((entry) => typeof entry === "string");
}
