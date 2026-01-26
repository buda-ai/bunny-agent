"use client";

import type { DynamicToolUIPart } from "ai";
import { useState } from "react";
import { cn } from "../../lib/utils";

/**
 * Question structure for AskUserQuestion tool
 */
export interface AskUserQuestionItem {
  question: string;
  header?: string;
  multiSelect?: boolean;
  options?: Array<{
    label: string;
    description?: string;
  }>;
}

/**
 * Input format for AskUserQuestion tool
 */
export interface AskUserQuestionInput {
  questions: AskUserQuestionItem[];
}

/**
 * Props for AskUserQuestion component
 */
export interface AskUserQuestionProps {
  /** The dynamic tool UI part from AI SDK */
  part: DynamicToolUIPart;
  /** Session ID for tracking */
  sessionId: string;
  /** Additional config to pass to approval API */
  config?: Record<string, string>;
  /** Custom approval API endpoint (default: /api/approval/submit) */
  approvalEndpoint?: string;
  /** Custom class name */
  className?: string;
}

/**
 * AskUserQuestion - Interactive component for user question/answer flows
 *
 * Renders questions from the Claude AskUserQuestion tool with
 * single-select or multi-select options.
 */
export function AskUserQuestion({
  part,
  sessionId,
  config = {},
  approvalEndpoint = "/api/approval/submit",
  className,
}: AskUserQuestionProps) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  // Safely extract questions with type checking
  const questions = (() => {
    if (!part.input || typeof part.input !== "object") return [];
    const input = part.input as AskUserQuestionInput;
    if (!input.questions || !Array.isArray(input.questions)) return [];
    return input.questions;
  })();

  // If questions is empty or invalid, show error state
  if (questions.length === 0) {
    return (
      <div
        className={cn(
          "my-2 rounded-lg border border-destructive bg-destructive/10 p-4",
          className,
        )}
      >
        <p className="text-sm text-destructive">
          Invalid question format. Please try again.
        </p>
      </div>
    );
  }

  // Parse answers from part.output if available (for restored sessions)
  const outputAnswers = (() => {
    if (part.output && typeof part.output === "object") {
      const output = part.output as { answers?: Record<string, string> };
      if (output.answers) {
        const hasRealAnswers = Object.values(output.answers).some(
          (v) => v && v.trim() !== "",
        );
        if (hasRealAnswers) {
          const parsed: Record<string, string | string[]> = {};
          for (const q of questions) {
            const val = output.answers[q.question];
            if (q.multiSelect && val) {
              parsed[q.question] = val.split(", ").filter(Boolean);
            } else {
              parsed[q.question] = val || "";
            }
          }
          return parsed;
        }
      }
    }
    return null;
  })();

  const displayAnswers =
    Object.keys(answers).length > 0 ? answers : outputAnswers || {};

  // Show read-only state if tool execution completed
  const isCompleted =
    part.state === "output-available" ||
    (Object.keys(answers).length === 0 && outputAnswers !== null);

  if (isCompleted) {
    return (
      <div className={cn("my-2 space-y-4", className)}>
        {questions.map((q, idx) => {
          const selectedValue = displayAnswers[q.question];
          const isMulti = q.multiSelect ?? false;

          return (
            <div key={idx} className="rounded-lg border border-border p-4">
              {q.header && (
                <h4 className="mb-2 font-medium text-foreground">{q.header}</h4>
              )}
              <p className="mb-3 text-sm text-muted-foreground">{q.question}</p>
              {q.options && (
                <div className="space-y-2">
                  {q.options.map((opt, optIdx) => {
                    const isSelected = isMulti
                      ? (selectedValue as string[] | undefined)?.includes(
                          opt.label,
                        )
                      : selectedValue === opt.label;

                    return (
                      <div
                        key={optIdx}
                        className={cn(
                          "flex items-start gap-3 rounded-md border p-3",
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border opacity-50",
                        )}
                      >
                        <div
                          className={cn(
                            "mt-0.5 flex size-4 shrink-0 items-center justify-center border",
                            isMulti ? "rounded-sm" : "rounded-full",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground",
                          )}
                        >
                          {isSelected && (
                            <svg
                              className="size-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">
                            {opt.label}
                          </div>
                          {opt.description && (
                            <div className="text-sm text-muted-foreground">
                              {opt.description}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  const handleSelect = (
    question: string,
    value: string,
    multiSelect: boolean,
  ) => {
    const newAnswers = { ...answers };
    if (multiSelect) {
      const current = (newAnswers[question] as string[]) || [];
      newAnswers[question] = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
    } else {
      newAnswers[question] = value;
    }
    setAnswers(newAnswers);

    // Prepare all answers for submission
    const answersMap: Record<string, string> = {};
    for (const q of questions) {
      const answer = newAnswers[q.question];
      if (q.multiSelect) {
        answersMap[q.question] = Array.isArray(answer) ? answer.join(", ") : "";
      } else {
        answersMap[q.question] = (answer as string) || "";
      }
    }

    // Submit to approval API
    fetch(approvalEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        toolCallId: part.toolCallId,
        questions,
        answers: answersMap,
        ...config,
      }),
    }).catch((error) => {
      console.error("Failed to submit answer:", error);
    });
  };

  // Show animation when waiting for user input
  const shouldAnimate = part.state === "input-available";

  return (
    <div className={cn("my-2 space-y-4", className)}>
      {questions.map((q, idx) => {
        const selectedValue = answers[q.question];
        const isMulti = q.multiSelect ?? false;

        return (
          <div
            key={idx}
            className={cn(
              "rounded-lg border p-4",
              shouldAnimate ? "bounce-animation" : "border-border",
            )}
          >
            {q.header && (
              <h4 className="mb-2 font-medium text-foreground">{q.header}</h4>
            )}
            <p className="mb-3 text-sm text-muted-foreground">{q.question}</p>
            {q.options && (
              <div className="space-y-2">
                {q.options.map((opt, optIdx) => {
                  const isSelected = isMulti
                    ? (selectedValue as string[] | undefined)?.includes(
                        opt.label,
                      )
                    : selectedValue === opt.label;

                  return (
                    <button
                      type="button"
                      key={optIdx}
                      onClick={() =>
                        handleSelect(q.question, opt.label, isMulti)
                      }
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        handleSelect(q.question, opt.label, isMulti)
                      }
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors w-full text-left",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted",
                      )}
                    >
                      <div
                        className={cn(
                          "mt-0.5 flex size-4 shrink-0 items-center justify-center border",
                          isMulti ? "rounded-sm" : "rounded-full",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground",
                        )}
                      >
                        {isSelected && (
                          <svg
                            className="size-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-foreground">
                          {opt.label}
                        </div>
                        {opt.description && (
                          <div className="text-sm text-muted-foreground">
                            {opt.description}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
