import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildToolDefinitionsFromRefs, type PiToolRef } from "../tool-refs.js";

interface CapturedCall {
  authorization: string | undefined;
  contentType: string | undefined;
  body: unknown;
}

interface FakeBridgeServer {
  url: string;
  calls: CapturedCall[];
  close: () => Promise<void>;
}

async function startFakeBridge(
  handler: (call: CapturedCall) => {
    status?: number;
    body: string | object;
  },
): Promise<FakeBridgeServer> {
  const calls: CapturedCall[] = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      const call: CapturedCall = {
        authorization: req.headers.authorization,
        contentType: req.headers["content-type"] as string | undefined,
        body: raw ? JSON.parse(raw) : { name: "", input: undefined },
      };
      calls.push(call);
      const result = handler(call);
      res.statusCode = result.status ?? 200;
      res.setHeader("content-type", "application/json");
      res.end(
        typeof result.body === "string"
          ? result.body
          : JSON.stringify(result.body),
      );
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}/invoke`,
    calls,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

const sampleSpec: Omit<PiToolRef, "runtime"> = {
  name: "get_current_time",
  description: "Return the current ISO timestamp.",
  inputSchema: {
    type: "object",
    properties: {
      timezone: { type: "string", description: "IANA timezone, e.g. UTC" },
    },
    required: [],
  },
};

describe("buildToolDefinitionsFromRefs", () => {
  let server: FakeBridgeServer;

  beforeEach(async () => {
    server = await startFakeBridge(({ body }) => ({
      body: { now: "2026-04-29T00:00:00.000Z", echoed: body },
    }));
  });

  afterEach(async () => {
    await server.close();
  });

  it("posts direct HTTP runtime inputs with configured headers", async () => {
    const [tool] = buildToolDefinitionsFromRefs([
      {
        ...sampleSpec,
        runtime: {
          type: "http",
          url: server.url,
          headers: { Authorization: "Bearer test-token-123" },
        },
      },
    ]);
    expect(tool.name).toBe("get_current_time");
    expect(tool.label).toBe("get_current_time");
    expect(tool.description).toBe(sampleSpec.description);

    const result = await tool.execute(
      "tc_1",
      { timezone: "UTC" },
      undefined,
      undefined,
      // ExtensionContext is unused by the wrapper; cast to satisfy the type
      undefined as never,
    );

    expect(server.calls).toHaveLength(1);
    const [call] = server.calls;
    expect(call.authorization).toBe("Bearer test-token-123");
    expect(call.contentType).toBe("application/json");
    expect(call.body).toEqual({ timezone: "UTC" });

    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: JSON.stringify({
        now: "2026-04-29T00:00:00.000Z",
        echoed: { timezone: "UTC" },
      }),
    });
  });

  it("surfaces non-2xx responses as a tool error message", async () => {
    await server.close();
    server = await startFakeBridge(() => ({
      status: 403,
      body: "tool not enabled for this agent",
    }));

    const [tool] = buildToolDefinitionsFromRefs([
      { ...sampleSpec, runtime: { type: "http", url: server.url } },
    ]);
    const result = await tool.execute(
      "tc_2",
      {},
      undefined,
      undefined,
      undefined as never,
    );

    expect(result.content[0]).toMatchObject({ type: "text" });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/status 403/);
    expect(text).toMatch(/tool not enabled/);
  });

  it("propagates AbortSignal so a cancelled run terminates the fetch", async () => {
    // Replace the server with one that never responds so we can assert the
    // abort path. The bridge fetch should reject with an AbortError-like
    // condition that the wrapper converts into a tool-error result.
    await server.close();
    server = await startFakeBridge(() => ({
      // Hold the response by returning very late — but http.createServer
      // resolves synchronously here. To keep the test deterministic, we
      // instead abort BEFORE calling execute and rely on the fetch failing
      // immediately on the pre-aborted signal.
      body: { ok: true },
    }));

    const controller = new AbortController();
    controller.abort();

    const [tool] = buildToolDefinitionsFromRefs([
      { ...sampleSpec, runtime: { type: "http", url: server.url } },
    ]);
    const result = await tool.execute(
      "tc_3",
      {},
      controller.signal,
      undefined,
      undefined as never,
    );

    const text = (result.content[0] as { text: string }).text;
    // Either fetch failed (aborted) or never reached the server. Both surface
    // as a transport error from the wrapper, which is what we want.
    expect(text).toMatch(/transport error/i);
    expect(text).toMatch(/abort/i);
  });

  it("executes sandbox module runtime tools", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bunny-agent-module-tool-"));
    const modulePath = join(dir, "tool.mjs");
    writeFileSync(
      modulePath,
      "export async function run(input, ctx) { return { input, aborted: ctx.signal?.aborted ?? false }; }\n",
    );
    try {
      const [tool] = buildToolDefinitionsFromRefs([
        {
          ...sampleSpec,
          runtime: {
            type: "module",
            module: pathToFileURL(modulePath).href,
            exportName: "run",
          },
        },
      ]);

      const result = await tool.execute(
        "tc_module",
        { timezone: "UTC" },
        undefined,
        undefined,
        undefined as never,
      );

      expect(result.content[0]).toMatchObject({
        type: "text",
        text: JSON.stringify({
          input: { timezone: "UTC" },
          aborted: false,
        }),
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
