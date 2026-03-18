/**
 * Answer Extractor
 *
 * Enhanced answer extraction using AI SDK compatible parsing
 * Reference: ai-chat-so doSaveAiResponse - UIMessage stream parsing
 */

/**
 * Part types from UIMessage stream
 */
interface TextPart {
  type: "text";
  text: string;
}

interface ToolOutputPart {
  type: "tool-output-available";
  toolCallId: string;
  toolName: string;
  output: unknown;
}

interface ReasoningPart {
  type: "reasoning";
  text: string;
}

type MessagePart = TextPart | ToolOutputPart | ReasoningPart;

/**
 * Parsed message from SSE stream
 */
interface ParsedMessage {
  id?: string;
  parts: MessagePart[];
  textContent: string;
  toolOutputs: Array<{ toolName: string; toolCallId: string; output: unknown }>;
  reasoningText: string;
}

/**
 * Parse SSE stream into structured message (like ai-sdk UIMessage)
 */
export function parseSSEToMessage(output: string): ParsedMessage {
  const parts: MessagePart[] = [];
  const toolOutputs: Array<{
    toolName: string;
    toolCallId: string;
    output: unknown;
  }> = [];
  const textParts: string[] = [];
  const reasoningParts: string[] = [];
  let messageId: string | undefined;

  // SSE format: data: {...}\n\n
  const chunks = output.split(/data: /);

  for (const chunk of chunks) {
    if (!chunk.trim()) continue;

    const jsonPart = chunk.split(/\n\n/)[0]?.trim();
    if (!jsonPart) continue;

    try {
      const data = JSON.parse(jsonPart);

      // Message start with ID
      if (data.type === "start" && data.messageId) {
        messageId = data.messageId;
      }

      // Text delta - collect into text part
      if (data.type === "text-delta" && data.delta) {
        textParts.push(data.delta);
      }

      // Reasoning - extended thinking
      if (data.type === "reasoning" && data.text) {
        reasoningParts.push(data.text);
      }

      // Tool output available - critical for GAIA answers
      if (data.type === "tool-output-available") {
        const toolOutput = {
          toolName: data.toolName || "unknown",
          toolCallId: data.toolCallId || "",
          output: data.output,
        };
        toolOutputs.push(toolOutput);
        parts.push({
          type: "tool-output-available",
          ...toolOutput,
        });
      }
    } catch {
      // Skip malformed JSON
    }
  }

  // Combine text parts into a single text part
  const textContent = textParts.join("");
  if (textContent) {
    parts.unshift({ type: "text", text: textContent });
  }

  const reasoningText = reasoningParts.join("");
  if (reasoningText) {
    parts.unshift({ type: "reasoning", text: reasoningText });
  }

  return {
    id: messageId,
    parts,
    textContent,
    toolOutputs,
    reasoningText,
  };
}

/**
 * Answer extraction patterns - prioritized list
 */
const ANSWER_PATTERNS = {
  // Explicit FINAL ANSWER markers (highest priority)
  finalAnswer: [
    /FINAL\s+ANSWER:\s*(.+?)(?:\n|$)/i,
    /\*\*FINAL\s+ANSWER:\*\*\s*(.+?)(?:\n|$)/i,
    /##\s*Final\s+Answer\s*\n+(.+?)(?:\n\n|$)/i,
  ],

  // Ball/numeric extraction patterns (for GAIA probability tasks)
  ballNumber: [
    /(?:Ball\s+with\s+)?HIGHEST\s+(?:ejection\s+)?probability:\s*Ball\s*#?(\d+)/i,
    /Ball\s*#?(\d+)\s+has\s+the\s+highest/i,
    /ANSWER:\s*Ball\s*#?(\d+)/i,
    /(?:choose|select|pick)\s+Ball\s*#?(\d+)/i,
  ],

  // TaskOutput tool results (for GAIA)
  taskOutput: [
    /content["']?\s*:\s*["']([^"']+)["']/i,
    /answer["']?\s*:\s*["']([^"']+)["']/i,
    /result["']?\s*:\s*["']([^"']+)["']/i,
  ],

  // Tool stdout patterns
  stdout: [
    /(?:FINAL\s+)?ANSWER:\s*(\d+)/i, // Numeric answer first
    /(?:FINAL\s+)?ANSWER:\s*(.+?)(?:\n|$)/i,
    /^(?!.*(?:error|failed|exception))(.+)$/im, // Non-error last line
  ],

  // Markdown bold answers
  boldAnswer: [
    /\*\*(?:The\s+)?(?:Final\s+)?Answer(?:\s+is)?:\*\*\s*(.+?)(?:\n|$)/i,
    /(?:answer|result)\s+is\s+\*\*(.+?)\*\*/i,
  ],

  // Numeric patterns
  numeric: [
    /(?:equals?|=|is)\s*\*?\*?(\d[\d,.]*)\*?\*?/i,
    /(?:total|sum|count|result)(?:\s+is)?:\s*(\d[\d,.]*)/i,
    /rounds?\s+to\s+\*?\*?(\d[\d,.]*)\*?\*?/i,
  ],

  // List patterns
  list: [
    /(?:comma[- ]separated|list)[^:]*:\s*\n*([a-zA-Z0-9/,.\s-]+(?:,\s*[a-zA-Z0-9/,.\s-]+)+)/i,
    /alphabetical(?:ly)?[^:]*:\s*\n*([a-zA-Z,\s]+)/i,
  ],

  // General answer patterns
  general: [
    /(?:the answer is)[:\s]+(.+?)(?:\.|$)/i,
    /(?:therefore|thus|hence)[,:\s]+(.+?)(?:\.|$)/i,
    /(?:in conclusion)[,:\s]+(.+?)(?:\.|$)/i,
  ],
};

