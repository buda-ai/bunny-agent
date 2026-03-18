/**
 * Next.js Route Handler adapter for sandagent-daemon.
 *
 * Usage in Next.js app router:
 *
 *   // app/api/daemon/[...path]/route.ts
 *   import { createNextHandler } from "@sandagent/daemon/nextjs";
 *   const handler = createNextHandler({ root: "/workspace" });
 *   export const GET = handler;
 *   export const POST = handler;
 */

import { DaemonRouter } from "./router.js";

export function createNextHandler(opts: { root: string }) {
  const router = new DaemonRouter({ root: opts.root });

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    // Strip the Next.js prefix: /api/daemon/fs/read -> /api/fs/read
    const pathname = url.pathname.replace(/^\/api\/daemon/, "/api");
    const method = req.method ?? "GET";

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
