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
}

/** Bounded current-answer view; historical identity remains deterministic on disk. */
export class SourceRegistry {
  private readonly sources = new Map<string, RegisteredSource>();
  readonly diagnostics: CitationDiagnostic[] = [];

  constructor(
    private readonly persist?: (source: RegisteredSource) => void,
    private readonly lookup?: (id: string) => RegisteredSource | undefined,
  ) {}

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
  ): RegisteredSource | undefined {
    if (
      toolCallIds.some(
        (id) =>
          typeof id !== "string" || id.trim().length === 0 || id.length > 1024,
      )
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
    const entry: RegisteredSource = {
      type: "url",
      source_id: source.source_id,
      url,
      title: (source.title ?? previous?.title ?? url).slice(0, 2048),
      tool_call_ids: provenance.slice(0, 50),
    };
    this.sources.set(entry.source_id, entry);
    if (save && JSON.stringify(previous) !== JSON.stringify(entry))
      this.persist?.(entry);
    return entry;
  }

  registerSearch(record: WebSearchCallRecord): void {
    if (!isValidWebSearchCallRecord(record) || record.status !== "completed")
      return;
    for (const source of record.action.sources)
      this.register(source, [record.id]);
  }

  resolve(id: string): RegisteredSource | undefined {
    const known = this.sources.get(id);
    if (known) return known;
    const historical = this.lookup?.(id);
    return (
      historical && this.register(historical, historical.tool_call_ids, false)
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
    Array.isArray(entry.tool_call_ids) &&
    entry.tool_call_ids.length <= 50 &&
    entry.tool_call_ids.every(
      (id) =>
        typeof id === "string" && id.trim().length > 0 && id.length <= 1024,
    )
  );
}
