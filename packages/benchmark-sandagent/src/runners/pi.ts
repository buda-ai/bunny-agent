/**
 * SandAgent Pi Runner
 *
 * Tests: sandagent run --runner pi
 */

import type { BenchmarkResult } from "@sandagent/benchmark-shared";
import { BaseRunner } from "./base.js";

class SandAgentPiRunner extends BaseRunner {
  readonly name = "pi";
  readonly defaults = {
    command: "sandagent",
    args: ["run", "--runner", "pi", "--output-format", "stream-json", "--"],
    timeout: 300000, // 5 minutes
  };

  extractAnswer(rawOutput: Required<BenchmarkResult["rawOutput"]>): string {
    if (typeof rawOutput === "string") {
      // Parse AI SDK UI format (NDJSON)
      const lines = rawOutput.split('\n');
      let finalText = "";
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // Skip logs
        if (trimmed.includes('[dotenv@')) continue;
        if (trimmed.includes('[Runner]')) continue;
        
        // Extract text from 0:"text" format (AI SDK UI stream)
        if (trimmed.startsWith('0:"')) {
          const match = trimmed.match(/^0:"(.*)"/);
          if (match) {
            // Get the last text chunk (most complete)
            finalText = match[1];
          }
        }
      }
      
      // If no text found, return raw output
      if (!finalText) {
        return rawOutput.trim();
      }
      
      // Unescape JSON strings
      return finalText.replace(/\\"/g, '"').replace(/\\n/g, '\n').trim();
    }

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

        const msg = message as any;

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

    const result = this.extractFromJsonFields(rawOutput);
    if (result) {
      return result;
    }

    return String(rawOutput).trim();
  }
}

export const piRunner = new SandAgentPiRunner();
