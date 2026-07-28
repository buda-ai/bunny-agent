import { describe, expect, it } from "vitest";
import {
  addWebMcpServer,
  createWebMcpServer,
  getWebMcpRequestFields,
  parseStoredWebMcpServers,
  removeWebMcpServer,
  serializeStoredWebMcpServers,
  toggleWebMcpServer,
  updateWebMcpServer,
  validateWebMcpServers,
  WebMcpConfigError,
  type WebMcpServer,
  webMcpServersToConfig,
} from "./mcp-config";

function remoteServer(overrides: Partial<WebMcpServer> = {}): WebMcpServer {
  return {
    id: "server-1",
    enabled: true,
    name: "github",
    url: "https://mcp.example.com/rpc",
    auth: "none",
    bearerToken: "",
    headers: [],
    ...overrides,
  };
}

describe("web MCP validation", () => {
  it("normalizes an HTTPS server into locked-down runner config", () => {
    const config = webMcpServersToConfig([
      remoteServer({
        auth: "bearer",
        bearerToken: "secret",
      }),
    ]);

    expect(config).toEqual({
      mcpServers: {
        github: {
          url: "https://mcp.example.com/rpc",
          auth: "bearer",
          bearerToken: "secret",
          lifecycle: "lazy",
          directTools: false,
        },
      },
      settings: {
        hostConfigDiscovery: "off",
        directTools: false,
        disableProxyTool: false,
        autoAuth: false,
        sampling: false,
        samplingAutoApprove: false,
        elicitation: false,
        outputGuard: true,
      },
    });
  });

  it("omits disabled servers and credentials", () => {
    expect(
      webMcpServersToConfig([
        remoteServer({
          enabled: false,
          url: "",
          bearerToken: "disabled-secret",
        }),
      ]),
    ).toBeUndefined();
  });

  it.each([
    ["HTTP", { url: "http://mcp.example.com" }],
    ["embedded credentials", { url: "https://user:pass@example.com" }],
    ["localhost", { url: "https://localhost/rpc" }],
    ["private IPv4", { url: "https://127.0.0.1/rpc" }],
    ["private IPv6", { url: "https://[::1]/rpc" }],
    ["link-local IPv6", { url: "https://[fe80::1]/rpc" }],
  ])("rejects %s targets", (_label, overrides) => {
    expect(() => validateWebMcpServers([remoteServer(overrides)])).toThrow(
      WebMcpConfigError,
    );
  });

  it("rejects command injection and hop-by-hop headers", () => {
    expect(() =>
      validateWebMcpServers([{ ...remoteServer(), command: "node" }]),
    ).toThrow(/command is not supported/);

    expect(() =>
      validateWebMcpServers([
        remoteServer({
          auth: "headers",
          headers: [{ id: "h1", name: "Host", value: "internal" }],
        }),
      ]),
    ).toThrow(/not allowed/);
  });

  it("rejects duplicate server and header names", () => {
    expect(() =>
      validateWebMcpServers([
        remoteServer(),
        remoteServer({ id: "server-2", name: "GitHub" }),
      ]),
    ).toThrow(/unique/);

    expect(() =>
      validateWebMcpServers([
        remoteServer({
          auth: "headers",
          headers: [
            { id: "h1", name: "X-Token", value: "a" },
            { id: "h2", name: "x-token", value: "b" },
          ],
        }),
      ]),
    ).toThrow(/duplicate/);
  });
});

describe("web MCP browser state", () => {
  it("migrates the legacy array shape and serializes version 1", () => {
    const legacy = JSON.stringify([remoteServer()]);
    const parsed = parseStoredWebMcpServers(legacy);
    expect(parsed).toHaveLength(1);

    const stored = JSON.parse(serializeStoredWebMcpServers(parsed));
    expect(stored).toMatchObject({
      version: 1,
      servers: [{ name: "github" }],
    });
  });

  it("supports add, edit, toggle, and delete state transitions", () => {
    const created = createWebMcpServer();
    const added = addWebMcpServer([], created);
    const edited = updateWebMcpServer(added, created.id, {
      name: "github",
      url: "https://mcp.example.com",
    });
    const toggled = toggleWebMcpServer(edited, created.id);
    const removed = removeWebMcpServer(toggled, created.id);

    expect(edited[0]).toMatchObject({
      name: "github",
      url: "https://mcp.example.com",
    });
    expect(toggled[0].enabled).toBe(true);
    expect(removed).toEqual([]);
  });

  it("includes MCP servers only in Pi request bodies", () => {
    const servers = [remoteServer()];

    expect(getWebMcpRequestFields("pi", servers)).toEqual({
      mcpServers: servers,
    });
    expect(getWebMcpRequestFields("PI", servers)).toEqual({
      mcpServers: servers,
    });
    expect(getWebMcpRequestFields("claude", servers)).toEqual({});
    expect(getWebMcpRequestFields(undefined, servers)).toEqual({});
  });
});
