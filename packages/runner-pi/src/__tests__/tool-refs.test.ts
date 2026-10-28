import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { TOOL_OUTPUT_MAX_BYTES } from "@bunny-agent/manager";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildToolDefinitionsFromRefs, type PiToolRef } from "../tool-refs.js";

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, tmpdir: vi.fn(actual.tmpdir) };
});

const systemTempDirectory = tmpdir();

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
  let tempDirectory: string;

  beforeEach(async () => {
    tempDirectory = mkdtempSync(
      join(systemTempDirectory, "bunny-pi-tool-refs-"),
    );
    vi.mocked(tmpdir).mockReturnValue(tempDirectory);
    server = await startFakeBridge(({ body }) => ({
      body: { now: "2026-04-29T00:00:00.000Z", echoed: body },
    }));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await server.close();
    rmSync(tempDirectory, { recursive: true, force: true });
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

  it("surfaces non-2xx responses as a thrown tool error", async () => {
    await server.close();
    server = await startFakeBridge(() => ({
      status: 403,
      body: "tool not enabled for this agent",
    }));

    const [tool] = buildToolDefinitionsFromRefs([
      { ...sampleSpec, runtime: { type: "http", url: server.url } },
    ]);
    await expect(
      tool.execute("tc_2", {}, undefined, undefined, undefined as never),
    ).rejects.toMatchObject({
      name: "PiToolRefError",
      status: 403,
      body: "tool not enabled for this agent",
      message: "tool not enabled for this agent",
    });
  });

  it("propagates AbortSignal so a cancelled run terminates the fetch", async () => {
    // Replace the server with one that never responds so we can assert the
    // abort path. The bridge fetch should reject with an AbortError-like
    // condition that the wrapper converts into a thrown tool error.
    await server.close();
    server = await startFakeBridge(() => ({
      body: { ok: true },
    }));

    const controller = new AbortController();
    controller.abort();

    const [tool] = buildToolDefinitionsFromRefs([
      { ...sampleSpec, runtime: { type: "http", url: server.url } },
    ]);
    await expect(
      tool.execute(
        "tc_3",
        {},
        controller.signal,
        undefined,
        undefined as never,
      ),
    ).rejects.toMatchObject({
      name: "PiToolRefError",
      message: expect.stringMatching(/transport error.*abort/i),
    });
  });

  it("includes the underlying fetch cause in transport errors", async () => {
    const socketError = Object.assign(new Error("other side closed"), {
      code: "UND_ERR_SOCKET",
    });
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      Object.assign(new TypeError("fetch failed"), { cause: socketError }),
    );

    const [tool] = buildToolDefinitionsFromRefs([
      { ...sampleSpec, runtime: { type: "http", url: server.url } },
    ]);

    await expect(
      tool.execute(
        "tc_transport",
        {},
        undefined,
        undefined,
        undefined as never,
      ),
    ).rejects.toMatchObject({
      name: "PiToolRefError",
      message:
        'Tool "get_current_time" transport error: fetch failed (cause: UND_ERR_SOCKET: other side closed)',
    });
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

  it.each([
    200, 500,
  ])("bounds oversized HTTP responses while preserving status %i semantics", async (status) => {
    const body = JSON.stringify({
      records: [{ report: "work log\\n".repeat(400_000) }],
    });
    await server.close();
    server = await startFakeBridge(() => ({ status, body }));
    const [tool] = buildToolDefinitionsFromRefs([
      { ...sampleSpec, runtime: { type: "http", url: server.url } },
    ]);
    let text: string;
    if (status === 200) {
      const result = await tool.execute(
        "large",
        {},
        undefined,
        undefined,
        undefined as never,
      );
      text = (result.content[0] as { text: string }).text;
    } else {
      const error = await tool
        .execute("large", {}, undefined, undefined, undefined as never)
        .catch((error) => error);
      expect(error).toMatchObject({ name: "PiToolRefError", status });
      text = error.message;
      expect(error.body).toBe(text);
    }
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(TOOL_OUTPUT_MAX_BYTES);
    const path = JSON.parse(text.match(/Full output saved to: (".*?")\./)![1]);
    expect(path.startsWith(tempDirectory)).toBe(true);
    expect(readFileSync(path, "utf8")).toBe(body);
  });

  it("guards concurrent module results and oversized thrown errors", async () => {
    const modulePath = join(tempDirectory, "large.mjs");
    writeFileSync(
      modulePath,
      'export function execute(input) { if (input.fail) throw new Error("failure".repeat(100000)); return input.id + ":" + "x".repeat(100000); }',
    );
    const [tool] = buildToolDefinitionsFromRefs([
      {
        ...sampleSpec,
        runtime: { type: "module", module: pathToFileURL(modulePath).href },
      },
    ]);
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, id) =>
        tool.execute(
          `batch_${id}`,
          { id },
          undefined,
          undefined,
          undefined as never,
        ),
      ),
    );
    for (const [id, result] of results.entries()) {
      const text = (result.content[0] as { text: string }).text;
      expect(Buffer.byteLength(text)).toBeLessThanOrEqual(
        TOOL_OUTPUT_MAX_BYTES,
      );
      const details = result.details as {
        outputGuard: { fullOutputPath: string };
      };
      expect(readFileSync(details.outputGuard.fullOutputPath, "utf8")).toBe(
        `${id}:${"x".repeat(100_000)}`,
      );
    }
    const error = await tool
      .execute("fail", { fail: true }, undefined, undefined, undefined as never)
      .catch((error) => error);
    expect(error.name).toBe("PiToolRefError");
    expect(Buffer.byteLength(error.message)).toBeLessThanOrEqual(
      TOOL_OUTPUT_MAX_BYTES,
    );
    expect(error.message).toContain("Full output saved to:");
  });
});
