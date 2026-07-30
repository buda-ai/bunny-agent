import type { McpConfig } from "@bunny-agent/sdk";

export const MCP_STORAGE_KEY = "bunny-agent-mcp-servers-v1";
export const MCP_CONFIG_UPDATED_EVENT = "bunny-agent-mcp-config-updated";
export const MCP_STORAGE_VERSION = 1;
export const MAX_WEB_MCP_SERVERS = 10;

const MAX_SERVER_NAME_LENGTH = 64;
const MAX_URL_LENGTH = 2_048;
const MAX_HEADERS = 20;
const MAX_HEADER_NAME_LENGTH = 64;
const MAX_HEADER_VALUE_LENGTH = 4_096;
const MAX_BEARER_TOKEN_LENGTH = 8_192;
const SERVER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const FORBIDDEN_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export type WebMcpAuth = "none" | "bearer" | "headers";

export interface WebMcpHeader {
  id: string;
  name: string;
  value: string;
}

export interface WebMcpServer {
  id: string;
  enabled: boolean;
  name: string;
  url: string;
  auth: WebMcpAuth;
  bearerToken: string;
  headers: WebMcpHeader[];
}

interface StoredWebMcpServers {
  version: typeof MCP_STORAGE_VERSION;
  servers: WebMcpServer[];
}

export class WebMcpConfigError extends Error {
  constructor(message: string) {
    super(`Invalid MCP server configuration: ${message}`);
    this.name = "WebMcpConfigError";
  }
}

function createId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createWebMcpServer(): WebMcpServer {
  return {
    id: createId(),
    enabled: false,
    name: "",
    url: "",
    auth: "none",
    bearerToken: "",
    headers: [],
  };
}

export function addWebMcpServer(
  servers: WebMcpServer[],
  server: WebMcpServer = createWebMcpServer(),
): WebMcpServer[] {
  if (servers.length >= MAX_WEB_MCP_SERVERS) return servers;
  return [...servers, server];
}

export function updateWebMcpServer(
  servers: WebMcpServer[],
  id: string,
  patch: Partial<WebMcpServer>,
): WebMcpServer[] {
  return servers.map((server) =>
    server.id === id ? { ...server, ...patch, id: server.id } : server,
  );
}

export function removeWebMcpServer(
  servers: WebMcpServer[],
  id: string,
): WebMcpServer[] {
  return servers.filter((server) => server.id !== id);
}

export function toggleWebMcpServer(
  servers: WebMcpServer[],
  id: string,
): WebMcpServer[] {
  return servers.map((server) =>
    server.id === id ? { ...server, enabled: !server.enabled } : server,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readString(
  value: Record<string, unknown>,
  key: string,
  fallback = "",
): string {
  return typeof value[key] === "string" ? value[key] : fallback;
}

function coerceStoredHeader(value: unknown): WebMcpHeader | null {
  if (!isRecord(value)) return null;
  return {
    id: readString(value, "id") || createId(),
    name: readString(value, "name"),
    value: readString(value, "value"),
  };
}

function coerceStoredServer(value: unknown): WebMcpServer | null {
  if (!isRecord(value)) return null;
  const auth = value.auth;
  const headers = Array.isArray(value.headers)
    ? value.headers
        .slice(0, MAX_HEADERS)
        .map(coerceStoredHeader)
        .filter((header): header is WebMcpHeader => header !== null)
    : [];

  return {
    id: readString(value, "id") || createId(),
    enabled: value.enabled === true,
    name: readString(value, "name"),
    url: readString(value, "url"),
    auth:
      auth === "bearer" || auth === "headers" || auth === "none"
        ? auth
        : "none",
    bearerToken: readString(value, "bearerToken"),
    headers,
  };
}

/**
 * Read both the current versioned object and the pre-version array shape.
 * Invalid entries are dropped and browser data is capped before rendering.
 */
export function parseStoredWebMcpServers(raw: string | null): WebMcpServer[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const servers = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) &&
          parsed.version === MCP_STORAGE_VERSION &&
          Array.isArray(parsed.servers)
        ? parsed.servers
        : [];
    return servers
      .slice(0, MAX_WEB_MCP_SERVERS)
      .map(coerceStoredServer)
      .filter((server): server is WebMcpServer => server !== null);
  } catch {
    return [];
  }
}

export function serializeStoredWebMcpServers(servers: WebMcpServer[]): string {
  const stored: StoredWebMcpServers = {
    version: MCP_STORAGE_VERSION,
    servers: servers.slice(0, MAX_WEB_MCP_SERVERS),
  };
  return JSON.stringify(stored);
}

export function getWebMcpRequestFields(
  runner: string | undefined,
  servers: WebMcpServer[],
): { mcpServers?: WebMcpServer[] } {
  return runner?.toLowerCase() === "pi" ? { mcpServers: servers } : {};
}

function fail(message: string): never {
  throw new WebMcpConfigError(message);
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fail(`${path}.${key} is not supported`);
    }
  }
}

const SERVER_KEYS = new Set([
  "id",
  "enabled",
  "name",
  "url",
  "auth",
  "bearerToken",
  "headers",
]);
const HEADER_KEYS = new Set(["id", "name", "value"]);

