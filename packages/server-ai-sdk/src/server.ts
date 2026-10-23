import type * as http from "node:http";
import type { CodingRunServer } from "@bunny-agent/runner-harness";
import {
  bunnyAgentRun,
  codingRunStream,
  type RunRequest,
} from "./coding-run.js";
import {
  handleControlRequest,
  parseControlRequestBody,
} from "./control-route.js";
import {
  LiveRunRegistry,
  type LiveRunRegistryOptions,
} from "./live-run-registry.js";

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
  /**
   * Shared live-control registry. Only set internally by
   * {@link createAiSdkCodingServers} so the run server registers runs into
   * the exact same registry instance the control server reads — passing an
   * independent registry here (or omitting it) disables the live-control
   * channel for this run server (`control` on incoming bodies is ignored).
   */
  controlRegistry?: LiveRunRegistry;
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
    // Never echo any part of the raw body back: a `/api/coding/run` body
    // can carry `control.token`, and no regex/prefix redaction of
    // attacker-controlled JSON can be trusted to catch every encoding of
    // that field. Fixed, static message only.
    throw new Error("Invalid JSON body");
  }
};

/**
 * Serves runner output as an AI SDK UI stream (SSE-framed NDJSON) — the
 * protocol consumed by `@bunny-agent/sdk` and Vercel AI SDK UI clients.
 *
 * Prefer {@link createAiSdkCodingServers} when the host also wants to mount
 * `/api/coding/control` — it returns a run+control pair that share one
 * registry instance. This standalone factory remains supported for hosts
 * that don't need live steering.
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
      await bunnyAgentRun(
        prepared.req,
        res,
        prepared.env,
        options.controlRegistry,
      );
    },

    async handleWebRequest(req: Request): Promise<Response> {
      const body = (await req.json().catch(() => ({}))) as RunRequest;
      const prepared = withEnv(body);
      return codingRunStream(
        prepared.req,
        prepared.env,
        options.controlRegistry,
      );
    },
  };
}

export interface AiSdkCodingControlServerOptions {
  mountPath?: string;
  registry: LiveRunRegistry;
}

/** Serves `POST /api/coding/control` (capabilities/steer/status) against a shared {@link LiveRunRegistry}. */
export function createAiSdkCodingControlServer(
  options: AiSdkCodingControlServerOptions,
): CodingRunServer {
  const { registry } = options;

  return {
    protocol: "ai-sdk-control",
    mountPath: options.mountPath ?? "/api/coding/control",

    async handleNodeHttp(
      req: http.IncomingMessage,
      res: http.ServerResponse,
    ): Promise<void> {
      const raw = await readBody(req);
      const parsed = parseControlRequestBody(raw);
      if (!parsed.ok) {
        res.writeHead(parsed.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(parsed.envelope));
        return;
      }
      const result = await handleControlRequest(registry, parsed.body);
      res.writeHead(result.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result.body));
    },

    async handleWebRequest(req: Request): Promise<Response> {
      const raw = await req.text();
      const parsed = parseControlRequestBody(raw);
      if (!parsed.ok) {
        return Response.json(parsed.envelope, { status: parsed.status });
      }
      const result = await handleControlRequest(registry, parsed.body);
      return Response.json(result.body, { status: result.status });
    },
  };
}

export interface AiSdkCodingServersOptions extends AiSdkCodingRunServerOptions {
  runMountPath?: string;
  controlMountPath?: string;
  /** Durable journal options for the shared registry. See {@link LiveRunRegistryOptions}. */
  registryOptions?: LiveRunRegistryOptions;
}

export interface AiSdkCodingServers {
  run: CodingRunServer;
  control: CodingRunServer;
  registry: LiveRunRegistry;
}

/**
 * Create a `run`+`control` {@link CodingRunServer} pair that share exactly
 * one {@link LiveRunRegistry} instance — the only supported way to get live
 * steering working end-to-end, since the control route must see the same
 * in-memory active-run map the run route populates. Mount both servers'
 * `mountPath`s in the host's router (see `apps/daemon/src/server.ts` and
 * `apps/daemon/src/nextjs.ts`).
 */
export function createAiSdkCodingServers(
  options: AiSdkCodingServersOptions,
): AiSdkCodingServers {
  const registry = new LiveRunRegistry(options.registryOptions);
  const run = createAiSdkCodingRunServer({
    prepareEnv: options.prepareEnv,
    mountPath: options.runMountPath ?? options.mountPath,
    controlRegistry: registry,
  });
  const control = createAiSdkCodingControlServer({
    mountPath: options.controlMountPath,
    registry,
  });
  return { run, control, registry };
}
