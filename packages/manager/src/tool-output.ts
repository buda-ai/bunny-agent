import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const TOOL_OUTPUT_MAX_BYTES = 50 * 1024;
export const TOOL_OUTPUT_MAX_LINES = 2_000;

/** Size and retrieval information for a truncated external tool response. */
export interface ToolOutputGuardDetails {
  truncated: true;
  originalBytes: number;
  originalLines: number;
  fullOutputPath?: string;
}

/** Model-visible text and optional metadata; never contains the full spilled response. */
export interface GuardedToolOutput {
  text: string;
  outputGuard?: ToolOutputGuardDetails;
}

function countLines(text: string): number {
  let lines = 1;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "\n") lines++;
  }
  return lines;
}

function previewText(text: string, maxBytes: number, maxLines: number): string {
  // Slice before encoding to avoid allocating another copy of a multi-MB response.
  const buffer = Buffer.from(text.slice(0, maxBytes), "utf8");
  let end = Math.min(buffer.length, maxBytes);
  while (end > 0 && end < buffer.length && (buffer[end] & 0xc0) === 0x80) {
    end--;
  }
  const prefix = buffer.subarray(0, end).toString("utf8");
  let lines = 1;
  for (let index = 0; index < prefix.length; index++) {
    if (prefix[index] === "\n" && ++lines > maxLines) {
      return prefix.slice(0, index);
    }
  }
  return prefix;
}

/**
 * Bound external tool text to 50 KiB / 2,000 lines, including the retrieval notice.
 * Oversized responses are saved verbatim in the OS temporary directory, matching
 * Pi's native output-file lifecycle. Storage failures still return bounded text
 * and explicitly report that the full output could not be saved.
 */
export async function guardToolOutput(
  text: string,
): Promise<GuardedToolOutput> {
  const originalBytes = Buffer.byteLength(text, "utf8");
  const originalLines = countLines(text);
  if (
    originalBytes <= TOOL_OUTPUT_MAX_BYTES &&
    originalLines <= TOOL_OUTPUT_MAX_LINES
  ) {
    return { text };
  }

  let fullOutputPath: string | undefined;
  try {
    const path = join(
      tmpdir(),
      `bunny-tool-output-${randomBytes(8).toString("hex")}.txt`,
    );
    await writeFile(path, text, { encoding: "utf8", mode: 0o600, flag: "wx" });
    fullOutputPath = path;
  } catch {
    // A storage error must not let the original oversized response reach the model.
  }

  const retrieval = fullOutputPath
    ? `Full output saved to: ${JSON.stringify(fullOutputPath)}. Use read with offset/limit or bash to extract a bounded fragment.`
    : "Full output could not be saved. Retry with a narrower query or fewer fields.";
  const notice = `\n\n[Tool output truncated: original ${originalBytes} bytes / ${originalLines} lines; preview limit ${TOOL_OUTPUT_MAX_BYTES} bytes / ${TOOL_OUTPUT_MAX_LINES} lines. ${retrieval}]`;
  const preview = previewText(
    text,
    TOOL_OUTPUT_MAX_BYTES - Buffer.byteLength(notice, "utf8"),
    TOOL_OUTPUT_MAX_LINES - countLines(notice) + 1,
  );

  return {
    text: `${preview}${notice}`,
    outputGuard: {
      truncated: true,
      originalBytes,
      originalLines,
      ...(fullOutputPath ? { fullOutputPath } : {}),
    },
  };
}
