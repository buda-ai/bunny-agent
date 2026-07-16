import { describe, expect, it, vi } from "vitest";
import { isTransientNetworkError, withNetworkRetry } from "../retry.js";

describe("isTransientNetworkError", () => {
  it("recognizes undici's 'terminated' TypeError with a SocketError cause", () => {
    // The exact shape observed against production sandock.ai in CI: a
    // TypeError('terminated') whose .cause is the underlying SocketError.
    const socketError = Object.assign(new Error("other side closed"), {
      code: "UND_ERR_SOCKET",
    });
    const terminated = new TypeError("terminated", { cause: socketError });
    expect(isTransientNetworkError(terminated)).toBe(true);
  });

  it("recognizes common POSIX network error codes", () => {
    for (const code of ["ECONNRESET", "ETIMEDOUT", "EPIPE", "ECONNREFUSED"]) {
      const error = Object.assign(new Error("boom"), { code });
      expect(isTransientNetworkError(error)).toBe(true);
    }
  });

  it("does not treat an application-level error as transient", () => {
    expect(isTransientNetworkError(new Error("404 Not Found"))).toBe(false);
    expect(isTransientNetworkError(new Error("Unauthorized"))).toBe(false);
  });

  it("does not treat a non-Error value as transient", () => {
    expect(isTransientNetworkError("just a string")).toBe(false);
    expect(isTransientNetworkError(null)).toBe(false);
  });

  it("stops walking the cause chain after a bounded depth (no infinite loop on a cyclic cause)", () => {
    const a: Error & { cause?: unknown } = new Error("a");
    const b: Error & { cause?: unknown } = new Error("b");
    a.cause = b;
    b.cause = a; // cyclic — must not hang
    expect(isTransientNetworkError(a)).toBe(false);
  });
});

describe("withNetworkRetry", () => {
  it("returns the result on first success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withNetworkRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure and succeeds on the next attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("other side closed"), {
          code: "UND_ERR_SOCKET",
        }),
      )
      .mockResolvedValue("recovered");

    const result = await withNetworkRetry(fn, { baseDelayMs: 1 });
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-transient (application-level) error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("401 Unauthorized"));
    await expect(withNetworkRetry(fn, { baseDelayMs: 1 })).rejects.toThrow(
      "401 Unauthorized",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up and throws after exhausting all attempts", async () => {
    const transientError = Object.assign(new Error("socket hang up"), {
      code: "ECONNRESET",
    });
    const fn = vi.fn().mockRejectedValue(transientError);

    await expect(
      withNetworkRetry(fn, { attempts: 3, baseDelayMs: 1 }),
    ).rejects.toThrow("socket hang up");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
