import type {
  ExtensionFactory,
  InlineExtension,
} from "@earendil-works/pi-coding-agent";
import { createJiti } from "jiti";

const MAX_SERVERS = 50;
const MAX_MAP_ENTRIES = 100;
const MAX_ARRAY_ENTRIES = 100;
const MAX_NAME_LENGTH = 128;
const MAX_STRING_LENGTH = 32_768;
const MAX_URL_LENGTH = 4_096;
const MAX_TIMEOUT_MS = 300_000;

export type McpLifecycle = "lazy" | "eager" | "keep-alive";

export interface McpServerOptions {
  lifecycle?: McpLifecycle;
  requestTimeoutMs?: number;
  directTools?: boolean | string[];
  includeTools?: string[];
  excludeTools?: string[];
  exposeResources?: boolean;
  disabled?: boolean;
}

export interface McpHttpServerConfig extends McpServerOptions {
  url: string;
  headers?: Record<string, string>;
  auth?: "bearer" | false;
  bearerToken?: string;
}

export interface McpStdioServerConfig extends McpServerOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export type McpServerConfig = McpHttpServerConfig | McpStdioServerConfig;

export interface McpSettings {
  toolPrefix?: "server" | "none" | "short" | "mcp";
  hostConfigDiscovery?: "off" | "prompt" | "on";
  idleTimeout?: number;
  requestTimeoutMs?: number;
  directTools?: boolean;
  disableProxyTool?: boolean;
  autoAuth?: boolean;
  sampling?: boolean;
  samplingAutoApprove?: boolean;
  elicitation?: boolean;
  outputGuard?: boolean;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
  settings?: McpSettings;
}

export class McpConfigValidationError extends Error {
  constructor(message: string) {
    super(`Invalid MCP config: ${message}`);
    this.name = "McpConfigValidationError";
  }
}

interface McpAdapterModule {
  createMcpAdapter(options?: { config?: McpConfig }): ExtensionFactory;
}

let mcpAdapterModule: McpAdapterModule | undefined;

function getMcpAdapterModule(): McpAdapterModule {
  if (!mcpAdapterModule) {
    const jiti = createJiti(import.meta.url, {
      fsCache: false,
      moduleCache: true,
    });
    mcpAdapterModule = jiti("pi-mcp-adapter") as McpAdapterModule;
  }
  return mcpAdapterModule;
}

