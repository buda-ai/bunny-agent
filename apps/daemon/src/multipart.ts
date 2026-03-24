/**
 * Minimal multipart/form-data parser — zero external dependencies.
 * Parses raw body buffer using the boundary from Content-Type header.
 */

export interface ParsedMultipart {
  fields: Record<string, string>;
  files: Array<{ filename: string; data: Buffer }>;
}

export function parseMultipart(
  contentType: string,
  body: Buffer,
): ParsedMultipart {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/);
  if (!match) throw new Error("missing multipart boundary");
  const boundary = match[1] ?? match[2];
  const delimiter = Buffer.from(`--${boundary}`);

  const fields: Record<string, string> = {};
  const files: Array<{ filename: string; data: Buffer }> = [];

  // Split body by boundary
  let start = body.indexOf(delimiter) + delimiter.length;
  while (start < body.length) {
    const end = body.indexOf(delimiter, start);
    if (end === -1) break;

    const part = body.subarray(start, end);
    // Skip leading \r\n
    const partStart = part[0] === 0x0d && part[1] === 0x0a ? 2 : 0;
    const headerEnd = part.indexOf("\r\n\r\n", partStart);
    if (headerEnd === -1) {
      start = end + delimiter.length;
      continue;
    }

    const headerStr = part.subarray(partStart, headerEnd).toString("utf-8");
    // Data is between header end and trailing \r\n before next boundary
    let data = part.subarray(headerEnd + 4);
    // Strip trailing \r\n
    if (
      data.length >= 2 &&
      data[data.length - 2] === 0x0d &&
      data[data.length - 1] === 0x0a
    ) {
      data = data.subarray(0, data.length - 2);
    }

    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);

    if (filenameMatch && nameMatch) {
      files.push({ filename: filenameMatch[1], data: Buffer.from(data) });
    } else if (nameMatch) {
      fields[nameMatch[1]] = data.toString("utf-8");
    }

    start = end + delimiter.length;
  }

  return { fields, files };
}
