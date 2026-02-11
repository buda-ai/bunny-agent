"use client";

import { useAskUserQuestion } from "@sandagent/sdk/react";
import type { DynamicToolUIPart } from "ai";

// AskUserQuestion interactive component
export function AskUserQuestionUI({ part }: { part: DynamicToolUIPart }) {
  const {
    questions,
    answers,
    isCompleted,
    isWaitingForInput,
    selectAnswer,
    isSelected,
  } = useAskUserQuestion({
    part,
  });

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

  // Completed state - show read-only answers
  if (isCompleted) {
    return (
      <div className="my-2 space-y-4">
        {questions.map((q, idx) => {
          const answer = answers[q.question];
          const displayValue = Array.isArray(answer)
            ? answer.join(", ")
            : answer || "";

          return (
            <div
              key={`${q.question}-${idx}`}
              className="rounded-lg border border-border bg-muted/30 p-4"
            >
              {q.header && (
                <div className="mb-2 text-sm font-medium text-muted-foreground">
                  {q.header}
                </div>
              )}
              <div className="mb-2 text-sm">{q.question}</div>
              <div className="flex flex-wrap gap-2">
                {q.options?.map((opt, optIdx) => {
                  const selected = Array.isArray(answer)
                    ? answer.includes(opt.label)
                    : answer === opt.label;
                  return (
                    <div
                      key={`${opt.label}-${optIdx}`}
                      className={`rounded-md px-3 py-1.5 text-sm ${
                        selected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {opt.label}
                      {selected && <span className="ml-1">✓</span>}
                    </div>
                  );
                })}
              </div>
              {displayValue && !q.options && (
                <div className="mt-2 text-sm text-foreground">
                  {displayValue}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Interactive state - show selection UI (radio 单选 / checkbox 多选)
  return (
    <div className="my-2 space-y-4 overflow-visible">
      {questions.map((q, idx) => (
        <fieldset
          key={`${q.question}-${idx}`}
          className={`rounded-lg border border-border p-4 transition-all duration-300 overflow-visible ${
            isWaitingForInput ? "animate-pulse border-primary/50" : ""
          }`}
        >
          {q.header && (
            <legend className="mb-2 text-sm font-medium text-foreground">
              {q.header}
            </legend>
          )}
          <div className="mb-3 text-sm text-muted-foreground">{q.question}</div>
          {q.multiSelect && (
            <div className="mb-2 text-xs text-muted-foreground">可多选</div>
          )}
          <div className="flex flex-col gap-2 overflow-visible min-h-[2rem]">
            {q.options?.map((opt, optIdx) => {
              const selected = isSelected(q.question, opt.label, q.multiSelect);
              const id = `ask-${idx}-${optIdx}-${opt.label.slice(0, 8)}`;

              if (q.multiSelect) {
                return (
                  <label
                    key={`${opt.label}-${optIdx}`}
                    htmlFor={id}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm cursor-pointer border transition-colors ${
                      selected
                        ? "bg-primary/10 border-primary text-foreground"
                        : "bg-muted/50 border-border hover:border-primary/30 text-foreground"
                    }`}
                  >
                    <input
                      id={id}
                      type="checkbox"
                      checked={!!selected}
                      onChange={() => selectAnswer(q.question, opt.label, true)}
                      className="size-4 shrink-0 rounded border-border"
                    />
                    <span className="flex-1">{opt.label}</span>
                    {opt.description && (
                      <span className="text-xs text-muted-foreground">
                        {opt.description}
                      </span>
                    )}
                  </label>
                );
              }

              return (
                <label
                  key={`${opt.label}-${optIdx}`}
                  htmlFor={id}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm cursor-pointer border transition-colors ${
                    selected
                      ? "bg-primary/10 border-primary text-foreground"
                      : "bg-muted/50 border-border hover:border-primary/30 text-foreground"
                  }`}
                >
                  <input
                    id={id}
                    type="radio"
                    name={`ask-${idx}-${q.question.slice(0, 12)}`}
                    checked={!!selected}
                    onChange={() => selectAnswer(q.question, opt.label, false)}
                    className="size-4 shrink-0 border-border"
                  />
                  <span className="flex-1">{opt.label}</span>
                  {opt.description && (
                    <span className="text-xs text-muted-foreground">
                      {opt.description}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
