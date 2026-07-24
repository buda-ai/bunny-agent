export interface PiSessionToolHistoryRepairStats {
  removedToolCalls: number;
  removedToolResults: number;
  removedEmptyAssistantMessages: number;
}

export interface PiSessionToolHistoryRepairResult {
  messages: unknown[];
  stats: PiSessionToolHistoryRepairStats;
}

type UnknownRecord = Record<string, unknown>;

type ToolCallRef = {
  id: string;
  name: string;
  messageIndex: number;
};

type ToolResultRef = {
  id: string;
  name: string;
  messageIndex: number;
};

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object"
    ? (value as UnknownRecord)
    : null;
}

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readToolCall(
  block: unknown,
  messageIndex: number,
): ToolCallRef | null {
  const candidate = asRecord(block);
  if (candidate?.type !== "toolCall") return null;
  return {
    id: readTrimmedString(
      candidate.id ?? candidate.toolCallId ?? candidate.tool_call_id,
    ),
    name: readTrimmedString(candidate.name ?? candidate.toolName),
    messageIndex,
  };
}

function readToolResult(
  message: UnknownRecord,
  messageIndex: number,
): ToolResultRef | null {
  if (message.role !== "toolResult") return null;
  return {
    id: readTrimmedString(message.toolCallId ?? message.tool_call_id),
    name: readTrimmedString(message.toolName),
    messageIndex,
  };
}

function hasConversationBoundary(
  messages: readonly unknown[],
  start: number,
  end: number,
): boolean {
  for (let index = start + 1; index < end; index++) {
    const role = asRecord(messages[index])?.role;
    if (role === "user" || role === "assistant") return true;
  }
  return false;
}

/**
 * Build a safe request-time projection of Pi session messages. The append-only
 * session entries remain untouched; every resume deterministically derives the
 * same valid context from the persisted transcript.
 */
export function repairPiSessionToolHistory(
  messages: readonly unknown[],
): PiSessionToolHistoryRepairResult {
  const callsById = new Map<string, ToolCallRef[]>();
  const resultsById = new Map<string, ToolResultRef[]>();
  const blankCallLocations = new Set<string>();
  const blankResultIndexes = new Set<number>();

  for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
    const message = asRecord(messages[messageIndex]);
    if (!message) continue;

    if (message.role === "assistant" && Array.isArray(message.content)) {
      for (
        let blockIndex = 0;
        blockIndex < message.content.length;
        blockIndex++
      ) {
        const call = readToolCall(message.content[blockIndex], messageIndex);
        if (!call) continue;
        if (!call.id || !call.name) {
          blankCallLocations.add(`${messageIndex}:${blockIndex}`);
          continue;
        }
        const calls = callsById.get(call.id) ?? [];
        calls.push(call);
        callsById.set(call.id, calls);
      }
    }

    const result = readToolResult(message, messageIndex);
    if (!result) continue;
    if (!result.id || !result.name) {
      blankResultIndexes.add(messageIndex);
      continue;
    }
    const results = resultsById.get(result.id) ?? [];
    results.push(result);
    resultsById.set(result.id, results);
  }

  const safeIds = new Set<string>();
  for (const [id, calls] of callsById) {
    const results = resultsById.get(id) ?? [];
    if (calls.length !== 1 || results.length !== 1) continue;
    const [call] = calls;
    const [result] = results;
    if (!call || !result) continue;
    if (call.name !== result.name || result.messageIndex <= call.messageIndex)
      continue;
    if (
      hasConversationBoundary(messages, call.messageIndex, result.messageIndex)
    )
      continue;
    safeIds.add(id);
  }

  let removedToolCalls = 0;
  let removedToolResults = 0;
  let removedEmptyAssistantMessages = 0;
  const repairedMessages: unknown[] = [];

  for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
    const original = messages[messageIndex];
    const message = asRecord(original);
    if (!message) {
      repairedMessages.push(original);
      continue;
    }

    if (message.role === "toolResult") {
      const result = readToolResult(message, messageIndex);
      if (
        blankResultIndexes.has(messageIndex) ||
        !result ||
        !safeIds.has(result.id)
      ) {
        removedToolResults++;
        continue;
      }
      repairedMessages.push(original);
      continue;
    }

    if (message.role !== "assistant" || !Array.isArray(message.content)) {
      repairedMessages.push(original);
      continue;
    }

    const content = message.content.filter((block, blockIndex) => {
      const call = readToolCall(block, messageIndex);
      if (!call) return true;
      const remove =
        blankCallLocations.has(`${messageIndex}:${blockIndex}`) ||
        !safeIds.has(call.id);
      if (remove) removedToolCalls++;
      return !remove;
    });

    if (content.length === 0 && message.content.length > 0) {
      removedEmptyAssistantMessages++;
      continue;
    }
    repairedMessages.push(
      content.length === message.content.length
        ? original
        : { ...message, content },
    );
  }

  return {
    messages: repairedMessages,
    stats: {
      removedToolCalls,
      removedToolResults,
      removedEmptyAssistantMessages,
    },
  };
}

export function stripInvalidToolHistoryFromSessionManager(
  sessionManager: unknown,
  onRepair?: (stats: PiSessionToolHistoryRepairStats) => void,
): void {
  const manager = sessionManager as {
    buildSessionContext?: () => UnknownRecord;
  };
  if (typeof manager.buildSessionContext !== "function") return;

  const buildSessionContext = manager.buildSessionContext.bind(manager);
  manager.buildSessionContext = () => {
    const context = buildSessionContext();
    if (!Array.isArray(context.messages)) return context;
    const repaired = repairPiSessionToolHistory(context.messages);
    const changed =
      repaired.stats.removedToolCalls > 0 ||
      repaired.stats.removedToolResults > 0 ||
      repaired.stats.removedEmptyAssistantMessages > 0;
    if (changed) onRepair?.(repaired.stats);
    return { ...context, messages: repaired.messages };
  };
}
