"use client";

import { useCallback, useMemo, useState } from "react";
import type {
  AskUserQuestionInput,
  AskUserQuestionOutput,
  Question,
  UseAskUserQuestionOptions,
  UseAskUserQuestionReturn,
} from "./types";

/**
 * useAskUserQuestion - Hook for handling AskUserQuestion tool interactions
 *
 * Manages the state for user question/answer interactions in chat.
 * Provides answer selection, completion detection, and formatted output.
 *
 * @example
 * ```tsx
 * import { useAskUserQuestion } from "@sandagent/sdk/react";
 *
 * function QuestionUI({ part, sessionId }) {
 *   const {
 *     questions,
 *     answers,
 *     isCompleted,
 *     selectAnswer,
 *     isSelected,
 *   } = useAskUserQuestion({
 *     part,
 *     onAnswer: (data) => {
 *       fetch("/api/answer", {
 *         method: "POST",
 *         body: JSON.stringify(data),
 *       });
 *     },
 *   });
 *
 *   if (isCompleted) {
 *     return <div>Completed</div>;
 *   }
 *
 *   return (
 *     <div>
 *       {questions.map((q) => (
 *         <div key={q.question}>
 *           <p>{q.question}</p>
 *           {q.options?.map((opt) => (
 *             <button
 *               key={opt.label}
 *               onClick={() => selectAnswer(q.question, opt.label, q.multiSelect)}
 *               style={{ fontWeight: isSelected(q.question, opt.label, q.multiSelect) ? 'bold' : 'normal' }}
 *             >
 *               {opt.label}
 *             </button>
 *           ))}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useAskUserQuestion({
  part,
  answerEndpoint = "/api/answer",
  onAnswer,
}: UseAskUserQuestionOptions): UseAskUserQuestionReturn {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  // Parse questions from part.input
  const questions = useMemo((): Question[] => {
    if (!part.input || typeof part.input !== "object") return [];
    const input = part.input as AskUserQuestionInput;
    if (!input.questions || !Array.isArray(input.questions)) return [];
    return input.questions;
  }, [part.input]);

  // Parse answers from part.output (for restored sessions)
  const outputAnswers = useMemo((): Record<
    string,
    string | string[]
  > | null => {
    if (part.output && typeof part.output === "object") {
      const output = part.output as AskUserQuestionOutput;
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
  }, [part.output, questions]);

  // Determine display answers (user input or restored from output)
  const displayAnswers = useMemo(() => {
    return Object.keys(answers).length > 0 ? answers : outputAnswers || {};
  }, [answers, outputAnswers]);

  // Check if completed
  const isCompleted = useMemo(() => {
    return (
      part.state === "output-available" ||
      (Object.keys(answers).length === 0 && outputAnswers !== null)
    );
  }, [part.state, answers, outputAnswers]);

  // Check if waiting for input (for animation)
  const isWaitingForInput = part.state === "input-available";

  // Get formatted answers map
  const getAnswersMap = useCallback((): Record<string, string> => {
    const answersMap: Record<string, string> = {};
    for (const q of questions) {
      const answer = displayAnswers[q.question];
      if (q.multiSelect) {
        answersMap[q.question] = Array.isArray(answer) ? answer.join(", ") : "";
      } else {
        answersMap[q.question] = (answer as string) || "";
      }
    }
    return answersMap;
  }, [questions, displayAnswers]);

  // Select answer handler
  const selectAnswer = useCallback(
    (question: string, value: string, multiSelect = false) => {
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

      // Prepare answers map for callback and API
      const answersMap: Record<string, string> = {};
      for (const q of questions) {
        const answer = newAnswers[q.question];
        if (q.multiSelect) {
          answersMap[q.question] = Array.isArray(answer)
            ? answer.join(", ")
            : "";
        } else {
          answersMap[q.question] = (answer as string) || "";
        }
      }

      // Auto-submit to answer endpoint
      fetch(answerEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolCallId: part.toolCallId,
          questions,
          answers: answersMap,
        }),
      }).catch((err) => {
        console.error("[useAskUserQuestion] Submit failed:", err);
      });

      // Trigger callback
      onAnswer?.({
        toolCallId: part.toolCallId,
        questions,
        answers: answersMap,
      });
    },
    [answers, questions, part.toolCallId, answerEndpoint, onAnswer],
  );

  // Check if option is selected
  const isSelected = useCallback(
    (question: string, optionLabel: string, multiSelect = false): boolean => {
      const selectedValue = displayAnswers[question];
      if (multiSelect) {
        return (
          (selectedValue as string[] | undefined)?.includes(optionLabel) ??
          false
        );
      }
      return selectedValue === optionLabel;
    },
    [displayAnswers],
  );

  return {
    questions,
    answers: displayAnswers,
    isCompleted,
    isWaitingForInput,
    selectAnswer,
    getAnswersMap,
    isSelected,
  };
}
