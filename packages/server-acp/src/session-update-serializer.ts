import type { SessionUpdate, StopReason } from "@agentclientprotocol/sdk";
import type { RunnerChunk } from "@bunny-agent/runner-harness";

const asText = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value ?? null);

/**
 * Converts a runner's AI SDK chunk stream into ACP `session/update` payloads.
 *
 * Inverse of the ACP-client mapping in
 * `@bunny-agent/runner-acp`'s `process-runner.ts` (`handleUpdate`), which
 * translates ACP updates into AI SDK chunks for ACP-backed runners.
 */
export class AcpSessionUpdateSerializer {
  private readonly startedTools = new Set<string>();
  private readonly toolTitles = new Map<string, string>();
  private stopReasonValue: StopReason = "end_turn";
  private errorTextValue: string | undefined;

  /** Stop reason for the prompt turn; valid once `serialize()` completes. */
  get stopReason(): StopReason {
    return this.stopReasonValue;
  }

  /** Error text emitted by the runner, if the turn failed. */
  get errorText(): string | undefined {
    return this.errorTextValue;
  }

  async *serialize(
    chunks: AsyncIterable<RunnerChunk>,
  ): AsyncIterable<SessionUpdate> {
    for await (const chunk of chunks) {
      yield* this.convert(chunk);
    }
  }

  private *convert(chunk: RunnerChunk): Iterable<SessionUpdate> {
    switch (chunk.type) {
      case "text-delta": {
        const { id, delta } = chunk as { id: string; delta: string };
        yield {
          sessionUpdate: "agent_message_chunk",
          messageId: id,
          content: { type: "text", text: delta },
        };
        return;
      }

      case "reasoning": {
        const { text } = chunk as { text: string };
        yield {
          sessionUpdate: "agent_thought_chunk",
          content: { type: "text", text },
        };
        return;
      }

      case "tool-input-start": {
        const { toolCallId, toolName } = chunk as {
          toolCallId: string;
          toolName: string;
        };
        yield* this.openToolCall(toolCallId, toolName);
        return;
      }

      case "tool-input-available": {
        const { toolCallId, toolName, input } = chunk as {
          toolCallId: string;
          toolName: string;
          input: unknown;
        };
        yield* this.openToolCall(toolCallId, toolName);
        yield {
          sessionUpdate: "tool_call_update",
          toolCallId,
          status: "in_progress",
          rawInput: input,
        };
        return;
      }

      case "tool-output-available": {
        const { toolCallId, output, isError } = chunk as {
          toolCallId: string;
          output: unknown;
          isError?: boolean;
        };
        yield* this.openToolCall(toolCallId, this.toolTitles.get(toolCallId));
        yield {
          sessionUpdate: "tool_call_update",
          toolCallId,
          status: isError ? "failed" : "completed",
          rawOutput: output,
          content: [
            {
              type: "content",
              content: { type: "text", text: asText(output) },
            },
          ],
        };
        return;
      }

      case "tool-output-error": {
        const { toolCallId, errorText } = chunk as {
          toolCallId: string;
          errorText: string;
        };
        yield* this.openToolCall(toolCallId, this.toolTitles.get(toolCallId));
        yield {
          sessionUpdate: "tool_call_update",
          toolCallId,
          status: "failed",
          rawOutput: errorText,
          content: [
            { type: "content", content: { type: "text", text: errorText } },
          ],
        };
        return;
      }

      case "error": {
        const { errorText } = chunk as { errorText: string };
        this.errorTextValue = errorText;
        this.stopReasonValue = "refusal";
        return;
      }

      case "finish": {
        const { finishReason } = chunk as { finishReason?: string };
        // An `error` chunk already recorded the real cause; don't downgrade it.
        if (this.errorTextValue === undefined) {
          this.stopReasonValue = mapFinishReason(finishReason);
        }
        return;
      }

      // text-start/text-end have no ACP equivalent (agent_message_chunk carries
      // messageId), and tool-input-delta has no incremental-input counterpart.
      default:
        return;
    }
  }

  private *openToolCall(
    toolCallId: string,
    toolName: string | undefined,
  ): Iterable<SessionUpdate> {
    if (this.startedTools.has(toolCallId)) return;
    this.startedTools.add(toolCallId);
    const title = toolName ?? "tool";
    this.toolTitles.set(toolCallId, title);
    yield {
      sessionUpdate: "tool_call",
      toolCallId,
      title,
      status: "pending",
    };
  }
}

function mapFinishReason(finishReason: string | undefined): StopReason {
  switch (finishReason) {
    case "length":
      return "max_tokens";
    case "error":
      return "refusal";
    case "abort":
    case "cancelled":
      return "cancelled";
    default:
      return "end_turn";
  }
}
