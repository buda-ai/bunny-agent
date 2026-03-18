import * as http from "node:http";
import httpProxy from "http-proxy";

export interface ProxyTarget {
  /** Route prefix, e.g. "/api/git" */
  prefix: string;
  /** Target origin, e.g. "http://127.0.0.1:8001" */
  target: string;
  /** Optional: rewrite the path (strip prefix, etc.) */
  rewrite?: (path: string) => string;
}

export function createProxyServer(): httpProxy {
  return httpProxy.createProxyServer({ ws: true });
}

/**
 * Try to match and proxy a request. Returns true if handled.
 */
export function tryProxy(
  proxy: httpProxy,
  targets: ProxyTarget[],
  req: http.IncomingMessage,
  res: http.ServerResponse,
): boolean {
  const url = req.url ?? "/";
  for (const t of targets) {
    if (url.startsWith(t.prefix)) {
      if (t.rewrite) {
        req.url = t.rewrite(url);
      }
      proxy.web(req, res, { target: t.target }, (err) => {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, data: null, error: `proxy error: ${err.message}` }));
      });
      return true;
    }
  }
  return false;
}
