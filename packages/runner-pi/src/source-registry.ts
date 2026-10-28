import {
  type CitationDiagnostic,
  isValidWebSearchCallRecord,
  isWebSearchSource,
  SEARCH_CONTRACT_LIMITS,
  type WebSearchCallRecord,
  type WebSearchSource,
} from "@bunny-agent/manager/contracts";
import {
  deriveSourceId,
  normalizeSourceUrl,
} from "@bunny-agent/manager/contracts/source-id";

export interface RegisteredSource extends WebSearchSource {
  tool_call_ids: string[];
  references?: Record<string, string>;
}

/** OpenAI citation-formatting reference: one turn per tool invocation. */
export function sourceReference(turn: number, index: number): string {
  return `turn${turn}url${index}`;
}

/** Bounded current-answer view; historical identity remains deterministic on disk. */
export class SourceRegistry {
  private readonly sources = new Map<string, RegisteredSource>();
  private readonly calls = new Map<string, number>();
  private nextTurn = 0;
  private readonly callSources = new Map<string, Map<string, number>>();
  readonly diagnostics: CitationDiagnostic[] = [];

  constructor(
    private readonly persist?: (source: RegisteredSource) => void,
    private readonly lookup?: (id: string) => RegisteredSource | undefined,
    private readonly lookupReference?: (
      reference: string,
    ) => RegisteredSource[],
    private readonly persistCall?: (id: string, turn: number) => void,
  ) {}

  reserveSearch(id: string, restoredTurn?: number, save = true): number {
    const known = this.calls.get(id);
    if (known !== undefined) return known;
    const turn = restoredTurn ?? this.nextTurn;
    this.nextTurn = Math.max(this.nextTurn, turn + 1);
    this.calls.set(id, turn);
    if (restoredTurn === undefined && save) this.persistCall?.(id, turn);
    return turn;
  }

  referenceForSource(id: string, callId?: string): string | undefined {
    return Object.entries(this.resolve(id)?.references ?? {}).find(
      ([, call]) => !callId || call === callId,
    )?.[0];
  }

  diagnose(code: CitationDiagnostic["code"], message: string): void {
    if (
      !this.diagnostics.some(
        (item) => item.code === code && item.message === message,
      )
    ) {
      if (this.diagnostics.length < 16)
        this.diagnostics.push({ code, message });
    }
  }

  register(
    source: WebSearchSource,
    toolCallIds: string[] = [],
    save = true,
    restoredReferences?: Record<string, string>,
  ): RegisteredSource | undefined {
    // Provider IDs are opaque and may include an encoded thought signature.
    if (
      toolCallIds.some((id) => typeof id !== "string" || id.trim().length === 0)
    ) {
      this.diagnose("invalid_version", "Rejected malformed source provenance.");
      return undefined;
    }
    const url = normalizeSourceUrl(source.url);
    if (!url || deriveSourceId(url) !== source.source_id) {
      this.diagnose(
        "unsafe_target",
        "Rejected an unsafe or inconsistent source identity.",
      );
      return undefined;
    }
    const previous =
      this.sources.get(source.source_id) ?? this.lookup?.(source.source_id);
    if (
      !this.sources.has(source.source_id) &&
      this.sources.size >= SEARCH_CONTRACT_LIMITS.maxSourcesPerTurn
    ) {
      this.diagnose(
        "budget_exceeded",
        "The answer source budget was exceeded.",
      );
      return undefined;
    }
    const provenance = [
      ...new Set([...(previous?.tool_call_ids ?? []), ...toolCallIds]),
    ];
    if (provenance.length > 50)
      this.diagnose("budget_exceeded", "Source provenance was bounded.");
    if ((source.title?.length ?? 0) > 2048)
      this.diagnose("budget_exceeded", "A source title was bounded.");
    const references = { ...previous?.references, ...restoredReferences };
    for (const [reference, callId] of Object.entries(references)) {
      const match = /^turn(\d+)url(\d+)$/.exec(reference);
      if (!match) continue;
      this.reserveSearch(callId, Number(match[1]));
      const items = this.callSources.get(callId) ?? new Map<string, number>();
      items.set(source.source_id, Number(match[2]));
      this.callSources.set(callId, items);
    }
    for (const callId of toolCallIds) {
      if (Object.values(references).includes(callId)) continue;
      const turn = this.reserveSearch(callId);
      const items = this.callSources.get(callId) ?? new Map<string, number>();
      const index =
        items.get(source.source_id) ??
        [...items.values()].reduce(
          (maximum, value) => Math.max(maximum, value),
          -1,
        ) + 1;
      items.set(source.source_id, index);
      this.callSources.set(callId, items);
      references[sourceReference(turn, index)] = callId;
    }
    const entry: RegisteredSource = {
      type: "url",
      source_id: source.source_id,
      url,
      title: (source.title ?? previous?.title ?? url).slice(0, 2048),
      tool_call_ids: provenance.slice(0, 50),
      references: Object.fromEntries(
        Object.entries(references)
          .filter(([, call]) => provenance.slice(0, 50).includes(call))
          .slice(0, 50),
      ),
    };
    this.sources.set(entry.source_id, entry);
    if (save && JSON.stringify(previous) !== JSON.stringify(entry))
      this.persist?.(entry);
    return entry;
  }

