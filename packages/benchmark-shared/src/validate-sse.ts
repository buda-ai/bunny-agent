/**
 * SSE Format Validator
 * Validates AI SDK Data Stream Protocol format. Only handles `data:` lines.
 */

export interface SSEValidationResult {
  valid: boolean;
  errors: string[];
  events: Array<{ type: string; [key: string]: unknown }>;
}

export function validateSSEFormat(output: string): SSEValidationResult {
  const errors: string[] = [];
  const lines = output.split("\n").filter((l) => l.trim());

  // Parse SSE events
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;

    const jsonStr = line.slice(5).trim();
    if (jsonStr === "[DONE]") {
      events.push({ type: "DONE" });
      continue;
    }

    try {
      const event = JSON.parse(jsonStr);
      if (!event.type) {
        errors.push(`Event missing 'type' field: ${jsonStr}`);
      }
      events.push(event);
    } catch (_err) {
      errors.push(`Invalid JSON: ${jsonStr}`);
    }
  }

  if (events.length === 0) {
    errors.push("No SSE events found");
    return { valid: false, errors, events };
  }

  // Validate event sequence
  const eventTypes = events.map((e) => e.type);

  // Should have finish event
  if (!eventTypes.includes("finish")) {
    errors.push("Missing 'finish' event");
  }

  // Should end with DONE
  if (events[events.length - 1]?.type !== "DONE") {
    errors.push("Stream should end with [DONE]");
  }

  // Should have text-delta or error
  const hasText = eventTypes.includes("text-delta");
  const hasError = eventTypes.includes("error");
  if (!hasText && !hasError) {
    errors.push("No 'text-delta' or 'error' events found");
  }

  // Validate text events have IDs
  const textEvents = events.filter((e) =>
    ["text-start", "text-delta", "text-end"].includes(e.type),
  );
  for (const event of textEvents) {
    if (!event.id) {
      errors.push(`Text event missing 'id': ${JSON.stringify(event)}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    events,
  };
}