function fail(message: string): never {
  throw new McpConfigValidationError(message);
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertAllowedKeys(
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

function assertOptionalBoolean(
  value: Record<string, unknown>,
  key: string,
  path: string,
): void {
  const candidate = value[key];
  if (candidate !== undefined && typeof candidate !== "boolean") {
    fail(`${path}.${key} must be a boolean`);
  }
}

function assertOptionalNumber(
  value: Record<string, unknown>,
  key: string,
  path: string,
  options: { min?: number; max?: number } = {},
): void {
  const candidate = value[key];
  if (candidate === undefined) return;
  if (
    typeof candidate !== "number" ||
    !Number.isFinite(candidate) ||
    candidate < (options.min ?? 0) ||
    candidate > (options.max ?? Number.MAX_SAFE_INTEGER)
  ) {
    fail(`${path}.${key} is outside the supported range`);
  }
}

function assertOptionalString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  options: { min?: number; max?: number } = {},
): void {
  const candidate = value[key];
  if (candidate === undefined) return;
  if (
    typeof candidate !== "string" ||
    candidate.length < (options.min ?? 0) ||
    candidate.length > (options.max ?? MAX_STRING_LENGTH)
  ) {
    fail(`${path}.${key} must be a bounded string`);
  }
}

function assertStringArray(
  candidate: unknown,
  path: string,
): asserts candidate is string[] {
  if (!Array.isArray(candidate) || candidate.length > MAX_ARRAY_ENTRIES) {
    fail(`${path} must be an array with at most ${MAX_ARRAY_ENTRIES} entries`);
  }
  for (const [index, entry] of candidate.entries()) {
    if (
      typeof entry !== "string" ||
      entry.length === 0 ||
      entry.length > MAX_STRING_LENGTH
    ) {
      fail(`${path}[${index}] must be a non-empty bounded string`);
    }
  }
}

function assertOptionalStringArray(
  value: Record<string, unknown>,
  key: string,
  path: string,
): void {
  const candidate = value[key];
  if (candidate !== undefined) {
    assertStringArray(candidate, `${path}.${key}`);
  }
}

function assertStringMap(candidate: unknown, path: string): void {
  if (!isPlainRecord(candidate)) {
    fail(`${path} must be an object`);
  }
  const entries = Object.entries(candidate);
  if (entries.length > MAX_MAP_ENTRIES) {
    fail(`${path} must have at most ${MAX_MAP_ENTRIES} entries`);
  }
  for (const [key, value] of entries) {
    if (
      key.length === 0 ||
      key.length > MAX_NAME_LENGTH ||
      typeof value !== "string" ||
      value.length > MAX_STRING_LENGTH
    ) {
      fail(`${path} contains an invalid key or value`);
    }
  }
}

const COMMON_SERVER_KEYS = new Set([
  "lifecycle",
  "requestTimeoutMs",
  "directTools",
  "includeTools",
  "excludeTools",
  "exposeResources",
  "disabled",
]);

const HTTP_SERVER_KEYS = new Set([
  ...COMMON_SERVER_KEYS,
  "url",
  "headers",
  "auth",
  "bearerToken",
]);

const STDIO_SERVER_KEYS = new Set([
  ...COMMON_SERVER_KEYS,
  "command",
  "args",
  "env",
  "cwd",
]);

function validateCommonServerOptions(
  server: Record<string, unknown>,
  path: string,
): void {
  const lifecycle = server.lifecycle;
  if (
    lifecycle !== undefined &&
    lifecycle !== "lazy" &&
    lifecycle !== "eager" &&
    lifecycle !== "keep-alive"
  ) {
    fail(`${path}.lifecycle is not supported`);
  }

  assertOptionalNumber(server, "requestTimeoutMs", path, {
    min: 1,
    max: MAX_TIMEOUT_MS,
  });
  assertOptionalBoolean(server, "exposeResources", path);
  assertOptionalBoolean(server, "disabled", path);
  assertOptionalStringArray(server, "includeTools", path);
  assertOptionalStringArray(server, "excludeTools", path);

  const directTools = server.directTools;
  if (
    directTools !== undefined &&
    typeof directTools !== "boolean" &&
    !Array.isArray(directTools)
  ) {
    fail(`${path}.directTools must be a boolean or string array`);
  }
  if (Array.isArray(directTools)) {
    assertStringArray(directTools, `${path}.directTools`);
  }
}

function validateHttpServer(
  server: Record<string, unknown>,
  path: string,
): void {
  assertAllowedKeys(server, HTTP_SERVER_KEYS, path);
  assertOptionalString(server, "url", path, {
    min: 1,
    max: MAX_URL_LENGTH,
  });

  let url: URL;
  try {
    url = new URL(server.url as string);
  } catch {
    fail(`${path}.url must be an absolute URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    fail(`${path}.url must use HTTP or HTTPS`);
  }
  if (url.username || url.password) {
    fail(`${path}.url must not contain embedded credentials`);
  }

  if (server.headers !== undefined) {
    assertStringMap(server.headers, `${path}.headers`);
  }

  const auth = server.auth;
  if (auth !== undefined && auth !== false && auth !== "bearer") {
    fail(`${path}.auth must be "bearer" or false`);
  }
  assertOptionalString(server, "bearerToken", path, {
    min: 1,
    max: MAX_STRING_LENGTH,
  });
  if (auth === "bearer" && typeof server.bearerToken !== "string") {
    fail(`${path}.bearerToken is required for bearer auth`);
  }
  if (server.bearerToken !== undefined && auth !== "bearer") {
    fail(`${path}.bearerToken requires auth to be "bearer"`);
  }
}

function validateStdioServer(
  server: Record<string, unknown>,
  path: string,
): void {
  assertAllowedKeys(server, STDIO_SERVER_KEYS, path);
  if (typeof server.command !== "string") {
    fail(`${path}.command must be a non-empty bounded string`);
  }
  assertOptionalString(server, "command", path, {
    min: 1,
    max: MAX_STRING_LENGTH,
  });
  assertOptionalString(server, "cwd", path, {
    min: 1,
    max: MAX_STRING_LENGTH,
  });
  if (server.args !== undefined) {
    assertStringArray(server.args, `${path}.args`);
  }
  if (server.env !== undefined) {
    assertStringMap(server.env, `${path}.env`);
  }
}

function validateServer(
  server: unknown,
  serverName: string,
): asserts server is McpServerConfig {
  const path = `mcpServers.${serverName}`;
  if (!isPlainRecord(server)) {
    fail(`${path} must be an object`);
  }

  const serverKeys = Object.keys(server);
  const hasUrl = serverKeys.includes("url");
  const hasCommand = serverKeys.includes("command");
  if (hasUrl === hasCommand) {
    fail(`${path} must define exactly one of url or command`);
  }

  validateCommonServerOptions(server, path);
  if (hasUrl) {
    validateHttpServer(server, path);
  } else {
    validateStdioServer(server, path);
  }
}

const SETTINGS_KEYS = new Set([
  "toolPrefix",
  "hostConfigDiscovery",
  "idleTimeout",
  "requestTimeoutMs",
  "directTools",
  "disableProxyTool",
  "autoAuth",
  "sampling",
  "samplingAutoApprove",
  "elicitation",
  "outputGuard",
]);

function validateSettings(settings: unknown): asserts settings is McpSettings {
  if (!isPlainRecord(settings)) {
    fail("settings must be an object");
  }
  assertAllowedKeys(settings, SETTINGS_KEYS, "settings");

  const toolPrefix = settings.toolPrefix;
  if (
    toolPrefix !== undefined &&
    toolPrefix !== "server" &&
    toolPrefix !== "none" &&
    toolPrefix !== "short" &&
    toolPrefix !== "mcp"
  ) {
    fail("settings.toolPrefix is not supported");
  }

  const hostConfigDiscovery = settings.hostConfigDiscovery;
  if (
    hostConfigDiscovery !== undefined &&
    hostConfigDiscovery !== "off" &&
    hostConfigDiscovery !== "prompt" &&
    hostConfigDiscovery !== "on"
  ) {
    fail("settings.hostConfigDiscovery is not supported");
  }

  assertOptionalNumber(settings, "idleTimeout", "settings", {
    min: 0,
    max: 1_440,
  });
  assertOptionalNumber(settings, "requestTimeoutMs", "settings", {
    min: 1,
    max: MAX_TIMEOUT_MS,
  });
  for (const key of [
    "directTools",
    "disableProxyTool",
    "autoAuth",
    "sampling",
    "samplingAutoApprove",
    "elicitation",
    "outputGuard",
  ]) {
    assertOptionalBoolean(settings, key, "settings");
  }
}

/**
 * Validate and clone request-scoped MCP configuration before an extension sees
 * it. This is the trusted SDK/daemon boundary; browser input has a stricter
 * HTTPS-only validator in the web package.
 */
export function validateMcpConfig(config: unknown): McpConfig {
  if (!isPlainRecord(config)) {
    fail("root value must be an object");
  }
  assertAllowedKeys(config, new Set(["mcpServers", "settings"]), "config");

  if (!isPlainRecord(config.mcpServers)) {
    fail("mcpServers must be an object");
  }
  const servers = Object.entries(config.mcpServers);
  if (servers.length > MAX_SERVERS) {
    fail(`mcpServers must have at most ${MAX_SERVERS} entries`);
  }
  for (const [name, server] of servers) {
    if (
      name.length === 0 ||
      name.length > MAX_NAME_LENGTH ||
      hasControlCharacter(name)
    ) {
      fail("mcpServers contains an invalid server name");
    }
    validateServer(server, name);
  }

  if (config.settings !== undefined) {
    validateSettings(config.settings);
  }

  return structuredClone(config) as unknown as McpConfig;
}

export function shouldEnableMcp(
  config: McpConfig | undefined,
  allowedTools: string[] | undefined,
): boolean {
  return (
    config !== undefined && (!allowedTools || allowedTools.includes("mcp"))
  );
}

export function createMcpExtension(config: McpConfig): InlineExtension {
  const validated = validateMcpConfig(config);
  const { createMcpAdapter } = getMcpAdapterModule();
  return {
    name: "bunny-agent-mcp",
    factory: createMcpAdapter({ config: validated }),
  };
}
