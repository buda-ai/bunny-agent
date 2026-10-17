/**
 * Browser-safe re-export of the web search / answer citation contract
 * types and helpers from `@bunny-agent/manager/contracts`, published as
 * `@bunny-agent/sdk/contracts` for product (Buda Cloud/OpenBuda) consumers.
 *
 * This file intentionally re-exports only the browser-safe manager barrel —
 * never `@bunny-agent/manager/contracts/source-id`, which uses `node:crypto`
 * and must stay server-only.
 */
export type {
  CitationBinding,
  CitationContractMetadata,
  CitationDiagnostic,
  CitationOffsetUnit,
  CitationOrigin,
  CitationProcessingState,
  CitationValidationContext,
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
} from "@bunny-agent/manager/contracts";
export {
  codePointLength,
  codePointOffsetToUtf16Index,
  enforceSourceLimit,
  isAnnotationRangeValidForText,
  isCitationBinding,
  isSafeHttpUrl,
  isSupportedSearchContractVersion,
  isUrlCitationAnnotation,
  isValidCitationContractMetadata,
  isValidCodePointRange,
  isValidWebSearchCallRecord,
  isWebSearchAction,
  isWebSearchError,
  isWebSearchResultItem,
  isWebSearchSource,
  projectOutputText,
  SEARCH_CONTRACT_LIMITS,
  SEARCH_CONTRACT_VERSION_1,
  sliceByCodePointRange,
  utf16IndexToCodePointOffset,
  utf16RangeToCodePointRange,
} from "@bunny-agent/manager/contracts";
export type { UIMessageOutputText } from "./ui-message-projection";
export {
  isSearchContractCapabilities,
  projectUIMessageOutputText,
} from "./ui-message-projection";
