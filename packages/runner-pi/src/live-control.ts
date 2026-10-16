import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import type {
  LiveRunController,
  LiveSteerResult,
  RunControlMessage,
} from "@bunny-agent/manager";
import type { AgentMessage, StreamFn } from "@earendil-works/pi-agent-core";
import type { ImageContent, Message } from "@earendil-works/pi-ai";
import type { AgentSession } from "@earendil-works/pi-coding-agent";

type QueuedInputDisposition = Awaited<ReturnType<AgentSession["steer"]>>;

/**
 * Minimal surface of `AgentSession` this module depends on, so unit tests can
 * pass a lightweight fake instead of a real Pi session.
 */
export type SteerableSession = Pick<AgentSession, "steer"> & {
  agent: {
    steer(message: AgentMessage): void;
    streamFunction: StreamFn;
    steeringMode: "all" | "one-at-a-time";
  };
};

/**
 * Own-enumerable-string-key marker `pi-coding-agent`'s `emitContext` carries
 * through `structuredClone(messages)` (its first line, unconditionally —
 * verified against the installed `@earendil-works/pi-coding-agent` sources).
 * `structuredClone` does NOT preserve object identity or `WeakMap`/`Symbol`
 * associations, so this is the only thing that survives from the exact
 * native `{ role: "user", ... }` object `AgentSession.steer()` builds through
 * to the cloned context `convertToLlm`'s `case "user": return m` passes
 * through unchanged into the `Message[]` handed to `Agent.streamFunction`.
 * Deleted from a shallow copy of every message before the real stream
 * function is invoked, so it never reaches the provider payload.
 */
interface LiveControlMarker {
  __bunnyLiveControl?: {
    /** Per-controller random correlation nonce; rejects markers from a different run/controller instance. */
    controllerNonce: string;
    /** Caller-chosen stable id (`RunControlMessage.id`). */
    stableId: string;
  };
}

type MarkedAgentMessage = AgentMessage & LiveControlMarker;

/**
 * Bridges the generic {@link LiveRunController} contract to a real Pi
 * `AgentSession`.
 *
 * Correlation contract: `pi-coding-agent`'s `AgentSession.steer()` eventually
 * calls the low-level `Agent.steer(message: AgentMessage)` synchronously with
 * a freshly built `{ role: "user", content, timestamp }` object. That object
 * then flows through `transformContext` -> `runner.emitContext`, whose first
 * line is `structuredClone(messages)`. Object identity (and therefore any
 * `WeakMap`/`Symbol` tagging) does not survive that clone — only own
 * enumerable string-keyed properties do. This module tags the native message
 * object with such a property (a per-controller random nonce plus the
 * caller's stable id) immediately after capturing it, and looks for that same
 * property (by value, not by reference) on every message in the final
 * provider-bound context passed to the wrapped `streamFunction` — i.e. after
 * `transformContext`/`convertToLlm` ran. The marker is stripped from a
 * shallow copy of any message that carries it before the real stream
 * function is invoked, so it never leaks into the provider request; ordinary
 * content/ordering/tools/options/model are otherwise untouched. The native
 * transcript entry itself (as persisted/replayed by pi-coding-agent) may
 * retain the stableId/nonce as an opaque extra field — this is intentional
 * and is not message text.
 *
 * An `AsyncLocalStorage` capture buffer collects every `agent.steer()` call
 * made while our own `steer()` call (and anything it awaits, including
 * extension input handlers) is on the stack. Attribution only commits when
 * exactly one native `role: "user"` message was captured for that dispatch
 * and the outcome was "queued" — never for "handled", and never when a
 * handler produced zero or multiple candidates, since there would be no
 * reliable way to tell which one is ours. An extension that calls
 * `agent.steer()` on its own and then resolves "handled" for our text must
 * stay "handled" forever, regardless of what it queued.
 *
 * Consumption is reported only when a message carrying the matching marker
 * value is observed inside the final provider-bound context — never from
 * queue-length deltas, `clearQueue()`, or any other shrink-based inference. A
 * final context that silently drops the controlled message (e.g. compaction,
 * a misbehaving extension) must not produce "consumed": it simply stays
 * pending, visible to the host as "accepted" until a later sighting (if any)
 * or run end. If the real stream function throws or rejects, "consumed" is
 * never reported for that invocation's candidates — the model never actually
 * received the request.
 */
