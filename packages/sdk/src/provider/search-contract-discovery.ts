import type { ExecOptions, SandboxHandle } from "@bunny-agent/manager";
import { isSearchContractCapabilities } from "../contracts";

const CACHE_TTL_MS = 30_000;
const PROBE_TIMEOUT_MS = 4_000;
const MAX_ENDPOINTS_PER_HANDLE = 16;
const MAX_RESPONSE_BYTES = 16_384;

interface Flight {
  controller: AbortController;
  promise: Promise<1 | undefined>;
  waiters: number;
  settled: boolean;
}

interface Entry {
  expiresAt: number;
  version?: 1;
  flight?: Flight;
}

// A handle belongs to one attached sandbox/transport and carries its auth. The
// additional ID guards adapters that reuse a handle after sandbox replacement.
// Weak ownership avoids retaining destroyed handles or their authentication.
const cache = new WeakMap<SandboxHandle, Map<string, Entry>>();

function abortError(): DOMException {
  return new DOMException("Search capability discovery aborted.", "AbortError");
}

/** Wait independently: one canceled caller must not cancel other subscribers. */
export function waitForSearchDiscovery<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Only a successful, recognizable legacy health document proves old support. */
function parseHealth(text: string): 1 | undefined {
  const status = /\n(\d{3})$/.exec(text);
  if (!status || status[1] !== "200") {
    throw new Error(
      `Search capability discovery failed (HTTP ${status?.[1] ?? "unknown"}).`,
    );
  }
  let health: unknown;
  try {
    health = JSON.parse(text.slice(0, status.index));
  } catch {
    throw new Error("Invalid daemon health response during search discovery.");
  }
  const envelope = object(health);
  const data = object(envelope?.data);
  if (envelope?.ok !== true || data?.status !== "ok") {
    throw new Error("Invalid daemon health response during search discovery.");
  }
  if (data.capabilities === undefined) return undefined;
  const capabilities = object(data.capabilities);
  if (!capabilities)
    throw new Error("Invalid daemon capability advertisement.");
  if (capabilities.searchContracts === undefined) return undefined;
  const contracts = object(capabilities.searchContracts);
  if (!contracts)
    throw new Error("Invalid daemon search capability advertisement.");
  if (contracts.pi === undefined) return undefined;
  if (!isSearchContractCapabilities(contracts.pi)) {
    throw new Error("Invalid Pi search capability advertisement.");
  }
  return contracts.pi.structured_retrieval &&
    contracts.pi.explicit_source_marker_annotations
    ? 1
    : undefined;
}

async function probe(
  handle: SandboxHandle,
  url: string,
  opts: ExecOptions,
): Promise<1 | undefined> {
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    // This is the same sandbox-side transport as the existing health probe.
    // Sandock uses its authenticated shell API; no host-side loopback fetch or
    // coding-run POST is used for discovery, and no credentials enter argv.
    for await (const chunk of handle.exec(
      [
        "curl",
        "-sS",
        "--connect-timeout",
        "2",
        "--max-time",
        "4",
        "--write-out",
        "\n%{http_code}",
        "--url",
        url,
      ],
      opts,
    )) {
      bytes += chunk.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        throw new Error("Daemon capability response exceeds its size limit.");
      }
      text += decoder.decode(chunk, { stream: true });
    }
  } catch {
    if (opts.signal?.aborted) throw opts.signal.reason ?? abortError();
    throw new Error("Search capability discovery transport failed.");
  }
  text += decoder.decode();
  return parseHealth(text.trimEnd());
}

async function join(
  flight: Flight,
  signal?: AbortSignal,
): Promise<1 | undefined> {
  flight.waiters += 1;
  try {
    return await waitForSearchDiscovery(flight.promise, signal);
  } finally {
    flight.waiters -= 1;
    if (flight.waiters === 0 && !flight.settled) {
      flight.controller.abort(abortError());
    }
  }
}

/**
 * Negotiate only before execution. Cache healthy new/old results, never errors.
 * In-flight operations stay tracked until actual transport settlement even if
 * an adapter ignores abort, preventing duplicate outstanding sandbox commands.
 */
export async function discoverPiSearchContract(
  handle: SandboxHandle,
  daemonUrl: string,
  opts: Pick<ExecOptions, "cwd" | "signal"> = {},
): Promise<1 | undefined> {
  if (opts.signal?.aborted) throw abortError();
  const parsed = new URL(daemonUrl);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Invalid daemon URL for search capability discovery.");
  }
  parsed.pathname = `${parsed.pathname.replace(/\/$/, "").replace(/\/healthz$/, "")}/healthz`;
  const url = parsed.href;
  const key = JSON.stringify([handle.getSandboxId(), url]);
  let entries = cache.get(handle);
  if (!entries) {
    entries = new Map();
    cache.set(handle, entries);
  }
  const previous = entries.get(key);
  if (previous?.flight) return join(previous.flight, opts.signal);
  if (previous && previous.expiresAt > Date.now()) return previous.version;
  entries.delete(key);
  for (const [entryKey, entry] of entries) {
    if (!entry.flight && entry.expiresAt <= Date.now())
      entries.delete(entryKey);
  }
  if (entries.size >= MAX_ENDPOINTS_PER_HANDLE) {
    const evictable = [...entries].find(([, entry]) => !entry.flight);
    if (!evictable)
      throw new Error("Too many pending daemon capability probes.");
    entries.delete(evictable[0]);
  }

  const controller = new AbortController();
  const entry: Entry = { expiresAt: 0 };
  const flight: Flight = {
    controller,
    promise: Promise.resolve(undefined),
    waiters: 0,
    settled: false,
  };
  entry.flight = flight;
  entries.set(key, entry);
  const timer = setTimeout(() => {
    controller.abort(
      new DOMException(
        "Search capability discovery timed out.",
        "TimeoutError",
      ),
    );
  }, PROBE_TIMEOUT_MS);
  const operation = probe(handle, url, {
    cwd: opts.cwd ?? handle.getWorkdir(),
    timeout: PROBE_TIMEOUT_MS,
    signal: controller.signal,
  });
  // Keep the entry until the real operation settles, not only until our bounded
  // wait ends. Non-cooperating adapters cannot cause duplicate remote probes.
  operation.then(
    (version) => {
      flight.settled = true;
      clearTimeout(timer);
      if (controller.signal.aborted) entries.delete(key);
      else entries.set(key, { version, expiresAt: Date.now() + CACHE_TTL_MS });
    },
    () => {
      flight.settled = true;
      clearTimeout(timer);
      entries.delete(key);
    },
  );
  flight.promise = new Promise<1 | undefined>((resolve, reject) => {
    const onAbort = () => reject(controller.signal.reason ?? abortError());
    controller.signal.addEventListener("abort", onAbort, { once: true });
    operation.then(resolve, reject).finally(() => {
      controller.signal.removeEventListener("abort", onAbort);
    });
  });
  return join(flight, opts.signal);
}
