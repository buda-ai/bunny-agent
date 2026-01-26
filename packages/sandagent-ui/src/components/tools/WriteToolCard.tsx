"use client";

import { MessageResponse } from "kui/ai-elements/message";
import {
  CheckCircle,
  ChevronRight,
  Copy,
  Download,
  FileText,
} from "lucide-react";
import { memo, useState } from "react";
import { cn } from "../../lib/utils";

/**
 * Props for WriteToolCard component
 */
export interface WriteToolCardProps {
  /** File path being written to */
  filePath: string;
  /** File content */
  content: string;
  /** Tool state */
  state: string;
  /** Tool output (success message) */
  output?: string | Record<string, unknown>;
  /** Error text if failed */
  errorText?: string;
  /** Custom class name */
  className?: string;
}

/**
 * WriteToolCard - Expandable card for file write operations
 *
 * Shows file path and state in collapsed view, with expandable
 * content preview (supports markdown rendering).
 */
export const WriteToolCard = memo(
  function WriteToolCard({
    filePath,
    content,
    state,
    output,
    errorText,
    className,
  }: WriteToolCardProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const isMarkdown = filePath?.endsWith(".md");
    const fileName = filePath?.split("/").pop() || filePath;

    const handleDownload = (e: React.MouseEvent) => {
      e.stopPropagation();
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    const handleCopy = async (e: React.MouseEvent) => {
      e.stopPropagation();
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    const getStateLabel = () => {
      switch (state) {
        case "input-streaming":
          return { text: "输入中...", className: "text-muted-foreground" };
        case "input-available":
          return { text: "准备执行...", className: "text-muted-foreground" };
        case "output-available":
          return { text: "✓ 完成", className: "text-green-500" };
        case "output-error":
          return { text: "✗ 错误", className: "text-destructive" };
        default:
          return { text: state, className: "text-muted-foreground" };
      }
    };

    const stateInfo = getStateLabel();

    return (
      <div
        className={cn(
          "my-2 rounded-lg border border-border bg-muted/50 overflow-hidden",
          className,
        )}
      >
        {/* Header - always visible */}
        <div
          className="flex items-center justify-between p-3 hover:bg-muted/80 transition-colors cursor-pointer"
          onClick={() => setIsOpen(!isOpen)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setIsOpen(!isOpen);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-md bg-blue-500/10">
              <FileText className="size-4 text-blue-500" />
            </div>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground text-sm">
                  写入文件
                </span>
                <span className={cn("text-xs", stateInfo.className)}>
                  {stateInfo.text}
                </span>
              </div>
              <div className="text-xs text-muted-foreground font-mono">
                {filePath}
              </div>
            </div>
          </div>
          <ChevronRight
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              isOpen && "rotate-90",
            )}
          />
        </div>

        {/* Expandable Content */}
        {isOpen && (
          <div className="border-t border-border">
            {/* Content Header with Actions */}
            <div className="flex items-center justify-between p-3 bg-muted/30 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {isMarkdown ? "Markdown 预览" : "文件内容"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownload}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors"
                  title="下载文件"
                >
                  <Download className="size-4 text-muted-foreground" />
                </button>
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors"
                  title="复制内容"
                >
                  {copied ? (
                    <CheckCircle className="size-4 text-green-600" />
                  ) : (
                    <Copy className="size-4 text-muted-foreground" />
                  )}
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-4">
              {isMarkdown ? (
                <div
                  className="rounded-md border border-border bg-background p-4 prose prose-sm dark:prose-invert max-w-none scrollable-content overflow-y-auto"
                  style={{ maxHeight: "400px" }}
                >
                  <MessageResponse>{content}</MessageResponse>
                </div>
              ) : (
                <div
                  className="rounded-md border border-border bg-[#0d0d0d] scrollable-content overflow-auto"
                  style={{ height: "400px", minHeight: "200px" }}
                >
                  <pre className="p-3 text-xs text-[#e6e6e6] font-mono whitespace-pre m-0 block">
                    {content}
                  </pre>
                </div>
              )}

              {/* Error display */}
              {errorText && (
                <div className="mt-4">
                  <div className="text-sm text-destructive bg-destructive/10 rounded-md p-2">
                    {String(errorText)}
                  </div>
                </div>
              )}

              {/* Output display */}
              {output && (
                <div className="mt-4">
                  <div className="text-xs text-green-600 dark:text-green-400 bg-green-500/10 rounded-md p-2">
                    {typeof output === "string"
                      ? output
                      : JSON.stringify(output, null, 2)}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.filePath === nextProps.filePath &&
      prevProps.content === nextProps.content &&
      prevProps.state === nextProps.state &&
      prevProps.output === nextProps.output &&
      prevProps.errorText === nextProps.errorText
    );
  },
);
