import {
  isValidCitationContractMetadata,
  SEARCH_CONTRACT_LIMITS,
} from "@bunny-agent/manager/contracts";
import { deriveSourceId } from "@bunny-agent/manager/contracts/source-id";
import { describe, expect, it } from "vitest";
import {
  CitationTextProcessor,
  type NativeCitationInput,
} from "../citation-processor.js";
import { SourceRegistry, sourceReference } from "../source-registry.js";

const url = "https://example.com/docs";
const id = deriveSourceId(url)!;
const token = `[[cite:${id}]]`;

function registry() {
  const sources = new SourceRegistry();
  sources.register({ type: "url", url, source_id: id, title: "Docs" }, [
    "search-1",
  ]);
  return sources;
}

function render(parts: string[], partial = false) {
  const processor = new CitationTextProcessor(
    "text-1",
    "explicit-marker",
    registry(),
    new Map(),
  );
  const text =
    parts.map((part) => processor.push(part)).join("") +
    processor.finish(partial);
  expect(
    isValidCitationContractMetadata(processor.metadata, {
      text,
      sources: [{ type: "url", url, source_id: id }],
    }),
  ).toBe(true);
  return { text, metadata: processor.metadata };
}

describe("explicit citation streaming", () => {
  it("resolves compact References and legacy canonical markers to the same canonical binding across every split", () => {
    const alias = `[[cite:${sourceReference(id)}]]`;
    const input = `A😀B ${alias}${token} e\u0301`;
    const expected = render([input]);
    expect(expected.text).toBe("A😀B [1][1] e\u0301");
    expect(
      expected.metadata.bindings.map((binding) => binding.source_id),
    ).toEqual([id, id]);
    expect(
      expected.metadata.annotations.map((a) => [a.start_index, a.end_index]),
    ).toEqual([
      [4, 7],
      [7, 10],
    ]);
    for (let split = 0; split <= input.length; split++)
      expect(render([input.slice(0, split), input.slice(split)])).toEqual(
        expected,
      );
    expect(render(input.split(""))).toEqual(expected);
  });

  it("never repairs a mistyped canonical ID or a short Reference", () => {
    const wrongId = `src_${id[4] === "0" ? "1" : "0"}${id.slice(5)}`;
    const wrongAlias = sourceReference(wrongId);
    const input = `[[cite:${wrongId}]] [[cite:${wrongAlias}]]`;
    const result = render([...input]);
    expect(result.text).toBe(input);
    expect(result.metadata.annotations).toEqual([]);
    expect(result.metadata.diagnostics).toContainEqual(
      expect.objectContaining({ code: "unknown_source" }),
    );
  });

  it("has identical text and ranges for every UTF-16 split, including surrogate halves", () => {
    const input = `A😀B\r\ne\u0301 ${token}${token} end`;
    const expected = render([input]);
    expect(expected.text).toBe("A😀B\r\ne\u0301 [1][1] end");
    expect(
      expected.metadata.annotations.map((a) => [a.start_index, a.end_index]),
    ).toEqual([
      [8, 11],
      [11, 14],
    ]);
    for (let split = 0; split <= input.length; split++)
      expect(render([input.slice(0, split), input.slice(split)])).toEqual(
        expected,
      );
    expect(render(input.split(""))).toEqual(expected);
  });

  it.each([
    `\\${token}`,
    `\`${token}\``,
    `\`\`${token}\`\``,
    `\`\`\`ts\r\n${token}\r\n\`\`\`\r\n`,
    `~~~\n${token}\n~~~\n`,
    `   \`\`\`\n${token}\n   \`\`\`\n`,
    `\`unterminated ${token}`,
    `\`\`\`\n${token}`,
    `\\[\\[cite:${id}]]`,
    `    ${token}`,
    `\t${token}`,
    `  \t${token}`,
    `    literal\n    ${token}\n`,
    `    \`\`\`\n    ${token}\n    \`\`\`\n`,
    `> ~~~\n> ${token}\n> ~~~\n`,
    `- ~~~\n  ${token}\n  ~~~\n`,
    `1. ~~~\n   ${token}\n   ~~~\n`,
    `- > ~~~\n  > ${token}\n  > ~~~\n`,
    `> \`\`\`text\n> literal \`\`\` ${token}\n> \`\`\`\n`,
  ])("preserves literal Markdown contexts across every split: %s", (input) => {
    const expected = render([input]);
    expect(expected.text).toBe(input);
    expect(expected.metadata.annotations).toEqual([]);
    for (let split = 0; split <= input.length; split++)
      expect(render([input.slice(0, split), input.slice(split)])).toEqual(
        expected,
      );
    expect(render(input.split(""))).toEqual(expected);
  });

  it("resumes citations after closed inline and fenced code", () => {
    for (const prefix of [
      "`literal` ",
      "```ts\ncode\n```\n",
      "~~~\r\ncode\r\n~~~\r\n",
      "``literal ` code`` ",
      "    indented code\n",
      "\tindented code\n",
      "> ~~~\n> code\n> ~~~\n",
      "- ~~~\n    code\n    ~~~\n",
      "- > ~~~\n  > code\n  > ~~~\n",
    ]) {
      expect(render((prefix + token).split("")).text).toBe(prefix + "[1]");
    }
  });

  it("keeps outdented or new-container delimiters literal inside an existing nested fence", () => {
    const input = `- ~~~\n  code\n~~~\n${token}\n~~~`;
    for (let split = 0; split <= input.length; split++) {
      const result = render([input.slice(0, split), input.slice(split)]);
      expect(result.text).toBe(input);
      expect(result.metadata.annotations).toEqual([]);
    }
  });

  it("bounds container-prefix tracking and preserves later text literally", () => {
    const prefix = "> ".repeat(65);
    const input = `${prefix}~~~\n${prefix}${token}\n${token}`;
    const result = render([...input]);
    expect(result.text).toBe(input);
    expect(result.metadata.annotations).toEqual([]);
    expect(result.metadata.processing).toBe("partial");
    expect(result.metadata.diagnostics).toContainEqual(
      expect.objectContaining({ code: "budget_exceeded" }),
    );
  });

  it("does not close a fence on a delimiter followed by non-whitespace", () => {
    const input = `\`\`\`\n\`\`\`not a close\n${token}\n\`\`\`\n${token}`;
    expect(render(input.split("")).text).toBe(
      input.slice(0, -token.length) + "[1]",
    );
  });

  it("tracks Markdown delimiters even inside malformed literal tokens", () => {
    const input = `[[cite:bad\`]]${token}\` ${token}`;
    const expected = render([input]);
    expect(expected.text).toBe(`[[cite:bad\`]]${token}\` [1]`);
    expect(expected.metadata.annotations).toHaveLength(1);
    for (let split = 0; split <= input.length; split++)
      expect(render([input.slice(0, split), input.slice(split)])).toEqual(
        expected,
      );
  });

  it("retains unknown, malformed and oversized markers without inferring links", () => {
    const input = `[[cite:src_${"0".repeat(64)}]] [[cite:bad]] [[cite:${"x".repeat(200)}]] [Docs](${url})`;
    const result = render(input.split(""));
    expect(result.text).toBe(input);
    expect(result.metadata.annotations).toEqual([]);
    expect(result.metadata.processing).toBe("partial");
  });

  it("flushes a partial marker on abort without changing earlier ranges", () => {
    const result = render([token, " next [[ci"], true);
    expect(result.text).toBe("[1] next [[ci");
    expect(result.metadata.annotations).toHaveLength(1);
    expect(result.metadata.processing).toBe("partial");
  });

  it("retains every incomplete token prefix literally on abort", () => {
    for (let length = 0; length < token.length; length++) {
      const input = `A😀B ${token.slice(0, length)}`;
      const result = render(input.split(""), true);
      expect(result.text).toBe(input);
      expect(result.metadata.annotations).toEqual([]);
      expect(result.metadata.processing).toBe("partial");
    }
  });

  it("does not resolve embedded references inside an oversized malformed token", () => {
    const literal = `[[cite:${"x".repeat(130)}${token}]]`;
    const input = `${literal} then ${token}`;
    const expected = render([input]);
    expect(expected.text).toBe(`${literal} then [1]`);
    expect(render(input.split(""))).toEqual(expected);
    for (let split = 0; split <= input.length; split++)
      expect(render([input.slice(0, split), input.slice(split)])).toEqual(
        expected,
      );
  });

  it("shares source numbering across text parts", () => {
    const sources = registry();
    const otherUrl = "https://example.com/other";
    const otherId = deriveSourceId(otherUrl)!;
    sources.register({ type: "url", url: otherUrl, source_id: otherId }, [
      "search-2",
    ]);
    const numbers = new Map<string, number>();
    const first = new CitationTextProcessor(
      "a",
      "explicit-marker",
      sources,
      numbers,
    );
    const second = new CitationTextProcessor(
      "b",
      "explicit-marker",
      sources,
      numbers,
    );
    expect(first.push(token) + first.finish()).toBe("[1]");
    expect(second.push(`[[cite:${otherId}]]${token}`) + second.finish()).toBe(
      "[2][1]",
    );
    expect(second.metadata.annotations.map((a) => a.start_index)).toEqual([
      0, 3,
    ]);
  });

  it("bounds annotation tracking and forwards all later tokens literally", () => {
    const result = render([token.repeat(1002)]);
    expect(result.text).toBe("[1]".repeat(1000) + token.repeat(2));
    expect(result.metadata.annotations).toHaveLength(1000);
    expect(result.metadata.processing).toBe("partial");
    expect(result.metadata.diagnostics).toContainEqual(
      expect.objectContaining({ code: "budget_exceeded" }),
    );
  });

  it("bounds code-point tracking without truncating text or emitting out-of-range citations", () => {
    const prefix = "😀".repeat(
      SEARCH_CONTRACT_LIMITS.maxCodePointsPerTextPart - 2,
    );
    const result = render([prefix, token, " end"]);
    expect(result.text).toBe(prefix + token + " end");
    expect(result.metadata.annotations).toEqual([]);
    expect(result.metadata.processing).toBe("partial");
  });
});

