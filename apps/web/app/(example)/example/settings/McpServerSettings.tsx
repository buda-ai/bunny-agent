"use client";

import { Plus, Server, Trash2 } from "lucide-react";
import {
  addWebMcpServer,
  createWebMcpServer,
  MAX_WEB_MCP_SERVERS,
  removeWebMcpServer,
  toggleWebMcpServer,
  updateWebMcpServer,
  type WebMcpHeader,
  type WebMcpServer,
} from "../../../../lib/mcp-config";

interface McpServerSettingsProps {
  servers: WebMcpServer[];
  onChange: (servers: WebMcpServer[]) => void;
}

function createHeader(): WebMcpHeader {
  const id =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `header-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, name: "", value: "" };
}

export function McpServerSettings({
  servers,
  onChange,
}: McpServerSettingsProps) {
  const updateServer = (id: string, patch: Partial<WebMcpServer>) => {
    onChange(updateWebMcpServer(servers, id, patch));
  };

  const addServer = () => {
    const existingNames = new Set(
      servers.map((server) => server.name.toLowerCase()),
    );
    let nextIndex = 1;
    while (existingNames.has(`server-${nextIndex}`)) nextIndex += 1;
    const server = {
      ...createWebMcpServer(),
      name: `server-${nextIndex}`,
    };
    onChange(addWebMcpServer(servers, server));
  };

  const updateHeader = (
    server: WebMcpServer,
    headerId: string,
    patch: Partial<WebMcpHeader>,
  ) => {
    updateServer(server.id, {
      headers: server.headers.map((header) =>
        header.id === headerId ? { ...header, ...patch } : header,
      ),
    });
  };

  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Server className="size-5" />
          MCP Servers
        </h2>
        <button
          type="button"
          onClick={addServer}
          disabled={servers.length >= MAX_WEB_MCP_SERVERS}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="size-4" />
          Add server
        </button>
      </div>

      {servers.length === 0 ? (
        <div className="border-y border-border py-8 text-center text-sm text-muted-foreground">
          No MCP servers configured.
        </div>
      ) : (
        <div className="space-y-4">
          {servers.map((server) => (
            <div
              key={server.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">
                    {server.name || "Unnamed server"}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {server.url || "HTTPS endpoint not set"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {server.auth === "bearer"
                      ? "Bearer authentication"
                      : server.auth === "headers"
                        ? "Custom header authentication"
                        : "No authentication"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={server.enabled}
                      onChange={() =>
                        onChange(toggleWebMcpServer(servers, server.id))
                      }
                      className="size-4"
                    />
                    Enabled
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      onChange(removeWebMcpServer(servers, server.id))
                    }
                    className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Delete ${server.name || "MCP server"}`}
                    title="Delete server"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-foreground">
                    Server name
                  </span>
                  <input
                    type="text"
                    value={server.name}
                    maxLength={64}
                    onChange={(event) =>
                      updateServer(server.id, { name: event.target.value })
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="github"
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-foreground">HTTPS URL</span>
                  <input
                    type="url"
                    value={server.url}
                    maxLength={2048}
                    onChange={(event) =>
                      updateServer(server.id, { url: event.target.value })
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="https://mcp.example.com/rpc"
                  />
                </label>
              </div>

              <label className="mt-4 grid gap-1.5 text-sm">
                <span className="font-medium text-foreground">
                  Authentication
                </span>
                <select
                  value={server.auth}
                  onChange={(event) =>
                    updateServer(server.id, {
                      auth: event.target.value as WebMcpServer["auth"],
                    })
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="none">None</option>
                  <option value="bearer">Bearer token</option>
                  <option value="headers">Custom headers</option>
                </select>
              </label>

              {server.auth === "bearer" ? (
                <label className="mt-4 grid gap-1.5 text-sm">
                  <span className="font-medium text-foreground">
                    Bearer token
                  </span>
                  <input
                    type="password"
                    value={server.bearerToken}
                    maxLength={8192}
                    autoComplete="off"
                    onChange={(event) =>
                      updateServer(server.id, {
                        bearerToken: event.target.value,
                      })
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Token"
                  />
                </label>
              ) : null}

              {server.auth === "headers" ? (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between gap-4">
                    <span className="text-sm font-medium text-foreground">
                      Custom headers
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateServer(server.id, {
                          headers: [...server.headers, createHeader()],
                        })
                      }
                      disabled={server.headers.length >= 20}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50"
                    >
                      <Plus className="size-4" />
                      Add header
                    </button>
                  </div>
                  <div className="space-y-2">
                    {server.headers.map((header) => (
                      <div
                        key={header.id}
                        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_36px] gap-2"
                      >
                        <input
                          type="text"
                          value={header.name}
                          maxLength={64}
                          aria-label="Header name"
                          onChange={(event) =>
                            updateHeader(server, header.id, {
                              name: event.target.value,
                            })
                          }
                          className="min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="X-API-Key"
                        />
                        <input
                          type="password"
                          value={header.value}
                          maxLength={4096}
                          autoComplete="off"
                          aria-label={`${header.name || "Custom"} header value`}
                          onChange={(event) =>
                            updateHeader(server, header.id, {
                              value: event.target.value,
                            })
                          }
                          className="min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Value"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateServer(server.id, {
                              headers: server.headers.filter(
                                (candidate) => candidate.id !== header.id,
                              ),
                            })
                          }
                          className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Delete ${header.name || "custom"} header`}
                          title="Delete header"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