/**
 * Extract answer from tool output object
 */
function extractFromToolOutput(output: unknown): string | null {
  if (output === null || output === undefined) return null;

  // String output
  if (typeof output === "string") {
    return output.trim();
  }

  // Object with common answer fields
  if (typeof output === "object") {
    const obj = output as Record<string, unknown>;

    // Direct answer fields
    const answerFields = ["answer", "content", "result", "value", "text"];
    for (const field of answerFields) {
      if (typeof obj[field] === "string") {
        return (obj[field] as string).trim();
      }
    }

    // stdout from shell execution
    if (typeof obj.stdout === "string") {
      const stdout = obj.stdout.trim();

      // Priority 1: Ball number patterns (for GAIA probability tasks)
      for (const pattern of ANSWER_PATTERNS.ballNumber) {
        const match = stdout.match(pattern);
        if (match?.[1]) {
          return match[1].trim();
        }
      }

      // Priority 2: ANSWER pattern in stdout
      for (const pattern of ANSWER_PATTERNS.stdout) {
        const match = stdout.match(pattern);
        if (match?.[1]) {
          return match[1].trim();
        }
      }

      // Priority 3: Return last non-empty line
      const lines = stdout.split("\n").filter((l) => l.trim());
      if (lines.length > 0) {
        return lines[lines.length - 1].trim();
      }
    }

    // Nested data field
    if (typeof obj.data === "object" && obj.data !== null) {
      return extractFromToolOutput(obj.data);
    }
  }

  return null;
}

/**
 * Extract answer from text content using patterns
 */
function extractFromText(text: string): string | null {
  // Try each pattern category in priority order
  const categories = [
    "finalAnswer",
    "boldAnswer",
    "numeric",
    "list",
    "general",
  ] as const;

  for (const category of categories) {
    for (const pattern of ANSWER_PATTERNS[category]) {
      const match = text.match(pattern);
      if (match?.[1]) {
        let answer = match[1].trim();
        // Clean up markdown
        answer = answer.replace(/\*\*/g, "").replace(/^["']|["']$/g, "");
        if (answer.length > 0 && answer.length < 500) {
          return answer;
        }
      }
    }
  }

  // Fallback: look for last bold content
  const boldMatches = [...text.matchAll(/\*\*([^*]+)\*\*/g)];
  if (boldMatches.length > 0) {
    const lastBold = boldMatches[boldMatches.length - 1][1].trim();
    if (lastBold.length > 0 && lastBold.length < 200) {
      return lastBold;
    }
  }

  return null;
}

/**
 * Extract final answer from parsed message (main entry point)
 */
export function extractAnswerFromMessage(
  message: ParsedMessage,
): string | null {
  // Priority 1: TaskOutput or final tool outputs
  // Check tool outputs in reverse order (last output is usually final answer)
  const reversedOutputs = [...message.toolOutputs].reverse();

  for (const tool of reversedOutputs) {
    // TaskOutput is specifically for GAIA answers
    if (
      tool.toolName === "TaskOutput" ||
      tool.toolName === "task_output" ||
      tool.toolName === "final_answer"
    ) {
      const answer = extractFromToolOutput(tool.output);
      if (answer) return answer;
    }
  }

  // Priority 2: Any tool output with stdout containing answer pattern
  for (const tool of reversedOutputs) {
    const answer = extractFromToolOutput(tool.output);
    if (answer) {
      // Validate it looks like an answer (not an error)
      if (
        !answer.toLowerCase().includes("error") &&
        !answer.toLowerCase().includes("failed")
      ) {
        return answer;
      }
    }
  }

  // Priority 3: Text content patterns
  if (message.textContent) {
    const textAnswer = extractFromText(message.textContent);
    if (textAnswer) return textAnswer;
  }

  // Priority 4: Last meaningful sentence from text
  if (message.textContent) {
    const sentences = message.textContent
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length < 200);

    // Look for answer-like sentences from the end
    for (
      let i = sentences.length - 1;
      i >= Math.max(0, sentences.length - 5);
      i--
    ) {
      const sentence = sentences[i];
      if (
        sentence &&
        !sentence.toLowerCase().includes("let me") &&
        !sentence.toLowerCase().includes("i will") &&
        !sentence.toLowerCase().includes("we need")
      ) {
        return sentence;
      }
    }
  }

  return null;
}

/**
 * Main extraction function - combines SSE parsing and answer extraction
 */
export function extractAnswerFromSSE(output: string): string | null {
  // Parse SSE to structured message
  const message = parseSSEToMessage(output);

  // Extract answer from message
  return extractAnswerFromMessage(message);
}
