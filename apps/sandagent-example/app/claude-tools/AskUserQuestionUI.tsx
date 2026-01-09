"use client";

import type { DynamicToolUIPart } from "ai";
import { useState } from "react";
import type { AskUserQuestionOutput, ChatAddToolOutputFunction } from "./type";

// AskUserQuestion interactive component
export function AskUserQuestionUI({
  part,
  addToolOutput,
}: {
  part: DynamicToolUIPart;
  addToolOutput: ChatAddToolOutputFunction;
}) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  const questions = (part.input as AskUserQuestionOutput)?.questions || [];

  const approval = part.approval;

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

    // Submit answer to approval API
    const answer = multiSelect
      ? (newAnswers[question] as string[]).join(", ")
      : newAnswers[question];

    fetch("/api/approval/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toolCallId: part.toolCallId,
        question,
        answer,
      }),
    }).catch((error) => {
      console.error("Failed to submit answer:", error);
    });

    // Update tool output on every selection so it's ready when user sends message
    const answersMap: Record<string, string> = {};
    for (const q of questions) {
      const answer = newAnswers[q.question];
      if (q.multiSelect) {
        answersMap[q.question] = Array.isArray(answer) ? answer.join(", ") : "";
      } else {
        answersMap[q.question] = (answer as string) || "";
      }
    }
    addToolOutput({
      tool: part.toolName,
      toolCallId: part.toolCallId,
      output: {
        questions: questions,
        answers: answersMap,
      },
      approval: approval
        ? {
            id: approval.id,
            approved: true,
            reason: "User selected",
          }
        : undefined,
    });
  };

  // Check if waiting for user input (state !== 'output-available')
  const isWaiting = part.state !== "output-available";

  return (
    <div className={`my-2 space-y-4 ${isWaiting ? "shake-animation" : ""}`}>
      {questions.map((q, idx) => {
        const selectedValue = answers[q.question];
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
