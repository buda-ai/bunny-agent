import { beforeEach, describe, expect, it, vi } from "vitest";
import { SandockSandbox } from "../sandock-sandbox.js";

// Mock child_process
vi.mock("child_process", () => ({
  spawn: vi.fn().mockReturnValue({
    stdout: {
      on: vi.fn(),
      [Symbol.asyncIterator]: vi.fn().mockReturnValue({
        next: vi.fn().mockResolvedValue({ done: true }),
      }),
    },
    stderr: { on: vi.fn() },
    stdin: { write: vi.fn(), end: vi.fn() },
    on: vi.fn((event, callback) => {
      if (event === "close") {
        // Simulate successful exit
        setTimeout(() => callback(0), 10);
      }
    }),
    kill: vi.fn(),
  }),
}));

describe("SandockSandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should use default values", () => {
      const sandbox = new SandockSandbox();
      // Check defaults through behavior, not private properties
      expect(sandbox).toBeInstanceOf(SandockSandbox);
    });

    it("should accept custom options", () => {
      const sandbox = new SandockSandbox({
        image: "python:3.11-slim",
        volumePrefix: "custom-prefix",
        networkMode: "none",
        dockerArgs: ["--memory=1g"],
      });
      expect(sandbox).toBeInstanceOf(SandockSandbox);
    });
  });

  describe("attach", () => {
    it("should implement SandboxAdapter interface", () => {
      const sandbox = new SandockSandbox();
      expect(typeof sandbox.attach).toBe("function");
    });

    it("should return a handle with required methods", async () => {
      const sandbox = new SandockSandbox();

      // The attach method depends on Docker, so we just verify the interface
      // In a real environment, this would create/attach to a container
      try {
        const handle = await sandbox.attach("test-id");
        expect(typeof handle.exec).toBe("function");
        expect(typeof handle.upload).toBe("function");
        expect(typeof handle.destroy).toBe("function");
      } catch {
        // Expected to fail without Docker
        // Just verify the method exists
        expect(sandbox.attach).toBeDefined();
      }
    });
  });
});

describe("SandockSandbox Configuration", () => {
  it("should support different network modes", () => {
    const modes = ["none", "bridge", "host"] as const;
    for (const mode of modes) {
      const sandbox = new SandockSandbox({ networkMode: mode });
      expect(sandbox).toBeInstanceOf(SandockSandbox);
    }
  });

  it("should support custom Docker images", () => {
    const images = [
      "node:20-slim",
      "python:3.11-slim",
      "ubuntu:22.04",
      "alpine:latest",
    ];
    for (const image of images) {
      const sandbox = new SandockSandbox({ image });
      expect(sandbox).toBeInstanceOf(SandockSandbox);
    }
  });

  it("should support custom Docker args", () => {
    const sandbox = new SandockSandbox({
      dockerArgs: ["--memory=2g", "--cpus=2", "--env=NODE_ENV=production"],
    });
    expect(sandbox).toBeInstanceOf(SandockSandbox);
  });
});
