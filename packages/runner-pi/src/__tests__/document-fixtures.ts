import type { DocumentReadResult } from "@bunny-agent/manager/contracts";
import { hashDocumentText } from "@bunny-agent/manager/contracts/document-id";
export function documentRead(
  text = "First evidence\nSecond evidence",
  start = 3,
): DocumentReadResult {
  return {
    schema_version: 1,
    type: "document_read_result",
    document: {
      provider: "fixture",
      namespace: "space-a",
      collection: "drive-a",
      document_id: "asset-a",
      path: "/reports/report.pdf",
      title: "Report",
      media_type: "application/pdf",
      version: "version-1",
      content_hash: hashDocumentText("original PDF bytes"),
    },
    excerpts: [
      {
        locator: {
          type: "lines",
          start_line: start,
          end_line: start + text.split("\n").length - 1,
        },
        text,
        excerpt_hash: hashDocumentText(text),
      },
    ],
  };
}
