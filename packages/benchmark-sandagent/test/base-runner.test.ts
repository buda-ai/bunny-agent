import { describe, expect, it } from "vitest";
import { BaseRunner } from "../src/runners/base.js";
import type { RunnerDefaults } from "../src/runners/types.js";

class TestRunner extends BaseRunner {
  readonly name = "test";
  readonly defaults: RunnerDefaults = {
    command: "sandagent",
    args: ["run", "--runner", "gemini", "--output-format", "stream-json", "--"],
  };
}

describe("BaseRunner.extractAnswer", () => {
  it("concatenates multiple 0: text chunks", () => {
    const runner = new TestRunner();
    const output = [
      '0:"5"',
      '0:"79"',
      'd:{"finishReason":"stop"}',
    ].join("\n");

    expect(runner.extractAnswer(output)).toBe("579");
  });

  it("parses escaped json string chunks", () => {
    const runner = new TestRunner();
    const output = [
      '0:"Hello"',
      '0:", World!\\n"',
      'd:{"finishReason":"stop"}',
    ].join("\n");

    expect(runner.extractAnswer(output)).toBe("Hello, World!");
  });
});
