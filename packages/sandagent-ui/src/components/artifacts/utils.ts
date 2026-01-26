/**
 * Get file extension from MIME type
 */
export function getFileExtensionFromMimeType(mimeType: string): string {
  if (mimeType.includes("html")) return "html";
  if (mimeType.includes("javascript")) return "js";
  if (mimeType.includes("typescript")) return "ts";
  if (mimeType.includes("json")) return "json";
  if (mimeType.includes("markdown")) return "md";
  if (mimeType.includes("css")) return "css";
  if (mimeType.includes("python")) return "py";
  if (mimeType.includes("java")) return "java";
  if (mimeType.includes("xml")) return "xml";
  if (mimeType.includes("yaml")) return "yaml";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("svg")) return "svg";
  if (mimeType.includes("pdf")) return "pdf";
  return "txt"; // default fallback
}
