import { randomUUID } from "node:crypto";
import {
  type AgentApp,
  agent,
  type ContentBlock,
  methods,
  PROTOCOL_VERSION,
  RequestError,
} from "@agentclientprotocol/sdk";
import { createRunner, parseRunnerStream } from "@bunny-agent/runner-harness";
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
}

interface SessionState extends SessionOverrides {
  cwd: string;
  abort?: AbortController;
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

/**
 * ACP's `session/new` has no native runner/model field, so BunnyAgent reads
 * them from the protocol's implementation-defined `_meta` extension, namespaced
 * to avoid colliding with other ACP implementations' metadata.
 */
function readBunnyMeta(
  meta: { [key: string]: unknown } | null | undefined,
): SessionOverrides {
  const scoped = meta?.[BUNNY_META_KEY];
  if (scoped === null || typeof scoped !== "object") return {};
  const value = scoped as Record<string, unknown>;
  return {
    runner: asString(value.runner),
    model: asString(value.model),
    systemPrompt: asString(value.systemPrompt),
    yolo: typeof value.yolo === "boolean" ? value.yolo : undefined,
  };
}

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

    .onRequest(methods.agent.session.prompt, async ({ params, client }) => {
      const session = sessions.get(params.sessionId);
      if (!session) {
        throw RequestError.invalidParams(
          undefined,
          `Unknown session: ${params.sessionId}`,
        );
      }

      const abort = new AbortController();
      session.abort = abort;
      const serializer = new AcpSessionUpdateSerializer();

      try {
        let chunks: ReturnType<typeof parseRunnerStream>;
        try {
          // createRunner dispatches synchronously, so setup failures (an
          // unknown runner from `_meta`, malformed input) land here rather than
          // in the stream. Surfacing them as invalidParams keeps the real
          // reason visible; letting them escape would reach the client as a
          // bare JSON-RPC "Internal error".
          chunks = parseRunnerStream(
            createRunner({
              runner: session.runner ?? options.defaultRunner ?? "claude",
              model: session.model ?? options.defaultModel ?? DEFAULT_MODEL,
              userInput: promptToText(params.prompt),
              systemPrompt: session.systemPrompt,
              cwd: session.cwd,
              yolo: session.yolo ?? options.yolo,
              env: options.env,
              abortController: abort,
              // Caller owns session/resume; don't touch cwd/.bunny-agent state.
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
        session.abort = undefined;
      }

      return { stopReason: serializer.stopReason };
    })

    .onNotification(methods.agent.session.cancel, ({ params }) => {
      sessions.get(params.sessionId)?.abort?.abort();
    });
}
