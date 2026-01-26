"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ArtifactData, UIMessage } from "./types";

/**
 * Options for useArtifacts hook
 */
export interface UseArtifactsOptions {
  /** Messages to extract artifacts from */
  messages: UIMessage[];
}

/**
 * Return type for useArtifacts hook
 */
export interface UseArtifactsReturn {
  /** All extracted artifacts */
  artifacts: ArtifactData[];
  /** Currently selected artifact */
  selectedArtifact: ArtifactData | null;
  /** Set the selected artifact */
  setSelectedArtifact: (artifact: ArtifactData | null) => void;
  /** Select artifact by ID */
  selectArtifactById: (artifactId: string) => void;
  /** Whether there are any artifacts */
  hasArtifacts: boolean;
  /** Number of artifacts */
  count: number;
  /** Copy artifact content to clipboard */
  copyContent: (artifact: ArtifactData) => Promise<void>;
  /** Download artifact as file */
  downloadArtifact: (artifact: ArtifactData) => void;
  /** Get file extension from mime type */
  getFileExtension: (mimeType: string) => string;
}

/**
 * Get file extension from MIME type
 */
function getFileExtensionFromMimeType(mimeType: string): string {
  const mimeToExtension: Record<string, string> = {
    "text/plain": "txt",
    "text/html": "html",
    "text/css": "css",
    "text/javascript": "js",
    "text/markdown": "md",
    "application/json": "json",
    "application/xml": "xml",
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/svg+xml": "svg",
  };

  // Try exact match
  if (mimeToExtension[mimeType]) {
    return mimeToExtension[mimeType];
  }

  // Try partial match (e.g., "text/x-markdown" -> "md")
  if (mimeType.includes("markdown")) return "md";
  if (mimeType.includes("json")) return "json";
  if (mimeType.includes("javascript")) return "js";
  if (mimeType.includes("typescript")) return "ts";
  if (mimeType.includes("html")) return "html";
  if (mimeType.includes("css")) return "css";
  if (mimeType.includes("xml")) return "xml";
  if (mimeType.includes("python")) return "py";

  // Default
  return "txt";
}

/**
 * useArtifacts - Hook for managing artifacts from chat messages
 *
 * Extracts artifacts from messages and provides selection,
 * copy, and download functionality.
 *
 * @example
 * ```tsx
 * import { useArtifacts } from "@sandagent/sdk/react";
 *
 * function ArtifactPanel({ messages }) {
 *   const {
 *     artifacts,
 *     selectedArtifact,
 *     setSelectedArtifact,
 *     hasArtifacts,
 *     copyContent,
 *     downloadArtifact,
 *   } = useArtifacts({ messages });
 *
 *   if (!hasArtifacts) return null;
 *
 *   return (
 *     <div>
 *       {artifacts.map((artifact) => (
 *         <button
 *           key={artifact.artifactId}
 *           onClick={() => setSelectedArtifact(artifact)}
 *         >
 *           {artifact.artifactId}
 *         </button>
 *       ))}
 *
 *       {selectedArtifact && (
 *         <div>
 *           <pre>{selectedArtifact.content}</pre>
 *           <button onClick={() => copyContent(selectedArtifact)}>Copy</button>
 *           <button onClick={() => downloadArtifact(selectedArtifact)}>Download</button>
 *         </div>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useArtifacts({
  messages,
}: UseArtifactsOptions): UseArtifactsReturn {
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactData | null>(
    null,
  );

  // Extract artifacts from messages with memoization optimization
  const prevArtifactsRef = useRef<ArtifactData[]>([]);
  const artifacts = useMemo(() => {
    const results: ArtifactData[] = [];
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type === "data-artifact") {
          const data = part.data as ArtifactData;
          if (!results.some((a) => a.artifactId === data.artifactId)) {
            results.push(data);
          }
        }
      }
    }

    // Memoization optimization - return previous reference if content unchanged
    const prev = prevArtifactsRef.current;
    if (
      prev.length === results.length &&
      prev.every((prevArt, idx) => {
        const currArt = results[idx];
        return (
          prevArt.artifactId === currArt.artifactId &&
          prevArt.content === currArt.content &&
          prevArt.mimeType === currArt.mimeType
        );
      })
    ) {
      return prev;
    }

    prevArtifactsRef.current = results;
    return results;
  }, [messages]);

  // Sync selectedArtifact when artifacts change
  useEffect(() => {
    if (artifacts.length > 0) {
      setSelectedArtifact((prev) => {
        if (!prev) return artifacts[0];

        const currentMatch = artifacts.find(
          (a) => a.artifactId === prev.artifactId,
        );

        if (!currentMatch) {
          return artifacts[0];
        }

        if (
          currentMatch.content === prev.content &&
          currentMatch.mimeType === prev.mimeType
        ) {
          return prev;
        }

        return currentMatch;
      });
    } else {
      setSelectedArtifact((prev) => (prev === null ? prev : null));
    }
  }, [artifacts]);

  // Select artifact by ID
  const selectArtifactById = useCallback(
    (artifactId: string) => {
      const artifact = artifacts.find((a) => a.artifactId === artifactId);
      if (artifact) {
        setSelectedArtifact(artifact);
      }
    },
    [artifacts],
  );

  // Copy content to clipboard
  const copyContent = useCallback(async (artifact: ArtifactData) => {
    await navigator.clipboard.writeText(artifact.content);
  }, []);

  // Download artifact as file
  const downloadArtifact = useCallback((artifact: ArtifactData) => {
    const blob = new Blob([artifact.content], { type: artifact.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const fileName = artifact.artifactId.split("/").pop() || artifact.artifactId;
    const extension = getFileExtensionFromMimeType(artifact.mimeType);
    a.download = fileName.includes(".") ? fileName : `${fileName}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const hasArtifacts = artifacts.length > 0;
  const count = artifacts.length;

  return {
    artifacts,
    selectedArtifact,
    setSelectedArtifact,
    selectArtifactById,
    hasArtifacts,
    count,
    copyContent,
    downloadArtifact,
    getFileExtension: getFileExtensionFromMimeType,
  };
}
