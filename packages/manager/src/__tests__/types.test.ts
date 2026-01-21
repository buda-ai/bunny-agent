import { describe, expect, it } from "vitest";
import type { ExecOptions, StreamInput } from "../types.js";

describe("Type Definitions", () => {
  describe("ExecOptions", () => {
    it("should accept signal parameter", () => {
      const controller = new AbortController();
      const options: ExecOptions = {
        signal: controller.signal,
      };

      expect(options.signal).toBeDefined();
      expect(options.signal).toBe(controller.signal);
    });

    it("should accept signal with other options", () => {
      const controller = new AbortController();
      const options: ExecOptions = {
        cwd: "/workspace",
        env: { NODE_ENV: "test" },
        timeout: 5000,
        signal: controller.signal,
      };

      expect(options.signal).toBe(controller.signal);
      expect(options.cwd).toBe("/workspace");
      expect(options.env).toEqual({ NODE_ENV: "test" });
      expect(options.timeout).toBe(5000);
    });

    it("should allow signal to be undefined", () => {
      const options: ExecOptions = {
        cwd: "/workspace",
      };

      expect(options.signal).toBeUndefined();
    });

    it("should allow empty options object", () => {
      const options: ExecOptions = {};

      expect(options.signal).toBeUndefined();
    });
  });

  describe("StreamInput", () => {
    it("should accept signal parameter", () => {
      const controller = new AbortController();
      const input: StreamInput = {
        messages: [{ role: "user", content: "Hello" }],
        signal: controller.signal,
      };

      expect(input.signal).toBeDefined();
      expect(input.signal).toBe(controller.signal);
    });

    it("should accept signal with other options", () => {
      const controller = new AbortController();
      const input: StreamInput = {
        messages: [{ role: "user", content: "Hello" }],
        workspace: { path: "/workspace" },
        contentType: "text/event-stream",
        resume: "session-123",
        signal: controller.signal,
      };

      expect(input.signal).toBe(controller.signal);
      expect(input.workspace?.path).toBe("/workspace");
      expect(input.contentType).toBe("text/event-stream");
      expect(input.resume).toBe("session-123");
    });

    it("should allow signal to be undefined", () => {
      const input: StreamInput = {
        messages: [{ role: "user", content: "Hello" }],
      };

      expect(input.signal).toBeUndefined();
    });

    it("should require messages even with signal", () => {
      const controller = new AbortController();
      const input: StreamInput = {
        messages: [],
        signal: controller.signal,
      };

      expect(input.messages).toEqual([]);
      expect(input.signal).toBe(controller.signal);
    });
  });

  describe("Signal Type Inference", () => {
    it("should infer AbortSignal type correctly", () => {
      const controller = new AbortController();
      const options: ExecOptions = {
        signal: controller.signal,
      };

      // TypeScript should infer the type correctly
      const signal: AbortSignal | undefined = options.signal;
      expect(signal).toBe(controller.signal);
    });

    it("should allow AbortSignal methods to be called", () => {
      const controller = new AbortController();
      const options: ExecOptions = {
        signal: controller.signal,
      };

      if (options.signal) {
        // These should compile without errors
        expect(typeof options.signal.aborted).toBe("boolean");
        expect(typeof options.signal.addEventListener).toBe("function");
        expect(typeof options.signal.removeEventListener).toBe("function");
      }
    });

    it("should handle pre-aborted signal", () => {
      const controller = new AbortController();
      controller.abort();

      const options: ExecOptions = {
        signal: controller.signal,
      };

      expect(options.signal?.aborted).toBe(true);
    });

    it("should handle signal abort event", () => {
      const controller = new AbortController();
      const options: ExecOptions = {
        signal: controller.signal,
      };

      let aborted = false;
      options.signal?.addEventListener("abort", () => {
        aborted = true;
      });

      controller.abort();

      expect(aborted).toBe(true);
      expect(options.signal?.aborted).toBe(true);
    });
  });

  describe("Type Compatibility", () => {
    it("should accept signal from Request object", () => {
      // Simulate a Request object's signal
      const controller = new AbortController();
      const mockRequest = {
        signal: controller.signal,
      };

      const input: StreamInput = {
        messages: [{ role: "user", content: "Hello" }],
        signal: mockRequest.signal,
      };

      expect(input.signal).toBe(mockRequest.signal);
    });

    it("should work with signal passed through multiple layers", () => {
      const controller = new AbortController();

      // Simulate passing signal through layers
      const streamInput: StreamInput = {
        messages: [{ role: "user", content: "Hello" }],
        signal: controller.signal,
      };

      const execOptions: ExecOptions = {
        signal: streamInput.signal,
      };

      expect(execOptions.signal).toBe(controller.signal);
      expect(streamInput.signal).toBe(controller.signal);
    });
  });
});
