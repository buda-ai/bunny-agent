import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBunnyAgentSessionDir } from "../session-dir.js";

const originalFetch = globalThis.fetch;

describe("getBunnyAgentSessionDir", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("hits the daemon endpoint with default runner=pi and cwd=/agent", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            runner: "pi",
            cwd: "/agent",
            dir: "/root/.pi/agent/sessions/--agent--",
          },
          error: null,
        }),
        { status: 200 },
      ),
    );

    const dir = await getBunnyAgentSessionDir("http://sandock/proxy/coding");

    expect(dir).toBe("/root/.pi/agent/sessions/--agent--");
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "http://sandock/proxy/coding/api/coding/session/dir?runner=pi&cwd=%2Fagent",
    );
  });

  it("passes runner and cwd through", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { runner: "pi", cwd: "/workspace", dir: "/x" },
          error: null,
        }),
        { status: 200 },
      ),
    );

    await getBunnyAgentSessionDir("http://d/", {
      runner: "pi",
      cwd: "/workspace",
    });

    const [url] = fetchMock.mock.calls[0];
    // trailing slash is stripped and query is url-encoded
    expect(url).toBe(
      "http://d/api/coding/session/dir?runner=pi&cwd=%2Fworkspace",
    );
  });

  it("throws when daemon returns an error envelope", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          data: null,
          error: "getSessionDir not supported for runner: claude",
        }),
        { status: 400 },
      ),
    );

    await expect(
      getBunnyAgentSessionDir("http://d", { runner: "claude" }),
    ).rejects.toThrow(/getSessionDir not supported for runner: claude/);
  });

  it("throws when response body is not JSON", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>gateway error</html>", { status: 502 }),
    );

    await expect(getBunnyAgentSessionDir("http://d")).rejects.toThrow(
      /not valid JSON/,
    );
  });

  it("throws when data.dir is missing", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, data: { runner: "pi" }, error: null }),
        { status: 200 },
      ),
    );

    await expect(getBunnyAgentSessionDir("http://d")).rejects.toThrow(
      /missing 'data\.dir'/,
    );
  });

  it("wraps fetch errors with context", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(getBunnyAgentSessionDir("http://d")).rejects.toThrow(
      /ECONNREFUSED/,
    );
  });
});
