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
  it("returns Error.message for a simple Error", () => {
    expect(formatErrorForLog(new Error("simple"))).toBe("simple");
  });

  it("flattens nested Error causes with ' | cause: ' separator", () => {
    const inner = new Error("root cause");
    const middle = new Error("middle layer", { cause: inner });
    const outer = new Error("outer", { cause: middle });

    const out = formatErrorForLog(outer);
    expect(out).toBe("outer | cause: middle layer | cause: root cause");
  });

  it("stops walking causes once it hits a non-Error cause", () => {
    const outer = new Error("outer", { cause: { reason: "x" } });
    expect(formatErrorForLog(outer)).toBe("outer");
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
