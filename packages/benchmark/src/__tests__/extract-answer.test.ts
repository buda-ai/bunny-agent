import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { sandagentRunner } from "../runners/sandagent.js";

/**
 * Extract the final answer using sandagent runner
 */
function extractFinalAnswer(output: string): string {
  const answer = sandagentRunner.extractAnswer(output);
  if (answer !== null) {
    return answer;
  }
  // Fallback: return last non-empty line
  const lines = output
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines[lines.length - 1] ?? output.trim();
}

describe.skip("extractFinalAnswer", () => {
  it("should extract answer from benchmark results file", () => {
    // Load the actual benchmark results
    const resultsPath = path.join(
      __dirname,
      "../../benchmark-results/sandagent-validation-latest.json",
    );

    if (!fs.existsSync(resultsPath)) {
      console.log("Skipping test - no benchmark results file found");
      return;
    }

    const data = JSON.parse(fs.readFileSync(resultsPath, "utf-8"));
    const rawOutput = data.results[0].rawOutput;
    const expectedAnswer = data.results[0].expectedAnswer;

    const extractedAnswer = extractFinalAnswer(rawOutput);

    console.log("Extracted answer:", extractedAnswer);
    console.log("Expected answer:", expectedAnswer);

    // The extracted answer should be a valid non-empty answer
    expect(extractedAnswer).toBeDefined();
    expect(extractedAnswer.length).toBeGreaterThan(0);
    // Should not be the raw SSE marker
    expect(extractedAnswer).not.toBe("data: [DONE]");
  });

  it("should extract answer from simple ANSWER: format", () => {
    const sseOutput = `data: {"type":"tool-output-available","toolCallId":"test","toolName":"Bash","output":{"stdout":"ANSWER: 42","stderr":""},"dynamic":true}`;
    expect(extractFinalAnswer(sseOutput)).toBe("42");
  });

  it("should extract answer from Ball # format", () => {
    const sseOutput = `data: {"type":"tool-output-available","toolCallId":"test","toolName":"Bash","output":{"stdout":"Ball with HIGHEST ejection probability: Ball #3\\nEjection probability: 0.630990 (63.0990%)\\n\\nANSWER: Ball #3 has the highest probability!","stderr":""},"dynamic":true}`;
    expect(extractFinalAnswer(sseOutput)).toBe("3");
  });
});
