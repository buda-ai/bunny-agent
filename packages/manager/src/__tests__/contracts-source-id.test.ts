import { describe, expect, it } from "vitest";
import { deriveSourceId, normalizeSourceUrl } from "../contracts/source-id.js";

describe("deriveSourceId", () => {
  it("assigns a stable src_ prefixed id to a valid URL", () => {
    const id = deriveSourceId("https://example.com/docs");
    expect(id).toBeDefined();
    expect(id).toBe(
      "src_de106e607d0e711199de3fb7eb98fe5d412ee49ac326eadd3db848ee272ad2cb",
    );
  });

  it("returns the same id for a repeated URL", () => {
    const first = deriveSourceId("https://example.com/docs");
    const second = deriveSourceId("https://example.com/docs");
    expect(first).toBe(second);
  });

  it("keeps distinct query strings as distinct identities", () => {
    const a = deriveSourceId("https://example.com/docs?x=1");
    const b = deriveSourceId("https://example.com/docs?x=2");
    expect(a).not.toBe(b);
  });

  it("keeps distinct fragments as distinct identities", () => {
    const a = deriveSourceId("https://example.com/docs#section-1");
    const b = deriveSourceId("https://example.com/docs#section-2");
    expect(a).not.toBe(b);
  });

  it("does not strip tracking parameters into false equivalence", () => {
    const withTracking = deriveSourceId(
      "https://example.com/docs?utm_source=newsletter",
    );
    const without = deriveSourceId("https://example.com/docs");
    expect(withTracking).not.toBe(without);
  });

  it("rejects unsafe URLs (javascript scheme)", () => {
    expect(deriveSourceId("javascript:alert(1)")).toBeUndefined();
  });

  it("rejects URLs with embedded credentials", () => {
    expect(
      deriveSourceId("https://user:pass@example.com/docs"),
    ).toBeUndefined();
  });

  it("rejects malformed URLs", () => {
    expect(deriveSourceId("not a url")).toBeUndefined();
  });

  it("rejects relative paths", () => {
    expect(deriveSourceId("/relative/path")).toBeUndefined();
  });
});

describe("all-invalid provider output", () => {
  it("does not synthesize a false zero-hit search when every candidate URL is unsafe", () => {
    const candidateUrls = ["javascript:alert(1)", "not a url", "ftp://x/y"];
    const ids = candidateUrls.map(deriveSourceId);
    // Every candidate failed validation (undefined), which callers must
    // treat as "could not register any source" rather than silently
    // proceeding as if the search legitimately returned zero results.
    expect(ids.every((id) => id === undefined)).toBe(true);
  });
});

describe("normalizeSourceUrl", () => {
  it("preserves path, query, and fragment", () => {
    const normalized = normalizeSourceUrl(
      "https://example.com/docs?x=1#section",
    );
    expect(normalized).toBe("https://example.com/docs?x=1#section");
  });

  it("returns undefined for an all-invalid input", () => {
    expect(normalizeSourceUrl("ftp://example.com/file")).toBeUndefined();
  });
});
