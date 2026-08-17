import type * as http from "node:http";
import { createNodeHttpHandler } from "@agentclientprotocol/sdk/experimental/node";
import { AcpServer } from "@agentclientprotocol/sdk/experimental/server";
import type { CodingRunServer } from "@bunny-agent/runner-harness";
import {
  type BunnyAgentAcpOptions,
  createBunnyAgentAcpApp,
} from "./acp-agent.js";

export interface AcpHttpServerOptions extends BunnyAgentAcpOptions {
  mountPath?: string;
}

export interface AcpCodingRunServer extends CodingRunServer {
  /** Closes all active ACP connections owned by this server. */
  close(): Promise<void>;
}

/**
 * Serves BunnyAgent runners as an ACP agent over Streamable HTTP, for ACP
 * clients (Zed, JetBrains, ...) connecting to a hosted daemon.
 */
export function createAcpHttpServer(
  options: AcpHttpServerOptions = {},
): AcpCodingRunServer {
  const server = new AcpServer({
    createAgent: () => createBunnyAgentAcpApp(options),
  });
  const nodeHandler = createNodeHttpHandler(server);

  return {
    protocol: "acp",
    mountPath: options.mountPath ?? "/api/coding/acp",

    async handleNodeHttp(
      req: http.IncomingMessage,
      res: http.ServerResponse,
    ): Promise<void> {
      nodeHandler(req, res);
    },

    handleWebRequest(req: Request): Promise<Response> {
      return server.handleRequest(req);
    },

    close(): Promise<void> {
      return server.close();
    },
  };
}