  registerSearch(record: WebSearchCallRecord): void {
    if (!isValidWebSearchCallRecord(record)) return;
    this.reserveSearch(record.id);
    if (record.status !== "completed") return;
    for (const source of record.action.sources)
      this.register(source, [record.id]);
  }

  resolve(id: string): RegisteredSource | undefined {
    if (/^turn\d+url\d+$/.test(id)) {
      const candidates = new Map<string, RegisteredSource>();
      for (const source of [
        ...this.sources.values(),
        ...(this.lookupReference?.(id) ?? []),
      ]) {
        if (source.references?.[id] !== undefined)
          candidates.set(source.source_id, source);
      }
      if (candidates.size > 1) {
        this.diagnose(
          "unknown_source",
          "An ambiguous source reference was rejected.",
        );
        return undefined;
      }
      const candidate = candidates.values().next().value;
      return candidate ? this.resolve(candidate.source_id) : undefined;
    }
    const known = this.sources.get(id);
    if (known) return known;
    const historical = this.lookup?.(id);
    return (
      historical &&
      this.register(
        historical,
        historical.tool_call_ids,
        false,
        historical.references,
      )
    );
  }

  relevantSources(): WebSearchSource[] {
    return [...this.sources.values()]
      .filter((source) => source.tool_call_ids.length > 0)
      .slice(-20)
      .map(({ type, source_id, url }) => ({ type, source_id, url }));
  }
}

export function isRegisteredSource(value: unknown): value is RegisteredSource {
  if (!isWebSearchSource(value)) return false;
  const entry = value as RegisteredSource;
  return (
    deriveSourceId(entry.url) === entry.source_id &&
    (entry.references === undefined ||
      (typeof entry.references === "object" &&
        entry.references !== null &&
        Object.keys(entry.references).length <= 50 &&
        Object.entries(entry.references).every(
          ([ref, call]) =>
            ref.length <= 64 &&
            /^turn\d+url\d+$/.test(ref) &&
            Number.isSafeInteger(Number(/^turn(\d+)/.exec(ref)?.[1])) &&
            Number.isSafeInteger(Number(/url(\d+)$/.exec(ref)?.[1])) &&
            typeof call === "string" &&
            Array.isArray(entry.tool_call_ids) &&
            entry.tool_call_ids.includes(call),
        ))) &&
    Array.isArray(entry.tool_call_ids) &&
    entry.tool_call_ids.length <= 50 &&
    entry.tool_call_ids.every(
      (id) => typeof id === "string" && id.trim().length > 0,
    )
  );
}
