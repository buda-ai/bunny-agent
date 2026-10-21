import type { ExecOptions, SandboxHandle } from "@bunny-agent/manager";
import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverPiSearchContract } from "../provider/search-contract-discovery";
import { capabilities } from "./citation-fixtures";

const url = "http://127.0.0.1:3080";
const legacy = { ok: true, data: { status: "ok" } };
const current = {
  ok: true,
  data: {
    status: "ok",
    capabilities: { searchContracts: { pi: capabilities } },
  },
};

function fixture(health: unknown = current, status = 200) {
  const exec = vi.fn(async function* (_args: string[], _opts?: ExecOptions) {
    yield new TextEncoder().encode(`${JSON.stringify(health)}\n${status}`);
  });
  const handle: SandboxHandle = {
    getSandboxId: () => "sandbox-a",
    getVolumes: () => null,
    getWorkdir: () => "/workspace",
    exec,
    upload: async () => {},
    readFile: async () => "",
    destroy: async () => {},
  };
  return { handle, exec };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("read-only Pi daemon search discovery", () => {
  it("discovers v1 and caches the healthy response through the sandbox transport", async () => {
    const { handle, exec } = fixture();
    expect(await discoverPiSearchContract(handle, `${url}/`)).toBe(1);
    expect(await discoverPiSearchContract(handle, `${url}/healthz`)).toBe(1);
    expect(exec).toHaveBeenCalledTimes(1);
    const [args, opts] = exec.mock.calls[0];
    expect(args).toContain("curl");
    expect(args.at(-1)).toBe(`${url}/healthz`);
    expect(args).not.toContain("POST");
    expect(opts?.timeout).toBe(4_000);
    expect(opts?.signal).toBeInstanceOf(AbortSignal);
    expect(opts?.env).toBeUndefined();
  });

  it("recognizes a healthy old daemon without guessing support from search results", async () => {
    const { handle, exec } = fixture(legacy);
    expect(await discoverPiSearchContract(handle, url)).toBeUndefined();
    expect(await discoverPiSearchContract(handle, url)).toBeUndefined();
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it.each([
    { structured_retrieval: false },
    { explicit_source_marker_annotations: false },
  ])("requires both structured retrieval and answer annotations for Pi v1", async (unsupported) => {
    const { handle } = fixture({
      ...current,
      data: {
        ...current.data,
        capabilities: {
          searchContracts: { pi: { ...capabilities, ...unsupported } },
        },
      },
    });
    expect(await discoverPiSearchContract(handle, url)).toBeUndefined();
  });

  it.each([
    401, 403, 404, 500,
  ])("does not downgrade or cache HTTP %s", async (status) => {
    const { handle, exec } = fixture(legacy, status);
    await expect(discoverPiSearchContract(handle, url)).rejects.toThrow(
      `HTTP ${status}`,
    );
    await expect(discoverPiSearchContract(handle, url)).rejects.toThrow();
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it("does not cache network errors or disclose adapter error details", async () => {
    const { handle, exec } = fixture();
    exec.mockImplementationOnce(async function* () {
      yield* [];
      throw new Error("private-token");
    });
    await expect(discoverPiSearchContract(handle, url)).rejects.toThrow(
      "transport failed",
    );
    expect(await discoverPiSearchContract(handle, url)).toBe(1);
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it.each([
    {},
    { ok: false, data: { status: "ok" } },
    { ok: true, data: { status: "ok", capabilities: [] } },
    { ok: true, data: { status: "ok", capabilities: { searchContracts: [] } } },
    {
      ok: true,
      data: {
        status: "ok",
        capabilities: { searchContracts: { pi: { version: 1 } } },
      },
    },
  ])("rejects a malformed health/capability advertisement without caching", async (health) => {
    const { handle, exec } = fixture(health);
    await expect(discoverPiSearchContract(handle, url)).rejects.toThrow(
      "Invalid",
    );
    await expect(discoverPiSearchContract(handle, url)).rejects.toThrow(
      "Invalid",
    );
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it("caps bytes collected from the transport", async () => {
    const { handle, exec } = fixture();
    exec.mockImplementationOnce(async function* () {
      yield new Uint8Array(16_385);
    });
    await expect(discoverPiSearchContract(handle, url)).rejects.toThrow();
    expect(await discoverPiSearchContract(handle, url)).toBe(1);
  });

  it("isolates handle identities, replacement sandbox IDs, and daemon endpoints", async () => {
    const first = fixture();
    const second = fixture(legacy);
    expect(await discoverPiSearchContract(first.handle, url)).toBe(1);
    expect(await discoverPiSearchContract(second.handle, url)).toBeUndefined();
    expect(await discoverPiSearchContract(first.handle, `${url}/another`)).toBe(
      1,
    );
    first.handle.getSandboxId = () => "replacement";
    expect(await discoverPiSearchContract(first.handle, url)).toBe(1);
    expect(first.exec).toHaveBeenCalledTimes(3);
    expect(second.exec).toHaveBeenCalledTimes(1);
  });

  it("expires healthy results within 30 seconds and bounds retained endpoints", async () => {
    vi.useFakeTimers();
    const { handle, exec } = fixture();
    await discoverPiSearchContract(handle, url);
    vi.setSystemTime(Date.now() + 30_001);
    await discoverPiSearchContract(handle, url);
    expect(exec).toHaveBeenCalledTimes(2);
    for (let index = 0; index < 16; index += 1) {
      await discoverPiSearchContract(handle, `${url}/${index}`);
    }
    await discoverPiSearchContract(handle, url);
    expect(exec).toHaveBeenCalledTimes(19);
  });

  it("shares a pending probe while one canceled subscriber leaves the other active", async () => {
    const { handle, exec } = fixture();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    exec.mockImplementationOnce(async function* () {
      await pending;
      yield new TextEncoder().encode(`${JSON.stringify(current)}\n200`);
    });
    const abort = new AbortController();
    const first = discoverPiSearchContract(handle, url, {
      signal: abort.signal,
    });
    const rejected = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    const second = discoverPiSearchContract(handle, url);
    abort.abort();
    await rejected;
    expect(exec.mock.calls[0][1]?.signal?.aborted).toBe(false);
    release();
    expect(await second).toBe(1);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("does not execute a probe for an already aborted caller", async () => {
    const { handle, exec } = fixture();
    await expect(
      discoverPiSearchContract(handle, url, { signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(exec).not.toHaveBeenCalled();
  });

  it("aborts the transport when all subscribers cancel and allows a fresh probe after settlement", async () => {
    const { handle, exec } = fixture();
    exec.mockImplementationOnce(async function* (_args, opts) {
      await new Promise<void>((_resolve, reject) => {
        opts?.signal?.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        );
      });
    });
    const abort = new AbortController();
    const pending = discoverPiSearchContract(handle, url, {
      signal: abort.signal,
    });
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    abort.abort();
    await rejected;
    await Promise.resolve();
    expect(exec.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(await discoverPiSearchContract(handle, url)).toBe(1);
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it("bounds an uncooperative transport and does not overlap its unconfirmed operation", async () => {
    vi.useFakeTimers();
    const { handle, exec } = fixture();
    exec.mockImplementationOnce(async function* () {
      await new Promise(() => {});
    });
    const pending = discoverPiSearchContract(handle, url);
    const rejected = expect(pending).rejects.toMatchObject({
      name: "TimeoutError",
    });
    await vi.advanceTimersByTimeAsync(4_000);
    await rejected;
    await expect(discoverPiSearchContract(handle, url)).rejects.toMatchObject({
      name: "TimeoutError",
    });
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it.each([
    "file:///healthz",
    "http://user:password@localhost",
    `${url}?token=secret`,
  ])("rejects unsafe daemon discovery URLs before transport", async (unsafe) => {
    const { handle, exec } = fixture();
    await expect(discoverPiSearchContract(handle, unsafe)).rejects.toThrow();
    expect(exec).not.toHaveBeenCalled();
  });
});
