import {
  type CitationBinding,
  isValidCitationContractMetadata,
  type OutputTextContent,
  projectOutputText,
  type SearchContractCapabilities,
} from "@bunny-agent/manager/contracts";

/** A canonical text projection with associations kept outside flat annotations. */
export interface UIMessageOutputText {
  textPartId?: string;
  output_text: OutputTextContent;
  bindings: CitationBinding[];
  searchContract?: SearchContractCapabilities;
}

/** Validate a request's effective acknowledgement without inferring capabilities. */
export function isSearchContractCapabilities(
  value: unknown,
): value is SearchContractCapabilities {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 1 &&
    typeof v.structured_retrieval === "boolean" &&
    typeof v.native_annotations === "boolean" &&
    typeof v.explicit_source_marker_annotations === "boolean"
  );
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Project durable AI SDK UIMessage text parts in message order, without a
 * registry or Node dependencies. Identity lives in Bunny `textPartId` metadata.
 * Legacy/unknown-version parts yield plain text with empty annotations/bindings.
 * Recognized v1 citation metadata fails closed with TypeError if malformed,
 * out of bounds, missing durable identity, or lacking a valid acknowledgement.
 * Links, raw search snippets, and source cards never create annotations.
 */
export function projectUIMessageOutputText(message: {
  parts: readonly unknown[];
}): UIMessageOutputText[] {
  return message.parts.flatMap((value): UIMessageOutputText[] => {
    const part = record(value);
    if (part?.type !== "text" || typeof part.text !== "string") return [];
    const bunny = record(record(part.providerMetadata)?.["bunny-agent"]);
    const identity =
      typeof bunny?.textPartId === "string" && bunny.textPartId.length > 0
        ? bunny.textPartId
        : undefined;
    const contract = record(bunny?.citation_contract);
    const acknowledgement = isSearchContractCapabilities(bunny?.searchContract)
      ? bunny.searchContract
      : undefined;
    if (
      acknowledgement &&
      bunny?.citation_contract !== undefined &&
      contract?.schema_version === undefined
    ) {
      throw new TypeError(
        "Invalid durable Bunny citation contract v1 text part",
      );
    }
    if (contract?.schema_version === 1) {
      if (
        !identity ||
        !acknowledgement ||
        !isValidCitationContractMetadata(contract, { text: part.text })
      ) {
        throw new TypeError(
          "Invalid durable Bunny citation contract v1 text part",
        );
      }
      return [
        {
          textPartId: identity,
          output_text: projectOutputText(part.text, contract.annotations),
          bindings: contract.bindings.map((binding) => ({
            ...binding,
            tool_call_ids: [...binding.tool_call_ids],
          })),
          searchContract: { ...acknowledgement },
        },
      ];
    }
    return [
      {
        ...(identity ? { textPartId: identity } : {}),
        output_text: projectOutputText(part.text, []),
        bindings: [],
        ...(acknowledgement ? { searchContract: { ...acknowledgement } } : {}),
      },
    ];
  });
}
