/**
 * Next.js Route Handler adapter for sandagent-daemon.
 *
 * Usage in Next.js app router:
 *
 *   // app/api/daemon/[...path]/route.ts
 *   import { createNextHandler } from "@sandagent/daemon/nextjs";
 *   const handler = createNextHandler({ root: "/workspace", prefix: "/api/daemon" });
 *   export const GET = handler;
 *   export const POST = handler;
 *
 * Requests to /api/daemon/healthz      → daemon /healthz
 * Requests to /api/daemon/api/fs/read  → daemon /api/fs/read
 * Requests to /api/daemon/api/coding/run → daemon /api/coding/run (NDJSON stream)
 */

import { DaemonRouter } from "./router.js";
import { codingRunStream, type RunRequest } from "./routes/coding.js";

export function createNextHandler(opts: { root: string; prefix?: string }) {
  const router = new DaemonRouter({ root: opts.root });
  const env = process.env as Record<string, string>;
  const prefix = opts.prefix ?? "/api/daemon";

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    // Strip the mount prefix to get the daemon-internal path
    const pathname = url.pathname.startsWith(prefix)
      ? url.pathname.slice(prefix.length) || "/"
      : url.pathname;
    const method = req.method ?? "GET";

    // Streaming: /api/coding/run → NDJSON stream
    if (method === "POST" && pathname === "/api/coding/run") {
      const body = (await req.json().catch(() => ({}))) as RunRequest;
      return codingRunStream(body, env);
    }

    // Standard JSON routes
    const params =
      method === "GET"
        ? Object.fromEntries(url.searchParams)
        : ((await req.json().catch(() => ({}))) as Record<string, unknown>);

    const result = await router.handle(method, pathname, params);
    if (!result) {
      return Response.json(
        { ok: false, data: null, error: `not found: ${method} ${pathname}` },
        { status: 404 },
      );
    }
    return Response.json(result.body, { status: result.status });
  };
}
