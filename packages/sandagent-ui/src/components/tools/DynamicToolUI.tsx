"use client";

import type { DynamicToolUIPart } from "ai";
import { isTodoWriteInput, TodoView } from "kui/ai-elements/todo";
import { cn } from "../../lib/utils";
import { AskUserQuestion } from "./AskUserQuestion";
import { WriteToolCard } from "./WriteToolCard";

/**
 * Props for DynamicToolUI component
 */
export interface DynamicToolUIProps {
  /** The dynamic tool UI part from AI SDK */
  part: DynamicToolUIPart;
  /** Session ID for tracking */
  sessionId: string;
  /** Additional config to pass to tools */
  config?: Record<string, string>;
  /** Custom class name */
  className?: string;
  /** Custom tool renderers for extensibility */
  customRenderers?: Record<
    string,
    (props: {
      part: DynamicToolUIPart;
      sessionId: string;
      config?: Record<string, string>;
    }) => React.ReactNode
  >;
}

/**
 * DynamicToolUI - Renders tool UI based on tool name
 *
 * Handles built-in tools (TodoWrite, AskUserQuestion, Write)
 * and supports custom tool renderers for extensibility.
 */
export function DynamicToolUI({
  part,
  sessionId,
  config,
  className,
  customRenderers,
}: DynamicToolUIProps) {
  const toolName = part.toolName;
  const state = part.state;
  const input = part.input as Record<string, unknown> | undefined;
  const output = part.output as string | Record<string, unknown> | undefined;
  const errorText = part.errorText;

  // Check for custom renderer first
  if (customRenderers?.[toolName]) {
    return (
      <div className={className}>
        {customRenderers[toolName]({ part, sessionId, config })}
      </div>
    );
  }

  // Handle TodoWrite tool
  if (toolName === "TodoWrite" && input && isTodoWriteInput(input)) {
    return (
      <TodoView
        todos={input.todos}
        title="任务列表"
        isStreaming={state === "input-streaming"}
        className={className}
      />
    );
  }

  // Handle AskUserQuestion tool
  if (toolName === "AskUserQuestion" && part.state !== "input-streaming") {
    return (
      <AskUserQuestion
        part={part}
        sessionId={sessionId}
        config={config}
        className={className}
      />
    );
  }

  // Handle Write tool
  if (toolName === "Write" && input) {
    return (
      <WriteToolCard
        filePath={input.file_path as string}
        content={input.content as string}
        state={state}
        output={output}
        errorText={errorText}
        className={className}
      />
    );
  }

  // Generic tool display
  return (
    <div
      className={cn(
        "my-2 rounded-lg border border-border bg-muted/50 p-3",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium text-foreground">{toolName}</span>
        <span
          className={cn(
            "text-xs",
            state === "output-error"
              ? "text-destructive"
              : state === "output-available"
                ? "text-green-500"
                : "text-muted-foreground",
          )}
        >
          {state === "input-streaming" && "输入中..."}
          {state === "input-available" && "准备执行..."}
          {state === "output-available" && "✓ 完成"}
          {state === "output-error" && "✗ 错误"}
        </span>
      </div>
      {input && (
        <pre className="mt-2 overflow-auto text-xs text-muted-foreground">
          {JSON.stringify(input, null, 2)}
        </pre>
      )}
      {errorText && (
        <div className="mt-2 text-sm text-destructive">{String(errorText)}</div>
      )}
      {output && (
        <div className="mt-2 border-t border-border pt-2">
          <pre className="overflow-auto text-xs text-muted-foreground">
            {typeof output === "string"
              ? output
              : JSON.stringify(output, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
