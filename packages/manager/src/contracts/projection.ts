/**
 * Pure helpers converting between Bunny's canonical Unicode code-point
 * offsets and JavaScript's native UTF-16 string indices, plus the
 * Responses-shaped output-text projection.
 *
 * Bunny v1 annotation ranges are zero-based Unicode code-point offsets with
 * an exclusive end, measured over the exact emitted Markdown text of one
 * text part — before any Markdown rendering, Unicode normalization, or
 * line-ending conversion. See design.md §7 for the canonical `A😀B [1]`
 * example: the literal `[1]` is code-point range `[4,7)` and UTF-16 range
 * `[5,8)`, because the leading `😀` is one code point but two UTF-16 units.
 */

import type { OutputTextContent, UrlCitationAnnotation } from "./types.js";

/** Number of Unicode code points in `text` (NOT `text.length`, which counts UTF-16 units). */
export function codePointLength(text: string): number {
  let count = 0;
  // `for...of` over a string iterates by code point, not UTF-16 code unit.
  for (const _ of text) count++;
  return count;
}

/**
 * Convert a zero-based Unicode code-point offset into the corresponding
 * UTF-16 index of `text`. `codePointOffset` may equal `codePointLength(text)`
 * to address the end of the string.
 *
 * Throws if `codePointOffset` is negative or beyond the string's length.
 */
export function codePointOffsetToUtf16Index(
  text: string,
  codePointOffset: number,
): number {
  if (!Number.isInteger(codePointOffset) || codePointOffset < 0) {
    throw new RangeError(
      `codePointOffset must be a non-negative integer, got ${codePointOffset}`,
    );
  }
  let remaining = codePointOffset;
  let utf16Index = 0;
  for (const ch of text) {
    if (remaining === 0) return utf16Index;
    remaining--;
    utf16Index += ch.length; // 1 for BMP code points, 2 for astral (surrogate pair)
  }
  if (remaining === 0) return utf16Index;
  throw new RangeError(
    `codePointOffset ${codePointOffset} exceeds code-point length of text`,
  );
}

/**
 * Convert a UTF-16 index of `text` into the corresponding zero-based Unicode
 * code-point offset. `utf16Index` may equal `text.length` to address the end
 * of the string. Throws if `utf16Index` splits a surrogate pair, is
 * negative, or exceeds `text.length`.
 */
export function utf16IndexToCodePointOffset(
  text: string,
  utf16Index: number,
): number {
  if (!Number.isInteger(utf16Index) || utf16Index < 0) {
    throw new RangeError(
      `utf16Index must be a non-negative integer, got ${utf16Index}`,
    );
  }
  if (utf16Index > text.length) {
    throw new RangeError(
      `utf16Index ${utf16Index} exceeds UTF-16 length of text`,
    );
  }
  let codePointOffset = 0;
  let utf16Cursor = 0;
  for (const ch of text) {
    if (utf16Cursor === utf16Index) return codePointOffset;
    if (utf16Cursor + ch.length > utf16Index) {
      throw new RangeError(
        `utf16Index ${utf16Index} splits a surrogate pair at code-point offset ${codePointOffset}`,
      );
    }
    utf16Cursor += ch.length;
    codePointOffset++;
  }
  if (utf16Cursor === utf16Index) return codePointOffset;
  throw new RangeError(
    `utf16Index ${utf16Index} exceeds UTF-16 length of text`,
  );
}

/**
 * Convert a native UTF-16 `[start, end)` range of `text` into a Bunny
 * canonical Unicode code-point `[start, end)` range, preserving the exact
 * covered substring. Throws if either boundary splits a surrogate pair or
 * is out of range.
 */
export function utf16RangeToCodePointRange(
  text: string,
  utf16Start: number,
  utf16End: number,
): { start_index: number; end_index: number } {
  if (utf16End < utf16Start) {
    throw new RangeError(
      `utf16End ${utf16End} must be >= utf16Start ${utf16Start}`,
    );
  }
  return {
    start_index: utf16IndexToCodePointOffset(text, utf16Start),
    end_index: utf16IndexToCodePointOffset(text, utf16End),
  };
}

/** Validate that a code-point annotation range is well-formed for `text`. */
export function isValidCodePointRange(
  text: string,
  startIndex: number,
  endIndex: number,
): boolean {
  if (
    !Number.isInteger(startIndex) ||
    !Number.isInteger(endIndex) ||
    startIndex < 0 ||
    endIndex <= startIndex
  ) {
    return false;
  }
  return endIndex <= codePointLength(text);
}

/**
 * Slice `text` by a validated Unicode code-point `[startIndex, endIndex)`
 * range. Callers should validate with {@link isValidCodePointRange} first;
 * this throws on an invalid range rather than silently clamping.
 */
export function sliceByCodePointRange(
  text: string,
  startIndex: number,
  endIndex: number,
): string {
  if (!isValidCodePointRange(text, startIndex, endIndex)) {
    throw new RangeError(
      `invalid code-point range [${startIndex}, ${endIndex}) for text of length ${codePointLength(text)}`,
    );
  }
  const utf16Start = codePointOffsetToUtf16Index(text, startIndex);
  const utf16End = codePointOffsetToUtf16Index(text, endIndex);
  return text.slice(utf16Start, utf16End);
}

/**
 * Project a finalized text part and its validated annotations into the
 * flat Responses `output_text` shape. Annotation order is preserved because
 * citation bindings address the sibling annotations array by index. Callers
 * must validate ranges against the exact finalized text before projection.
 */
export function projectOutputText(
  text: string,
  annotations: UrlCitationAnnotation[],
): OutputTextContent {
  return {
    type: "output_text",
    text,
    annotations: annotations.map((annotation) => ({
      type: "url_citation",
      start_index: annotation.start_index,
      end_index: annotation.end_index,
      url: annotation.url,
      title: annotation.title,
    })),
  };
}
