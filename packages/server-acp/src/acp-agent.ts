import { randomUUID } from "node:crypto";
import {
  type AgentApp,
  agent,
  type ContentBlock,
  methods,
  PROTOCOL_VERSION,
  RequestError,
} from "@agentclientprotocol/sdk";
import {
  createRunner,
  parseRunnerStream,
  type RunnerCoreOptions,
  type RunnerToolRef,
} from "@bunny-agent/runner-harness";
import { AcpSessionUpdateSerializer } from "./session-update-serializer.js";

/** Namespace for BunnyAgent fields inside ACP's implementation-defined `_meta`. */
const BUNNY_META_KEY = "bunny-agent";

/** Matches the daemon's AI SDK route default so both protocols behave alike. */
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

export interface BunnyAgentAcpOptions {
  /** Runner used when a session does not select one via `_meta`. */
  defaultRunner?: string;
  /** Model used when a session does not select one via `_meta`. */
  defaultModel?: string;
  /** Working directory used when `session/new` omits one. */
  defaultCwd?: string;
  /** Runner env; hosts pass their own resolved environment. */
  env?: Record<string, string>;
  /** Skip tool approval checks for every session on this server. */
  yolo?: boolean;
}

interface SessionOverrides {
  runner?: string;
  model?: string;
  systemPrompt?: string;
  yolo?: boolean;
  allowedTools?: string[];
  resume?: string;
  forkFrom?: string;
  skillPaths?: string[];
  env?: Record<string, string>;
  systemEnv?: Record<string, string>;
  toolRefs?: RunnerToolRef[];
  mcpConfig?: RunnerCoreOptions["mcpConfig"];
  effort?: string;
  askUserQuestionTimeoutMs?: number;
}

interface TurnOverrides extends SessionOverrides {
  input?: RunnerCoreOptions["input"];
}

interface SessionState extends SessionOverrides {
  cwd: string;
  abort?: AbortController;
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const asStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter(
    (item): item is string => typeof item === "string",
  );
  return strings.length === value.length ? strings : undefined;
};

const asStringRecord = (value: unknown): Record<string, string> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const entries = Object.entries(value);
  if (!entries.every(([, item]) => typeof item === "string")) return undefined;
  return Object.fromEntries(entries) as Record<string, string>;
};

const asObject = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/**
 * ACP's `session/new` has no native runner/model field, so BunnyAgent reads
 * them from the protocol's implementation-defined `_meta` extension, namespaced
 * to avoid colliding with other ACP implementations' metadata.
 */
function readBunnyMeta(
  meta: { [key: string]: unknown } | null | undefined,
): TurnOverrides {
  const scoped = meta?.[BUNNY_META_KEY];
  if (scoped === null || typeof scoped !== "object") return {};
  const value = scoped as Record<string, unknown>;
  return {
    runner: asString(value.runner),
    model: asString(value.model),
    systemPrompt: asString(value.systemPrompt),
    yolo: typeof value.yolo === "boolean" ? value.yolo : undefined,
    allowedTools: asStringArray(value.allowedTools),
    resume: asString(value.resume),
    forkFrom: asString(value.forkFrom),
    skillPaths: asStringArray(value.skillPaths),
    env: asStringRecord(value.env),
    systemEnv: asStringRecord(value.systemEnv),
    toolRefs: Array.isArray(value.toolRefs)
      ? (value.toolRefs as RunnerToolRef[])
      : undefined,
    mcpConfig: asObject(value.mcpConfig) as RunnerCoreOptions["mcpConfig"],
    effort: asString(value.effort),
    askUserQuestionTimeoutMs:
      typeof value.askUserQuestionTimeoutMs === "number" &&
      Number.isFinite(value.askUserQuestionTimeoutMs)
        ? value.askUserQuestionTimeoutMs
        : undefined,
    input: asObject(value.input) as RunnerCoreOptions["input"],
  };
}

const mergeEnv = (
  ...sources: Array<Record<string, string> | undefined>
): Record<string, string> | undefined => {
  const merged = Object.assign({}, ...sources.filter(Boolean));
  return Object.keys(merged).length > 0 ? merged : undefined;
};

const promptToText = (prompt: ContentBlock[]): string =>
  prompt
    .map((block) => (block.type === "text" ? block.text : ""))
    .filter((text) => text.length > 0)
    .join("\n");

/**
 * Builds a transport-agnostic ACP agent that serves BunnyAgent runners.
 * Wire it to a stream with `.connect(...)` — over HTTP for the daemon, or over
 * stdio for the CLI.
 */
