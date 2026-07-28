import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import {
  createAgentSession,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { BunnyAgentResourceLoader } from "../bunny-agent-resource-loader.js";
import { createMcpExtension } from "../mcp-config.js";
import { disposePiSession } from "../pi-runner.js";

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (address == null || typeof address === "string") {
        reject(new Error("MCP fixture did not receive a TCP port"));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

describe("Pi MCP adapter integration", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.allSettled(
      cleanup
        .splice(0)
        .reverse()
        .map((run) => run()),
    );
  });

  it("loads the real adapter, connects over Streamable HTTP, and calls a tool", async () => {
    const sessions = new Map<
      string,
      {
        server: McpServer;
        transport: StreamableHTTPServerTransport;
      }
    >();
    const httpServer = createServer((request, response) => {
      void (async () => {
        const sessionId = request.headers["mcp-session-id"];
        if (typeof sessionId === "string") {
          const session = sessions.get(sessionId);
          if (!session) {
            response.statusCode = 404;
            response.end("Unknown MCP session");
            return;
          }
          await session.transport.handleRequest(request, response);
          return;
        }

        const server = new McpServer({
          name: "bunny-agent-test",
          version: "1.0.0",
        });
        server.registerTool(
          "echo",
          {
            description: "Echo a string",
            inputSchema: { text: z.string() },
          },
          ({ text }) => ({
            content: [{ type: "text", text: `fixture:${text}` }],
          }),
        );
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: randomUUID,
        });
        await server.connect(transport);
        await transport.handleRequest(request, response);
        if (transport.sessionId) {
          sessions.set(transport.sessionId, { server, transport });
        }
      })().catch((error) => {
        response.statusCode = 500;
        response.end(error instanceof Error ? error.message : String(error));
      });
    });
    const port = await listen(httpServer);
    cleanup.push(() => closeServer(httpServer));
    cleanup.push(async () => {
      await Promise.allSettled(
        [...sessions.values()].map((session) => session.server.close()),
      );
      sessions.clear();
    });

    const loader = new BunnyAgentResourceLoader({
      cwd: process.cwd(),
      extensionFactories: [
        createMcpExtension({
          mcpServers: {
            fixture: {
              url: `http://127.0.0.1:${port}/mcp`,
              lifecycle: "lazy",
            },
          },
          settings: {
            hostConfigDiscovery: "off",
            directTools: false,
            autoAuth: false,
            sampling: false,
            elicitation: false,
          },
        }),
      ],
    });
    await loader.reload();

    const { session } = await createAgentSession({
      cwd: process.cwd(),
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(process.cwd()),
      tools: ["mcp"],
    });
    let sessionDisposed = false;
    cleanup.push(async () => {
      if (!sessionDisposed) await disposePiSession(session);
    });
    await session.bindExtensions({ mode: "print" });

    const mcpTool = session.state.tools.find((tool) => tool.name === "mcp");
    expect(mcpTool).toBeDefined();

    const connected = await mcpTool!.execute("connect-fixture", {
      connect: "fixture",
    });
    if (
      connected.details &&
      typeof connected.details === "object" &&
      "error" in connected.details
    ) {
      throw new Error(
        `MCP fixture connection failed: ${JSON.stringify(connected.details)}`,
      );
    }
    expect(connected.details).not.toHaveProperty("error");
    expect(connected.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("fixture"),
        }),
      ]),
    );

    const result = await mcpTool!.execute("call-echo", {
      tool: "fixture_echo",
      server: "fixture",
      args: { text: "hello" },
    });
    expect(result.content).toContainEqual({
      type: "text",
      text: "fixture:hello",
    });

    await disposePiSession(session);
    sessionDisposed = true;

    await expect(mcpTool!.execute("status-after-shutdown", {})).rejects.toThrow(
      /extension ctx is stale/,
    );
  }, 20_000);
});
