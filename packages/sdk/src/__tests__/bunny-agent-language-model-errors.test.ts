import { describe, expect, it } from "vitest";
import {
  formatErrorForLog,
  stringifyStreamErrorField,
} from "../provider/bunny-agent-language-model";

describe("stringifyStreamErrorField", () => {
  it("returns undefined for nullish input", () => {
    expect(stringifyStreamErrorField(undefined)).toBeUndefined();
    expect(stringifyStreamErrorField(null)).toBeUndefined();
  });

  it("returns undefined for empty strings (so callers can fall back)", () => {
    expect(stringifyStreamErrorField("")).toBeUndefined();
  });

  it("returns non-empty strings as-is", () => {
    expect(stringifyStreamErrorField("boom")).toBe("boom");
  });

  it("stringifies numbers and booleans", () => {
    expect(stringifyStreamErrorField(42)).toBe("42");
    expect(stringifyStreamErrorField(true)).toBe("true");
  });

  it("never produces '[object Object]' for plain object payloads", () => {
    // This is the exact bug class we're guarding against: an upstream runner
    // emitted `{ "type": "error", "errorText": { code: 500, body: "boom" } }`,
    // and we used to do `new Error(parsed.errorText as string)` which produced
    // an Error whose message was the literal "[object Object]".
    const out = stringifyStreamErrorField({ code: 500, body: "boom" });
    expect(out).not.toBe("[object Object]");
    expect(out).toBeTypeOf("string");
    expect(JSON.parse(out as string)).toEqual({ code: 500, body: "boom" });
  });

  it("handles error-shaped objects without throwing", () => {
    const out = stringifyStreamErrorField({
      name: "RemoteError",
      message: "upstream blew up",
      status: 502,
    });
    expect(out).toContain("upstream blew up");
    expect(out).toContain("502");
  });

  it("constructing a real Error with the result no longer yields '[object Object]'", () => {
    const payload = { code: 500, body: "boom" };
    const text = stringifyStreamErrorField(payload);
    const err = new Error(text ?? "fallback");
    expect(err.message).not.toBe("[object Object]");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("formatErrorForLog", () => {
  it("returns a structured string for a simple Error", () => {
    const parsed = JSON.parse(formatErrorForLog(new Error("simple")));
    expect(parsed).toMatchObject({ name: "Error", message: "simple" });
  });

  it("flattens nested Error causes with ' | cause: ' separator", () => {
    const inner = new Error("root cause");
    const middle = new Error("middle layer", { cause: inner });
    const outer = new Error("outer", { cause: middle });

    const out = formatErrorForLog(outer);
    const [outerPart, middlePart, innerPart] = out.split(" | cause: ");
    expect(JSON.parse(outerPart)).toMatchObject({ message: "outer" });
    expect(JSON.parse(middlePart)).toMatchObject({ message: "middle layer" });
    expect(JSON.parse(innerPart)).toMatchObject({ message: "root cause" });
  });

  it("includes non-Error cause details from the formatted outer Error", () => {
    const outer = new Error("outer", { cause: { reason: "x" } });
    const out = formatErrorForLog(outer);
    const parsed = JSON.parse(out);
    expect(parsed.message).toBe("outer");
    expect(typeof parsed.cause).toBe("string");
    expect(JSON.parse(parsed.cause)).toEqual({ reason: "x" });
  });

  it("delegates non-Error values to formatUnknownError (no '[object Object]')", () => {
    const out = formatErrorForLog({ status: 500 });
    expect(out).not.toBe("[object Object]");
    expect(JSON.parse(out)).toEqual({ status: 500 });
  });

  it("handles strings", () => {
    expect(formatErrorForLog("plain")).toBe("plain");
  });
});
