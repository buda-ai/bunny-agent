"use client";

import type { DynamicToolUIPart } from "ai";
import { useState } from "react";
import type { AskUserQuestionOutput, ChatAddToolOutputFunction } from "./type";

// AskUserQuestion interactive component
export function AskUserQuestionUI({
  part,
  addToolOutput,
  sessionId,
  config = {},
}: {
  part: DynamicToolUIPart;
  addToolOutput: ChatAddToolOutputFunction;
  sessionId: string;
  config?: Record<string, string>;
}) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  // Safely extract questions with type checking
  const questions = (() => {
    if (!part.input || typeof part.input !== "object") return [];
    const input = part.input as AskUserQuestionOutput;
    if (!input.questions || !Array.isArray(input.questions)) return [];
    return input.questions;
  })();

  const approval = part.approval;

  // If questions is empty or invalid, show error state
  if (questions.length === 0) {
    return (
      <div className="my-2 rounded-lg border border-destructive bg-destructive/10 p-4">
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
        // Check if any answer is non-empty
        const hasRealAnswers = Object.values(output.answers).some(
          (v) => v && v.trim() !== "",
        );
        if (hasRealAnswers) {
          // Convert comma-separated strings back to arrays for multiSelect
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

  // Only show read-only completed state if:
  // 1. User hasn't started selecting (answers is empty)
  // 2. AND there are real answers from a previous session (outputAnswers exists)
  const isCompleted =
    Object.keys(answers).length === 0 && outputAnswers !== null;

  if (isCompleted) {
    return (
      <div className="my-2 space-y-4">
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
                        className={`flex items-start gap-3 rounded-md border p-3 ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border opacity-50"
                        }`}
                      >
                        <div
                          className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-${isMulti ? "sm" : "full"} border ${
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground"
                          }`}
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

    // Submit all collected answers to approval API (updates file in sandbox)
    // This allows the runner to read partial answers if timeout occurs
    fetch("/api/approval/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        toolCallId: part.toolCallId,
        questions,
        answers: answersMap,
        E2B_API_KEY: config.E2B_API_KEY,
        SANDOCK_API_KEY: config.SANDOCK_API_KEY,
        SANDBOX_PROVIDER: config.SANDBOX_PROVIDER || "e2b",
      }),
    }).catch((error) => {
      console.error("Failed to submit answer:", error);
    });

    // Note: We don't call addToolOutput here to avoid changing tool state
    // The tool output will be set when user sends the message
  };

  // Show animation when waiting for user input
  const shouldAnimate = part.state === "input-available";

  return (
    <div className="my-2 space-y-4">
      {questions.map((q, idx) => {
        const selectedValue = answers[q.question];
        const isMulti = q.multiSelect ?? false;

        return (
          <div
            key={idx}
            className={`rounded-lg border p-4 ${shouldAnimate ? "bounce-animation" : "border-border"}`}
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
                    <div
                      key={optIdx}
                      onClick={() =>
                        handleSelect(q.question, opt.label, isMulti)
                      }
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        handleSelect(q.question, opt.label, isMulti)
                      }
                      role={isMulti ? "checkbox" : "radio"}
                      aria-checked={isSelected}
                      tabIndex={0}
                      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      <div
                        className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-${isMulti ? "sm" : "full"} border ${
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground"
                        }`}
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