describe("native annotation ingestion boundary", () => {
  function native(text = "A😀B [1]") {
    const sources = new SourceRegistry();
    const processor = new CitationTextProcessor(
      "native-1",
      "native",
      sources,
      new Map(),
    );
    expect(processor.push(text)).toBe(text);
    return { processor, sources };
  }
  const annotation = {
    type: "url_citation",
    start_index: 5,
    end_index: 8,
    url,
    title: "Docs",
  };

  it("converts a recorded flat Responses UTF-16 fixture and registers an unretrieved source", () => {
    const { processor, sources } = native();
    processor.ingestNative({
      textId: "native-1",
      offsetUnit: "utf-16",
      annotations: [annotation],
    });
    processor.finish();
    expect(processor.metadata.annotations).toEqual([
      { ...annotation, start_index: 4, end_index: 7 },
    ]);
    expect(processor.metadata.bindings).toEqual([
      {
        annotation_index: 0,
        source_id: id,
        origin: "provider",
        tool_call_ids: [],
      },
    ]);
    expect(sources.resolve(id)?.url).toBe(url);
    expect(
      isValidCitationContractMetadata(processor.metadata, {
        text: "A😀B [1]",
        sources: [sources.resolve(id)!],
      }),
    ).toBe(true);
  });

  it("deduplicates exact ranges, retaining distinct safe sources on the same range and URL title fallback", () => {
    const { processor } = native();
    processor.ingestNative({
      textId: "native-1",
      offsetUnit: "utf-16",
      annotations: [
        annotation,
        annotation,
        { ...annotation, url: "https://example.net/", title: undefined },
      ],
    });
    expect(processor.metadata.annotations).toHaveLength(2);
    expect(processor.metadata.annotations[1].title).toBe(
      "https://example.net/",
    );
    expect(processor.metadata.diagnostics?.[0].code).toBe("duplicate_range");
  });

  it.each([
    { ...annotation, start_index: 2 },
    { ...annotation, end_index: 99 },
    { ...annotation, start_index: -1 },
    { ...annotation, start_index: 5.5 },
    { ...annotation, end_index: 5 },
    { ...annotation, start_index: Number.NaN },
    { ...annotation, url: "javascript:alert(1)" },
    { ...annotation, url: "https://user:password@example.com" },
  ])("rejects unsafe targets and invalid ranges: %j", (bad) => {
    const { processor } = native();
    processor.ingestNative({
      textId: "native-1",
      offsetUnit: "utf-16",
      annotations: [bad],
    });
    expect(processor.metadata.annotations).toEqual([]);
    expect(processor.metadata.processing).toBe("partial");
  });

  it("rejects unknown units and mismatched identity", () => {
    const { processor } = native();
    processor.ingestNative({
      textId: "native-1",
      offsetUnit: "bytes",
      annotations: [annotation],
    } as unknown as NativeCitationInput);
    processor.ingestNative({
      textId: "wrong",
      offsetUnit: "utf-16",
      annotations: [annotation],
    });
    expect(processor.metadata.annotations).toEqual([]);
    expect(processor.metadata.diagnostics?.map((d) => d.code)).toEqual([
      "unavailable_offset_unit",
      "invalid_range",
    ]);
  });

  it("native mode never rewrites markers, and marker mode rejects late native ranges", () => {
    const { processor } = native(token);
    expect(processor.finish()).toBe("");
    const marker = new CitationTextProcessor(
      "marker",
      "explicit-marker",
      registry(),
      new Map(),
    );
    expect(marker.push(token)).toBe("[1]");
    marker.ingestNative({
      textId: "marker",
      offsetUnit: "unicode-code-points",
      annotations: [{ ...annotation, start_index: 0, end_index: token.length }],
    });
    expect(marker.metadata.annotations).toHaveLength(1);
    expect(marker.metadata.bindings[0].origin).toBe("explicit_source_marker");
    expect(marker.metadata.processing).toBe("partial");
  });
});
