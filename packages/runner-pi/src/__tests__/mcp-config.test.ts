import { describe, expect, it } from "vitest";
import {
  createMcpExtension,
  McpConfigValidationError,
  shouldEnableMcp,
  validateMcpConfig,
} from "../mcp-config.js";

describe("validateMcpConfig", () => {
  it("accepts and defensively clones HTTP and stdio servers", () => {
    const input = {
      mcpServers: {
        remote: {
          url: "https://mcp.example.com/rpc",
          headers: { "X-Tenant": "tenant-1" },
          auth: "bearer" as const,
          bearerToken: "secret",
          lifecycle: "lazy" as const,
        },
        local: {
          command: "node",
          args: ["server.mjs"],
          env: { TOKEN: "secret" },
          cwd: "/workspace",
        },
      },
      settings: {
        hostConfigDiscovery: "off" as const,
        outputGuard: true,
      },
    };

    const result = validateMcpConfig(input);
    input.mcpServers.remote.headers["X-Tenant"] = "changed";

    expect(result).not.toBe(input);
    expect(result.mcpServers.remote).toMatchObject({
      headers: { "X-Tenant": "tenant-1" },
    });
    expect(result.mcpServers.local).toMatchObject({
      command: "node",
      args: ["server.mjs"],
    });
  });

  it.each([
    {
      label: "mixed transports",
      config: {
        mcpServers: {
          bad: { url: "https://example.com", command: "node" },
        },
      },
    },
    {
      label: "embedded URL credentials",
      config: {
        mcpServers: {
          bad: { url: "https://user:pass@example.com" },
        },
      },
    },
    {
      label: "OAuth",
      config: {
        mcpServers: {
          bad: { url: "https://example.com", auth: "oauth" },
        },
      },
    },
    {
      label: "unsupported fields",
      config: {
        mcpServers: {
          bad: { url: "https://example.com", socket: "/tmp/mcp.sock" },
        },
      },
    },
    {
      label: "missing stdio command",
      config: {
        mcpServers: {
          bad: { command: undefined },
        },
      },
    },
  ])("rejects $label", ({ config }) => {
    expect(() => validateMcpConfig(config)).toThrow(McpConfigValidationError);
  });

  it("caps the server count", () => {
    const mcpServers = Object.fromEntries(
      Array.from({ length: 51 }, (_, index) => [
        `server-${index}`,
        { url: `https://mcp-${index}.example.com` },
      ]),
    );
    expect(() => validateMcpConfig({ mcpServers })).toThrow(
      /at most 50 entries/,
    );
  });
});

describe("Pi MCP extension loading", () => {
  const config = {
    mcpServers: {
      remote: { url: "https://mcp.example.com/rpc" },
    },
  };

  it("requires mcp in an explicit tool allowlist", () => {
    expect(shouldEnableMcp(config, undefined)).toBe(true);
    expect(shouldEnableMcp(config, ["read", "mcp"])).toBe(true);
    expect(shouldEnableMcp(config, ["read", "bash"])).toBe(false);
    expect(shouldEnableMcp(undefined, ["mcp"])).toBe(false);
  });

  it("creates a named inline adapter extension", () => {
    const extension = createMcpExtension(config);
    expect(extension).toMatchObject({ name: "bunny-agent-mcp" });
    expect(typeof (extension as { factory?: unknown }).factory).toBe(
      "function",
    );
  });
});
