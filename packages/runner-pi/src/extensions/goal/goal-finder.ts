import type { GoalState } from "./state.js";

export const CUSTOM_TYPE = "pi-goal";

interface SessionEntry {
  type: string;
  customType?: string;
  data?: unknown;
  details?: unknown;
}

interface SessionLike {
  getEntries(): SessionEntry[];
}

/**
 * Find the most recent goal state in the session entries.
 * Falls back to idle if none is present.
 *
 * pi writes our state through two paths that share the same customType:
 *   - appendEntry(...)            → entry.type === "custom",         entry.data
 *   - sendMessage({ details })    → entry.type === "custom_message", entry.details
 */
export function goalForSession(sm: SessionLike): GoalState {
  const entries = sm.getEntries();
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (
      (entry.type === "custom" || entry.type === "custom_message") &&
      entry.customType === CUSTOM_TYPE
    ) {
      const payload =
        entry.type === "custom_message" ? entry.details : entry.data;
      // We're the only writer of this customType, so trust the shape.
      return payload as GoalState;
    }
  }
  return { phase: "idle" };
}
