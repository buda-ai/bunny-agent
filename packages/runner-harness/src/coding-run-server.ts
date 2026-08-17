import type * as http from "node:http";

/**
 * A protocol server that exposes runner output over HTTP. One implementation
 * per wire protocol (AI SDK UI stream, ACP, ...); hosts pick the transport
 * adapter matching their runtime.
 */
export interface CodingRunServer {
  /** Wire protocol this server speaks, e.g. "ai-sdk" or "acp". */
  readonly protocol: string;
  /** Default HTTP path this server is mounted at. */
  readonly mountPath: string;
  /** Node http adapter — used by the standalone daemon. */
  handleNodeHttp(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void>;
  /** Web fetch adapter — used by the Next.js embed. */
  handleWebRequest(req: Request): Promise<Response>;
}
