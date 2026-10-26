/** A host-mediated decision made before a runner executes a tool. */
export interface ToolInteractionRequest {
  toolCallId: string;
  toolName: string;
  input: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Original native permission presentation, when bridging another ACP agent. */
  permission?: {
    toolCall: Record<string, unknown>;
    options: Array<{ optionId: string; name: string; kind: string }>;
    _meta?: Record<string, unknown>;
  };
}

export type ToolInteractionResponse =
  | {
      behavior: "allow";
      updatedInput?: Record<string, unknown>;
      optionId?: string;
    }
  | { behavior: "deny"; message: string; optionId?: string };

/**
 * In-process hosts may supply this instead of the approval-file bridge. The
 * callback runs at the same authorization boundary as the file bridge, never
 * after the tool has already executed.
 */
export type ToolInteractionHandler = (
  request: ToolInteractionRequest,
) => Promise<ToolInteractionResponse>;
