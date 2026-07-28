import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WebMcpServer } from "../../../../lib/mcp-config";
import { McpServerSettings } from "./McpServerSettings";

function createServer(overrides: Partial<WebMcpServer> = {}): WebMcpServer {
  return {
    id: "server-1",
    enabled: true,
    name: "remote",
    url: "https://mcp.example.com/rpc",
    auth: "none",
    bearerToken: "",
    headers: [],
    ...overrides,
  };
}

describe("McpServerSettings", () => {
  it("renders bearer and custom-header secrets as password inputs", () => {
    const html = renderToStaticMarkup(
      <McpServerSettings
        servers={[
          createServer({
            auth: "bearer",
            bearerToken: "bearer-secret",
          }),
          createServer({
            id: "server-2",
            name: "headers",
            auth: "headers",
            headers: [
              {
                id: "header-1",
                name: "X-API-Key",
                value: "header-secret",
              },
            ],
          }),
        ]}
        onChange={() => {}}
      />,
    );

    expect(html.match(/type="password"/g)).toHaveLength(2);
    expect(html).not.toContain('type="text" value="bearer-secret"');
    expect(html).not.toContain('type="text" value="header-secret"');
  });
});
