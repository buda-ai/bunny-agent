import type { AgentMessage, StreamFn } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Context } from "@earendil-works/pi-ai";
import {
  createAssistantMessageEventStream,
  createFauxCore,
  fauxAssistantMessage,
  fauxToolCall,
  InMemoryCredentialStore,
} from "@earendil-works/pi-ai";
import { streamSimple as streamCompletions } from "@earendil-works/pi-ai/api/openai-completions";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import {
  createAgentSession,
  defineTool,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";
import {
  createPiLiveController,
  type SteerableSession,
} from "../live-control.js";

type TestStreamFunction = (
  model: Parameters<StreamFn>[0],
  context: { messages: AgentMessage[] },
  options?: Parameters<StreamFn>[2],
) => Promise<Awaited<ReturnType<StreamFn>>>;
type TestSession = Omit<SteerableSession, "agent"> & {
  agent: Omit<SteerableSession["agent"], "streamFunction"> & {
    streamFunction: TestStreamFunction;
  };
};

/**
 * Minimal fake matching the `SteerableSession` surface for isolated unit
 * tests. `extraStoredDuringHandled`/`extraQueuedCount` simulate an input
 * handler that itself calls `agent.steer()` before `_queueUserInput`
 * resolves — the edge case `_runInputHandlers` makes possible.
 */
function createFakeSession(): {
  session: TestSession;
  queuedUserMessages: AgentMessage[];
  streamCalls: Context[];
  resolveSteer: (outcome: "queued" | "handled") => void;
  rejectSteer: (error: Error) => void;
  setHandlerSideEffect: (count: number) => void;
} {
  const queuedUserMessages: AgentMessage[] = [];
  const streamCalls: Context[] = [];
  let nextOutcome: "queued" | "handled" = "queued";
  let nextError: Error | undefined;
  /** Extra native messages an input handler enqueues before resolving. */
  let handlerSideEffectCount = 0;

  const originalStreamFunction: TestStreamFunction = async (
    _model,
    context,
  ) => {
    streamCalls.push(context as unknown as Context);
    return createAssistantMessageEventStream();
  };

  const session: TestSession = {
    agent: {
      steeringMode: "all",
      steer(message: AgentMessage): void {
        queuedUserMessages.push(message);
      },
      streamFunction: originalStreamFunction,
    },
    async steer(text, images): Promise<"queued" | "handled"> {
      if (nextError) {
        const err = nextError;
        nextError = undefined;
        throw err;
      }
      // Simulate an input handler that queues its own message(s) while
      // `_runInputHandlers` is awaited, before the "handled"/"queued"
      // disposition is known to the caller.
      for (let i = 0; i < handlerSideEffectCount; i++) {
        this.agent.steer({
          role: "user",
          content: [{ type: "text", text: `handler-side-effect-${i}` }],
          timestamp: Date.now(),
        } as AgentMessage);
      }
      const outcome = nextOutcome;
      if (outcome === "queued") {
        const content: Array<{ type: "text"; text: string }> = [
          { type: "text", text },
        ];
        this.agent.steer({
          role: "user",
          content: images ? [...content, ...images] : content,
          timestamp: Date.now(),
        } as AgentMessage);
      }
      return outcome;
    },
  };

  return {
    session,
    queuedUserMessages,
    streamCalls,
    resolveSteer: (outcome) => {
      nextOutcome = outcome;
    },
    rejectSteer: (error) => {
      nextError = error;
    },
    setHandlerSideEffect: (count) => {
      handlerSideEffectCount = count;
    },
  };
}

describe("createPiLiveController", () => {
  it("omits an interrupted assistant without nonempty real text instead of fabricating a boundary", async () => {
    const { session, streamCalls } = createFakeSession();
    const controller = createPiLiveController(session);
    const interrupted = fauxAssistantMessage(
      [{ type: "text", text: "  " }, fauxToolCall("unstarted", {})],
      { stopReason: "aborted" },
    );
    try {
      await session.agent.streamFunction(
        {} as any,
        { messages: [interrupted] },
        undefined,
      );
      expect(streamCalls[0].messages).toEqual([]);
      expect(interrupted.stopReason).toBe("aborted");
      expect(interrupted.content).toHaveLength(2);
    } finally {
      controller.dispose();
    }
  });

  it("preempts a provider whose async startup ignores abort and closes its late stream", async () => {
    const { session, queuedUserMessages } = createFakeSession();
    let release!: (
      stream: ReturnType<typeof createAssistantMessageEventStream>,
    ) => void;
    const pending = new Promise<
      ReturnType<typeof createAssistantMessageEventStream>
    >((resolve) => {
      release = resolve;
    });
    session.agent.streamFunction = (() => pending) as TestStreamFunction;
    const controller = createPiLiveController(session);
    const consumed: string[] = [];
    controller.onConsumed((id) => consumed.push(id));
    const parent = new AbortController();
    const first = session.agent.streamFunction(
      {} as Parameters<StreamFn>[0],
      { messages: [] },
      { signal: parent.signal },
    );
    await controller.steer({ id: "async-start", text: "new direction" });
    expect((await (await first).result()).stopReason).toBe("aborted");
    expect(parent.signal.aborted).toBe(false);
    const late = createAssistantMessageEventStream();
    release(late);
    expect((await late.result()).stopReason).toBe("aborted");
    expect(queuedUserMessages).toHaveLength(1);
    expect(consumed).toEqual([]);
    controller.dispose();
  });

  it("does not keep preempting after transformed context silently drops an accepted message", async () => {
    const { session } = createFakeSession();
    const sources: ReturnType<typeof createAssistantMessageEventStream>[] = [];
    const signals: AbortSignal[] = [];
    session.agent.streamFunction = (async (_model, _context, options) => {
      const source = createAssistantMessageEventStream();
      sources.push(source);
      signals.push(options!.signal!);
      return source;
    }) as TestStreamFunction;
    const controller = createPiLiveController(session);
    const consumed: string[] = [];
    controller.onConsumed((id) => consumed.push(id));
    await controller.steer({ id: "filtered", text: "dropped by extension" });
    const first = await session.agent.streamFunction(
      {} as Parameters<StreamFn>[0],
      {
        messages: [],
      },
    );
    expect((await first.result()).stopReason).toBe("aborted");
    const second = await session.agent.streamFunction(
      {} as Parameters<StreamFn>[0],
      {
        messages: [],
      },
    );
    expect(signals[1].aborted).toBe(false);
    const message = fauxAssistantMessage("natural completion");
    sources[1].push({ type: "done", reason: "stop", message });
    expect((await second.result()).stopReason).toBe("stop");
    expect(consumed).toEqual([]);
    controller.dispose();
  });

  it("forces one-at-a-time native steering mode", () => {
    const { session } = createFakeSession();
    createPiLiveController(session);
    expect(session.agent.steeringMode).toBe("one-at-a-time");
  });

  it("reports consumed only once the tagged object appears in a provider-bound context", async () => {
    const { session, queuedUserMessages } = createFakeSession();
    const controller = createPiLiveController(session);

    const consumed: string[] = [];
    controller.onConsumed((id) => consumed.push(id));

    const result = await controller.steer({ id: "m1", text: "steer me" });
    expect(result.disposition).toBe("queued");
    expect(consumed).toEqual([]);
    expect(queuedUserMessages).toHaveLength(1);

    // Simulate the agent loop handing the exact queued object (same
    // reference) to the wrapped streamFunction as part of the final
    // provider-bound context.
    await session.agent
      .streamFunction(
        // biome-ignore lint/suspicious/noExplicitAny: faux model stand-in
        {} as any,
        { messages: [queuedUserMessages[0]] },
        undefined,
      )
      .catch(() => undefined);

    expect(consumed).toEqual(["m1"]);
  });

  it("never attributes an untagged native message to a steer id", async () => {
    const { session } = createFakeSession();
    const controller = createPiLiveController(session);
    const consumed: string[] = [];
    controller.onConsumed((id) => consumed.push(id));

    // A message that was never created through our steer() dispatch (e.g.
    // the initial prompt, or an extension's own steer call) must never be
    // mistaken for a tracked id, even though it shares the same shape.
    const foreignMessage: AgentMessage = {
      role: "user",
      content: [{ type: "text", text: "unrelated" }],
      timestamp: Date.now(),
    };

    await session.agent
      .streamFunction({} as any, { messages: [foreignMessage] }, undefined)
      .catch(() => undefined);

    expect(consumed).toEqual([]);
  });

  it("reports 'handled' without ever emitting 'consumed' for that id", async () => {
    const { session, resolveSteer } = createFakeSession();
    const controller = createPiLiveController(session);
    const consumed: string[] = [];
    controller.onConsumed((id) => consumed.push(id));

    resolveSteer("handled");
    const result = await controller.steer({ id: "m2", text: "/skill:foo" });
    expect(result.disposition).toBe("handled");

    // Even if some unrelated message later flows through streamFunction,
    // "m2" must never fire — there was no native message object for it.
    await session.agent
      .streamFunction(
        {} as any,
        {
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: "other" }],
              timestamp: Date.now(),
            },
          ],
        },
        undefined,
      )
      .catch(() => undefined);

    expect(consumed).toEqual([]);
  });

  it("rejects when the native steer call throws", async () => {
    const { session, rejectSteer } = createFakeSession();
    const controller = createPiLiveController(session);
    rejectSteer(new Error("boom"));

    const result = await controller.steer({ id: "m3", text: "x" });
    expect(result).toEqual({ disposition: "rejected", reason: "boom" });
  });

  it("rejects new steer calls after dispose and restores the original functions", async () => {
    const { session } = createFakeSession();
    const originalSteer = session.agent.steer;
    const originalStreamFunction = session.agent.streamFunction;
    const controller = createPiLiveController(session);

    expect(session.agent.steer).not.toBe(originalSteer);
    expect(session.agent.streamFunction).not.toBe(originalStreamFunction);

    controller.dispose();

    expect(session.agent.steer).toBe(originalSteer);
    expect(session.agent.streamFunction).toBe(originalStreamFunction);

    const result = await controller.steer({ id: "m4", text: "x" });
    expect(result).toEqual({
      disposition: "rejected",
      reason: "controller disposed",
    });
  });

  it("does not attribute one pending id's object to a different pending id", async () => {
    const { session, queuedUserMessages } = createFakeSession();
    const controller = createPiLiveController(session);
    const consumed: string[] = [];
    controller.onConsumed((id) => consumed.push(id));

    await controller.steer({ id: "a", text: "first" });
    await controller.steer({ id: "b", text: "second" });
    expect(queuedUserMessages).toHaveLength(2);

    // Only the object tagged for "b" appears; "a" must stay unresolved.
    await session.agent
      .streamFunction(
        {} as any,
        { messages: [queuedUserMessages[1]] },
        undefined,
      )
      .catch(() => undefined);

    expect(consumed).toEqual(["b"]);
  });

  it("never attributes consumption when an input handler queues its own message during 'handled'", async () => {
    const { session, resolveSteer, setHandlerSideEffect, queuedUserMessages } =
      createFakeSession();
    const controller = createPiLiveController(session);
    const consumed: string[] = [];
    controller.onConsumed((id) => consumed.push(id));

    // The input handler queues a message of its own, then resolves
    // "handled" for our text — the exact race the dispatch-capture design
    // must not misattribute.
    setHandlerSideEffect(1);
    resolveSteer("handled");
    const result = await controller.steer({ id: "m5", text: "/skill:x" });
    expect(result.disposition).toBe("handled");
    expect(queuedUserMessages).toHaveLength(1);

    await session.agent
      .streamFunction(
        {} as any,
        { messages: [queuedUserMessages[0]] },
        undefined,
      )
      .catch(() => undefined);

    // The handler's own message must never resolve "m5" as consumed.
    expect(consumed).toEqual([]);
  });

  it("does not attribute consumption to any candidate when a dispatch produces more than one native message", async () => {
    const { session, setHandlerSideEffect, queuedUserMessages } =
      createFakeSession();
    const controller = createPiLiveController(session);
    const consumed: string[] = [];
    controller.onConsumed((id) => consumed.push(id));

    // One extra message from a handler plus our own queued message means
    // two candidates were captured for this one dispatch — ambiguous, so
    // neither may be attributed to "m6".
    setHandlerSideEffect(1);
    const result = await controller.steer({ id: "m6", text: "steer me" });
    expect(result.disposition).toBe("queued");
    expect(queuedUserMessages).toHaveLength(2);

    for (const message of queuedUserMessages) {
      await session.agent
        .streamFunction({} as any, { messages: [message] }, undefined)
        .catch(() => undefined);
    }

    expect(consumed).toEqual([]);
  });

  it("does not confuse two pending ids with identical steered text", async () => {
    const { session, queuedUserMessages } = createFakeSession();
    const controller = createPiLiveController(session);
    const consumed: string[] = [];
    controller.onConsumed((id) => consumed.push(id));

    // Same text, two different ids: a text-based correlation strategy would
    // conflate these; the marker is keyed on (controllerNonce, stableId),
    // not content, so it must not.
    await controller.steer({ id: "dup-a", text: "same text" });
    await controller.steer({ id: "dup-b", text: "same text" });
    expect(queuedUserMessages).toHaveLength(2);

    await session.agent
      .streamFunction(
        {} as any,
        { messages: [queuedUserMessages[0]] },
        undefined,
      )
      .catch(() => undefined);
    expect(consumed).toEqual(["dup-a"]);

    await session.agent
      .streamFunction(
        {} as any,
        { messages: [queuedUserMessages[1]] },
        undefined,
      )
      .catch(() => undefined);
    expect(consumed).toEqual(["dup-a", "dup-b"]);
  });

  it("does not confuse two pending image-only messages with different stableIds", async () => {
    const { session, queuedUserMessages } = createFakeSession();
    const controller = createPiLiveController(session);
    const consumed: string[] = [];
    controller.onConsumed((id) => consumed.push(id));

    await controller.steer({
      id: "img-a",
      text: "look",
      images: [{ data: "AAAA", mimeType: "image/png" }],
    });
    await controller.steer({
      id: "img-b",
      text: "look",
      images: [{ data: "AAAA", mimeType: "image/png" }],
    });
    expect(queuedUserMessages).toHaveLength(2);

    await session.agent
      .streamFunction(
        {} as any,
        { messages: [queuedUserMessages[1]] },
        undefined,
      )
      .catch(() => undefined);
    expect(consumed).toEqual(["img-b"]);
    expect(consumed).not.toContain("img-a");
  });

  it("correlates through a context that rewrites message text (extension transform)", async () => {
    const { session, queuedUserMessages } = createFakeSession();
    const controller = createPiLiveController(session);
    const consumed: string[] = [];
    controller.onConsumed((id) => consumed.push(id));

    await controller.steer({ id: "transformed-1", text: "original text" });
    expect(queuedUserMessages).toHaveLength(1);

    // Simulate an extension's `context` handler rewriting the message's
    // content in place (same object, edited `content`) before the final
    // provider-bound context is built — the marker travels on the object
    // independent of content.
    const native = queuedUserMessages[0] as unknown as {
      content: Array<{ type: "text"; text: string }>;
    };
    native.content = [{ type: "text", text: "rewritten by extension" }];

    await session.agent
      .streamFunction(
        {} as any,
        { messages: [queuedUserMessages[0]] },
        undefined,
      )
      .catch(() => undefined);

    expect(consumed).toEqual(["transformed-1"]);
  });

  it("never reports consumed when the final context drops the controlled message", async () => {
    const { session, queuedUserMessages } = createFakeSession();
    const controller = createPiLiveController(session);
    const consumed: string[] = [];
    controller.onConsumed((id) => consumed.push(id));

    await controller.steer({ id: "dropped-1", text: "x" });
    expect(queuedUserMessages).toHaveLength(1);

    // Simulate compaction/a misbehaving extension that silently drops the
    // controlled message from the final provider-bound context.
    await session.agent
      .streamFunction(
        {} as any,
        {
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: "unrelated replacement" }],
              timestamp: Date.now(),
            },
          ],
        },
        undefined,
      )
      .catch(() => undefined);

    expect(consumed).toEqual([]);
  });

  it("strips the marker from the sanitized copy without mutating the native message object", async () => {
    const { session, queuedUserMessages } = createFakeSession();
    const streamed: unknown[] = [];
    session.agent.streamFunction = ((_model: any, context: any) => {
      streamed.push(context.messages[0]);
      return Promise.reject(new Error("fake provider, not reached"));
    }) as any;

    const controller = createPiLiveController(session);
    const consumed: string[] = [];
    controller.onConsumed((id) => consumed.push(id));

    await controller.steer({ id: "strip-1", text: "x" });
    expect(queuedUserMessages).toHaveLength(1);

    await session.agent
      .streamFunction(
        {} as any,
        { messages: [queuedUserMessages[0]] },
        undefined,
      )
      .catch(() => undefined);

    const sentToProvider = streamed[0] as Record<string, unknown>;
    expect(sentToProvider.__bunnyLiveControl).toBeUndefined();
    // The native object itself (as captured) keeps the marker — only the
    // array element forwarded to the provider is sanitized.
    expect(
      (queuedUserMessages[0] as unknown as Record<string, unknown>)
        .__bunnyLiveControl,
    ).toBeDefined();
  });

  it("never reports consumed when the real stream function throws synchronously", async () => {
    const { session, queuedUserMessages } = createFakeSession();
    session.agent.streamFunction = (() => {
      throw new Error("synchronous provider failure");
    }) as unknown as TestStreamFunction;
    const controller = createPiLiveController(session);
    const consumed: string[] = [];
    controller.onConsumed((id) => consumed.push(id));

    await controller.steer({ id: "throw-1", text: "x" });
    expect(queuedUserMessages).toHaveLength(1);

    expect(() =>
      session.agent.streamFunction(
        {} as any,
        { messages: [queuedUserMessages[0]] },
        undefined,
      ),
    ).toThrow("synchronous provider failure");

    expect(consumed).toEqual([]);
  });

  it("never reports consumed when the real stream function returns a rejected promise", async () => {
    const { session, queuedUserMessages } = createFakeSession();
    session.agent.streamFunction = (async () => {
      throw new Error("async provider failure");
    }) as unknown as TestStreamFunction;
    const controller = createPiLiveController(session);
    const consumed: string[] = [];
    controller.onConsumed((id) => consumed.push(id));

    await controller.steer({ id: "reject-1", text: "x" });
    expect(queuedUserMessages).toHaveLength(1);

    await expect(
      session.agent.streamFunction(
        {} as any,
        { messages: [queuedUserMessages[0]] },
        undefined,
      ),
    ).rejects.toThrow("async provider failure");

    expect(consumed).toEqual([]);
  });

  it("treats a provider call racing ahead of the async steer() disposition as a sighting, not a consumption", async () => {
    const { session, queuedUserMessages } = createFakeSession();
    const controller = createPiLiveController(session);
    const consumed: string[] = [];
    controller.onConsumed((id) => consumed.push(id));

    const originalSteer = session.steer.bind(session);
    let releaseDisposition!: () => void;
    const dispositionGate = new Promise<void>((resolve) => {
      releaseDisposition = resolve;
    });
    session.steer = async (...args) => {
      const outcome = await originalSteer(...args);
      await dispositionGate;
      return outcome;
    };
    const steerPromise = controller.steer({ id: "race-1", text: "x" });
    expect(queuedUserMessages).toHaveLength(1);
    await session.agent.streamFunction(
      {} as any,
      { messages: structuredClone(queuedUserMessages) },
      undefined,
    );
    expect(consumed).toEqual([]);
    releaseDisposition();
    const result = await steerPromise;
    expect(result.disposition).toBe("queued");
    expect(consumed).toEqual(["race-1"]);
    // Later model calls still strip retained transcript metadata without
    // producing another consumed receipt.
    await session.agent.streamFunction(
      {} as any,
      { messages: structuredClone(queuedUserMessages) },
      undefined,
    );
    expect(consumed).toEqual(["race-1"]);
  });

  it("strips retained metadata on every later provider request without mutating native contexts", async () => {
    const { session, queuedUserMessages, streamCalls } = createFakeSession();
    const controller = createPiLiveController(session);
    const consumed: string[] = [];
    controller.onConsumed((id) => consumed.push(id));
    await controller.steer({ id: "retained", text: "steer once" });
    for (let turn = 0; turn < 3; turn++) {
      const context = { messages: structuredClone(queuedUserMessages) };
      await session.agent.streamFunction({} as any, context as any, undefined);
      expect((context.messages[0] as any).__bunnyLiveControl).toBeDefined();
      expect(JSON.stringify(streamCalls[turn])).not.toContain(
        "__bunnyLiveControl",
      );
    }
    expect(consumed).toEqual(["retained"]);
  });

  it("does not consume a handler's message observed before the handled disposition", async () => {
    const { session, queuedUserMessages, resolveSteer, setHandlerSideEffect } =
      createFakeSession();
    resolveSteer("handled");
    setHandlerSideEffect(1);
    const originalSteer = session.steer.bind(session);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    session.steer = async (...args) => {
      const result = await originalSteer(...args);
      await gate;
      return result;
    };
    const controller = createPiLiveController(session);
    const consumed: string[] = [];
    controller.onConsumed((id) => consumed.push(id));
    const delivery = controller.steer({
      id: "handled-race",
      text: "intercepted",
    });
    await session.agent.streamFunction(
      {} as any,
      { messages: structuredClone(queuedUserMessages) } as any,
      undefined,
    );
    expect(consumed).toEqual([]);
    release();
    expect(await delivery).toEqual({ disposition: "handled" });
    expect(consumed).toEqual([]);
  });

  it("leaves an exception after native enqueue ambiguous for the host", async () => {
    const { session } = createFakeSession();
    const originalSteer = session.steer.bind(session);
    session.steer = async (...args) => {
      await originalSteer(...args);
      throw new Error("handler failed after enqueue");
    };
    const controller = createPiLiveController(session);
    await expect(
      controller.steer({ id: "ambiguous", text: "maybe queued" }),
    ).rejects.toThrow("handler failed after enqueue");
  });

  it("invokes onFirstStreamInvocation exactly once, on the first streamFunction call", async () => {
    const { session, queuedUserMessages } = createFakeSession();
    let readyCount = 0;
    const controller = createPiLiveController(session, () => {
      readyCount++;
    });
    expect(readyCount).toBe(0);

    await session.agent
      .streamFunction({} as any, { messages: [] }, undefined)
      .catch(() => undefined);
    expect(readyCount).toBe(1);

    await controller.steer({ id: "ready-1", text: "x" });
    await session.agent
      .streamFunction(
        {} as any,
        { messages: [queuedUserMessages[0]] },
        undefined,
      )
      .catch(() => undefined);
    expect(readyCount).toBe(1);
  });

  it("does not clobber a later wrapper installed after dispose, and restores steeringMode", async () => {
    const { session } = createFakeSession();
    session.agent.steeringMode = "all";
    const controller = createPiLiveController(session);
    expect(session.agent.steeringMode).toBe("one-at-a-time");

    controller.dispose();
    expect(session.agent.steeringMode).toBe("all");

    // Simulate a second, later wrapper installed on top of the (now
    // restored) originals after this controller disposed.
    const laterSteer = session.agent.steer;
    const laterStreamFunction = session.agent.streamFunction;
    session.agent.steer = ((message: AgentMessage) =>
      laterSteer(message)) as any;
    session.agent.streamFunction = ((...args: Parameters<StreamFn>) =>
      laterStreamFunction(...args)) as any;
    const laterWrappedSteer = session.agent.steer;
    const laterWrappedStreamFunction = session.agent.streamFunction;

    // Disposing again must be a no-op (already disposed) and must not touch
    // the later wrapper.
    controller.dispose();
    expect(session.agent.steer).toBe(laterWrappedSteer);
    expect(session.agent.streamFunction).toBe(laterWrappedStreamFunction);
  });
});

