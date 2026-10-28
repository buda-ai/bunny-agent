import { randomUUID } from "node:crypto";

export interface InteractionReply {
  action: "accept" | "decline" | "cancel";
  content?: Record<string, unknown>;
  optionId?: string;
}

interface PendingInteraction {
  sessionId: string;
  reply?: InteractionReply;
  promise: Promise<InteractionReply>;
  resolve: (reply: InteractionReply) => void;
  accepted: Promise<void>;
  acknowledge: () => void;
  validate?: (reply: InteractionReply) => void;
}

/**
 * Shared by connections on one daemon. A different Buda worker can deliver a
 * decision without owning the original ACP request. Session + unguessable
 * interaction id must both match; a decision can be accepted only once.
 */
export class AcpInteractionRegistry {
  private readonly pending = new Map<string, PendingInteraction>();

  create(
    sessionId: string,
    validate?: (reply: InteractionReply) => void,
  ): { id: string; promise: Promise<InteractionReply> } {
    const id = randomUUID();
    let resolve!: PendingInteraction["resolve"];
    let acknowledge!: PendingInteraction["acknowledge"];
    const promise = new Promise<InteractionReply>((done) => {
      resolve = done;
    });
    const accepted = new Promise<void>((done) => {
      acknowledge = done;
    });
    this.pending.set(id, {
      sessionId,
      promise,
      resolve,
      accepted,
      acknowledge,
      validate,
    });
    return { id, promise };
  }

  async respond(
    sessionId: string,
    id: string,
    reply: InteractionReply,
  ): Promise<{ ok: true }> {
    const pending = this.pending.get(id);
    if (!pending || pending.sessionId !== sessionId)
      throw new Error("Interaction is unknown or expired.");
    pending.validate?.(reply);
    if (pending.reply && canonical(pending.reply) !== canonical(reply)) {
      throw new Error(
        "Interaction was already resolved with a different decision.",
      );
    }
    if (!pending.reply) {
      pending.reply = reply;
      pending.resolve(reply);
    }
    await pending.accepted;
    return { ok: true };
  }

  acknowledge(id: string): void {
    this.pending.get(id)?.acknowledge();
    // Keep a bounded receipt cache so a retry after a lost ACK is idempotent.
    if (this.pending.size > 1000) {
      for (const [key, pending] of this.pending) {
        if (pending.reply && key !== id) {
          this.pending.delete(key);
          break;
        }
      }
    }
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}
