import { beforeEach, describe, expect, it, vi } from "vitest";
import { SandAgent } from "../sand-agent.js";
import type { SandboxAdapter, SandboxHandle, StreamInput } from "../types.js";

describe("Signal Integration Tests", () => {
  let mockSandbox: SandboxAdapter;
  let mockHandle: SandboxHandle;
  let execSignalReceived: AbortSignal | undefined;

  beforeEach(() => {
    execSignalReceived = undefined;

    mockHandle = {
      exec: vi.fn((command: string[], opts) => {
        // Capture the signal that was passed
        execSignalReceived = opts?.signal;

        // Return an async iterable that respects the signal
        return {
          async *[Symbol.asyncIterator]() {
            const chunks = [
              new TextEncoder().encode("chunk1"),
              new TextEncoder().encode("chunk2"),
              new TextEncoder().encode("chunk3"),
            ];

            for (const chunk of chunks) {
              // Check if signal was aborted
              if (opts?.signal?.aborted) {
                break;
              }
              yield chunk;
              // Small delay to allow abort to happen
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
          },
        };
      }),
      upload: vi.fn(),
      destroy: vi.fn(),
    };

    mockSandbox = {
      attach: vi.fn(async () => mockHandle),
    };
  });

  it("should pass signal from StreamInput to sandbox exec", async () => {
    const agent = new SandAgent({
      sandboxId: "test-agent",
      sandbox: mockSandbox,
      runner: {
        kind: "claude-agent-sdk",
        model: "claude-3-5-sonnet-20241022",
      },
    });

    const controller = new AbortController();
    const input: StreamInput = {
      messages: [{ role: "user", content: "test" }],
      signal: controller.signal,
    };

    const stream = await agent.stream(input);
    expect(stream).toBeInstanceOf(ReadableStream);

    // Verify that the signal was passed to exec
    expect(execSignalReceived).toBe(controller.signal);
  });

  it("should stop streaming when signal is aborted", async () => {
    const agent = new SandAgent({
      sandboxId: "test-agent",
      sandbox: mockSandbox,
      runner: {
        kind: "claude-agent-sdk",
        model: "claude-3-5-sonnet-20241022",
      },
    });

    const controller = new AbortController();
    const input: StreamInput = {
      messages: [{ role: "user", content: "test" }],
      signal: controller.signal,
    };

    const stream = await agent.stream(input);
    const reader = stream.getReader();
    expect(reader).toBeDefined();

    // Read first chunk
    const chunk1 = await reader!.read();
    expect(chunk1.done).toBe(false);

    // Abort the signal
    controller.abort();

    // Try to read more - should complete quickly
    const chunks: Uint8Array[] = [];
    while (true) {
      const result = await reader!.read();
      if (result.done) break;
      chunks.push(result.value);
    }

    // Should have received fewer than all 3 chunks
    expect(chunks.length).toBeLessThan(2);
  });

  it("should handle pre-aborted signal", async () => {
    const agent = new SandAgent({
      sandboxId: "test-agent",
      sandbox: mockSandbox,
      runner: {
        kind: "claude-agent-sdk",
        model: "claude-3-5-sonnet-20241022",
      },
    });

    const controller = new AbortController();
    controller.abort(); // Abort before streaming

    const input: StreamInput = {
      messages: [{ role: "user", content: "test" }],
      signal: controller.signal,
    };

    await expect(agent.stream(input)).rejects.toThrow("Operation was aborted");
  });

  it("should work without signal (backward compatibility)", async () => {
    const agent = new SandAgent({
      sandboxId: "test-agent",
      sandbox: mockSandbox,
      runner: {
        kind: "claude-agent-sdk",
        model: "claude-3-5-sonnet-20241022",
      },
    });

    const input: StreamInput = {
      messages: [{ role: "user", content: "test" }],
      // No signal provided
    };

    const stream = await agent.stream(input);
    expect(stream).toBeInstanceOf(ReadableStream);

    // Verify that exec was called without signal
    expect(execSignalReceived).toBeUndefined();

    // Should be able to read all chunks
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const result = await reader!.read();
      if (result.done) break;
      chunks.push(result.value);
    }

    expect(chunks.length).toBe(3);
  });
});
