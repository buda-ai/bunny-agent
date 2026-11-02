import {
  type Api,
  type AssistantMessage,
  type AssistantMessageEventStream,
  createAssistantMessageEventStream,
  type Model,
} from "@earendil-works/pi-ai";

/**
 * Fence one provider generation independently of the lifetime of its Pi run.
 * Closing locally also bounds providers that ignore cancellation: their late
 * events cannot leak into the next generation or mutate the saved partial.
 */
export function fenceGenerationStream(
  source: AssistantMessageEventStream,
  model: Model<Api>,
  signal: AbortSignal,
  onSettled: () => void,
): AssistantMessageEventStream {
  const target = createAssistantMessageEventStream();
  let partial: AssistantMessage | undefined;
  let closed = false;
  const close = () => {
    closed = true;
    signal.removeEventListener("abort", abort);
    onSettled();
  };
  const finishFailure = (error?: unknown) => {
    if (closed) return;
    // Do not retain references that an uncooperative provider can still edit.
    const message: AssistantMessage = partial
      ? structuredClone(partial)
      : {
          role: "assistant",
          content: [],
          api: model.api,
          provider: model.provider,
          model: model.id,
          timestamp: Date.now(),
          stopReason: "aborted",
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              total: 0,
            },
          },
        };
    message.stopReason = error === undefined ? "aborted" : "error";
    // A steering preemption is an interrupted completion, not a failed run.
    if (error === undefined) delete message.errorMessage;
    else
      message.errorMessage =
        error instanceof Error ? error.message : String(error);
    close();
    target.push({ type: "error", reason: message.stopReason, error: message });
    target.end();
    // Release the suspended forwarding iterator even if the provider ignores
    // its abort signal and never emits again. Late source.push calls are no-ops.
    source.end(message);
  };
  const abort = () => finishFailure();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();

  void (async () => {
    try {
      for await (const event of source) {
        if (closed) break;
        if ("partial" in event) partial = event.partial;
        if (event.type === "done" || event.type === "error") {
          close();
          target.push(event);
          target.end();
          return;
        }
        target.push(event);
      }
      if (!closed) {
        const message = await source.result();
        if (closed) return;
        close();
        target.end(message);
      }
    } catch (error) {
      finishFailure(error);
    }
  })();
  return target;
}
