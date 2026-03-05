/**
 * SandAgent Runner
 *
 * Handles SandAgent CLI with stream-json output format
 */

import type { BenchmarkResult } from "../types.js";
import { BaseRunner } from "./base.js";

class SandAgentRunner extends BaseRunner {
  readonly name = "sandagent";
  readonly defaults = {
    command: "sandagent",
    args: ["run", "--output-format", "stream-json", "--"],
    timeout: 300000, // 5 minutes
  };

  extractAnswer(rawOutput: Required<BenchmarkResult["rawOutput"]>): string {
    // Handle string output
    if (typeof rawOutput === "string") {
      return rawOutput.trim();
    }

    // Handle array of messages (NDJSON format)
    if (Array.isArray(rawOutput)) {
      let collectedText = "";
      let finalResult: string | null = null;

      for (const message of rawOutput) {
        if (typeof message === "string") {
          collectedText += message;
          continue;
        }

        if (typeof message !== "object" || message === null) {
          continue;
        }

        // biome-ignore lint/suspicious/noExplicitAny: message type is dynamic
        const msg = message as any;

        // Handle assistant messages with text content
        if (msg.type === "assistant" && msg.message) {
          // If message is a string
          if (typeof msg.message === "string") {
            collectedText += msg.message;
          }
          // If message has content array
          else if (msg.message.content && Array.isArray(msg.message.content)) {
            for (const block of msg.message.content) {
              if (block.type === "text" && block.text) {
                collectedText += block.text;
              }
            }
          }
        }

        // Handle result message (final output)
        if (msg.type === "result" && msg.subtype === "success") {
          if (msg.result) {
            finalResult = msg.result;
          }
        }
      }

      // Return final result if available, otherwise collected text
      const answer = finalResult || collectedText.trim();
      return answer || "";
    }

    // Handle object output
    const result = this.extractFromJsonFields(rawOutput);
    if (result) {
      return result;
    }

    return String(rawOutput).trim();
  }
}

export const sandagentRunner = new SandAgentRunner();
