/**
 * SandAgent Runner
 *
 * Handles SandAgent CLI with stream-json output format
 */

import { BaseRunner } from "./base.js";

class SandAgentRunner extends BaseRunner {
  readonly name = "sandagent";
  readonly defaults = {
    command: "sandagent",
    args: ["run", "--output-format", "stream-json", "--"],
    timeout: 300000, // 5 minutes
  };

  extractAnswer(output: string): string {
    if (!output || !output.trim()) {
      return "";
    }

    // Parse NDJSON format (each line is a JSON object)
    const lines = output.split("\n").filter((line) => line.trim());

    let collectedText = "";
    let finalResult: string | null = null;

    for (const line of lines) {
      try {
        const message = JSON.parse(line);

        // Handle assistant messages with text content
        if (message.type === "assistant" && message.message) {
          // If message is a string
          if (typeof message.message === "string") {
            collectedText += message.message;
          }
          // If message has content array
          else if (
            message.message.content &&
            Array.isArray(message.message.content)
          ) {
            for (const block of message.message.content) {
              if (block.type === "text" && block.text) {
                collectedText += block.text;
              }
            }
          }
        }

        // Handle result message (final output)
        if (message.type === "result" && message.subtype === "success") {
          if (message.result) {
            finalResult = message.result;
          }
        }
      } catch {
        // Skip invalid JSON lines
      }
    }

    // Return final result if available, otherwise collected text
    const answer = finalResult || collectedText.trim();
    return answer || "";
  }
}

export const sandagentRunner = new SandAgentRunner();
