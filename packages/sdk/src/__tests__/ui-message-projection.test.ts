import { describe, expect, it } from "vitest";
import { projectUIMessageOutputText } from "../contracts.js";
import { capabilities, citationContract, text } from "./citation-fixtures";

const metadata = {
  textPartId: "actual-runner-id",
  searchContract: capabilities,
  citation_contract: citationContract,
};
function message(bunny: unknown = metadata, answer = text) {
  return {
    parts: [
      {
        type: "text",
        text: answer,
        providerMetadata: { "bunny-agent": bunny },
      },
    ],
  };
}

describe("browser-safe durable UIMessage projection", () => {
  it("never infers citations from Markdown links, snippets, source cards, or legacy raw metadata", () => {
    const answer =
      "[Documentation](https://example.com/docs) [[cite:src_untrusted]]";
    const input = {
      parts: [
        {
          type: "source-url",
          sourceId: "untrusted",
          url: "https://example.com/docs",
        },
        { type: "dynamic-tool", output: { snippet: answer } },
        ...message(
          {
            citation_contract: {
              annotations: [{ url: "https://example.com/docs" }],
            },
          },
          answer,
        ).parts,
      ],
    };
    expect(projectUIMessageOutputText(input)).toEqual([
      {
        output_text: {
          type: "output_text",
          text: answer,
          annotations: [],
        },
        bindings: [],
      },
    ]);
  });

  it.each([
    { ...metadata, citation_contract: { schema_version: 1 } },
    { ...metadata, textPartId: undefined },
    { ...metadata, searchContract: undefined },
    {
      ...metadata,
      searchContract: { ...capabilities, native_annotations: "yes" },
    },
    { ...metadata, citation_contract: { ...citationContract, bindings: [] } },
    {
      ...metadata,
      citation_contract: {
        ...citationContract,
        annotations: [{ ...citationContract.annotations[0], end_index: 100 }],
      },
    },
    {
      ...metadata,
      citation_contract: {
        ...citationContract,
        annotations: [{ ...citationContract.annotations[0], title: undefined }],
      },
    },
    {
      ...metadata,
      citation_contract: {
        ...citationContract,
        annotations: [
          { ...citationContract.annotations[0], url: "javascript:alert(1)" },
        ],
      },
    },
  ])("fails closed on malformed recognized v1 data %#", (bunny) => {
    expect(() => projectUIMessageOutputText(message(bunny))).toThrow(TypeError);
  });

  it("preserves annotation order, flat canonical fields, and binding indices without mutating the input", () => {
    const contract = {
      ...citationContract,
      annotations: [
        { ...citationContract.annotations[0], extra: "not canonical" },
        { ...citationContract.annotations[0], start_index: 0, end_index: 1 },
      ],
      bindings: [
        citationContract.bindings[0],
        { ...citationContract.bindings[0], annotation_index: 1 },
      ],
    };
    const input = message({ ...metadata, citation_contract: contract });
    const original = JSON.stringify(input);
    const projected = projectUIMessageOutputText(input);
    expect(
      projected[0].output_text.annotations.map(
        (annotation) => annotation.start_index,
      ),
    ).toEqual([4, 0]);
    expect(projected[0].output_text.annotations[0]).not.toHaveProperty("extra");
    expect(
      projected[0].bindings.map((binding) => binding.annotation_index),
    ).toEqual([0, 1]);
    projected[0].bindings[0].tool_call_ids.push("consumer-change");
    expect(JSON.stringify(input)).toBe(original);
  });

  it("projects multiple text parts by retained runner identity, ignoring array position and unknown versions", () => {
    const input = {
      parts: [
        ...message().parts,
        { type: "step-start" },
        ...message(
          {
            ...metadata,
            textPartId: "second-id",
            citation_contract: { schema_version: 2 },
          },
          "legacy",
        ).parts,
      ],
    };
    const projected = projectUIMessageOutputText(input);
    expect(projected.map((part) => part.textPartId)).toEqual([
      "actual-runner-id",
      "second-id",
    ]);
    expect(projected[1].output_text.annotations).toEqual([]);
  });
});
