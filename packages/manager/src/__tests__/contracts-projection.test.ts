import { describe, expect, it } from "vitest";
import {
  codePointLength,
  codePointOffsetToUtf16Index,
  isValidCodePointRange,
  projectOutputText,
  sliceByCodePointRange,
  utf16IndexToCodePointOffset,
  utf16RangeToCodePointRange,
} from "../contracts/projection.js";

describe("codePointLength", () => {
  it("counts an astral character as one code point, not two UTF-16 units", () => {
    expect(codePointLength("A😀B [1]")).toBe(7);
    expect("A😀B [1]".length).toBe(8); // UTF-16 length is 8 (surrogate pair)
  });

  it("counts combining characters as separate code points", () => {
    // "e" + combining acute accent (U+0301) is two code points, one grapheme.
    const text = "é";
    expect(codePointLength(text)).toBe(2);
  });

  it("treats CRLF as two code points", () => {
    expect(codePointLength("a\r\nb")).toBe(4);
  });
});

describe("codePointOffsetToUtf16Index / utf16IndexToCodePointOffset", () => {
  const text = "A😀B [1]";

  it("matches the design doc's literal example: code-point [4,7) <-> UTF-16 [5,8)", () => {
    expect(codePointOffsetToUtf16Index(text, 4)).toBe(5);
    expect(codePointOffsetToUtf16Index(text, 7)).toBe(8);
    expect(utf16IndexToCodePointOffset(text, 5)).toBe(4);
    expect(utf16IndexToCodePointOffset(text, 8)).toBe(7);
  });

  it("round-trips every valid boundary", () => {
    for (let cp = 0; cp <= codePointLength(text); cp++) {
      const utf16 = codePointOffsetToUtf16Index(text, cp);
      expect(utf16IndexToCodePointOffset(text, utf16)).toBe(cp);
    }
  });

  it("throws when a UTF-16 index splits the surrogate pair of 😀", () => {
    // "😀" occupies UTF-16 indices [1,3); index 2 is inside the pair.
    expect(() => utf16IndexToCodePointOffset(text, 2)).toThrow(RangeError);
  });

  it("throws on an out-of-range UTF-16 index", () => {
    expect(() => utf16IndexToCodePointOffset(text, 999)).toThrow(RangeError);
  });

  it("throws on a negative or non-integer code-point offset", () => {
    expect(() => codePointOffsetToUtf16Index(text, -1)).toThrow(RangeError);
    expect(() => codePointOffsetToUtf16Index(text, 1.5)).toThrow(RangeError);
  });
});

describe("utf16RangeToCodePointRange", () => {
  it("converts the design doc's native UTF-16 [5,8) example to code-point [4,7)", () => {
    const range = utf16RangeToCodePointRange("A😀B [1]", 5, 8);
    expect(range).toEqual({ start_index: 4, end_index: 7 });
  });

  it("preserves the exact covered substring across conversion", () => {
    const text = "A😀B [1]";
    const utf16Start = 5;
    const utf16End = 8;
    const expectedSubstring = text.slice(utf16Start, utf16End);
    const { start_index, end_index } = utf16RangeToCodePointRange(
      text,
      utf16Start,
      utf16End,
    );
    expect(sliceByCodePointRange(text, start_index, end_index)).toBe(
      expectedSubstring,
    );
  });

  it("throws on an inverted range", () => {
    expect(() => utf16RangeToCodePointRange("abc", 2, 1)).toThrow(RangeError);
  });
});

describe("isValidCodePointRange / sliceByCodePointRange", () => {
  it("validates the design doc's literal [25,28) example over its exact string", () => {
    const text = "The guide describes this.[1]";
    expect(isValidCodePointRange(text, 25, 28)).toBe(true);
    expect(sliceByCodePointRange(text, 25, 28)).toBe("[1]");
  });

  it("rejects end_index beyond the text length", () => {
    expect(isValidCodePointRange("abc", 0, 10)).toBe(false);
  });

  it("rejects end_index <= start_index", () => {
    expect(isValidCodePointRange("abc", 2, 2)).toBe(false);
  });

  it("rejects a negative start_index", () => {
    expect(isValidCodePointRange("abc", -1, 2)).toBe(false);
  });

  it("throws when slicing an invalid range rather than silently clamping", () => {
    expect(() => sliceByCodePointRange("abc", 0, 10)).toThrow(RangeError);
  });
});

describe("projectOutputText", () => {
  it("projects into the flat Responses output_text shape", () => {
    const projected = projectOutputText("The guide describes this.[1]", [
      {
        type: "url_citation",
        start_index: 25,
        end_index: 28,
        url: "https://example.com/docs",
        title: "Documentation",
      },
    ]);
    expect(projected).toEqual({
      type: "output_text",
      text: "The guide describes this.[1]",
      annotations: [
        {
          type: "url_citation",
          start_index: 25,
          end_index: 28,
          url: "https://example.com/docs",
          title: "Documentation",
        },
      ],
    });
  });

  it("preserves annotation order so binding indexes retain their meaning", () => {
    const projected = projectOutputText("[2] then [1]", [
      {
        type: "url_citation",
        start_index: 9,
        end_index: 12,
        url: "https://example.com/a",
        title: "A",
      },
      {
        type: "url_citation",
        start_index: 0,
        end_index: 3,
        url: "https://example.com/b",
        title: "B",
      },
    ]);
    expect(projected.annotations.map((a) => a.start_index)).toEqual([9, 0]);
  });

  it("returns an empty annotations array for plain text", () => {
    expect(projectOutputText("no citations here", [])).toEqual({
      type: "output_text",
      text: "no citations here",
      annotations: [],
    });
  });
});