function validateHeader(
  value: unknown,
  serverName: string,
  index: number,
): WebMcpHeader {
  const path = `${serverName}.headers[${index}]`;
  if (!isRecord(value)) fail(`${path} must be an object`);
  assertOnlyKeys(value, HEADER_KEYS, path);

  const id = readString(value, "id");
  const name = readString(value, "name").trim();
  const headerValue = readString(value, "value");
  if (
    name.length === 0 ||
    name.length > MAX_HEADER_NAME_LENGTH ||
    !HEADER_NAME_PATTERN.test(name)
  ) {
    fail(`${path}.name is invalid`);
  }
  if (FORBIDDEN_HEADERS.has(name.toLowerCase())) {
    fail(`${path}.name is not allowed`);
  }
  if (
    headerValue.length > MAX_HEADER_VALUE_LENGTH ||
    /[\r\n]/.test(headerValue)
  ) {
    fail(`${path}.value is invalid`);
  }
  return { id: id || createId(), name, value: headerValue };
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^\d+$/.test(part) || Number(part) > 255)
  ) {
    return false;
  }
  const [a, b] = parts.map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.replace(/^\[/, "").replace(/\]$/, "");
  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("::ffff:")
  ) {
    return true;
  }
  const firstPart = normalized.split(":")[0];
  const first = Number.parseInt(firstPart, 16);
  return (
    Number.isNaN(first) ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00
  );
}

function validateRemoteUrl(rawUrl: string, serverName: string): string {
  if (rawUrl.length === 0 || rawUrl.length > MAX_URL_LENGTH) {
    fail(`${serverName}.url is outside the supported length`);
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    fail(`${serverName}.url must be an absolute HTTPS URL`);
  }
  if (url.protocol !== "https:") {
    fail(`${serverName}.url must use HTTPS`);
  }
  if (url.username || url.password) {
    fail(`${serverName}.url must not contain embedded credentials`);
  }

  const hostname = url.hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[/, "")
    .replace(/\]$/, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    isPrivateIpv4(hostname) ||
    (hostname.includes(":") && isPrivateIpv6(hostname))
  ) {
    fail(`${serverName}.url must not target localhost or a private IP`);
  }

  return url.toString();
}

function validateWebMcpServer(value: unknown, index: number): WebMcpServer {
  const path = `servers[${index}]`;
  if (!isRecord(value)) fail(`${path} must be an object`);
  assertOnlyKeys(value, SERVER_KEYS, path);

  const id = readString(value, "id");
  const name = readString(value, "name").trim();
  const rawUrl = readString(value, "url").trim();
  if (!SERVER_NAME_PATTERN.test(name)) {
    fail(
      `${path}.name must be 1-${MAX_SERVER_NAME_LENGTH} letters, numbers, dots, underscores, or hyphens`,
    );
  }
  if (typeof value.enabled !== "boolean") {
    fail(`${path}.enabled must be a boolean`);
  }

  const auth = value.auth;
  if (auth !== "none" && auth !== "bearer" && auth !== "headers") {
    fail(`${path}.auth is not supported`);
  }
  const bearerToken = readString(value, "bearerToken");
  if (bearerToken.length > MAX_BEARER_TOKEN_LENGTH) {
    fail(`${path}.bearerToken is too long`);
  }

  if (!Array.isArray(value.headers) || value.headers.length > MAX_HEADERS) {
    fail(`${path}.headers must contain at most ${MAX_HEADERS} entries`);
  }
  const headers = value.headers.map((header, headerIndex) =>
    validateHeader(header, path, headerIndex),
  );
  const normalizedHeaderNames = headers.map((header) =>
    header.name.toLowerCase(),
  );
  if (new Set(normalizedHeaderNames).size !== normalizedHeaderNames.length) {
    fail(`${path}.headers contains duplicate names`);
  }

  if (value.enabled && auth === "bearer" && bearerToken.length === 0) {
    fail(`${path}.bearerToken is required for bearer auth`);
  }
  const url = value.enabled ? validateRemoteUrl(rawUrl, path) : rawUrl;

  return {
    id: id || createId(),
    enabled: value.enabled,
    name,
    url,
    auth,
    bearerToken,
    headers,
  };
}

export function validateWebMcpServers(input: unknown): WebMcpServer[] {
  if (!Array.isArray(input)) {
    fail("servers must be an array");
  }
  if (input.length > MAX_WEB_MCP_SERVERS) {
    fail(`at most ${MAX_WEB_MCP_SERVERS} servers are allowed`);
  }

  const servers = input.map(validateWebMcpServer);
  const names = servers.map((server) => server.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    fail("server names must be unique");
  }
  return servers;
}

/**
 * Convert public-web input into the trusted runner shape. Disabled servers
 * and their credentials do not cross the sandbox boundary.
 */
export function webMcpServersToConfig(input: unknown): McpConfig | undefined {
  const servers = validateWebMcpServers(input).filter(
    (server) => server.enabled,
  );
  if (servers.length === 0) return undefined;

  return {
    mcpServers: Object.fromEntries(
      servers.map((server) => {
        const headers =
          server.auth === "headers"
            ? Object.fromEntries(
                server.headers.map((header) => [header.name, header.value]),
              )
            : undefined;
        return [
          server.name,
          {
            url: server.url,
            ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
            auth: server.auth === "bearer" ? ("bearer" as const) : false,
            ...(server.auth === "bearer"
              ? { bearerToken: server.bearerToken }
              : {}),
            lifecycle: "lazy" as const,
            directTools: false,
          },
        ];
      }),
    ),
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
  };
}
