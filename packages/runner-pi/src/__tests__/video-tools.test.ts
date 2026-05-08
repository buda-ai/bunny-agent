import { describe, expect, it, vi } from "vitest";
import {
  buildVideoGenerateTool,
  resolveVideoProvider,
} from "../video-tools.js";

// Minimal stub for ExtensionContext required by tool.execute signature
const mockCtx = {} as Parameters<
  NonNullable<ReturnType<typeof buildVideoGenerateTool>>["execute"]
>[4];

describe("video-tools", () => {
  describe("resolveVideoProvider", () => {
    it("returns null if ARK_API_KEY is missing", () => {
      expect(resolveVideoProvider({})).toBeNull();
      expect(resolveVideoProvider({ ARK_MODEL_ID: "model-id" })).toBeNull();
    });

    it("returns byteplus provider if ARK_API_KEY is present", () => {
      const provider = resolveVideoProvider({ ARK_API_KEY: "secret" });
      expect(provider).not.toBeNull();
      expect(provider?.id).toBe("byteplus");
      expect(provider?.label).toBe("BytePlus Ark");
    });
  });

  describe("buildVideoGenerateTool", () => {
    it("returns null if no provider is resolved", () => {
      expect(buildVideoGenerateTool({})).toBeNull();
    });

    it("returns ToolDefinition when provider is resolved", () => {
      const tool = buildVideoGenerateTool({ ARK_API_KEY: "secret" });
      expect(tool).not.toBeNull();
      expect(tool?.name).toBe("generate_video");
      expect(tool?.label).toContain("BytePlus Ark");
      expect(tool?.parameters.properties.prompt).toBeDefined();
    });

    it("polls until the task succeeds and returns the video URL", async () => {
      const tool = buildVideoGenerateTool({ ARK_API_KEY: "secret" });
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      mockFetch
        // create
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "task-123" }),
        } as Response)
        // first poll: running
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: "running" }),
        } as Response)
        // second poll: succeeded
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            status: "succeeded",
            content: [{ video: { url: "https://example.com/video.mp4" } }],
          }),
        } as Response);

      // Make sleepAbortable resolve immediately so the poll loop doesn't stall.
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = ((fn: () => void) => {
        fn();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout;

      try {
        const onUpdate = vi.fn();
        const result = await tool!.execute(
          "call-id",
          { prompt: "test video prompt" },
          undefined,
          onUpdate,
          mockCtx,
        );

        expect(mockFetch).toHaveBeenCalledTimes(3);
        const first = result.content[0];
        if (first.type !== "text") throw new Error("expected text content");
        expect(first.text).toContain("https://example.com/video.mp4");
        expect(first.text).toContain("task-123");
      } finally {
        global.setTimeout = originalSetTimeout;
        vi.unstubAllGlobals();
      }
    });

    it("throws when the task ends in failed status", async () => {
      const tool = buildVideoGenerateTool({ ARK_API_KEY: "secret" });
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "task-fail" }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: "failed", error: "upstream exploded" }),
        } as Response);

      const originalSetTimeout = global.setTimeout;
      global.setTimeout = ((fn: () => void) => {
        fn();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout;

      try {
        await expect(
          tool!.execute(
            "call-id",
            { prompt: "x" },
            undefined,
            vi.fn(),
            mockCtx,
          ),
        ).rejects.toThrow(/failed.*upstream exploded/);
      } finally {
        global.setTimeout = originalSetTimeout;
        vi.unstubAllGlobals();
      }
    });

    it("calls cancel (DELETE) when aborted mid-poll", async () => {
      const tool = buildVideoGenerateTool({ ARK_API_KEY: "secret" });
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "task-abort" }),
      } as Response);

      const controller = new AbortController();
      // Abort on the next microtask so sleepAbortable has time to attach its
      // abort listener (it registers it after calling setTimeout).
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = ((_fn: () => void) => {
        queueMicrotask(() => controller.abort());
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout;

      // Subsequent fetch (the DELETE) — respond 200.
      mockFetch.mockResolvedValueOnce({ ok: true } as Response);

      try {
        await expect(
          tool!.execute(
            "call-id",
            { prompt: "x" },
            controller.signal,
            vi.fn(),
            mockCtx,
          ),
        ).rejects.toThrow(/aborted/);
      } finally {
        global.setTimeout = originalSetTimeout;
      }

      const deleteCall = mockFetch.mock.calls.find(
        ([, init]: [string, RequestInit | undefined]) =>
          init?.method === "DELETE",
      );
      expect(deleteCall).toBeDefined();
      expect(deleteCall![0]).toContain(
        "/contents/generations/tasks/task-abort",
      );

      vi.unstubAllGlobals();
    });
  });
});
