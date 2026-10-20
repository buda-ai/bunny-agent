import { describe, expect, it } from "vitest";
import {
  isDocumentReadResult,
  isValidDocumentCitationContractMetadata,
} from "../contracts/document.js";
import {
  deriveDocumentKey,
  documentSourcesFromRead,
  hashDocumentText,
  validateDocumentReadResult,
} from "../contracts/document-id.js";

const text = "Alpha\nBeta";
const read = {
  schema_version: 1 as const,
  type: "document_read_result" as const,
  document: {
    provider: "fixture",
    namespace: "space-a",
    collection: "drive-a",
    document_id: "asset-a",
    path: "/docs/report.pdf",
    title: "Report",
    media_type: "application/pdf",
    version: "v1",
    content_hash: hashDocumentText("PDF bytes"),
  },
  excerpts: [
    {
      locator: { type: "lines" as const, start_line: 10, end_line: 11 },
      text,
      excerpt_hash: hashDocumentText(text),
    },
  ],
};
describe("document read receipt contract", () => {
  it("binds canonical document version and exact excerpt separately from presentation labels", () => {
    expect(validateDocumentReadResult(read)).toBe(true);
    const original = documentSourcesFromRead(read, "documents")[0];
    expect(original.mcp_server).toBe("documents");
    expect(
      documentSourcesFromRead(
        {
          ...read,
          document: {
            ...read.document,
            path: "/renamed.pdf",
            title: "Renamed",
          },
        },
        "documents",
      )[0].source_id,
    ).toBe(original.source_id);
    for (const field of [
      "provider",
      "namespace",
      "collection",
      "document_id",
      "version",
      "content_hash",
    ] as const)
      expect(
        deriveDocumentKey({
          ...read.document,
          [field]: `${read.document[field]}changed`,
        }),
      ).not.toBe(original.document_key);
    expect(
      documentSourcesFromRead(
        {
          ...read,
          excerpts: [
            {
              ...read.excerpts[0],
              locator: { type: "lines", start_line: 12, end_line: 13 },
            },
          ],
        },
        "documents",
      )[0].source_id,
    ).not.toBe(original.source_id);
    expect(
      documentSourcesFromRead(
        {
          ...read,
          excerpts: [
            {
              ...read.excerpts[0],
              text: "Changed\nBeta",
              excerpt_hash: hashDocumentText("Changed\nBeta"),
            },
          ],
        },
        "documents",
      )[0].source_id,
    ).not.toBe(original.source_id);
  });
  it.each([
    { ...read, schema_version: 2 },
    { ...read, document: { ...read.document, content_hash: "unknown" } },
    {
      ...read,
      document: {
        ...read.document,
        path: "https://signed.example/file?token=secret",
      },
    },
    { ...read, excerpts: [{ ...read.excerpts[0], text: "Alpha\r\nBeta" }] },
    {
      ...read,
      excerpts: [
        {
          ...read.excerpts[0],
          locator: { type: "lines", start_line: 0, end_line: 1 },
        },
      ],
    },
    {
      ...read,
      excerpts: [{ ...read.excerpts[0], locator: { type: "page", page: 2 } }],
    },
    { ...read, excerpts: [{ ...read.excerpts[0], text: "one line" }] },
    {
      ...read,
      excerpts: [
        {
          ...read.excerpts[0],
          excerpt_hash: hashDocumentText("not the excerpt"),
        },
      ],
    },
  ])("rejects malformed, signed-URL, or inconsistent evidence", (value) =>
    expect(validateDocumentReadResult(value)).toBe(false));
  it("validates independent document annotations against exact Unicode text and read provenance", () => {
    const source = documentSourcesFromRead(read, "documents")[0];
    const contract = {
      schema_version: 1,
      offset_unit: "unicode-code-points",
      annotations: [
        {
          type: "document_citation",
          start_index: 2,
          end_index: 5,
          source_id: source.source_id,
          title: "Report",
        },
      ],
      bindings: [
        {
          annotation_index: 0,
          source_id: source.source_id,
          origin: "explicit_source_marker",
          tool_call_ids: ["actual-call"],
        },
      ],
      sources: [source],
      processing: "complete",
    };
    expect(
      isValidDocumentCitationContractMetadata(contract, { text: "😀 [1]" }),
    ).toBe(true);
    expect(
      isValidDocumentCitationContractMetadata(contract, { text: "😀 [" }),
    ).toBe(false);
    expect(
      isValidDocumentCitationContractMetadata({
        ...contract,
        bindings: [{ ...contract.bindings[0], tool_call_ids: [] }],
      }),
    ).toBe(false);
    expect(
      isValidDocumentCitationContractMetadata({ ...contract, sources: [] }),
    ).toBe(false);
    expect(isDocumentReadResult({ ...read, excerpts: [] })).toBe(false);
  });
});
