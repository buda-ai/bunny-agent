export const SANDBOX_PROVIDERS = [
  "local",
  "e2b",
  "sandock",
  "daytona",
] as const;

export type SandboxProvider = (typeof SANDBOX_PROVIDERS)[number];
export type CloudSandboxProvider = Exclude<SandboxProvider, "local">;

const CLOUD_SANDBOX_CREDENTIALS: Record<CloudSandboxProvider, string> = {
  e2b: "E2B_API_KEY",
  sandock: "SANDOCK_API_KEY",
  daytona: "DAYTONA_API_KEY",
};

export class SandboxProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxProviderConfigError";
  }
}

function parseSandboxProvider(
  value: string | undefined,
  source: "request" | "server",
): SandboxProvider | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (SANDBOX_PROVIDERS.includes(normalized as SandboxProvider)) {
    return normalized as SandboxProvider;
  }

  throw new SandboxProviderConfigError(
    `Unsupported ${source} sandbox provider "${value}". Expected one of: ${SANDBOX_PROVIDERS.join(", ")}.`,
  );
}

/** Resolve a request provider without allowing clients to enable host execution. */
export function resolveSandboxProvider(
  requestedProvider?: string,
  serverProvider?: string,
): SandboxProvider {
  const requested = parseSandboxProvider(requestedProvider, "request");
  const configured = parseSandboxProvider(serverProvider, "server");

  if (requested === "local" && configured !== "local") {
    throw new SandboxProviderConfigError(
      "Local execution is disabled. Set SANDBOX_PROVIDER=local on the server to enable it.",
    );
  }

  return requested ?? configured ?? "e2b";
}

export function getSandboxCredentialKey(
  provider: string | undefined,
): string | undefined {
  if (!provider) return undefined;
  const normalized = provider.trim().toLowerCase();
  if (normalized === "local") return undefined;
  if (normalized in CLOUD_SANDBOX_CREDENTIALS) {
    return CLOUD_SANDBOX_CREDENTIALS[normalized as CloudSandboxProvider];
  }
  return undefined;
}
export function getMissingSandboxCredential(
  config: Record<string, string | undefined>,
): string | undefined {
  const credentialKey = getSandboxCredentialKey(config.SANDBOX_PROVIDER);
  return credentialKey && !config[credentialKey] ? credentialKey : undefined;
}

export function assertSandboxCredentials(
  provider: SandboxProvider,
  credentials: Record<string, string | undefined>,
): void {
  const credentialKey = getSandboxCredentialKey(provider);
  if (credentialKey && !credentials[credentialKey]) {
    throw new SandboxProviderConfigError(
      `${credentialKey} is required when using ${provider} sandbox.`,
    );
  }
}

export function resolveLocalRunnerCommand(
  runnerBundlePath: string,
  bundleExists: boolean,
): string[] {
  return bundleExists
    ? ["node", runnerBundlePath, "run"]
    : ["bunny-agent", "run"];
}
