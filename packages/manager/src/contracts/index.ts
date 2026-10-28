/**
 * Browser-safe public entry point for the web search / answer citation
 * contract. Re-exported through `@bunny-agent/sdk/contracts`.
 *
 * Node-specific source hashing (`source-id.ts`) is intentionally NOT
 * re-exported here — import it directly from
 * `@bunny-agent/manager/contracts/source-id` in server code.
 */

export {
  codePointLength,
  codePointOffsetToUtf16Index,
  isValidCodePointRange,
  projectOutputText,
  sliceByCodePointRange,
  utf16IndexToCodePointOffset,
  utf16RangeToCodePointRange,
} from "./projection.js";
export type {
  CitationBinding,
  CitationContractMetadata,
  CitationDiagnostic,
  CitationOffsetUnit,
  CitationOrigin,
  CitationProcessingState,
  OutputTextContent,
  SearchContractCapabilities,
  SearchContractLimits,
  SearchContractVersion,
  SourceDetails,
  UrlCitationAnnotation,
  WebSearchAction,
  WebSearchCallRecord,
  WebSearchCallStatus,
  WebSearchError,
  WebSearchErrorCode,
  WebSearchResultItem,
  WebSearchSource,
} from "./types.js";
export { SEARCH_CONTRACT_LIMITS, SEARCH_CONTRACT_VERSION_1 } from "./types.js";

export type { CitationValidationContext } from "./validators.js";
export {
  enforceSourceLimit,
  isAnnotationRangeValidForText,
  isCitationBinding,
  isSafeHttpUrl,
  isSupportedSearchContractVersion,
  isUrlCitationAnnotation,
  isValidCitationContractMetadata,
  isValidWebSearchCallRecord,
  isWebSearchAction,
  isWebSearchError,
  isWebSearchResultItem,
  isWebSearchSource,
} from "./validators.js";
