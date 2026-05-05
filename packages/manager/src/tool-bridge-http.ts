import { randomBytes } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import type {
  PendingTool,
  ToolBridge,
  ToolGateway,
  ToolGatewayRegistration,
} from "./types.js";
import type { BridgeResponse } from "./tool-bridge-dispatch.js";
import {
  createPendingToolMap,
  dispatchToolBridgePayload,
  parseBridgeJson,
  resolveBridgeAbortSignal,
} from "./tool-bridge-dispatch.js";

export interface HttpToolGatewayOptions {
  /**
   * Absolute URL reachable from the sandbox runner. This can point at an
   * existing application route that calls handleRequest().
   */
  url: string;
  /** Bearer token factory. Generated per registration when omitted. */
  createToken?: () => string;
}

export interface HttpToolGateway extends ToolGateway {
  handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void>;
}

interface RegisteredTools {
  toolMap: Map<string, PendingTool>;
  sessionId: string | undefined;
  signal: AbortSignal | undefined;
}

/**
 * Host-side HTTP gateway that can be mounted on an existing Node HTTP server.
 *
 * register() creates a per-stream bearer token and stores that stream's tools
 * in memory. handleRequest() validates the token, dispatches `{ name, input }`
 * to the matching registered tool, and returns the tool result as response
 * text.
 */
export function createHttpToolGateway(
  options: HttpToolGatewayOptions,
): HttpToolGateway {
  const registrations = new Map<string, RegisteredTools>();

  const register = async (input: {
    tools: PendingTool[];
    sessionId?: string;
    signal?: AbortSignal;
  }): Promise<ToolGatewayRegistration> => {
    const token = options.createToken?.() ?? randomBytes(32).toString("base64url");
    registrations.set(token, {
      toolMap: createPendingToolMap(input.tools),
      sessionId: input.sessionId,
      signal: input.signal,
    });

    let closed = false;
    return {
      bridge: { transport: "http", url: options.url, token },
      async close() {
        if (closed) return;
        closed = true;
        registrations.delete(token);
      },
    };
  };

  return {
    register,
    async handleRequest(req: IncomingMessage, res: ServerResponse) {
      const response = await routeRequest(req, registrations);
      writeResponse(res, response);
    },
  };
}

export interface StandaloneHttpToolGatewayOptions {
  /**
   * Host interface to bind. Defaults to loopback for safety. Use publicUrl when
   * a remote sandbox needs a tunnel or externally reachable callback URL.
   */
  host?: string;
  /** Port to bind. Defaults to 0, letting the OS choose a free port. */
  port?: number;
  /** HTTP path that accepts tool calls. Defaults to "/invoke". */
  path?: string;
  /** URL returned in bridge descriptors when it differs from the bound URL. */
  publicUrl?: string;
  /** Bearer token factory. Generated per registration when omitted. */
  createToken?: () => string;
}

export interface StandaloneHttpToolGateway extends HttpToolGateway {
  url: string;
  close(): Promise<void>;
}

/**
 * Convenience helper for simple deployments and tests. Production applications
 * with an existing HTTP server should usually call createHttpToolGateway() and
 * mount gateway.handleRequest() on their own route.
 */
export async function createStandaloneHttpToolGateway(
  options: StandaloneHttpToolGatewayOptions = {},
): Promise<StandaloneHttpToolGateway> {
  const path = normalizePath(options.path ?? "/invoke");
  let gateway: HttpToolGateway | undefined;

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== path) {
      writeResponse(res, { status: 404, body: "unknown bridge path" });
      return;
    }
    void gateway?.handleRequest(req, res);
  });

  const host = options.host ?? "127.0.0.1";
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const url = options.publicUrl ?? buildLocalUrl(server, host, path);
  gateway = createHttpToolGateway({
    url,
    createToken: options.createToken,
  });

  let closing: Promise<void> | null = null;
  const close = async (): Promise<void> => {
    if (closing) return closing;
    closing = new Promise<void>((resolve) => server.close(() => resolve()));
    return closing;
  };

  return {
    ...gateway,
    url,
    close,
  };
}

async function routeRequest(
  req: IncomingMessage,
  registrations: Map<string, RegisteredTools>,
): Promise<BridgeResponse> {
  if (req.method !== "POST") {
    return { status: 405, body: "method not allowed" };
  }

  const token = readBearerToken(req.headers.authorization);
  if (!token) {
    return { status: 401, body: "unauthorized" };
  }

  const registered = registrations.get(token);
  if (!registered) {
    return { status: 401, body: "unauthorized" };
  }

  let raw = "";
  try {
    raw = await readBody(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 400, body: `request read failed: ${message}` };
  }

  const parsed = parseBridgeJson(raw);
  if (!parsed.ok || parsed.payload === undefined) {
    return parsed.response as BridgeResponse;
  }

  return dispatchToolBridgePayload(
    parsed.payload,
    registered.toolMap,
    resolveBridgeAbortSignal(registered.signal),
    registered.sessionId,
  );
}

function readBearerToken(header: string | undefined): string | null {
  const prefix = "Bearer ";
  return header?.startsWith(prefix) ? header.slice(prefix.length) : null;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function writeResponse(res: ServerResponse, response: BridgeResponse): void {
  if (res.headersSent || res.destroyed) return;
  res.statusCode = response.status;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(response.body);
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function buildLocalUrl(server: Server, host: string, path: string): string {
  const address = server.address() as AddressInfo | null;
  const port = address?.port;
  const hostname =
    host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  return `http://${formatHost(hostname)}:${port}${path}`;
}

function formatHost(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}
