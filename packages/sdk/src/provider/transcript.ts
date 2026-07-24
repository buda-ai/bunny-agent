export type TranscriptPart = {
  type?: unknown;
  text?: unknown;
  toolCallId?: unknown;
  toolName?: unknown;
  state?: unknown;
};

function getToolPartIdentity(
  part: TranscriptPart,
): { toolCallId: string; toolName: string } | null {
  if (typeof part.type !== "string") return null;
  const toolName =
    part.type === "dynamic-tool"
      ? part.toolName
      : part.type.startsWith("tool-")
        ? part.type.slice("tool-".length)
        : null;
  if (typeof toolName !== "string") return null;
  return {
    toolCallId:
      typeof part.toolCallId === "string" ? part.toolCallId.trim() : "",
    toolName: toolName.trim(),
  };
}

function sanitizeTranscriptToolParts(
  message: TranscriptMessage,
): TranscriptMessage {
  if (message.role !== "assistant" || typeof message.content === "string") {
    return message;
  }

  const counts = new Map<string, number>();
  for (const part of message.content) {
    const identity = getToolPartIdentity(part);
    if (!identity?.toolCallId) continue;
    counts.set(identity.toolCallId, (counts.get(identity.toolCallId) ?? 0) + 1);
  }

  const content = message.content.filter((part) => {
    const identity = getToolPartIdentity(part);
    if (!identity) return true;
    if (
      !identity.toolCallId ||
      !identity.toolName ||
      (counts.get(identity.toolCallId) ?? 0) > 1
    ) {
      return false;
    }
    return part.state !== "input-streaming" && part.state !== "input-available";
  });
  return content.length === message.content.length
    ? message
    : { ...message, content };
}

export function sanitizeTranscriptToolHistory(
  messages: readonly TranscriptMessage[],
): TranscriptMessage[] {
  return messages.map(sanitizeTranscriptToolParts);
}

export interface TranscriptMessage {
  role: string;
  content: string | readonly TranscriptPart[];
}

function extractTranscriptText(content: TranscriptMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter(
      (part): part is TranscriptPart & { type: "text"; text: string } =>
        part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("\n");
}

/**
 * Serialize a structured transcript into the single prompt used to hydrate a
 * fresh runner session. Non-text parts are intentionally excluded: native
 * runner tool history is owned and repaired by the runner session itself.
 */
export function serializeTranscriptToUserInput(
  messages: readonly TranscriptMessage[],
): string {
  const sanitizedMessages = sanitizeTranscriptToolHistory(messages);
  let currentStart = sanitizedMessages.length;
  for (let index = sanitizedMessages.length - 1; index >= 0; index--) {
    if (sanitizedMessages[index]?.role === "user") {
      currentStart = index;
    } else {
      break;
    }
  }

  const history = sanitizedMessages.slice(0, currentStart);
  const currentText = sanitizedMessages
    .slice(currentStart)
    .map((message) => extractTranscriptText(message.content))
    .filter((text) => text.length > 0)
    .join("\n\n");

  const historyLines = history.flatMap((message) => {
    const text = extractTranscriptText(message.content);
    if (text.length === 0) return [];
    const label =
      message.role === "user"
        ? "User"
        : message.role === "assistant"
          ? "Assistant"
          : "System";
    return [`${label}: ${text}`];
  });

  if (historyLines.length === 0) return currentText;
  const historyBlock = `Previous conversation:\n\n${historyLines.join("\n\n")}`;
  if (currentText.length === 0) return historyBlock;
  return `${historyBlock}\n\nCurrent message:\n\n${currentText}`;
}
