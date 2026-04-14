import { describe, expect, it, vi } from "vitest";
import { BunnyAgent } from "../bunny-agent.js";
import type { SandboxAdapter, SandboxHandle } from "../types.js";

/**
 * Create an async iterable from data
 */
function createAsyncIterable<T>(data: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]: () => {
      let index = 0;
      return {
        async next(): Promise<IteratorResult<T>> {
          if (index < data.length) {
            return { value: data[index++], done: false };
          }
          return { value: undefined, done: true };
        },
      };
    },
  };
}

/**
 * Mock sandbox adapter for testing
 */
function createMockSandbox(): SandboxAdapter & { handle: SandboxHandle } {
  const handle: SandboxHandle = {
    getWorkdir: vi.fn().mockReturnValue("/workspace"),
    getSandboxId: vi.fn().mockReturnValue(null),
    getVolumes: vi.fn().mockReturnValue(null),
    exec: vi
      .fn()
      .mockReturnValue(
        createAsyncIterable([new TextEncoder().encode("test output")]),
      ),
    upload: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(""),
    destroy: vi.fn().mockResolvedValue(undefined),
  };

  const adapter: SandboxAdapter & { handle: SandboxHandle } = {
    attach: vi.fn().mockResolvedValue(handle),
    getHandle: vi.fn().mockReturnValue(handle),
    handle,
  };

  return adapter;
}

