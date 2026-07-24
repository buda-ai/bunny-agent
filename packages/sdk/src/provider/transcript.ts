type TranscriptPart = {
  type?: unknown;
  text?: unknown;
};

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
  let currentStart = messages.length;
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.role === "user") {
      currentStart = index;
    } else {
      break;
    }
  }

  const history = messages.slice(0, currentStart);
  const currentText = messages
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
