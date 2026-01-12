/**
 * SandAgent Runner
 *
 * Handles SandAgent CLI with SSE output format
 */

import type { GaiaTask, RunnerConfig } from "../types.js";
import type { RunnerCommand, RunnerDefaults, RunnerHandler } from "./types.js";

/**
 * Parse SSE (Server-Sent Events) formatted output and extract text deltas
 */
function parseSSEOutput(output: string): {
  textContent: string;
  toolOutputs: Array<{ toolName: string; output: unknown }>;
} {
  const textParts: string[] = [];
  const toolOutputs: Array<{ toolName: string; output: unknown }> = [];

  // SSE format: data: {...}\n\ndata: {...}
  const parts = output.split(/data: /);

  for (const part of parts) {
    if (!part.trim()) continue;

    const jsonPart = part.split(/\n\n/)[0]?.trim();
    if (!jsonPart) continue;

    try {
      const data = JSON.parse(jsonPart);

      if (data.type === "text-delta" && data.delta) {
        textParts.push(data.delta);
      }

      if (data.type === "tool-output-available" && data.output) {
        toolOutputs.push({
          toolName: data.toolName,
          output: data.output,
        });
      }
    } catch {
      // Skip malformed JSON
    }
  }

  return {
    textContent: textParts.join(""),
    toolOutputs,
  };
}

/**
 * Extract answer from SSE formatted output
 */
function extractFromSSE(output: string): string | null {
  const { textContent, toolOutputs } = parseSSEOutput(output);

  // First, look for TaskOutput tool result (preferred for GAIA answers)
  const taskOutput = toolOutputs.find((t) => t.toolName === "TaskOutput");
  if (taskOutput?.output) {
    const outputObj = taskOutput.output as Record<string, unknown>;
    if (typeof outputObj.content === "string") {
      return outputObj.content.trim();
    }
    if (typeof outputObj.answer === "string") {
      return outputObj.answer.trim();
    }
    if (typeof outputObj === "string") {
      return (outputObj as string).trim();
    }
  }

  // Look for answer patterns in ALL tool outputs with stdout
  const reversedOutputs = [...toolOutputs].reverse();
  for (const tool of reversedOutputs) {
    const toolOutput = tool.output as Record<string, unknown>;
    const stdout = toolOutput?.stdout;
    if (typeof stdout === "string") {
      const answerMatch = stdout.match(
        /(?:FINAL\s+)?ANSWER:\s*(?:Ball\s*#?)?(\d+|[^\n]+)/i,
      );
      if (answerMatch) {
        return answerMatch[1].trim();
      }

      const ballMatch = stdout.match(
        /(?:Ball\s+with\s+)?HIGHEST\s+ejection\s+probability:\s*Ball\s*#?(\d+)/i,
      );
      if (ballMatch) {
        return ballMatch[1].trim();
      }
    }
  }

  // Fall back to text content analysis
  if (textContent) {
    // === NUMERIC ANSWER PATTERNS ===
    const numericPatterns = [
      /(?:optimal choice is|the answer is|choose)[:\s]*\*\*(\d+)\*\*/i,
      /(?:final answer|answer)[:\s]+(?:Ball\s*#?)?(\d+)/i,
      /(?:the answer is)[:\s]+(?:Ball\s*#?)?(\d+)/i,
      /(?:should choose|you should choose|choose ball)[:\s#]*(\d+)/i,
      /(?:Ball\s*#?)(\d+)\s+has the highest/i,
      /rounds to \*\*(\d+)(?:\s*\w*)?\*\*/i,
      /approximately \*\*(\d+)\*\*/i,
      /total(?:s|ing)?\s*(?:of|to|:)?\s*\*\*(\d+)\*\*/i,
      /(?:equals?|=)\s*\*\*(\d+)\*\*/i,
      /(?:result|answer|value|total|sum|count)[:\s]+\*\*(\d+)\*\*/i,
      /(?:winnings?|earnings?|profit)\s*[=:]\s*\*\*[^*]*?(\d[\d,]*)\*\*/i,
    ];

    for (const pattern of numericPatterns) {
      const match = textContent.match(pattern);
      if (match) {
        return match[1].replace(/,/g, "").trim();
      }
    }

    // === BOLD CONTENT EXTRACTION ===
    // First check for "**The Answer:**" header pattern
    const answerHeaderMatch = textContent.match(
      /\*\*(?:The\s+)?Answer:\*\*\s*\n?\s*([A-Z][a-z]+)\s+(?:was|is|did)/i,
    );
    if (answerHeaderMatch) {
      return answerHeaderMatch[1].trim();
    }

    // Prefer the LAST bold content as it's often the final/corrected answer
    const allBoldMatches = [...textContent.matchAll(/\*\*"?([^*]+)"?\*\*/g)];
    if (allBoldMatches.length > 0) {
      const lastBold = allBoldMatches[allBoldMatches.length - 1][1].trim();
      const cleanedBold = lastBold.replace(/^["']|["']$/g, "").trim();
      if (cleanedBold.length > 0 && cleanedBold.length < 100) {
        const numWithUnits = cleanedBold.match(/^(\d[\d,]*)\s*(?:\w+)?$/);
        if (numWithUnits) {
          return numWithUnits[1].replace(/,/g, "");
        }
        return cleanedBold;
      }
    }

    // === COMMA-SEPARATED LIST PATTERNS ===
    const listMatch = textContent.match(
      /(?:comma[- ]separated|list)[^:]*:\s*\n*([a-zA-Z0-9/,.\s-]+(?:,\s*[a-zA-Z0-9/,.\s-]+)+)\s*$/i,
    );
    if (listMatch) {
      return listMatch[1].replace(/\s+/g, "").trim();
    }

    // === TEXT ANSWER PATTERNS ===
    const textAnswerPatterns = [
      /(?:sentence is|answer is|result is)[:\s]+([^\n]{5,100})/i,
      /(?:was|is)[:\s]+([^\n]{5,100})\s*$/im,
    ];

    for (const pattern of textAnswerPatterns) {
      const match = textContent.match(pattern);
      if (match) {
        return match[1].replace(/^["']|["']$/g, "").trim();
      }
    }
  }

  // If we have text content but no clear answer, try to find the conclusion
  if (textContent && textContent.length > 0) {
    const sentences = textContent.split(/[.!?]+/).filter((s) => s.trim());
    for (
      let i = sentences.length - 1;
      i >= Math.max(0, sentences.length - 3);
      i--
    ) {
      const sentence = sentences[i]?.trim() ?? "";
      if (sentence.length > 0 && sentence.length < 150) {
        return sentence;
      }
    }
    const lastSentence = sentences[sentences.length - 1]?.trim() ?? "";
    if (lastSentence.length > 0) {
      return lastSentence.slice(0, 200);
    }
  }

  return null;
}

export const sandagentRunner: RunnerHandler = {
  name: "sandagent",

  defaults: {
    command: "sandagent",
    args: ["run", "--"],
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

    return {
      command,
      args: ["run", "--", prompt],
    };
  },

  extractAnswer(output: string): string | null {
    // Only handle SSE formatted output
    if (!output.includes('data: {"type":')) {
      return null;
    }
    return extractFromSSE(output);
  },
};
