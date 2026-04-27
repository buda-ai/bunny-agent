import { describe, expect, it } from "vitest";
import {
  describeError,
  ensureError,
  formatUnknownError,
} from "../error-serialize.js";

describe("formatUnknownError", () => {
  it("returns 'null' for null", () => {
    expect(formatUnknownError(null)).toBe("null");
  });

  it("returns 'undefined' for undefined", () => {
    expect(formatUnknownError(undefined)).toBe("undefined");
  });

  it("returns the string as-is for string input", () => {
    expect(formatUnknownError("boom")).toBe("boom");
  });

  it("stringifies numbers and booleans", () => {
    expect(formatUnknownError(42)).toBe("42");
    expect(formatUnknownError(true)).toBe("true");
    expect(formatUnknownError(false)).toBe("false");
  });

  it("serializes Error to JSON record with name and message", () => {
    const result = formatUnknownError(new Error("kaboom"));
    const parsed = JSON.parse(result);
    expect(parsed).toMatchObject({ name: "Error", message: "kaboom" });
  });

  it("includes recursive cause chain when present", () => {
    const inner = new Error("inner");
    const outer = new Error("outer", { cause: inner });
    const parsed = JSON.parse(formatUnknownError(outer));
    expect(parsed.message).toBe("outer");
    const innerParsed = JSON.parse(parsed.cause);
    expect(innerParsed.message).toBe("inner");
  });

  it("never produces literal '[object Object]' for plain object input", () => {
    const out = formatUnknownError({ code: 500, body: "boom" });
    expect(out).not.toBe("[object Object]");
    expect(JSON.parse(out)).toEqual({ code: 500, body: "boom" });
  });

  it("converts nested Error inside object to its record", () => {
    const inner = new Error("nested");
    const out = formatUnknownError({ outer: "ok", inner });
    const parsed = JSON.parse(out);
    expect(parsed.outer).toBe("ok");
    expect(parsed.inner).toMatchObject({ name: "Error", message: "nested" });
  });

  it("handles circular objects without throwing", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(() => formatUnknownError(obj)).not.toThrow();
    expect(formatUnknownError(obj)).toBe("Unserializable object error");
  });

  it("falls back to String() for symbols and bigints", () => {
    expect(formatUnknownError(Symbol("s"))).toBe("Symbol(s)");
    expect(formatUnknownError(10n)).toBe("10");
  });
});

describe("ensureError", () => {
  it("returns the same Error instance when given an Error", () => {
    const err = new Error("identity");
    expect(ensureError(err)).toBe(err);
  });

  it("preserves stack on the original Error", () => {
    const err = new Error("with stack");
    const out = ensureError(err);
    expect(out.stack).toBe(err.stack);
  });

  it("wraps a string into a real Error with that message", () => {
    const out = ensureError("plain string");
    expect(out).toBeInstanceOf(Error);
    expect(out.message).toBe("plain string");
  });

  it("wraps a plain object into Error whose message is structured (not '[object Object]')", () => {
    const payload = { code: 500, body: "boom" };
    const out = ensureError(payload);
    expect(out).toBeInstanceOf(Error);
    expect(out.message).not.toBe("[object Object]");
    expect(out.message).toBe(JSON.stringify(payload));
    expect(out.cause).toBe(payload);
  });

  it("wraps null/undefined into Error with readable message", () => {
    expect(ensureError(null).message).toBe("null");
    expect(ensureError(undefined).message).toBe("undefined");
  });
});

describe("describeError", () => {
  it("returns the formatUnknownError summary when value is not an Error", () => {
    expect(describeError("boom")).toBe("boom");
    expect(describeError({ x: 1 })).toBe('{"x":1}');
  });

  it("returns just the summary when Error has no extra fields", () => {
    const out = describeError(new Error("plain"));
    const parsed = JSON.parse(out);
    expect(parsed).toMatchObject({ name: "Error", message: "plain" });
    expect(out.includes("| extra=")).toBe(false);
  });

  it("appends extra=... with own properties attached to the Error", () => {
    const err = new Error("api fail") as Error & {
      status?: number;
      body?: string;
    };
    err.status = 500;
    err.body = "internal";

    const out = describeError(err);
    expect(out).toContain("| extra=");
    const extraIdx = out.indexOf("| extra=");
    const extraJson = out.slice(extraIdx + "| extra=".length);
    const extra = JSON.parse(extraJson);
    expect(extra).toEqual({ status: 500, body: "internal" });
  });

  it("includes cause when Error has a cause", () => {
    const err = new Error("outer", { cause: { reason: "x" } });
    const out = describeError(err);
    expect(out).toContain("| extra=");
    const extra = JSON.parse(out.slice(out.indexOf("| extra=") + 8));
    expect(extra.cause).toEqual({ reason: "x" });
  });

  it("salvages diagnostic info even when message is the literal '[object Object]'", () => {
    // Reproduces the third-party SDK bug where `new Error(someObject)` was
    // executed upstream, leaving us with an Error whose `.message` is useless.
    const err = new Error("[object Object]") as Error & {
      status?: number;
    };
    err.status = 502;

    const out = describeError(err);
    expect(out).toContain("status");
    expect(out).toContain("502");
  });
});
