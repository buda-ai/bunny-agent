import { describe, expect, it } from "vitest";
import {
  assertSandboxCredentials,
  getMissingSandboxCredential,
  getSandboxCredentialKey,
  resolveLocalRunnerCommand,
  resolveSandboxProvider,
  SandboxProviderConfigError,
} from "./sandbox-provider";

describe("resolveSandboxProvider", () => {
  it("keeps E2B as the deployment default", () => {
    expect(resolveSandboxProvider()).toBe("e2b");
  });

  it("uses server-enabled local execution when the request has no override", () => {
    expect(resolveSandboxProvider(undefined, "local")).toBe("local");
  });

  it("allows an explicit cloud provider to override the deployment default", () => {
    expect(resolveSandboxProvider("sandock", "local")).toBe("sandock");
  });

  it("rejects client attempts to enable local execution", () => {
    expect(() => resolveSandboxProvider("local", "e2b")).toThrow(
      /Local execution is disabled/,
    );
  });

  it("rejects unknown request and server providers", () => {
    expect(() => resolveSandboxProvider("docker", "e2b")).toThrow(
      SandboxProviderConfigError,
    );
    expect(() => resolveSandboxProvider(undefined, "docker")).toThrow(
      /Unsupported server sandbox provider/,
    );
  });
});

describe("sandbox credentials", () => {
  it.each([
    ["e2b", "E2B_API_KEY"],
    ["sandock", "SANDOCK_API_KEY"],
    ["daytona", "DAYTONA_API_KEY"],
  ] as const)("requires the matching key for %s", (provider, key) => {
    expect(getSandboxCredentialKey(provider)).toBe(key);
    expect(() => assertSandboxCredentials(provider, {})).toThrow(
      `${key} is required`,
    );
    expect(() =>
      assertSandboxCredentials(provider, { [key]: "configured" }),
    ).not.toThrow();
  });

  it("does not require a cloud key for local or deployment-default UI state", () => {
    expect(getSandboxCredentialKey("local")).toBeUndefined();
    expect(getSandboxCredentialKey(undefined)).toBeUndefined();
    expect(() => assertSandboxCredentials("local", {})).not.toThrow();
  });
  it("reports missing credentials only for an explicit cloud selection", () => {
    expect(getMissingSandboxCredential({})).toBeUndefined();
    expect(getMissingSandboxCredential({ SANDBOX_PROVIDER: "e2b" })).toBe(
      "E2B_API_KEY",
    );
    expect(
      getMissingSandboxCredential({
        SANDBOX_PROVIDER: "e2b",
        E2B_API_KEY: "configured",
      }),
    ).toBeUndefined();
  });
});

describe("resolveLocalRunnerCommand", () => {
  it("uses the monorepo runner bundle when it is available", () => {
    expect(
      resolveLocalRunnerCommand("/repo/apps/runner-cli/bundle.mjs", true),
    ).toEqual(["node", "/repo/apps/runner-cli/bundle.mjs", "run"]);
  });

  it("uses the installed CLI in deployment images without the bundle", () => {
    expect(resolveLocalRunnerCommand("/missing/bundle.mjs", false)).toEqual([
      "bunny-agent",
      "run",
    ]);
  });
});
