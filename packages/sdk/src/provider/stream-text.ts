import {
  asSchema,
  dynamicTool,
  streamText as aiStreamText,
  type Tool,
  type ToolExecutionOptions,
  type ToolSet,
} from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type {
  PendingTool,
  ToolBridge,
  ToolRef,
} from "@bunny-agent/manager";
import type { BunnyAgentProviderSettings } from "./types";

const BUNNY_TOOL_REF_METADATA = Symbol.for("bunny-agent.tool-ref");

type StreamTextParameters<TOOLS extends ToolSet> =
  Parameters<typeof aiStreamText<TOOLS>>[0];

type BunnyToolRefMetadata = {
  spec: Omit<ToolRef, "runtime">;
  runtime:
    | Extract<ToolRef["runtime"], { type: "http" | "module" }>
    | { type: "gateway-pending" };
};

type ToolWithMetadata = Tool<any, any> & {
  [BUNNY_TOOL_REF_METADATA]?: BunnyToolRefMetadata;
};

/**
 * Bunny-aware streamText wrapper. It preserves the AI SDK streamText API while
 * compiling user tools into Bunny tool refs before the AI SDK strips
 * execute functions from provider call options.
 */
export function streamText<
  TOOLS extends ToolSet,
>(
  options: StreamTextParameters<TOOLS>,
): ReturnType<typeof aiStreamText<TOOLS>> {
  if (!options.tools) {
    return aiStreamText(options);
  }

  const compiledToolRefs = compileToolRefs(options.tools);

  const model = options.model as LanguageModelV3 & {
    settings?: BunnyAgentProviderSettings;
  };
  if (!model.settings) {
    throw new Error(
      "[bunny-agent] Bunny streamText can only compile tools for BunnyAgent models.",
    );
  }

  const modelWithToolRefs = Object.assign(
    Object.create(Object.getPrototypeOf(model)),
    model,
    {
      settings: {
        ...model.settings,
        compiledToolRefs,
      },
    },
  ) as TOOLS extends ToolSet ? typeof model : never;
  Object.assign(modelWithToolRefs as object, {
    options: (modelWithToolRefs as typeof model).settings,
  });

  return aiStreamText({
    ...options,
    model: modelWithToolRefs as StreamTextParameters<TOOLS>["model"],
    tools: toDynamicToolSetForBunny(options.tools),
  });
}

export function bunnyHttpTool<INPUT, OUTPUT>(
  input: Omit<Tool<INPUT, OUTPUT>, "execute" | "outputSchema"> & {
    endpoint: {
      url: string;
      headers?: Record<string, string>;
    };
  },
): Tool<INPUT, never> {
  const tool = {
    type: "function" as const,
    description: input.description,
    title: input.title,
    providerOptions: input.providerOptions,
    inputSchema: input.inputSchema,
    inputExamples: input.inputExamples,
    needsApproval: input.needsApproval,
    strict: input.strict,
    onInputStart: input.onInputStart,
    onInputDelta: input.onInputDelta,
    onInputAvailable: input.onInputAvailable,
  } satisfies Tool<INPUT, never>;
  attachRuntimeMetadata(tool, {
    spec: {
      name: "",
      description: input.description ?? "",
      inputSchema: {},
    },
    runtime: {
      type: "http",
      url: input.endpoint.url,
      ...(input.endpoint.headers ? { headers: input.endpoint.headers } : {}),
    },
  });
  return tool;
}

export function bunnySandboxTool<INPUT, OUTPUT>(
  input: Omit<Tool<INPUT, OUTPUT>, "execute" | "outputSchema"> & {
    module: string;
    exportName?: string;
  },
): Tool<INPUT, never> {
  const tool = {
    type: "function" as const,
    description: input.description,
    title: input.title,
    providerOptions: input.providerOptions,
    inputSchema: input.inputSchema,
    inputExamples: input.inputExamples,
    needsApproval: input.needsApproval,
    strict: input.strict,
    onInputStart: input.onInputStart,
    onInputDelta: input.onInputDelta,
    onInputAvailable: input.onInputAvailable,
  } satisfies Tool<INPUT, never>;
  attachRuntimeMetadata(tool, {
    spec: {
      name: "",
      description: input.description ?? "",
      inputSchema: {},
    },
    runtime: {
      type: "module",
      module: input.module,
      ...(input.exportName ? { exportName: input.exportName } : {}),
    },
  });
  return tool;
}

export async function compileToolRefsForBunny(tools: ToolSet | undefined): Promise<
  | {
      toolRefs: ToolRef[];
      pendingTools?: {
        tools: PendingTool[];
        attachBridge(bridge: ToolBridge): void;
      };
    }
  | null
> {
  if (!tools) return null;

  const toolRefs: ToolRef[] = [];
  const pendingTools: PendingTool[] = [];
  const gatewayIndexes: number[] = [];

  for (const [name, tool] of Object.entries(tools)) {
    const spec = {
      name,
      description: tool.description ?? "",
      inputSchema: await toJsonSchema(tool.inputSchema),
    };
    const metadata = (tool as ToolWithMetadata)[BUNNY_TOOL_REF_METADATA];
    if (metadata?.runtime.type === "http" || metadata?.runtime.type === "module") {
      toolRefs.push({ ...spec, runtime: metadata.runtime });
      continue;
    }

    if (typeof tool.execute === "function") {
      const pendingTool: PendingTool = {
        ...spec,
        async execute(input, ctx) {
          return tool.execute?.(input as never, {
            toolCallId: "",
            messages: [],
            abortSignal: ctx.signal,
          } satisfies ToolExecutionOptions);
        },
      };
      gatewayIndexes.push(toolRefs.length);
      pendingTools.push(pendingTool);
      toolRefs.push({
        ...spec,
        runtime: {
          type: "gateway",
          bridge: { transport: "http", url: "pending://gateway", token: "" },
        },
      });
      continue;
    }

    throw new Error(
      `[bunny-agent] Tool "${name}" has no execute function and no Bunny runtime. ` +
        "Use tool({ execute }), bunnyHttpTool(...), or bunnySandboxTool(...).",
    );
  }

  return {
    toolRefs,
    ...(pendingTools.length > 0
      ? {
          pendingTools: {
            tools: pendingTools,
            attachBridge(bridge: ToolBridge) {
              for (const index of gatewayIndexes) {
                toolRefs[index] = {
                  ...toolRefs[index],
                  runtime: { type: "gateway", bridge },
                };
              }
            },
          },
        }
      : {}),
  };
}

const compileToolRefs = compileToolRefsForBunny;

export function toDynamicToolSetForBunny<TOOLS extends ToolSet>(
  tools: TOOLS,
): TOOLS {
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [
      name,
      dynamicTool({
        description: tool.description,
        title: tool.title,
        providerOptions: tool.providerOptions,
        inputSchema: tool.inputSchema,
        needsApproval: tool.needsApproval,
        async execute(input, options) {
          return tool.execute?.(input as never, options) as never;
        },
        toModelOutput: tool.toModelOutput,
      }),
    ]),
  ) as TOOLS;
}

async function toJsonSchema(inputSchema: unknown): Promise<Record<string, unknown>> {
  const schema = asSchema(inputSchema as Parameters<typeof asSchema>[0]);
  return (await schema.jsonSchema) as Record<string, unknown>;
}

function attachRuntimeMetadata(
  tool: Tool<any, never>,
  metadata: BunnyToolRefMetadata,
): void {
  Object.defineProperty(tool, BUNNY_TOOL_REF_METADATA, {
    value: metadata,
    enumerable: false,
  });
}
