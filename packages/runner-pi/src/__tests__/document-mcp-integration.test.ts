import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { documentSourcesFromRead } from "@bunny-agent/manager/contracts/document-id";
import {
  createAgentSession,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { BunnyAgentResourceLoader } from "../bunny-agent-resource-loader.js";
import { DocumentSourceRegistry } from "../document-registry.js";
import { createMcpExtension } from "../mcp-config.js";
import { disposePiSession } from "../pi-runner.js";
import { sourceReference } from "../source-registry.js";
import { documentRead } from "./document-fixtures.js";

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

describe("trusted document MCP integration", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.allSettled(
      cleanup
        .splice(0)
        .reverse()
        .map((run) => run()),
    );
  });

  it.each([
    false,
    true,
  ])("accepts only typed successful read receipts through real MCP HTTP (directTools=%s)", async (directTools) => {
    const documents = new DocumentSourceRegistry(
      undefined,
      new Set(["fixture"]),
    );
    const read = documentRead();
    let forbiddenCalls = 0;
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
            structuredContent: { "bunny-agent": { document_read: read } },
          }),
        );
        server.registerTool(
          "resolve_document_source",
          { description: "Private temporary URL resolver", inputSchema: {} },
          () => {
            forbiddenCalls++;
            return {
              content: [
                {
                  type: "text",
                  text: "https://private.example/file?token=never-model-visible",
                },
              ],
            };
          },
        );
        for (const name of [
          "text_only",
          "not_allowed",
          "bad_excerpt",
          "failed_read",
        ]) {
          server.registerTool(
            name,
            { description: name, inputSchema: {} },
            () => ({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    "bunny-agent": { document_read: read },
                  }),
                },
              ],
              ...(name === "text_only"
                ? {}
                : {
                    structuredContent: {
                      "bunny-agent": {
                        document_read:
                          name === "bad_excerpt"
                            ? {
                                ...read,
                                excerpts: [
                                  {
                                    ...read.excerpts[0],
                                    excerpt_hash: `sha256:${"0".repeat(64)}`,
                                  },
                                ],
                              }
                            : read,
                      },
                    },
                  }),
              ...(name === "failed_read" ? { isError: true } : {}),
            }),
          );
        }
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
        createMcpExtension(
          {
            mcpServers: {
              fixture: {
                url: `http://127.0.0.1:${port}/mcp`,
                lifecycle: "lazy",
                documentReadTools: [
                  "echo",
                  "text_only",
                  "bad_excerpt",
                  "failed_read",
                ],
                excludeTools: ["resolve_document_source"],
                directTools,
              },
            },
            settings: {
              hostConfigDiscovery: "off",
              directTools,
              autoAuth: false,
              sampling: false,
              elicitation: false,
            },
          },
          documents,
        ),
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

    const direct = session.state.tools.find(
      (tool) => tool.name === "fixture_echo",
    );
    const result =
      directTools && direct
        ? await direct.execute("call-echo", { text: "hello" })
        : await mcpTool!.execute("call-echo", {
            tool: "fixture_echo",
            server: "fixture",
            args: { text: "hello" },
          });
    expect(result.content).toContainEqual({
      type: "text",
      text: "fixture:hello",
    });

    for (const tool of [
      "fixture_resolve_document_source",
      "fixture.resolve_document_source",
      "resolve_document_source",
    ]) {
      const forbidden = await mcpTool!.execute("forbidden-resolver", {
        tool,
        server: "fixture",
        args: {},
      });
      expect(JSON.stringify(forbidden)).not.toContain("never-model-visible");
      expect(forbiddenCalls).toBe(0);
    }
    const source = documentSourcesFromRead(read, "fixture")[0];
    expect(documents.resolve(source.source_id)?.tool_call_ids).toEqual([
      "call-echo",
    ]);
    for (const tool of [
      "text_only",
      "not_allowed",
      "bad_excerpt",
      "failed_read",
    ]) {
      await mcpTool!.execute(`rejected-${tool}`, {
        tool: `fixture_${tool}`,
        server: "fixture",
        args: {},
      });
    }
    expect(documents.resolve(source.source_id)?.tool_call_ids).toEqual([
      "call-echo",
    ]);
    expect(JSON.stringify(result.content)).toContain(
      sourceReference(source.source_id),
    );
    expect(JSON.stringify(result.content)).not.toContain(source.source_id);
    await disposePiSession(session);
    sessionDisposed = true;

    // pi-mcp-adapter 5.x reports a stale ctx as an init_failed tool result
    // instead of throwing.
    const afterShutdown = await mcpTool!.execute("status-after-shutdown", {});
    expect(afterShutdown.details).toMatchObject({ error: "init_failed" });
    expect(JSON.stringify(afterShutdown.content)).toMatch(
      /extension ctx is stale/,
    );
  }, 30_000);
});