describe("createPiLiveController integration (real AgentSession + faux provider)", () => {
  it("preempts two unfinished text generations within the same native prompt and fences late deltas", async () => {
    const faux = createFauxCore({
      api: "faux-preempt",
      provider: "faux-preempt",
      models: [{ id: "faux-model", contextWindow: 20_000, maxTokens: 2_000 }],
    });
    faux.setResponses([fauxAssistantMessage("new-direction-done")]);
    const contexts: Context[] = [];
    const signals: AbortSignal[] = [];
    const hangingStreams: ReturnType<
      typeof createAssistantMessageEventStream
    >[] = [];
    const partials: AssistantMessage[] = [];
    let unstartedToolExecutions = 0;
    const modelRuntime = await ModelRuntime.create({
      modelsPath: null,
      allowModelNetwork: false,
      credentials: new InMemoryCredentialStore(),
    });
    modelRuntime.registerProvider("faux-preempt", {
      api: "faux-preempt",
      apiKey: "test-key",
      baseUrl: "http://localhost",
      streamSimple: (model, context, options) => {
        contexts.push(structuredClone(context));
        if (contexts.length > 2)
          return faux.streamSimple(model, context, options);
        signals.push(options!.signal!);
        const stream = createAssistantMessageEventStream();
        const partial = fauxAssistantMessage(
          [
            { type: "text", text: `unfinished-${contexts.length}` },
            fauxToolCall(
              "unstarted_tool",
              {},
              { id: `never-started-${contexts.length}` },
            ),
          ],
          { stopReason: "pending" },
        );
        partials.push(partial);
        hangingStreams.push(stream);
        stream.push({ type: "start", partial });
        stream.push({ type: "text_start", contentIndex: 0, partial });
        stream.push({
          type: "text_delta",
          contentIndex: 0,
          delta: `unfinished-${contexts.length}`,
          partial,
        });
        // Deliberately ignore the provider signal: the controller must still
        // resume Pi and prevent late old-generation events from entering it.
        return stream;
      },
      models: [
        {
          id: "faux-model",
          name: "faux-model",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 20_000,
          maxTokens: 2_000,
        },
      ],
    });
    const { session } = await createAgentSession({
      cwd: "/tmp",
      model: modelRuntime.getModel("faux-preempt", "faux-model"),
      modelRuntime,
      sessionManager: SessionManager.inMemory("/tmp"),
      settingsManager: SettingsManager.inMemory({
        retry: { enabled: false },
        compaction: { enabled: false },
      }),
      noTools: "builtin",
      customTools: [
        defineTool({
          name: "unstarted_tool",
          label: "unstarted_tool",
          description: "Must not execute a partial call",
          parameters: Type.Object({}),
          execute: async () => {
            unstartedToolExecutions++;
            return {
              content: [{ type: "text", text: "unexpected" }],
              details: undefined,
            };
          },
        }),
      ],
    });
    const sessionId = session.sessionId;
    const consumed: string[] = [];
    const updates: string[] = [];
    const completions: AssistantMessage[] = [];
    const events: string[] = [];
    const waits = [0, 1].map(() => {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      return { promise, resolve };
    });
    const unsubscribe = session.subscribe((event) => {
      events.push(JSON.stringify(event));
      if (
        event.type === "message_update" &&
        event.assistantMessageEvent.type === "text_delta"
      ) {
        updates.push(event.assistantMessageEvent.delta);
        if (updates.length <= 2) waits[updates.length - 1].resolve();
      }
      if (event.type === "message_end" && event.message.role === "assistant")
        completions.push(event.message);
    });
    const controller = createPiLiveController(session);
    controller.onConsumed((id) => consumed.push(id));
    try {
      const prompt = session.prompt("start a long response");
      await Promise.race([
        waits[0].promise,
        prompt.then(() => {
          throw new Error(`Prompt settled before text: ${events.join("\n")}`);
        }),
      ]);
      expect(
        await controller.steer({ id: "first", text: "change direction once" }),
      ).toEqual({ disposition: "queued" });
      await waits[1].promise;
      // The old source remains alive and even mutates its partial object.
      partials[0].content = [{ type: "text", text: "LATE-OLD" }];
      hangingStreams[0].push({
        type: "text_delta",
        contentIndex: 0,
        delta: "LATE-OLD",
        partial: partials[0],
      });
      expect(
        await controller.steer({
          id: "second",
          text: "change direction twice",
        }),
      ).toEqual({ disposition: "queued" });
      await prompt;
      expect(contexts).toHaveLength(3);
      expect(signals.every((signal) => signal.aborted)).toBe(true);
      expect(JSON.stringify(contexts[1])).toContain("change direction once");
      expect(JSON.stringify(contexts[1])).toContain("unfinished-1");
      expect(JSON.stringify(contexts[2])).toContain("change direction twice");
      expect(JSON.stringify(contexts)).not.toContain("__bunnyLiveControl");
      expect(JSON.stringify(contexts.slice(1))).not.toContain("never-started-");
      // Exercise Pi's real OpenAI serializer and SDK HTTP request path, which
      // otherwise silently drops aborted messages before sending to a gateway.
      let wireMessages: Array<{ role: string; content: unknown }> = [];
      const wireStream = streamCompletions(
        {
          ...modelRuntime.getModel("faux-preempt", "faux-model")!,
          api: "openai-completions",
        },
        normalizeContext(contexts[1]),
        {
          apiKey: "test-key",
          maxRetries: 0,
          fetch: (async (_url, options) => {
            wireMessages = JSON.parse(String(options?.body)).messages;
            return new Response(
              'data: {"id":"test","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
              { headers: { "content-type": "text/event-stream" } },
            );
          }) as typeof globalThis.fetch,
        },
      );
      expect((await wireStream.result()).stopReason).toBe("stop");
      expect(wireMessages.map((message) => message.role)).toEqual([
        "system",
        "user",
        "assistant",
        "user",
      ]);
      expect(wireMessages[2].content).toBe("unfinished-1");
      expect(JSON.stringify(wireMessages[3])).toContain(
        "change direction once",
      );
      expect(JSON.stringify(wireMessages)).not.toContain("never-started-");
      expect(unstartedToolExecutions).toBe(0);
      expect(consumed).toEqual(["first", "second"]);
      expect(completions.map((message) => message.stopReason)).toEqual([
        "aborted",
        "aborted",
        "stop",
      ]);
      expect(JSON.stringify(completions[0])).toContain("unfinished-1");
      expect(JSON.stringify(completions[0])).toContain("never-started-1");
      expect(updates.join("")).not.toContain("LATE-OLD");
      expect(updates.join("")).toContain("new-direction-done");
      expect(session.sessionId).toBe(sessionId);
      expect(session.isIdle).toBe(true);
    } finally {
      controller.dispose();
      unsubscribe();
      session.dispose();
      for (const stream of hangingStreams)
        stream.end(fauxAssistantMessage("late"));
    }
  });

  it("correlates a steer() call injected mid-tool-execution to the next real provider request", async () => {
    const faux = createFauxCore({
      api: "faux-live-control",
      provider: "faux-live-control",
      models: [{ id: "faux-model", contextWindow: 20_000, maxTokens: 2_000 }],
    });

    let controller: ReturnType<typeof createPiLiveController> | undefined;
    const consumedIds: string[] = [];
    let secondTurnSawSteeredText = false;
    let turn = 0;

    const respond = (context: Context): AssistantMessage => {
      turn++;
      if (turn === 1) {
        return fauxAssistantMessage(fauxToolCall("slow_tool", {}), {
          stopReason: "toolUse",
        });
      }
      if (turn === 2) {
        secondTurnSawSteeredText =
          JSON.stringify(context).includes("steer this run");
      }
      return fauxAssistantMessage("done");
    };
    faux.setResponses([
      (context) => respond(context),
      (context) => respond(context),
      (context) => respond(context),
    ]);

    const modelRuntime = await ModelRuntime.create({
      modelsPath: null,
      allowModelNetwork: false,
      credentials: new InMemoryCredentialStore(),
    });
    modelRuntime.registerProvider("faux-live-control", {
      baseUrl: "http://localhost",
      apiKey: "test-key",
      api: "faux-live-control",
      streamSimple: faux.streamSimple,
      models: [
        {
          id: "faux-model",
          name: "faux-model",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 20_000,
          maxTokens: 2_000,
        },
      ],
    });
    const model = modelRuntime.getModel("faux-live-control", "faux-model");
    expect(model).toBeDefined();

    const sessionManager = SessionManager.inMemory("/tmp");
    const { session } = await createAgentSession({
      cwd: "/tmp",
      model,
      modelRuntime,
      sessionManager,
      settingsManager: SettingsManager.inMemory({ retry: { enabled: false } }),
      noTools: "builtin",
      customTools: [
        defineTool({
          name: "slow_tool",
          label: "slow_tool",
          description: "A tool that steers the run while it executes",
          parameters: Type.Object({}),
          execute: async (_id, _params, signal) => {
            // Controller is registered (by the test, mirroring how
            // pi-runner.ts registers it) before this prompt started, so it
            // is already installed by the time the tool runs.
            const result = await controller!.steer({
              id: "steer-1",
              text: "steer this run",
            });
            expect(result.disposition).toBe("queued");
            expect(signal?.aborted).not.toBe(true);
            return {
              content: [{ type: "text", text: "ok" }],
              details: undefined,
            };
          },
        }),
      ],
    });

    controller = createPiLiveController(session as unknown as SteerableSession);
    controller.onConsumed((id) => consumedIds.push(id));

    try {
      await session.prompt("run the slow tool");
    } finally {
      controller.dispose();
      session.dispose();
    }

    expect(secondTurnSawSteeredText).toBe(true);
    expect(consumedIds).toEqual(["steer-1"]);
  });
});
