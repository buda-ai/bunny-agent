import type * as http from "node:http";
import type { CodingRunServer } from "@bunny-agent/runner-harness";
import {
  bunnyAgentRun,
  codingRunStream,
  type RunRequest,
} from "./coding-run.js";

export interface AiSdkCodingRunServerOptions {
  /**
   * Resolves the runner env for a request body. Hosts own env policy (which
   * process vars are inherited, which are request-scoped), so it is injected
   * rather than baked in here.
   */
  prepareEnv(body: RunRequest): {
    env: Record<string, string>;
    systemEnv: Record<string, string> | undefined;
  };
  mountPath?: string;
}

const readBody = (req: http.IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });

const parseBody = (text: string): RunRequest => {
  const trimmed = (text || "").trim();
  if (!trimmed) return {} as RunRequest;
  try {
    return JSON.parse(trimmed) as RunRequest;
  } catch {
    throw new Error(`Invalid JSON body: ${trimmed.slice(0, 120)}`);
  }
};

/**
 * Serves runner output as an AI SDK UI stream (SSE-framed NDJSON) — the
 * protocol consumed by `@bunny-agent/sdk` and Vercel AI SDK UI clients.
 */
export function createAiSdkCodingRunServer(
  options: AiSdkCodingRunServerOptions,
): CodingRunServer {
  const withEnv = (body: RunRequest) => {
    const { env, systemEnv } = options.prepareEnv(body);
    return { req: { ...body, systemEnv }, env };
  };

  return {
    protocol: "ai-sdk",
    mountPath: options.mountPath ?? "/api/coding/run",

    async handleNodeHttp(
      req: http.IncomingMessage,
      res: http.ServerResponse,
    ): Promise<void> {
      let body: RunRequest;
      try {
        body = parseBody(await readBody(req));
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, data: null, error }));
        return;
      }
      const prepared = withEnv(body);
      await bunnyAgentRun(prepared.req, res, prepared.env);
    },

    async handleWebRequest(req: Request): Promise<Response> {
      const body = (await req.json().catch(() => ({}))) as RunRequest;
      const prepared = withEnv(body);
      return codingRunStream(prepared.req, prepared.env);
    },
  };
}
