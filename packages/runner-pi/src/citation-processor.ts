import {
  type CitationContractMetadata,
  type CitationDiagnostic,
  isSafeHttpUrl,
  SEARCH_CONTRACT_LIMITS as LIMITS,
  type UrlCitationAnnotation,
  utf16RangeToCodePointRange,
} from "@bunny-agent/manager/contracts";
import { deriveSourceId } from "@bunny-agent/manager/contracts/source-id";
import type { SourceRegistry } from "./source-registry.js";

/** Explicit supported adapter boundary. Unknown offset units are rejected at runtime. */
export interface NativeCitationInput {
  textId: string;
  offsetUnit: "utf-16" | "unicode-code-points";
  annotations: readonly unknown[];
}

export type CitationMode = "native" | "explicit-marker";

/** One text part, retaining only a possible marker suffix and bounded native text. */
export class CitationTextProcessor {
  readonly metadata: CitationContractMetadata = {
    schema_version: 1,
    offset_unit: "unicode-code-points",
    annotations: [],
    bindings: [],
    processing: "complete",
  };
  private pending = "";
  private oversizedMarker = false;
  private oversizedPreviousBracket = false;
  private surrogate = "";
  private position = 0;
  private literal = false;
  private escaped = false;
  private inlineTicks = 0;
  private runChar = "";
  private runLength = 0;
  private runAtLineStart = false;
  private runPrefix = "";
  private fenceChar = "";
  private fenceLength = 0;
  private fenceQuotes = 0;
  private fenceContainerIndent = 0;
  private fenceClosing = false;
  private lineSpaces = 0;
  private linePrefix: string | undefined = "";
  private indentedLine = false;
  private nativeText = "";
  private finalized = false;

  constructor(
    readonly id: string,
    readonly mode: CitationMode,
    private readonly registry: SourceRegistry,
    private readonly numbering: Map<string, number>,
  ) {}

  diagnose(code: CitationDiagnostic["code"], message: string): void {
    this.metadata.processing = "partial";
    this.metadata.diagnostics ??= [];
    const diagnostics = this.metadata.diagnostics;
    if (
      diagnostics.length < 16 &&
      !diagnostics.some(
        (item) => item.code === code && item.message === message,
      )
    ) {
      diagnostics.push({ code, message });
    }
  }

