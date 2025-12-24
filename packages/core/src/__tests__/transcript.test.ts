import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MemoryTranscriptWriter,
  ConsoleTranscriptWriter,
  MultiTranscriptWriter,
} from "../transcript.js";
import type { TranscriptEntry } from "../types.js";

describe("Transcript Writers", () => {
  describe("MemoryTranscriptWriter", () => {
    let writer: MemoryTranscriptWriter;

    beforeEach(() => {
      writer = new MemoryTranscriptWriter();
    });

    it("should store entries in memory", () => {
      const entry: TranscriptEntry = {
        timestamp: new Date().toISOString(),
        type: "chunk",
        agentId: "test-agent",
        text: "Hello, world!",
      };

      writer.write(entry);

      const entries = writer.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual(entry);
    });

    it("should return chunks as strings", () => {
      writer.write({
        timestamp: new Date().toISOString(),
        type: "chunk",
        agentId: "test-agent",
        text: "Hello, ",
      });
      writer.write({
        timestamp: new Date().toISOString(),
        type: "chunk",
        agentId: "test-agent",
        text: "world!",
      });

      expect(writer.getChunks()).toEqual(["Hello, ", "world!"]);
    });

    it("should return full output as single string", () => {
      writer.write({
        timestamp: new Date().toISOString(),
        type: "chunk",
        agentId: "test-agent",
        text: "Hello, ",
      });
      writer.write({
        timestamp: new Date().toISOString(),
        type: "chunk",
        agentId: "test-agent",
        text: "world!",
      });

      expect(writer.getFullOutput()).toBe("Hello, world!");
    });

    it("should generate valid JSONL output", () => {
      writer.write({
        timestamp: "2024-01-01T00:00:00.000Z",
        type: "start",
        agentId: "test-agent",
      });
      writer.write({
        timestamp: "2024-01-01T00:00:01.000Z",
        type: "chunk",
        agentId: "test-agent",
        text: "test",
      });

      const jsonl = writer.toJsonl();
      const lines = jsonl.trim().split("\n");
      expect(lines).toHaveLength(2);

      const parsed0 = JSON.parse(lines[0]);
      expect(parsed0.type).toBe("start");

      const parsed1 = JSON.parse(lines[1]);
      expect(parsed1.type).toBe("chunk");
      expect(parsed1.text).toBe("test");
    });

    it("should clear all entries", () => {
      writer.write({
        timestamp: new Date().toISOString(),
        type: "chunk",
        agentId: "test-agent",
        text: "test",
      });
      expect(writer.getEntries()).toHaveLength(1);

      writer.clear();
      expect(writer.getEntries()).toHaveLength(0);
    });
  });

  describe("ConsoleTranscriptWriter", () => {
    it("should write to console", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const writer = new ConsoleTranscriptWriter();

      writer.write({
        timestamp: "2024-01-01T00:00:00.000Z",
        type: "chunk",
        agentId: "test-agent",
        text: "Hello",
      });

      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0][0] as string;
      expect(call).toContain("[Transcript]");
      expect(call).toContain("CHUNK");
      expect(call).toContain("Hello");

      consoleSpy.mockRestore();
    });

    it("should use custom prefix", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const writer = new ConsoleTranscriptWriter("[TEST]");

      writer.write({
        timestamp: "2024-01-01T00:00:00.000Z",
        type: "start",
        agentId: "test-agent",
      });

      const call = consoleSpy.mock.calls[0][0] as string;
      expect(call).toContain("[TEST]");

      consoleSpy.mockRestore();
    });

    it("should log errors to console.error", () => {
      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const writer = new ConsoleTranscriptWriter();

      writer.write({
        timestamp: "2024-01-01T00:00:00.000Z",
        type: "error",
        agentId: "test-agent",
        text: "Something went wrong",
      });

      expect(errorSpy).toHaveBeenCalled();
      const call = errorSpy.mock.calls[0][0] as string;
      expect(call).toContain("ERROR");
      expect(call).toContain("Something went wrong");

      errorSpy.mockRestore();
    });
  });

  describe("MultiTranscriptWriter", () => {
    it("should write to multiple writers", async () => {
      const writer1 = new MemoryTranscriptWriter();
      const writer2 = new MemoryTranscriptWriter();
      const multiWriter = new MultiTranscriptWriter([writer1, writer2]);

      const entry: TranscriptEntry = {
        timestamp: new Date().toISOString(),
        type: "chunk",
        agentId: "test-agent",
        text: "test",
      };

      await multiWriter.write(entry);

      expect(writer1.getEntries()).toHaveLength(1);
      expect(writer2.getEntries()).toHaveLength(1);
      expect(writer1.getEntries()[0]).toEqual(entry);
      expect(writer2.getEntries()[0]).toEqual(entry);
    });

    it("should close all writers", async () => {
      const closeFn = vi.fn();
      const writer1 = { write: vi.fn(), close: closeFn };
      const writer2 = { write: vi.fn(), close: closeFn };
      const multiWriter = new MultiTranscriptWriter([writer1, writer2]);

      await multiWriter.close();

      expect(closeFn).toHaveBeenCalledTimes(2);
    });
  });
});
