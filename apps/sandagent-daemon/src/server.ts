import * as http from "node:http";
import { URL } from "node:url";
import { fail } from "./utils.js";
import { DaemonRouter } from "./router.js";
import { sandagentRun } from "./routes/sandagent.js";

export interface DaemonConfig {
  host: string;
  port: number;
  root: string;
}

export function createDaemon(config: DaemonConfig): http.Server {
  const router = new DaemonRouter({ root: config.root });
  const env = process.env as Record<string, string>;

  return http.createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;

    // Streaming: /api/sandagent/run
    if (method === "POST" && pathname === "/api/sandagent/run") {
      const body = JSON.parse(await readBody(req) || "{}");
      return sandagentRun(body, res, env);
    }

    // Standard JSON routes
    const params = method === "GET"
      ? Object.fromEntries(url.searchParams)
      : JSON.parse(await readBody(req) || "{}");

    const result = await router.handle(method, pathname, params);
    const status = result?.status ?? 404;
    const body = result?.body ?? fail(`not found: ${method} ${pathname}`);
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  });
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}
