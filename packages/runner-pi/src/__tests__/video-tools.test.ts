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

    it("creates a tool that invokes provider.generate()", async () => {
      const tool = buildVideoGenerateTool({ ARK_API_KEY: "secret" });
      expect(tool).not.toBeNull();

      // Mock fetch globally
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      // Mocking fetch responses for create task and poll task
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "task-123" }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            status: "succeeded",
            content: [{ video: { url: "https://example.com/video.mp4" } }],
          }),
        } as Response);

      // Mock setTimeout to run instantly
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = ((fn: () => void) => {
        fn();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout;

      const onUpdate = vi.fn();
      const result = await tool!.execute(
        "call-id",
        { prompt: "test video prompt" },
        undefined,
        onUpdate,
        mockCtx,
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const first = result.content[0];
      expect(first.type).toBe("text");
      if (first.type !== "text") throw new Error("expected text content");
      expect(first.text).toContain("https://example.com/video.mp4");
      expect(first.text).toContain("task-123");

      // Restore
      global.setTimeout = originalSetTimeout;
      vi.restoreAllMocks();
    });
  });
});