export function createBunnyAgentAcpApp(
  options: BunnyAgentAcpOptions = {},
): AgentApp {
  const sessions = new Map<string, SessionState>();

  return agent({ name: "bunny-agent" })
    .onRequest(methods.agent.initialize, () => ({
      protocolVersion: PROTOCOL_VERSION,
      agentCapabilities: { loadSession: false, promptCapabilities: {} },
      agentInfo: { name: "bunny-agent", version: "0.1.0" },
    }))

    .onRequest(methods.agent.session.new, ({ params }) => {
      const sessionId = randomUUID();
      sessions.set(sessionId, {
        cwd: params.cwd ?? options.defaultCwd ?? process.cwd(),
        ...readBunnyMeta(params._meta),
      });
      return { sessionId };
    })

    .onRequest(
      methods.agent.session.prompt,
      async ({ params, client, signal }) => {
        const session = sessions.get(params.sessionId);
        if (!session) {
          throw RequestError.invalidParams(
            undefined,
            `Unknown session: ${params.sessionId}`,
          );
        }

        const abort = new AbortController();
        session.abort = abort;
        const turn = readBunnyMeta(params._meta);
        // Transport-level cancellation — the client disconnecting, or the
        // request being cancelled — must stop the runner too. Without this a
        // dropped editor connection leaves it running on a long-lived daemon.
        const onTransportAbort = () => abort.abort();
        if (signal.aborted) abort.abort();
        else signal.addEventListener("abort", onTransportAbort, { once: true });
        const serializer = new AcpSessionUpdateSerializer();

        try {
          let chunks: ReturnType<typeof parseRunnerStream>;
          try {
            // createRunner dispatches synchronously, so setup failures (an
            // unknown runner from `_meta`, malformed input) land here rather
            // than in the stream. Surfacing them as invalidParams keeps the
            // real reason visible; letting them escape would reach the client
            // as a bare JSON-RPC "Internal error".
            chunks = parseRunnerStream(
              createRunner({
                runner:
                  turn.runner ??
                  session.runner ??
                  options.defaultRunner ??
                  "claude",
                model:
                  turn.model ??
                  session.model ??
                  options.defaultModel ??
                  DEFAULT_MODEL,
                ...(turn.input
                  ? { input: turn.input }
                  : { userInput: promptToText(params.prompt) }),
                systemPrompt: turn.systemPrompt ?? session.systemPrompt,
                cwd: session.cwd,
                yolo: turn.yolo ?? session.yolo ?? options.yolo,
                allowedTools: turn.allowedTools ?? session.allowedTools,
                resume: turn.resume ?? session.resume,
                forkFrom: turn.forkFrom ?? session.forkFrom,
                skillPaths: turn.skillPaths ?? session.skillPaths,
                env: mergeEnv(options.env, session.env, turn.env),
                systemEnv: mergeEnv(session.systemEnv, turn.systemEnv),
                toolRefs: turn.toolRefs ?? session.toolRefs,
                mcpConfig: turn.mcpConfig ?? session.mcpConfig,
                effort: turn.effort ?? session.effort,
                askUserQuestionTimeoutMs:
                  turn.askUserQuestionTimeoutMs ??
                  session.askUserQuestionTimeoutMs,
                abortController: abort,
                // Caller owns session/resume; don't touch cwd/.bunny-agent.
                autoInject: false,
              }),
            );
          } catch (error) {
            throw RequestError.invalidParams(
              undefined,
              error instanceof Error ? error.message : String(error),
            );
          }

          for await (const update of serializer.serialize(chunks)) {
            await client.notify(methods.client.session.update, {
              sessionId: params.sessionId,
              update,
            });
          }
        } finally {
          signal.removeEventListener("abort", onTransportAbort);
          session.abort = undefined;
        }

        const runnerMeta = {
          ...(serializer.sessionId ? { sessionId: serializer.sessionId } : {}),
          ...(serializer.errorText ? { errorText: serializer.errorText } : {}),
        };
        return {
          stopReason: serializer.stopReason,
          ...(serializer.usage ? { usage: serializer.usage } : {}),
          ...(Object.keys(runnerMeta).length > 0
            ? { _meta: { [BUNNY_META_KEY]: runnerMeta } }
            : {}),
        };
      },
    )

    .onNotification(methods.agent.session.cancel, ({ params }) => {
      sessions.get(params.sessionId)?.abort?.abort();
    });
}
