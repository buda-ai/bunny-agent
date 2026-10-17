import { createRequire } from "node:module";

/** The verified AI SDK 6 baseline that preserves result provider metadata. */
export const SEARCH_CONTRACT_AI_SDK_MINIMUM = "6.0.264";

export function supportsSearchContractUiMetadata(version: string): boolean {
  const match = /^6\.(\d+)\.(\d+)(?:\+[\w.-]+)?$/.exec(version);
  return !!match && (Number(match[1]) > 0 || Number(match[2]) >= 264);
}

/**
 * Older AI SDK releases silently discard tool-result provider metadata. V1
 * fails before execution on those peers; version-unspecified calls keep their
 * existing peer range and never invoke this check. Resolve lazily from the
 * backend SDK module so builds do not depend on JSON import attributes.
 */
export async function assertSearchContractAiSdkSupport(): Promise<void> {
  let version: unknown;
  try {
    // Resolve the actual consumer peer without import attributes, which an
    // ES2022 bundle can remove even when supplied as a dynamic import option.
    const packageInfo = createRequire(import.meta.url)("ai/package.json") as {
      version?: unknown;
    };
    version = packageInfo.version;
  } catch {
    throw new Error(
      "Cannot verify the AI SDK peer required by searchContractVersion: 1.",
    );
  }
  if (
    typeof version !== "string" ||
    !supportsSearchContractUiMetadata(version)
  ) {
    throw new Error(
      `searchContractVersion: 1 requires ai >=${SEARCH_CONTRACT_AI_SDK_MINIMUM} <7.0.0 to preserve structured tool-result metadata; found ai@${String(version)}.`,
    );
  }
}
