"use client";

import {
  CheckCircle,
  Code,
  Copy,
  Download,
  Eye,
  FileCode,
  Maximize2,
  RefreshCw,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import type { ArtifactData } from "./ArtifactItem";
import { getFileExtensionFromMimeType } from "./utils";

/**
 * Props for ArtifactPanel component
 */
export interface ArtifactPanelProps {
  /** Artifact to display */
  artifact: ArtifactData;
  /** Custom class name */
  className?: string;
}

/**
 * ArtifactPanel - Full artifact content panel with preview support
 *
 * Supports code view and HTML preview with fullscreen mode.
 */
export function ArtifactPanel({ artifact, className }: ArtifactPanelProps) {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [previewScale, setPreviewScale] = useState(0.5);
  const previewWrapperRef = useRef<HTMLDivElement>(null);

  // Handle iframe scaling to fit container
  useEffect(() => {
    const wrapper = previewWrapperRef.current;
    if (!wrapper) return;

    const updateScale = () => {
      const wrapperWidth = wrapper.clientWidth;
      const wrapperHeight = wrapper.clientHeight;
      const scaleX = (wrapperWidth - 32) / 800;
      const scaleY = (wrapperHeight - 32) / 600;
      const scale = Math.min(scaleX, scaleY, 1);
      setPreviewScale(Math.max(scale, 0.2));
    };

    updateScale();
    const resizeObserver = new ResizeObserver(updateScale);
    resizeObserver.observe(wrapper);

    return () => {
      resizeObserver.disconnect();
    };
  });

  const handleCopy = async () => {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([artifact.content], { type: artifact.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const extension = getFileExtensionFromMimeType(artifact.mimeType);
    a.download = `${artifact.artifactId}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRefresh = () => {
    setIframeKey((prev) => prev + 1);
  };

  // ESC key to close fullscreen
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isFullscreen]);

  const isHtml = artifact.mimeType.includes("html");
  const isMarkdown = artifact.mimeType.includes("markdown");

  return (
    <>
      <div className={cn("h-full flex flex-col", className)}>
        <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2 min-w-0">
            <FileCode className="size-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium truncate">
              {artifact.artifactId}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* View mode toggle for HTML files */}
            {isHtml && (
              <>
                <button
                  onClick={() => setViewMode("preview")}
                  className={cn(
                    "p-1.5 rounded transition-colors",
                    viewMode === "preview"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted",
                  )}
                  title="预览"
                >
                  <Eye className="size-4" />
                </button>
                <button
                  onClick={() => setViewMode("code")}
                  className={cn(
                    "p-1.5 rounded transition-colors",
                    viewMode === "code"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted",
                  )}
                  title="代码"
                >
                  <Code className="size-4" />
                </button>
                {viewMode === "preview" && (
                  <>
                    <button
                      onClick={handleRefresh}
                      className="p-1.5 hover:bg-muted rounded transition-colors"
                      title="刷新"
                    >
                      <RefreshCw className="size-4 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => setIsFullscreen(true)}
                      className="p-1.5 hover:bg-muted rounded transition-colors"
                      title="全屏"
                    >
                      <Maximize2 className="size-4 text-muted-foreground" />
                    </button>
                  </>
                )}
                <div className="w-px h-4 bg-border" />
              </>
            )}
            <button
              onClick={handleCopy}
              className="p-1.5 hover:bg-muted rounded transition-colors"
              title="复制"
            >
              {copied ? (
                <CheckCircle className="size-4 text-green-600" />
              ) : (
                <Copy className="size-4 text-muted-foreground" />
              )}
            </button>
            <button
              onClick={handleDownload}
              className="p-1.5 hover:bg-muted rounded transition-colors"
              title="下载"
            >
              <Download className="size-4 text-muted-foreground" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col">
          {isHtml && viewMode === "preview" ? (
            <>
              {/* Iframe preview - scaled to fit container */}
              <div
                ref={previewWrapperRef}
                className="flex-1 overflow-hidden flex items-center justify-center p-4"
              >
                <div
                  className="relative bg-white rounded-lg border border-border shadow-sm overflow-hidden"
                  style={{
                    width: `${800 * previewScale}px`,
                    height: `${600 * previewScale}px`,
                  }}
                >
                  <iframe
                    key={iframeKey}
                    srcDoc={artifact.content}
                    className="absolute top-0 left-0 origin-top-left"
                    style={{
                      width: "800px",
                      height: "600px",
                      transform: `scale(${previewScale})`,
                    }}
                    title={artifact.artifactId}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
                  />
                </div>
              </div>
              {/* Fullscreen button at bottom */}
              <div className="p-3 text-center border-t border-border bg-muted/30">
                <button
                  onClick={() => setIsFullscreen(true)}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2 px-4 py-2 rounded-md hover:bg-muted"
                >
                  <Maximize2 className="size-4" />
                  点击展开全屏
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-auto p-4">
              {isMarkdown ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-sm">
                    {artifact.content}
                  </pre>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-sm">
                  {artifact.content}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Modal */}
      {isFullscreen && isHtml && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 bg-black/50 border-b border-white/10">
            <div className="flex items-center gap-3">
              <FileCode className="size-5 text-white" />
              <span className="text-white font-medium">
                {artifact.artifactId}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                className="p-2 hover:bg-white/10 rounded transition-colors"
                title="刷新"
              >
                <RefreshCw className="size-5 text-white" />
              </button>
              <button
                onClick={() => setIsFullscreen(false)}
                className="p-2 hover:bg-white/10 rounded transition-colors"
                title="退出全屏 (ESC)"
              >
                <X className="size-5 text-white" />
              </button>
            </div>
          </div>

          {/* Iframe container */}
          <div className="flex-1 p-4 overflow-hidden">
            <iframe
              key={iframeKey}
              srcDoc={artifact.content}
              className="w-full h-full bg-white rounded-lg"
              title={artifact.artifactId}
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
            />
          </div>

          {/* Footer hint */}
          <div className="p-3 text-center text-sm text-white/60 bg-black/50 border-t border-white/10">
            按 ESC 键退出全屏
          </div>
        </div>
      )}
    </>
  );
}
