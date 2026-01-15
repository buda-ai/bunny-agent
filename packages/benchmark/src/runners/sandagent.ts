/**
 * SandAgent Runner
 *
 * Handles SandAgent CLI with SSE output format
 */

import type { GaiaTask, RunnerConfig } from "../types.js";
import type { RunnerCommand, RunnerDefaults, RunnerHandler } from "./types.js";

export const sandagentRunner: RunnerHandler = {
  name: "sandagent",

  defaults: {
    command: "sandagent",
    args: ["run", "--output-format", "stream-json", "--"],
    timeout: 300000, // 5 minutes
  },

  buildCommand(task: GaiaTask, config: RunnerConfig): RunnerCommand {
    const command = config.command ?? this.defaults.command;

    let prompt = task.question;
    if (task.files && task.files.length > 0) {
      const fileInfo = task.files
        .map((f) => `[Attached file: ${f.name} at ${f.path}]`)
        .join("\n");
      prompt = `${fileInfo}\n\n${task.question}`;
    }

    const defaultArgs = this.defaults.args ?? [];
    return {
      command: command,
      args: [...defaultArgs, prompt],
    };
  },

  extractAnswer(output: string): string | null {
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

    // Prefer final result if available, otherwise use collected text
    const answer = finalResult || collectedText.trim();

    if (!answer) {
      return null;
    }

    // Extract answer from common patterns
    const patterns = [
      /(?:final answer|answer)[:\s]+(.+?)(?:\n|$)/i,
      /(?:the answer is)[:\s]+(.+?)(?:\n|$)/i,
      /(?:result)[:\s]+(.+?)(?:\n|$)/i,
    ];

    for (const pattern of patterns) {
      const match = answer.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    // Return the answer as-is if no pattern matches
    return answer;
  },
};
