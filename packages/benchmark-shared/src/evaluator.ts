/**
 * Core Evaluation Logic
 */

/**
 * Evaluate if answer matches expected
 */
export function evaluateAnswer(answer: string, expected: string | RegExp): boolean {
  if (typeof expected === "string") {
    return answer.trim().toLowerCase() === expected.trim().toLowerCase();
  }
  return expected.test(answer);
}
