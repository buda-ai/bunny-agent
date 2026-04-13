import * as fs from "node:fs";
import type { TranscriptEntry, TranscriptWriter } from "./types.js";

/**
 * JSONL Transcript Writer
 *
 * Writes transcript entries as JSONL (JSON Lines) format for debugging and replay.
 * Each line is a valid JSON object representing a transcript entry.
 *
 * @example
 * ```ts
 * import { JsonlTranscriptWriter } from "@bunny-agent/manager";
 *
 * const writer = new JsonlTranscriptWriter("./transcript.jsonl");
 *
 * const agent = new BunnyAgent({ ... });
 * const response = await agent.stream({
 *   messages,
 *   transcriptWriter: writer,
 * });
 *
 * // After streaming completes
 * await writer.close();
 * ```
 */
export class JsonlTranscriptWriter implements TranscriptWriter {
  private readonly filePath: string;
  private readonly stream: fs.WriteStream;
  private closed = false;

  /**
   * Create a new JSONL transcript writer
   * @param filePath - Path to write the JSONL file
   * @param options - Writer options
   */
  constructor(filePath: string, options: { append?: boolean } = {}) {
    this.filePath = filePath;
    this.stream = fs.createWriteStream(filePath, {
      flags: options.append ? "a" : "w",
      encoding: "utf-8",
    });
  }

  /**
   * Write a transcript entry as a JSONL line
   */
  write(entry: TranscriptEntry): void {
    if (this.closed) {
      throw new Error("TranscriptWriter is closed");
    }
    const line = JSON.stringify(entry) + "\n";
    this.stream.write(line);
  }

  /**
   * Close the writer and flush pending data
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    return new Promise((resolve, reject) => {
      this.stream.end((error?: Error | null) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get the file path of the transcript
   */
  getFilePath(): string {
    return this.filePath;
  }
}

/**
 * In-memory transcript writer for testing and debugging
 *
 * @example
 * ```ts
 * const writer = new MemoryTranscriptWriter();
 * const response = await agent.stream({ messages, transcriptWriter: writer });
 *
 * // Access entries after streaming
 * console.log(writer.getEntries());
 * ```
 */
export class MemoryTranscriptWriter implements TranscriptWriter {
  private readonly entries: TranscriptEntry[] = [];

  write(entry: TranscriptEntry): void {
    this.entries.push(entry);
  }

  /**
   * Get all recorded entries
   */
  getEntries(): ReadonlyArray<TranscriptEntry> {
    return this.entries;
  }

  /**
   * Get entries as JSONL string
   */
  toJsonl(): string {
    return this.entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  }

  /**
   * Get only chunk entries with decoded text
   */
  getChunks(): string[] {
    return this.entries
      .filter((e) => e.type === "chunk" && e.text)
      .map((e) => e.text!);
  }

  /**
   * Get the full streamed output as a single string
   */
  getFullOutput(): string {
    return this.getChunks().join("");
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries.length = 0;
  }
}

/**
 * Console transcript writer for debugging
 * Outputs transcript entries to console in a readable format
 */
export class ConsoleTranscriptWriter implements TranscriptWriter {
  private readonly prefix: string;

  constructor(prefix = "[Transcript]") {
    this.prefix = prefix;
  }

  write(entry: TranscriptEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString();
    const type = entry.type.toUpperCase().padEnd(8);

    if (entry.type === "chunk" && entry.text) {
      // For chunks, show the text content
      console.log(`${this.prefix} ${timestamp} ${type} ${entry.text}`);
    } else if (entry.type === "error") {
      console.error(
        `${this.prefix} ${timestamp} ${type} ${entry.text ?? entry.data}`,
      );
    } else if (entry.metadata) {
      console.log(
        `${this.prefix} ${timestamp} ${type} ${JSON.stringify(entry.metadata)}`,
      );
    } else {
      console.log(`${this.prefix} ${timestamp} ${type}`);
    }
  }
}

/**
 * Multi-writer that writes to multiple transcript writers
 * Useful for both logging and recording simultaneously
 *
 * @example
 * ```ts
 * const writer = new MultiTranscriptWriter([
 *   new JsonlTranscriptWriter("./transcript.jsonl"),
 *   new ConsoleTranscriptWriter(),
 * ]);
 * ```
 */
export class MultiTranscriptWriter implements TranscriptWriter {
  private readonly writers: TranscriptWriter[];

  constructor(writers: TranscriptWriter[]) {
    this.writers = writers;
  }

  async write(entry: TranscriptEntry): Promise<void> {
    await Promise.all(this.writers.map((w) => w.write(entry)));
  }

  async close(): Promise<void> {
    await Promise.all(
      this.writers.map((w) => (w.close ? w.close() : Promise.resolve())),
    );
  }
}
