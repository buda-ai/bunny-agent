import { describe, expect, it, vi } from "vitest";
import { SandAgent } from "../sand-agent.js";
import type { ExecOptions, SandboxAdapter, SandboxHandle } from "../types.js";

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
    exec: vi
      .fn()
      .mockReturnValue(
        createAsyncIterable([new TextEncoder().encode("test output")]),
      ),
    upload: vi.fn().mockResolvedValue(undefined),
    download: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  };

  const adapter: SandboxAdapter & { handle: SandboxHandle } = {
    attach: vi.fn().mockResolvedValue(handle),
    handle,
  };

  return adapter;
}

describe("SandAgent", () => {
  describe("constructor", () => {
    it("should create an agent with the given options", () => {
      const sandbox = createMockSandbox();
      const agent = new SandAgent({
        id: "test-agent",
        sandbox,
        runner: {
          kind: "claude-agent-sdk",
          model: "claude-sonnet-4-20250514",
        },
      });

      expect(agent.getId()).toBe("test-agent");
    });
  });

  describe("stream", () => {
    it("should attach to sandbox and execute command", async () => {
      const sandbox = createMockSandbox();
      const agent = new SandAgent({
        id: "test-agent",
        sandbox,
        runner: {
          kind: "claude-agent-sdk",
          model: "claude-sonnet-4-20250514",
        },
      });

      const response = await agent.stream({
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(sandbox.attach).toHaveBeenCalledWith("test-agent");
      expect(response).toBeInstanceOf(Response);
      expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    });

    it("should use default workspace path", async () => {
      const sandbox = createMockSandbox();
      const agent = new SandAgent({
        id: "test-agent",
        sandbox,
        runner: {
          kind: "claude-agent-sdk",
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

    it("should use custom workspace path", async () => {
      const sandbox = createMockSandbox();
      const agent = new SandAgent({
        id: "test-agent",
        sandbox,
        runner: {
          kind: "claude-agent-sdk",
          model: "claude-sonnet-4-20250514",
        },
      });

      await agent.stream({
        messages: [{ role: "user", content: "Hello" }],
        workspace: { path: "/custom/path" },
      });

      expect(sandbox.handle.exec).toHaveBeenCalledWith(
        expect.arrayContaining(["--cwd", "/custom/path"]),
        expect.objectContaining({ cwd: "/custom/path" }),
      );
    });

    it("should include user message in command", async () => {
      const sandbox = createMockSandbox();
      const agent = new SandAgent({
        id: "test-agent",
        sandbox,
        runner: {
          kind: "claude-agent-sdk",
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

      const agent = new SandAgent({
        id: "test-agent",
        sandbox,
        runner: {
          kind: "claude-agent-sdk",
          model: "claude-sonnet-4-20250514",
        },
      });

      const response = await agent.stream({
        messages: [{ role: "user", content: "Hello" }],
      });

      const reader = response.body!.getReader();
      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);

      expect(text).toBe(testData);
    });
  });

  describe("uploadFiles", () => {
    it("should upload files to the sandbox", async () => {
      const sandbox = createMockSandbox();
      const agent = new SandAgent({
        id: "test-agent",
        sandbox,
        runner: {
          kind: "claude-agent-sdk",
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
      const agent = new SandAgent({
        id: "test-agent",
        sandbox,
        runner: {
          kind: "claude-agent-sdk",
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
      const agent = new SandAgent({
        id: "test-agent",
        sandbox,
        runner: {
          kind: "claude-agent-sdk",
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
      const agent = new SandAgent({
        id: "test-agent",
        sandbox,
        runner: {
          kind: "claude-agent-sdk",
          model: "claude-sonnet-4-20250514",
        },
      });

      // Destroy without attaching first
      await agent.destroy();

      expect(sandbox.handle.destroy).not.toHaveBeenCalled();
    });
  });
});
