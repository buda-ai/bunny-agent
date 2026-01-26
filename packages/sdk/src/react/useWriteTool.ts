"use client";

import { useMemo } from "react";
import type { DynamicToolUIPart } from "./types";

/**
 * Write tool input structure
 */
export interface WriteToolInput {
  file_path: string;
  content: string;
}

/**
 * Write tool output structure
 */
export interface WriteToolOutput {
  type: "create" | "edit";
  filePath: string;
  content: string;
  structuredPatch?: unknown[];
  originalFile?: string | null;
}

/**
 * Options for useWriteTool hook
 */
export interface UseWriteToolOptions {
  /** The dynamic tool UI part from the message */
  part: DynamicToolUIPart;
}

/**
 * Return type for useWriteTool hook
 */
export interface UseWriteToolReturn {
  /** File path being written to */
  filePath: string | null;
  /** File name (extracted from path) */
  fileName: string | null;
  /** File content */
  content: string | null;
  /** Operation type: 'create' or 'edit' */
  operationType: "create" | "edit" | null;
  /** Original file content (for edit operations) */
  originalContent: string | null;
  /** Structured patch data (for edit operations) */
  structuredPatch: unknown[] | null;
  /** Tool state */
  state: "streaming" | "input-available" | "output-available" | "error";
  /** Whether the tool is currently streaming input */
  isStreaming: boolean;
  /** Whether the write operation completed successfully */
  isCompleted: boolean;
  /** Whether there was an error */
  hasError: boolean;
  /** Error message if any */
  errorText: string | null;
  /** Whether this is a markdown file */
  isMarkdown: boolean;
  /** File extension */
  fileExtension: string | null;
}

/**
 * useWriteTool - Hook for handling Write tool interactions
 *
 * Parses the Write tool's input and output data, providing
 * easy access to file information and operation state.
 *
 * @example
 * ```tsx
 * import { useWriteTool } from "@sandagent/sdk/react";
 *
 * function WriteToolUI({ part }) {
 *   const {
 *     filePath,
 *     fileName,
 *     content,
 *     operationType,
 *     isStreaming,
 *     isCompleted,
 *     isMarkdown,
 *   } = useWriteTool({ part });
 *
 *   if (isStreaming) {
 *     return <div>Writing {fileName}...</div>;
 *   }
 *
 *   return (
 *     <div>
 *       <h3>{fileName} ({operationType})</h3>
 *       {isMarkdown ? (
 *         <MarkdownRenderer content={content} />
 *       ) : (
 *         <pre>{content}</pre>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useWriteTool({
  part,
}: UseWriteToolOptions): UseWriteToolReturn {
  // Parse input data
  const inputData = useMemo((): WriteToolInput | null => {
    if (!part.input || typeof part.input !== "object") return null;
    const input = part.input as WriteToolInput;
    if (!input.file_path) return null;
    return input;
  }, [part.input]);

  // Parse output data
  const outputData = useMemo((): WriteToolOutput | null => {
    if (!part.output || typeof part.output !== "object") return null;
    const output = part.output as WriteToolOutput;
    if (!output.filePath) return null;
    return output;
  }, [part.output]);

  // Determine file path (prefer output, fallback to input)
  const filePath = outputData?.filePath ?? inputData?.file_path ?? null;

  // Extract file name
  const fileName = useMemo(() => {
    if (!filePath) return null;
    return filePath.split("/").pop() || filePath;
  }, [filePath]);

  // Extract file extension
  const fileExtension = useMemo(() => {
    if (!fileName) return null;
    const parts = fileName.split(".");
    return parts.length > 1 ? parts.pop()?.toLowerCase() || null : null;
  }, [fileName]);

  // Determine content (prefer output, fallback to input)
  const content = outputData?.content ?? inputData?.content ?? null;

  // Operation type
  const operationType = outputData?.type ?? null;

  // Original content (for edits)
  const originalContent = outputData?.originalFile ?? null;

  // Structured patch
  const structuredPatch = outputData?.structuredPatch ?? null;

  // State parsing
  const state = useMemo((): UseWriteToolReturn["state"] => {
    if (part.state === "input-streaming") return "streaming";
    if (part.state === "output-error") return "error";
    if (part.state === "output-available") return "output-available";
    return "input-available";
  }, [part.state]);

  const isStreaming = state === "streaming";
  const isCompleted = state === "output-available";
  const hasError = state === "error";
  const errorText = part.errorText ?? null;

  // Check if markdown
  const isMarkdown = useMemo(() => {
    if (!fileExtension) return false;
    return ["md", "markdown", "mdx"].includes(fileExtension);
  }, [fileExtension]);

  return {
    filePath,
    fileName,
    content,
    operationType,
    originalContent,
    structuredPatch,
    state,
    isStreaming,
    isCompleted,
    hasError,
    errorText,
    isMarkdown,
    fileExtension,
  };
}