  private output(text: string): string {
    for (const char of text) {
      this.position++;
      if (this.mode !== "explicit-marker" || this.literal) continue;
      if (char === "\n" || char === "\r") {
        this.linePrefix = "";
      } else if (this.linePrefix !== undefined) {
        if (!/^[ \t>+*.\d)-]$/.test(char)) {
          this.linePrefix = undefined;
        } else if (
          this.linePrefix.length >= LIMITS.maxPendingMarkerSuffixChars
        ) {
          this.linePrefix = undefined;
          this.literal = true;
          this.diagnose(
            "budget_exceeded",
            "The Markdown container prefix budget was exceeded.",
          );
        } else {
          this.linePrefix += char;
        }
      }
    }
    if (this.mode === "native" && !this.literal) this.nativeText += text;
    if (this.position > LIMITS.maxCodePointsPerTextPart) {
      this.diagnose(
        "budget_exceeded",
        "The text citation tracking budget was exceeded.",
      );
      this.literal = true;
      this.nativeText = "";
    }
    return text;
  }

  push(delta: string): string {
    if (this.finalized) return "";
    let input = this.surrogate + delta;
    this.surrogate = "";
    const last = input.charCodeAt(input.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) {
      this.surrogate = input.slice(-1);
      input = input.slice(0, -1);
    }
    if (this.mode === "native" || this.literal) return this.output(input);
    let output = "";
    for (const char of input) output += this.consume(char);
    return output;
  }

  private prefixColumns(prefix: string): number {
    let columns = 0;
    for (const char of prefix) columns += char === "\t" ? 4 - (columns % 4) : 1;
    return columns;
  }

  private isFencePrefix(): boolean {
    // Fence indentation is relative to quote/list containers. Only retain a
    // bounded possible prefix; ordinary paragraph text cannot start a fence.
    if (this.linePrefix === undefined) return false;
    if (this.fenceChar) {
      const quotes = this.linePrefix.match(/>/g)?.length ?? 0;
      const content = this.linePrefix.replace(/>[ \t]?/g, "");
      const columns = this.prefixColumns(content);
      return (
        quotes === this.fenceQuotes &&
        /^[ \t]*$/.test(content) &&
        columns >= this.fenceContainerIndent &&
        columns <= this.fenceContainerIndent + 3
      );
    }
    return /^(?: {0,3}(?:>[ \t]?|(?:[-+*]|\d{1,9}[.)])[ \t]+))* {0,3}$/.test(
      this.linePrefix,
    );
  }

  private finishRun(): void {
    if (!this.runChar) return;
    if (this.fenceChar) {
      if (
        this.runAtLineStart &&
        this.runChar === this.fenceChar &&
        this.runLength >= this.fenceLength
      )
        this.fenceClosing = true;
    } else if (
      !this.inlineTicks &&
      this.runAtLineStart &&
      this.runLength >= 3
    ) {
      this.fenceChar = this.runChar;
      this.fenceLength = this.runLength;
      this.fenceQuotes = this.runPrefix.match(/>/g)?.length ?? 0;
      const content = this.runPrefix.replace(/>[ \t]?/g, "");
      this.fenceContainerIndent = /[-+*\d]/.test(content)
        ? this.prefixColumns(content)
        : 0;
    } else if (this.runChar === "`") {
      if (!this.inlineTicks) this.inlineTicks = this.runLength;
      else if (this.inlineTicks === this.runLength) this.inlineTicks = 0;
    }
    this.runChar = "";
    this.runLength = 0;
  }

  private emitLiteralToken(text: string): string {
    let output = "";
    for (const char of text) output += this.consume(char, false);
    return output;
  }

  private consume(char: string, allowMarker = true): string {
    if (this.literal) return this.output(char);
    if (allowMarker && this.oversizedMarker) {
      if (
        (this.oversizedPreviousBracket && char === "]") ||
        char === "\n" ||
        char === "\r"
      )
        this.oversizedMarker = false;
      this.oversizedPreviousBracket = char === "]";
      return this.consume(char, false);
    }
    if (this.pending) {
      this.pending += char;
      if ("[[cite:".startsWith(this.pending)) return "";
      if (!this.pending.startsWith("[[cite:")) {
        const first = this.pending[0];
        const rest = this.pending.slice(1);
        this.pending = "";
        let result = this.output(first);
        this.lineSpaces = -1;
        for (const next of rest) result += this.consume(next);
        return result;
      }
      if (this.pending.endsWith("]]")) {
        const token = this.pending;
        this.pending = "";
        const match = /^\[\[cite:(src_[a-f0-9]{64})\]\]$/.exec(token);
        const source = match ? this.registry.resolve(match[1]) : undefined;
        if (!source || source.tool_call_ids.length === 0) {
          this.diagnose(
            match ? "unknown_source" : "malformed_token",
            "An unresolved citation marker was retained literally.",
          );
          return this.emitLiteralToken(token);
        }
        const number =
          this.numbering.get(source.source_id) ?? this.numbering.size + 1;
        const marker = `[${number}]`;
        if (
          this.metadata.annotations.length >=
            LIMITS.maxAnnotationsPerTextPart ||
          this.position + marker.length > LIMITS.maxCodePointsPerTextPart
        ) {
          this.literal = true;
          this.diagnose(
            "budget_exceeded",
            "The annotation or text citation budget was exceeded.",
          );
          return this.output(token);
        }
        this.numbering.set(source.source_id, number);
        this.metadata.bindings.push({
          annotation_index: this.metadata.annotations.length,
          source_id: source.source_id,
          origin: "explicit_source_marker",
          tool_call_ids: [...source.tool_call_ids],
        });
        this.metadata.annotations.push({
          type: "url_citation",
          start_index: this.position,
          end_index: this.position + marker.length,
          url: source.url,
          title: source.title ?? source.url,
        });
        return this.output(marker);
      }
      if (
        this.pending.length >= LIMITS.maxPendingMarkerSuffixChars ||
        char === "\n" ||
        char === "\r"
      ) {
        const text = this.pending;
        this.pending = "";
        this.diagnose(
          "malformed_token",
          "An incomplete or oversized citation marker was retained literally.",
        );
        this.oversizedMarker = char !== "\n" && char !== "\r";
        this.oversizedPreviousBracket = char === "]";
        return this.emitLiteralToken(text);
      }
      return "";
    }

    // Delimiter runs are counted, never buffered, and may cross any chunk boundary.
    if (this.runChar && char !== this.runChar) this.finishRun();
    const escaped = this.escaped;
    this.escaped = false;
    if (
      !this.fenceChar &&
      !this.inlineTicks &&
      this.lineSpaces >= 4 &&
      char !== "\n" &&
      char !== "\r"
    ) {
      this.indentedLine = true;
    }
    if (this.indentedLine && char !== "\n" && char !== "\r") {
      this.lineSpaces = -1;
      return this.output(char);
    }
    if (
      !escaped &&
      (char === "`" ||
        (char === "~" &&
          (this.runChar === "~" ||
            this.fenceChar === "~" ||
            (!this.inlineTicks && this.isFencePrefix()))))
    ) {
      if (!this.runChar) {
        this.runChar = char;
        this.runPrefix = this.linePrefix ?? "";
        this.runAtLineStart = this.isFencePrefix();
      }
      this.runLength = Math.min(
        this.runLength + 1,
        LIMITS.maxCodePointsPerTextPart + 1,
      );
      this.lineSpaces = -1;
      return this.output(char);
    }
    if (char === "\n" || char === "\r") {
      if (this.fenceClosing) {
        this.fenceChar = "";
        this.fenceLength = 0;
        this.fenceQuotes = 0;
        this.fenceContainerIndent = 0;
      }
      this.fenceClosing = false;
      this.lineSpaces = 0;
      this.indentedLine = false;
    } else {
      if (this.fenceClosing && char !== " " && char !== "\t")
        this.fenceClosing = false;
      this.lineSpaces =
        this.lineSpaces < 0
          ? -1
          : char === " "
            ? Math.min(4, this.lineSpaces + 1)
            : char === "\t"
              ? 4
              : -1;
    }
    if (this.fenceChar || this.inlineTicks) return this.output(char);
    if (!escaped && char === "\\") this.escaped = true;
    if (allowMarker && !escaped && char === "[") {
      this.pending = char;
      return "";
    }
    return this.output(char);
  }

  /** Native ranges are accepted only for the preselected native text identity. */
  ingestNative(input: NativeCitationInput): void {
    if (this.finalized) return;
    if (this.mode !== "native" || input.textId !== this.id) {
      this.diagnose(
        "invalid_range",
        "Native annotations did not match the selected text mode or identity.",
      );
      return;
    }
    if (
      input.offsetUnit !== "utf-16" &&
      input.offsetUnit !== "unicode-code-points"
    ) {
      this.diagnose(
        "unavailable_offset_unit",
        "Native annotation offset units are unavailable.",
      );
      return;
    }
    if (this.literal) return;
    if (!Array.isArray(input.annotations)) {
      this.diagnose("invalid_range", "Native annotations were malformed.");
      return;
    }
    const seen = new Set(
      this.metadata.annotations.map((a) =>
        JSON.stringify([a.start_index, a.end_index, a.url]),
      ),
    );
    if (input.annotations.length > LIMITS.maxAnnotationsPerTextPart)
      this.diagnose("budget_exceeded", "Native annotation input was bounded.");
    for (const value of input.annotations.slice(
      0,
      LIMITS.maxAnnotationsPerTextPart,
    )) {
      const annotation = value as UrlCitationAnnotation | null;
      if (
        !annotation ||
        annotation.type !== "url_citation" ||
        typeof annotation.url !== "string" ||
        !isSafeHttpUrl(annotation.url)
      ) {
        this.diagnose(
          "unsafe_target",
          "A native citation target was rejected.",
        );
        continue;
      }
      let start = annotation.start_index;
      let end = annotation.end_index;
      if (input.offsetUnit === "utf-16") {
        try {
          const range = utf16RangeToCodePointRange(this.nativeText, start, end);
          start = range.start_index;
          end = range.end_index;
        } catch {
          this.diagnose(
            "invalid_range",
            "A native citation range was rejected.",
          );
          continue;
        }
      }
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end <= start ||
        end > this.position
      ) {
        this.diagnose("invalid_range", "A native citation range was rejected.");
        continue;
      }
      const sourceId = deriveSourceId(annotation.url)!;
      const key = JSON.stringify([
        start,
        end,
        new URL(annotation.url).toString(),
      ]);
      if (seen.has(key)) {
        this.diagnose(
          "duplicate_range",
          "A duplicate native citation was ignored.",
        );
        continue;
      }
      if (
        this.metadata.annotations.length >= LIMITS.maxAnnotationsPerTextPart
      ) {
        this.diagnose(
          "budget_exceeded",
          "The native annotation budget was exceeded.",
        );
        break;
      }
      const source = this.registry.register({
        type: "url",
        source_id: sourceId,
        url: annotation.url,
        title:
          typeof annotation.title === "string"
            ? annotation.title
            : annotation.url,
      });
      if (!source) {
        this.diagnose(
          "budget_exceeded",
          "A native source could not be registered.",
        );
        continue;
      }
      seen.add(key);
      this.metadata.bindings.push({
        annotation_index: this.metadata.annotations.length,
        source_id: source.source_id,
        origin: "provider",
        tool_call_ids: [...source.tool_call_ids],
      });
      this.metadata.annotations.push({
        type: "url_citation",
        start_index: start,
        end_index: end,
        url: source.url,
        title: source.title ?? source.url,
      });
    }
  }

  finish(partial = false): string {
    if (this.finalized) return "";
    if (partial)
      this.diagnose(
        "invalid_range",
        "Citation processing ended before normal completion.",
      );
    const suffix = this.pending + this.surrogate;
    this.pending = "";
    this.surrogate = "";
    const output = this.output(suffix);
    for (const diagnostic of this.registry.diagnostics)
      this.diagnose(diagnostic.code, diagnostic.message);
    this.finalized = true;
    return output;
  }
}