export function createPiLiveController(
  session: SteerableSession,
  onFirstStreamInvocation?: () => void,
): LiveRunController {
  const originalSteeringMode = session.agent.steeringMode;
  session.agent.steeringMode = "one-at-a-time";
  const controllerNonce = randomBytes(16).toString("hex");
  type Dispatch = {
    id: string;
    captured: AgentMessage[];
    outcome?: QueuedInputDisposition;
    observed: boolean;
    reported: boolean;
  };
  const dispatchContext = new AsyncLocalStorage<Dispatch>();
  const dispatches = new Map<string, Dispatch>();
  let consumedCallback: ((id: string) => void) | undefined;
  let disposed = false;
  let firstStreamInvocationReported = false;
  const reportIfConfirmed = (dispatch: Dispatch) => {
    if (
      !disposed &&
      dispatch.outcome === "queued" &&
      dispatch.captured.length === 1 &&
      dispatch.observed &&
      !dispatch.reported
    ) {
      dispatch.reported = true;
      consumedCallback?.(dispatch.id);
    }
  };

  const originalAgentSteer = session.agent.steer;
  const installedAgentSteer = (message: AgentMessage): void => {
    const dispatch = dispatchContext.getStore();
    if (dispatch && message.role === "user") {
      dispatch.captured.push(message);
      // Tag before native enqueue: the provider may clone this message
      // before the async input handler returns its queued disposition.
      (message as MarkedAgentMessage).__bunnyLiveControl = {
        controllerNonce,
        stableId: dispatch.id,
      };
    }
    originalAgentSteer.call(session.agent, message);
  };
  session.agent.steer = installedAgentSteer;

  const originalStreamFunction = session.agent.streamFunction;
  const wrappedStreamFunction: StreamFn = (model, context, streamOptions) => {
    const observed = new Set<Dispatch>();
    const sanitizedMessages: Message[] = context.messages.map((candidate) => {
      if (!Object.hasOwn(candidate, "__bunnyLiveControl")) return candidate;
      const { __bunnyLiveControl: marker, ...rest } = candidate as Message &
        LiveControlMarker;
      if (
        marker &&
        marker.controllerNonce === controllerNonce &&
        candidate.role === "user"
      ) {
        const dispatch = dispatches.get(marker.stableId);
        if (dispatch) observed.add(dispatch);
      }
      // Strip our internal field even after consumption or when replaying
      // a transcript from a different controller; never mutate the transcript.
      return rest as Message;
    });
    const providerContext = {
      ...context,
      messages: sanitizedMessages,
    } as typeof context;
    const result = originalStreamFunction.call(
      session.agent,
      model,
      providerContext,
      streamOptions,
    );
    return Promise.resolve(result).then((stream) => {
      if (!disposed && !firstStreamInvocationReported) {
        firstStreamInvocationReported = true;
        onFirstStreamInvocation?.();
      }
      for (const dispatch of observed) {
        dispatch.observed = true;
        reportIfConfirmed(dispatch);
      }
      return stream;
    });
  };
  session.agent.streamFunction = wrappedStreamFunction;

  return {
    async steer(message: RunControlMessage): Promise<LiveSteerResult> {
      if (disposed)
        return { disposition: "rejected", reason: "controller disposed" };
      if (dispatches.has(message.id)) {
        return {
          disposition: "rejected",
          reason: "message id already dispatched",
        };
      }
      const dispatch: Dispatch = {
        id: message.id,
        captured: [],
        observed: false,
        reported: false,
      };
      dispatches.set(message.id, dispatch);
      const images: ImageContent[] | undefined = message.images?.map(
        (image) => ({
          type: "image" as const,
          data: image.data,
          mimeType: image.mimeType,
        }),
      );
      try {
        dispatch.outcome = await dispatchContext.run(dispatch, () =>
          session.steer(message.text, images?.length ? images : undefined),
        );
      } catch (error) {
        // Once anything reached native enqueue, a throwing handler has an
        // ambiguous result. Let the host retain an uncertain receipt.
        if (dispatch.captured.length > 0) throw error;
        return {
          disposition: "rejected",
          reason: error instanceof Error ? error.message : String(error),
        };
      }
      if (dispatch.outcome === "handled") return { disposition: "handled" };
      reportIfConfirmed(dispatch);
      return { disposition: "queued" };
    },
    onConsumed(callback: (id: string) => void): void {
      consumedCallback = callback;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (session.agent.steer === installedAgentSteer)
        session.agent.steer = originalAgentSteer;
      if (session.agent.streamFunction === wrappedStreamFunction)
        session.agent.streamFunction = originalStreamFunction;
      session.agent.steeringMode = originalSteeringMode;
      dispatches.clear();
    },
  };
}
