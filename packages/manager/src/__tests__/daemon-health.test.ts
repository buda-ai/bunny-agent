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

  describe("maxAttempts > 1 with delayMs > 0", () => {
    it("retries after a first-attempt failure and returns true on the second attempt's success, waiting the configured delay in between", async () => {
      let calls = 0;
      const handle = mockHandle(async function* () {
        calls += 1;
        if (calls === 1) {
          yield new TextEncoder().encode("503");
          return;
        }
        yield new TextEncoder().encode("200");
      });

      const start = Date.now();
      await expect(
        isBunnyAgentDaemonHealthy(handle, "http://127.0.0.1:3080", {
          maxAttempts: 2,
          delayMs: 50,
        }),
      ).resolves.toBe(true);
      const elapsed = Date.now() - start;

      expect(calls).toBe(2);
      // Scheduler jitter tolerance only — no added fixed margin.
      expect(elapsed).toBeGreaterThanOrEqual(45);
    });

    it("does not wait the inter-attempt delay after the final attempt", async () => {
      const handle = mockHandle(async function* () {
        yield new TextEncoder().encode("503");
      });

      const start = Date.now();
      await expect(
        isBunnyAgentDaemonHealthy(handle, "http://127.0.0.1:3080", {
          maxAttempts: 1,
          delayMs: 5_000,
        }),
      ).resolves.toBe(false);
      expect(Date.now() - start).toBeLessThan(1_000);
    });

    it("exhausts all attempts and returns false when every attempt fails", async () => {
      let calls = 0;
      const handle = mockHandle(async function* () {
        calls += 1;
        yield new TextEncoder().encode("503");
      });
      await expect(
        isBunnyAgentDaemonHealthy(handle, "http://127.0.0.1:3080", {
          maxAttempts: 3,
          delayMs: 1,
        }),
      ).resolves.toBe(false);
      expect(calls).toBe(3);
    });
  });

  describe("attempt-level timeout independent of handle.exec", () => {
    it("resolves false at or shortly after the configured timeout when exec never settles, and aborts the signal", async () => {
      let observedSignal: AbortSignal | undefined;
      const handle: SandboxHandle = {
        getSandboxId: () => "mock",
        getVolumes: () => null,
        getWorkdir: () => "/workspace",
        exec: vi.fn((_cmd: string[], opts?: { signal?: AbortSignal }) => {
          observedSignal = opts?.signal;
          return {
            [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
              // Never resolves and never rejects — simulates an adapter that
              // does not honor the timeout/signal it was given.
              return { next: () => new Promise(() => {}) };
            },
          };
        }),
        upload: vi.fn(),
        readFile: vi.fn(),
        destroy: vi.fn(),
      };

      const start = Date.now();
      await expect(
        isBunnyAgentDaemonHealthy(handle, "http://127.0.0.1:3080", {
          maxAttempts: 1,
          delayMs: 0,
          timeout: 500,
        }),
      ).resolves.toBe(false);
      const elapsed = Date.now() - start;

      // Bounded by the timeout plus only scheduler jitter — not an added
      // fixed margin, and not hanging indefinitely.
      expect(elapsed).toBeGreaterThanOrEqual(450);
      expect(elapsed).toBeLessThan(1_500);
      expect(observedSignal).toBeInstanceOf(AbortSignal);
      expect(observedSignal?.aborted).toBe(true);
    });

    it("reports probe-timeout via onAttempt when exec never settles", async () => {
      const handle: SandboxHandle = {
        getSandboxId: () => "mock",
        getVolumes: () => null,
        getWorkdir: () => "/workspace",
        exec: vi.fn(() => ({
          [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
            return { next: () => new Promise(() => {}) };
          },
        })),
        upload: vi.fn(),
        readFile: vi.fn(),
        destroy: vi.fn(),
      };

      const attempts: Array<{ reason: string; healthy: boolean }> = [];
      await isBunnyAgentDaemonHealthy(handle, "http://127.0.0.1:3080", {
        maxAttempts: 1,
        delayMs: 0,
        timeout: 300,
        onAttempt: (info) =>
          attempts.push({ reason: info.reason, healthy: info.healthy }),
      });

      expect(attempts).toEqual([{ reason: "probe-timeout", healthy: false }]);
    });

    it("still resolves true when the daemon responds within the timeout", async () => {
      const handle = mockHandle(async function* () {
        yield new TextEncoder().encode("200");
      });
      await expect(
        isBunnyAgentDaemonHealthy(handle, "http://127.0.0.1:3080", {
          maxAttempts: 1,
          delayMs: 0,
          timeout: 500,
        }),
      ).resolves.toBe(true);
    });
  });

  describe("no-overlapping-exec rule across maxAttempts > 1 (real exec concurrency, not a mocked boolean)", () => {
    it("never calls handle.exec a second time while the first attempt's exec is still pending", async () => {
      let concurrentExecs = 0;
      let maxConcurrentExecs = 0;
      let releaseFirst: (() => void) | undefined;
      let callCount = 0;

      const handle: SandboxHandle = {
        getSandboxId: () => "mock",
        getVolumes: () => null,
        getWorkdir: () => "/workspace",
        exec: vi.fn(() => {
          callCount += 1;
          concurrentExecs += 1;
          maxConcurrentExecs = Math.max(maxConcurrentExecs, concurrentExecs);
          const isFirstCall = callCount === 1;
          return {
            [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
              return {
                next: () =>
                  new Promise((resolve) => {
                    if (isFirstCall) {
                      // Never settles on its own — only resolved once the
                      // test explicitly calls releaseFirst() below. Combined
                      // with a tiny attempt timeout, this simulates a stuck
                      // exec that the adapter does not honor the abort for.
                      releaseFirst = () => {
                        concurrentExecs -= 1;
                        resolve({ done: true, value: undefined });
                      };
                      return;
                    }
                    concurrentExecs -= 1;
                    resolve({
                      done: false,
                      value: new TextEncoder().encode("200"),
                    });
                  }),
              };
            },
          };
        }),
        upload: vi.fn(),
        readFile: vi.fn(),
        destroy: vi.fn(),
      };

      const resultPromise = isBunnyAgentDaemonHealthy(
        handle,
        "http://127.0.0.1:3080",
        {
          maxAttempts: 2,
          delayMs: 0,
          timeout: 100,
        },
      );

      // Let the first attempt time out (timeout=100ms) without its exec
      // settling, then give the loop a chance to (incorrectly, if the bug
      // were present) start a second exec immediately afterward.
      await new Promise((r) => setTimeout(r, 250));
      // The real regression this guards: attempt 2 must NOT have started
      // its exec while attempt 1's exec is still outstanding.
      expect(callCount).toBe(1);
      expect(maxConcurrentExecs).toBe(1);

      releaseFirst?.();
      await resultPromise;
      expect(maxConcurrentExecs).toBe(1);
    });

    it("with maxAttempts=3 and an exec that never settles, never issues a second exec for the whole call", async () => {
      // Regression test for the actual bug: the retry loop raced `outstanding`
      // against a wait-timer bounded by `timeout`, then unconditionally set
      // `outstanding = null` regardless of which side won — so once the wait
      // timer (not the real exec) won the race, the loop proceeded to launch
      // attempt 2's exec anyway, overlapping the still-running attempt 1 exec.
      // With a never-settling exec and maxAttempts=3, a correct implementation
      // must call handle.exec exactly once for the ENTIRE call, not once per
      // attempt.
      let callCount = 0;
      const handle: SandboxHandle = {
        getSandboxId: () => "mock",
        getVolumes: () => null,
        getWorkdir: () => "/workspace",
        exec: vi.fn(() => {
          callCount += 1;
          return {
            [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
              // Never resolves and never rejects for the lifetime of the test.
              return { next: () => new Promise(() => {}) };
            },
          };
        }),
        upload: vi.fn(),
        readFile: vi.fn(),
        destroy: vi.fn(),
      };

      const result = await isBunnyAgentDaemonHealthy(
        handle,
        "http://127.0.0.1:3080",
        {
          maxAttempts: 3,
          delayMs: 0,
          timeout: 100,
        },
      );

      expect(result).toBe(false);
      // Exactly one exec for the whole call: attempt 1's exec times out
      // without confirming settlement, and the no-overlapping-exec rule must
      // refuse to start attempt 2's (or attempt 3's) exec while it's still
      // outstanding — the call gives up rather than launching a duplicate.
      expect(callCount).toBe(1);
    });

    it("refuses to start a new exec on a second, separate call for the same handle+endpoint while the first call's exec is still outstanding", async () => {
      let callCount = 0;
      const handle: SandboxHandle = {
        getSandboxId: () => "mock",
        getVolumes: () => null,
        getWorkdir: () => "/workspace",
        exec: vi.fn(() => {
          callCount += 1;
          return {
            [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
              return { next: () => new Promise(() => {}) };
            },
          };
        }),
        upload: vi.fn(),
        readFile: vi.fn(),
        destroy: vi.fn(),
      };

      const first = await isBunnyAgentDaemonHealthy(
        handle,
        "http://127.0.0.1:3080",
        {
          maxAttempts: 1,
          timeout: 100,
        },
      );
      expect(first).toBe(false);
      expect(callCount).toBe(1);

      // A second, separate call for the SAME handle and the same endpoint,
      // issued right after the first call returns, must not start a new exec
      // while the first call's exec is still unconfirmed in the background.
      const second = await isBunnyAgentDaemonHealthy(
        handle,
        "http://127.0.0.1:3080",
        {
          maxAttempts: 1,
          timeout: 100,
        },
      );
      expect(second).toBe(false);
      expect(callCount).toBe(1);
    });

    it("does not start any exec when the signal is already aborted before the call", async () => {
      const exec = vi.fn();
      const handle: SandboxHandle = {
        getSandboxId: () => "mock",
        getVolumes: () => null,
        getWorkdir: () => "/workspace",
        exec,
        upload: vi.fn(),
        readFile: vi.fn(),
        destroy: vi.fn(),
      };
      const controller = new AbortController();
      controller.abort();

      const result = await isBunnyAgentDaemonHealthy(
        handle,
        "http://127.0.0.1:3080",
        {
          maxAttempts: 3,
          signal: controller.signal,
        },
      );

      expect(result).toBe(false);
      expect(exec).not.toHaveBeenCalled();
    });
  });

  describe("bounded stdout collection", () => {
    it("does not hang or grow without bound when exec streams far more than a status code", async () => {
      const handle: SandboxHandle = {
        getSandboxId: () => "mock",
        getVolumes: () => null,
        getWorkdir: () => "/workspace",
        exec: vi.fn(() => {
          async function* huge() {
            // Stream well past the internal cap, interleaved with a trailing
            // "200" that must NOT be allowed to flip the result to healthy —
            // once the cap is exceeded, excess output is dropped.
            for (let i = 0; i < 50; i += 1) {
              yield new TextEncoder().encode("x".repeat(200));
            }
            yield new TextEncoder().encode("200");
          }
          return huge();
        }),
        upload: vi.fn(),
        readFile: vi.fn(),
        destroy: vi.fn(),
      };

      const result = await isBunnyAgentDaemonHealthy(
        handle,
        "http://127.0.0.1:3080",
        {
          maxAttempts: 1,
          timeout: 2_000,
        },
      );
      expect(result).toBe(false);
    });
  });

  describe("non-finite option inputs do not poison the deadline/attempt math", () => {
    it("falls back to defaults for NaN timeout/maxAttempts/delayMs instead of hanging forever", async () => {
      const handle = mockHandle(async function* () {
        yield new TextEncoder().encode("200");
      });
      const start = Date.now();
      await expect(
        isBunnyAgentDaemonHealthy(handle, "http://127.0.0.1:3080", {
          maxAttempts: Number.NaN,
          delayMs: Number.NaN,
          timeout: Number.NaN,
        }),
      ).resolves.toBe(true);
      expect(Date.now() - start).toBeLessThan(5_000);
    });
  });

  describe("failure classification via onAttempt (internal diagnostics, not part of the boolean contract)", () => {
    it("classifies a non-200 response as http-non-200", async () => {
      const handle = mockHandle(async function* () {
        yield new TextEncoder().encode("503");
      });
      const attempts: string[] = [];
      await isBunnyAgentDaemonHealthy(handle, "http://127.0.0.1:3080", {
        maxAttempts: 1,
        delayMs: 0,
        onAttempt: (info) => attempts.push(info.reason),
      });
      expect(attempts).toEqual(["http-non-200"]);
    });

    it("classifies a synchronous exec throw as transport-error", async () => {
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
      const attempts: string[] = [];
      await isBunnyAgentDaemonHealthy(handle, "http://127.0.0.1:3080", {
        maxAttempts: 1,
        delayMs: 0,
        onAttempt: (info) => attempts.push(info.reason),
      });
      expect(attempts).toEqual(["transport-error"]);
    });

    it("classifies an async-iterator rejection as transport-error", async () => {
      const handle = mockHandle(() => ({
        [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
          return {
            next(): Promise<IteratorResult<Uint8Array>> {
              return Promise.reject(new Error("curl failed"));
            },
          };
        },
      }));
      const attempts: string[] = [];
      await isBunnyAgentDaemonHealthy(handle, "http://127.0.0.1:3080", {
        maxAttempts: 1,
        delayMs: 0,
        onAttempt: (info) => attempts.push(info.reason),
      });
      expect(attempts).toEqual(["transport-error"]);
    });

    it("classifies a successful 200 response as ok", async () => {
      const handle = mockHandle(async function* () {
        yield new TextEncoder().encode("200");
      });
      const attempts: Array<{ reason: string; healthy: boolean }> = [];
      await isBunnyAgentDaemonHealthy(handle, "http://127.0.0.1:3080", {
        maxAttempts: 1,
        delayMs: 0,
        onAttempt: (info) =>
          attempts.push({ reason: info.reason, healthy: info.healthy }),
      });
      expect(attempts).toEqual([{ reason: "ok", healthy: true }]);
    });

    it("distinguishes http-non-200 from transport-error across separate calls, both returning false", async () => {
      const httpFailureHandle = mockHandle(async function* () {
        yield new TextEncoder().encode("503");
      });
      const transportFailureHandle: SandboxHandle = {
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

      const httpReasons: string[] = [];
      const transportReasons: string[] = [];
      const httpResult = await isBunnyAgentDaemonHealthy(
        httpFailureHandle,
        "http://127.0.0.1:3080",
        {
          maxAttempts: 1,
          onAttempt: (info) => httpReasons.push(info.reason),
        },
      );
      const transportResult = await isBunnyAgentDaemonHealthy(
        transportFailureHandle,
        "http://127.0.0.1:3080",
        {
          maxAttempts: 1,
          onAttempt: (info) => transportReasons.push(info.reason),
        },
      );

      expect(httpResult).toBe(false);
      expect(transportResult).toBe(false);
      expect(httpReasons).toEqual(["http-non-200"]);
      expect(transportReasons).toEqual(["transport-error"]);
    });

    it("never lets an onAttempt callback that throws affect the probe's own result", async () => {
      const handle = mockHandle(async function* () {
        yield new TextEncoder().encode("200");
      });
      await expect(
        isBunnyAgentDaemonHealthy(handle, "http://127.0.0.1:3080", {
          maxAttempts: 1,
          onAttempt: () => {
            throw new Error("logging bug");
          },
        }),
      ).resolves.toBe(true);
    });
  });
});
