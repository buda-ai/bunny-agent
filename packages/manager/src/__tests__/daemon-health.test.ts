import { describe, expect, it, vi } from "vitest";
import { isBunnyAgentDaemonHealthy } from "../daemon-health.js";
import type { SandboxHandle } from "../types.js";

function mockHandle(execImpl: () => AsyncIterable<Uint8Array>): SandboxHandle {
  return {
    getSandboxId: () => "mock",
    getVolumes: () => null,
    getWorkdir: () => "/workspace",
    exec: vi.fn().mockImplementation(() => execImpl()),
    upload: vi.fn(),
    readFile: vi.fn(),
    destroy: vi.fn(),
  };
}

describe("isBunnyAgentDaemonHealthy", () => {
  it("curls deduped /healthz when base already ends with /healthz", async () => {
    const exec = vi.fn().mockImplementation(() =>
      (async function* () {
        yield new TextEncoder().encode("200");
      })(),
    );
    const handle: SandboxHandle = {
      getSandboxId: () => "mock",
      getVolumes: () => null,
      getWorkdir: () => "/workspace",
      exec,
      upload: vi.fn(),
      readFile: vi.fn(),
      destroy: vi.fn(),
    };
    await expect(
      isBunnyAgentDaemonHealthy(handle, "http://127.0.0.1:3080/healthz", {
        maxAttempts: 1,
        delayMs: 0,
      }),
    ).resolves.toBe(true);
    const curlUrl = exec.mock.calls[0]?.[0]?.at(-1);
    expect(curlUrl).toBe("http://127.0.0.1:3080/healthz");
  });

  it("returns true when curl prints 200", async () => {
    const handle = mockHandle(async function* () {
      yield new TextEncoder().encode("200");
    });
    await expect(
      isBunnyAgentDaemonHealthy(handle, "http://127.0.0.1:3080", {
        maxAttempts: 1,
        delayMs: 0,
      }),
    ).resolves.toBe(true);
  });

  it("returns false for non-200 status code", async () => {
    const handle = mockHandle(async function* () {
      yield new TextEncoder().encode("503");
    });
    await expect(
      isBunnyAgentDaemonHealthy(handle, "http://127.0.0.1:3080", {
        maxAttempts: 1,
        delayMs: 0,
      }),
    ).resolves.toBe(false);
  });

  it("returns false for HTTP 500", async () => {
    const handle = mockHandle(async function* () {
      yield new TextEncoder().encode("500");
    });
    await expect(
      isBunnyAgentDaemonHealthy(handle, "http://127.0.0.1:3080", {
        maxAttempts: 1,
        delayMs: 0,
      }),
    ).resolves.toBe(false);
  });

  it("returns false when curl reports 000 (unreachable host / no TCP connection)", async () => {
    const handle = mockHandle(async function* () {
      yield new TextEncoder().encode("000");
    });
    await expect(
      isBunnyAgentDaemonHealthy(handle, "http://192.0.2.1:3080", {
        maxAttempts: 1,
        delayMs: 0,
      }),
    ).resolves.toBe(false);
  });

  it("returns false when exec throws synchronously (e.g. curl binary missing)", async () => {
    const handle: SandboxHandle = {
      getSandboxId: () => "mock",
      getVolumes: () => null,
      getWorkdir: () => "/workspace",
      exec: vi.fn(() => {
        throw new Error("spawn curl ENOENT");
      }),
      upload: vi.fn(),
      readFile: vi.fn(),
      destroy: vi.fn(),
    };
    await expect(
      isBunnyAgentDaemonHealthy(handle, "http://127.0.0.1:3080", {
        maxAttempts: 1,
        delayMs: 0,
      }),
    ).resolves.toBe(false);
  });

  it("returns false for empty stdout", async () => {
    const handle = mockHandle(async function* () {
      // no chunks
    });
    await expect(
      isBunnyAgentDaemonHealthy(handle, "http://127.0.0.1:3080", {
        maxAttempts: 1,
        delayMs: 0,
      }),
    ).resolves.toBe(false);
  });

  it("returns false when iterator rejects on first chunk (e.g. curl runtime error)", async () => {
    const handle = mockHandle(() => ({
      [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
        return {
          next(): Promise<IteratorResult<Uint8Array>> {
            return Promise.reject(new Error("curl failed"));
          },
        };
      },
    }));
    await expect(
      isBunnyAgentDaemonHealthy(handle, "http://127.0.0.1:3080", {
        maxAttempts: 1,
        delayMs: 0,
      }),
    ).resolves.toBe(false);
  });
});
