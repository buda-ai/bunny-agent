import { describe, expect, it } from "vitest";
import { checkAnswer, normalizeAnswer } from "../runner.js";

describe("normalizeAnswer", () => {
  it("should lowercase the answer", () => {
    expect(normalizeAnswer("HELLO")).toBe("hello");
    expect(normalizeAnswer("Hello World")).toBe("hello world");
  });

  it("should trim whitespace", () => {
    expect(normalizeAnswer("  hello  ")).toBe("hello");
    expect(normalizeAnswer("\nhello\n")).toBe("hello");
  });

  it("should collapse multiple spaces", () => {
    expect(normalizeAnswer("hello   world")).toBe("hello world");
    expect(normalizeAnswer("a  b  c")).toBe("a b c");
  });

  it("should remove punctuation", () => {
    expect(normalizeAnswer("hello, world!")).toBe("hello world");
    expect(normalizeAnswer("test: result")).toBe("test result");
  });

  it("should handle complex strings", () => {
    expect(normalizeAnswer("  Hello, World!  ")).toBe("hello world");
    expect(normalizeAnswer("The answer is: 42.")).toBe("the answer is 42");
  });
});

describe("checkAnswer", () => {
  it("should return true for exact match", () => {
    expect(checkAnswer("Paris", "Paris")).toBe(true);
    expect(checkAnswer("42", "42")).toBe(true);
  });

  it("should return true for case-insensitive match", () => {
    expect(checkAnswer("paris", "Paris")).toBe(true);
    expect(checkAnswer("PARIS", "paris")).toBe(true);
  });

  it("should return true when agent answer contains expected", () => {
    expect(checkAnswer("The answer is Paris", "Paris")).toBe(true);
    expect(checkAnswer("Result: 42", "42")).toBe(true);
  });

  it("should return true when expected contains agent answer", () => {
    expect(checkAnswer("Paris", "The capital is Paris")).toBe(true);
    expect(checkAnswer("42", "The answer is 42")).toBe(true);
  });

  it("should return false for non-matching answers", () => {
    expect(checkAnswer("London", "Paris")).toBe(false);
    expect(checkAnswer("41", "42")).toBe(false);
  });

  it("should handle whitespace and punctuation differences", () => {
    expect(checkAnswer("Paris, France", "Paris France")).toBe(true);
    expect(checkAnswer("forty-two", "fortytwo")).toBe(true);
  });
});