describe("BunnyAgent", () => {
  describe("stream", () => {
    it("should attach to sandbox and execute command", async () => {
      const sandbox = createMockSandbox();
      const agent = new BunnyAgent({
        sandbox,
        runner: {
          model: "claude-sonnet-4-20250514",
        },
      });

      const stream = await agent.stream({
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(sandbox.attach).toHaveBeenCalledWith();
      expect(stream).toBeInstanceOf(ReadableStream);
    });

    it("should use default workspace path", async () => {
      const sandbox = createMockSandbox();
      const agent = new BunnyAgent({
        sandbox,
        runner: {
          model: "claude-sonnet-4-20250514",
        },
      });

      await agent.stream({
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(sandbox.handle.exec).toHaveBeenCalledWith(
        expect.arrayContaining(["--cwd", "/workspace"]),
        expect.objectContaining({ cwd: "/workspace" }),
      );
    });

    it("should use workspace path from sandbox handle", async () => {
      const sandbox = createMockSandbox();
      const agent = new BunnyAgent({
        sandbox,
        runner: {
          model: "claude-sonnet-4-20250514",
        },
      });

      await agent.stream({
        messages: [{ role: "user", content: "Hello" }],
      });

      // Should use the workdir from handle.getWorkdir() (which returns "/workspace")
      expect(sandbox.handle.exec).toHaveBeenCalledWith(
        expect.arrayContaining(["--cwd", "/workspace"]),
        expect.objectContaining({ cwd: "/workspace" }),
      );
    });

    it("should include user message in command", async () => {
      const sandbox = createMockSandbox();
      const agent = new BunnyAgent({
        sandbox,
        runner: {
          model: "claude-sonnet-4-20250514",
        },
      });

      await agent.stream({
        messages: [{ role: "user", content: "Create a file" }],
      });

      expect(sandbox.handle.exec).toHaveBeenCalledWith(
        expect.arrayContaining(["Create a file"]),
        expect.any(Object),
      );
    });

    it("should pass through stdout without modification", async () => {
      const testData = "test streaming data";
      const sandbox = createMockSandbox();

      // Override exec to return test data using proper async iterable
      sandbox.handle.exec = vi
        .fn()
        .mockReturnValue(
          createAsyncIterable([new TextEncoder().encode(testData)]),
        );

      const agent = new BunnyAgent({
        sandbox,
        runner: {
          model: "claude-sonnet-4-20250514",
        },
      });

      const stream = await agent.stream({
        messages: [{ role: "user", content: "Hello" }],
      });

      const reader = stream.getReader();
      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);

      expect(text).toBe(testData);
    });
  });

  describe("uploadFiles", () => {
    it("should upload files to the sandbox", async () => {
      const sandbox = createMockSandbox();
      const agent = new BunnyAgent({
        sandbox,
        runner: {
          model: "claude-sonnet-4-20250514",
        },
      });

      await agent.uploadFiles([{ path: "test.txt", content: "Hello, World!" }]);

      expect(sandbox.handle.upload).toHaveBeenCalledWith(
        [{ path: "test.txt", content: "Hello, World!" }],
        "/workspace",
      );
    });

    it("should upload files to custom directory", async () => {
      const sandbox = createMockSandbox();
      const agent = new BunnyAgent({
        sandbox,
        runner: {
          model: "claude-sonnet-4-20250514",
        },
      });

      await agent.uploadFiles(
        [{ path: "test.txt", content: "Hello, World!" }],
        "/custom/dir",
      );

      expect(sandbox.handle.upload).toHaveBeenCalledWith(
        [{ path: "test.txt", content: "Hello, World!" }],
        "/custom/dir",
      );
    });
  });

  describe("destroy", () => {
    it("should destroy the sandbox", async () => {
      const sandbox = createMockSandbox();
      const agent = new BunnyAgent({
        sandbox,
        runner: {
          model: "claude-sonnet-4-20250514",
        },
      });

      // First attach to sandbox
      await agent.stream({
        messages: [{ role: "user", content: "Hello" }],
      });

      // Then destroy
      await agent.destroy();

      expect(sandbox.handle.destroy).toHaveBeenCalled();
    });

    it("should do nothing if not attached", async () => {
      const sandbox = createMockSandbox();
      const agent = new BunnyAgent({
        sandbox,
        runner: {
          model: "claude-sonnet-4-20250514",
        },
      });

      // Destroy without attaching first
      await agent.destroy();

      expect(sandbox.handle.destroy).not.toHaveBeenCalled();
    });
  });

  describe("AbortSignal support", () => {
    it("should pass signal to exec()", async () => {
      const sandbox = createMockSandbox();
      const agent = new BunnyAgent({
        sandbox,
        runner: {
          model: "claude-sonnet-4-20250514",
        },
      });

      const controller = new AbortController();
      const signal = controller.signal;

      await agent.stream({
        messages: [{ role: "user", content: "Hello" }],
        signal,
      });

      expect(sandbox.handle.exec).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ signal }),
      );
    });

    it("should throw error if signal is already aborted", async () => {
      const sandbox = createMockSandbox();
      const agent = new BunnyAgent({
        sandbox,
        runner: {
          model: "claude-sonnet-4-20250514",
        },
      });

      const controller = new AbortController();
      controller.abort();
      const signal = controller.signal;

      await expect(
        agent.stream({
          messages: [{ role: "user", content: "Hello" }],
          signal,
        }),
      ).rejects.toThrow("Operation was aborted");
    });

    it("should pass signal to exec()", async () => {
      const sandbox = createMockSandbox();
      const controller = new AbortController();

      sandbox.handle.exec = vi
        .fn()
        .mockReturnValue(
          createAsyncIterable([new TextEncoder().encode("test output")]),
        );

      const agent = new BunnyAgent({
        sandbox,
        runner: {
          model: "claude-sonnet-4-20250514",
        },
      });

      await agent.stream({
        messages: [{ role: "user", content: "Hello" }],
        signal: controller.signal,
      });

      // Verify signal was passed to exec
      expect(sandbox.handle.exec).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          signal: controller.signal,
        }),
      );
    });

    it("should handle AbortError from exec() gracefully", async () => {
      const sandbox = createMockSandbox();
      const transcriptEntries: Array<{
        timestamp: string;
        type: string;
        agentId: string;
        text?: string;
        data?: string;
        metadata?: unknown;
      }> = [];

      const mockTranscriptWriter = {
        write: vi.fn().mockImplementation((entry) => {
          transcriptEntries.push(entry);
          return Promise.resolve();
        }),
      };

      // Create a mock that throws AbortError
      sandbox.handle.exec = vi.fn().mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield new TextEncoder().encode("chunk1");
          const error = new Error("The operation was aborted");
          error.name = "AbortError";
          throw error;
        },
      });

      const agent = new BunnyAgent({
        sandbox,
        runner: {
          model: "claude-sonnet-4-20250514",
        },
      });

      const stream = await agent.stream({
        messages: [{ role: "user", content: "Hello" }],
        transcriptWriter: mockTranscriptWriter,
      });

      const reader = stream.getReader();

      // Read first chunk
      await reader.read();

      // Try to read next chunk - should throw
      await expect(reader.read()).rejects.toThrow();

      // Check that start entry was written
      const startEntry = transcriptEntries.find(
        (entry) => entry.type === "start",
      );
      expect(startEntry).toBeDefined();

      // Check that at least one chunk was written
      const chunkEntry = transcriptEntries.find(
        (entry) => entry.type === "chunk",
      );
      expect(chunkEntry).toBeDefined();

      // AbortError should NOT create an error entry - just stops cleanly
      const errorEntry = transcriptEntries.find(
        (entry) => entry.type === "error",
      );
      expect(errorEntry).toBeUndefined();
    });
  });
});
