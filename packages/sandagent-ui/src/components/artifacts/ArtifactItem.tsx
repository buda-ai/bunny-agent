"use client";

import {
  CheckCircle,
  ChevronRight,
  Copy,
  Download,
  FileCode,
} from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";
import { getFileExtensionFromMimeType } from "./utils";

/**
 * Artifact data structure
 */
export interface ArtifactData {
  artifactId: string;
  content: string;
  mimeType: string;
}

/**
 * Props for ArtifactItem component
 */
export interface ArtifactItemProps {
  /** Artifact data */
  artifact: ArtifactData;
  /** Callback when artifact is selected */
  onSelect?: (artifact: ArtifactData) => void;
  /** Custom class name */
  className?: string;
}

/**
 * ArtifactItem - Compact artifact list item for chat bubbles
 *
 * Shows file name and mime type with copy/download actions.
 */
export function ArtifactItem({
  artifact,
  onSelect,
  className,
}: ArtifactItemProps) {
  const [copied, setCopied] = useState(false);
  const fileName = artifact.artifactId.split("/").pop() || artifact.artifactId;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const blob = new Blob([artifact.content], { type: artifact.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const extension = getFileExtensionFromMimeType(artifact.mimeType);
    a.download = `${fileName}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClick = () => {
    onSelect?.(artifact);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      className={cn(
        "group flex items-center justify-between p-2 rounded-lg border border-border bg-background/50 hover:bg-accent/50 transition-colors cursor-pointer max-w-2xl",
        className,
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex size-7 items-center justify-center rounded bg-blue-500/10 shrink-0">
          <FileCode className="size-3.5 text-blue-500" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium text-foreground truncate">
            {fileName}
          </span>
          <span className="text-[10px] text-muted-foreground truncate">
            {artifact.mimeType}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleCopy}
          className="p-1 rounded hover:bg-muted transition-colors"
          title="复制"
        >
          {copied ? (
            <CheckCircle className="size-3 text-green-600" />
          ) : (
            <Copy className="size-3 text-muted-foreground" />
          )}
        </button>
        <button
          onClick={handleDownload}
          className="p-1 rounded hover:bg-muted transition-colors"
          title="下载"
        >
          <Download className="size-3 text-muted-foreground" />
        </button>
        <div className="p-1">
          <ChevronRight className="size-3 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}
