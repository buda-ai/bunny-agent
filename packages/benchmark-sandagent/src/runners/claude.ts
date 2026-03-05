/**
 * SandAgent Claude Runner
 *
 * Tests: sandagent run --runner claude
 */

import type { BenchmarkResult } from "@sandagent/benchmark-shared";
import { BaseRunner } from "./base.js";

class SandAgentClaudeRunner extends BaseRunner {
  readonly name = "claude";
  readonly defaults = {
    command: "sandagent",
    args: ["run", "--runner", "claude", "--output-format", "stream-json", "--"],
    timeout: 300000, // 5 minutes
  };

  extractAnswer(rawOutput: Required<BenchmarkResult["rawOutput"]>): string {
    if (typeof rawOutput === "string") {
      // Parse NDJSON output from Claude Agent SDK
      const lines = rawOutput.split('\n').filter(line => line.trim());
      const messages: any[] = [];
      
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          messages.push(parsed);
        } catch {
          // Skip non-JSON lines (dotenv logs, etc.)
        }
      }
      
      if (messages.length > 0) {
        return this.extractFromMessages(messages);
      }
      
      return rawOutput.trim();
    }

    if (Array.isArray(rawOutput)) {
      return this.extractFromMessages(rawOutput);
    }

    const result = this.extractFromJsonFields(rawOutput);
    if (result) {
      return result;
    }

    return String(rawOutput).trim();
  }

  private extractFromMessages(messages: any[]): string {
    let collectedText = "";
    let finalResult: string | null = null;

    for (const msg of messages) {
      if (typeof msg === "string") {
        collectedText += msg;
        continue;
      }

      if (typeof msg !== "object" || msg === null) {
        continue;
      }

      if (msg.type === "assistant" && msg.message) {
        if (typeof msg.message === "string") {
          collectedText += msg.message;
        } else if (msg.message.content && Array.isArray(msg.message.content)) {
          for (const block of msg.message.content) {
            if (block.type === "text" && block.text) {
              collectedText += block.text;
            }
          }
        }
      }

      if (msg.type === "result" && msg.subtype === "success") {
        if (msg.result) {
          finalResult = msg.result;
        }
      }
    }

    return finalResult || collectedText.trim() || "";
  }
}

export const claudeRunner = new SandAgentClaudeRunner();
