import { describe, expect, it } from "vitest";
import {
  prepareCodingRunEnv,
  sanitizeCodingRunBodyEnv,
  sanitizeCodingRunBodySystemEnv,
} from "../coding-run-env.js";

describe("sanitizeCodingRunBodyEnv", () => {
  it("returns undefined for non-object input", () => {
    expect(sanitizeCodingRunBodyEnv(null)).toBeUndefined();
    expect(sanitizeCodingRunBodyEnv("string")).toBeUndefined();
    expect(sanitizeCodingRunBodyEnv([1, 2])).toBeUndefined();
  });

  it("keeps valid env-style string entries", () => {
    expect(
      sanitizeCodingRunBodyEnv({ PATH: "/usr/bin", HOME: "/root" }),
    ).toEqual({ PATH: "/usr/bin", HOME: "/root" });
  });

  it("drops non-string values and invalid keys", () => {
    expect(
      sanitizeCodingRunBodyEnv({
        PATH: "/usr/bin",
        "BAD-KEY": "x",
        "1LEAD_DIGIT": "y",
        OBJ: { nested: true },
        NUM: 42,
        OK: "yes",
      }),
    ).toEqual({ PATH: "/usr/bin", OK: "yes" });
  });

  it("returns undefined when no valid entries remain", () => {
    expect(sanitizeCodingRunBodyEnv({ "1bad": "x" })).toBeUndefined();
  });
});

describe("sanitizeCodingRunBodySystemEnv", () => {
  it("matches sanitizeCodingRunBodyEnv shape rules", () => {
    expect(
      sanitizeCodingRunBodySystemEnv({ PATH: "/usr/bin", BAD: 42 }),
    ).toEqual({ PATH: "/usr/bin" });
  });

  it("returns undefined for missing field", () => {
    expect(sanitizeCodingRunBodySystemEnv(undefined)).toBeUndefined();
  });
});

describe("prepareCodingRunEnv", () => {
  it("inline env overrides daemon env", () => {
    const { env, systemEnv } = prepareCodingRunEnv(
      { PATH: "/usr/bin", FOO: "daemon" },
      { env: { FOO: "inline", BAR: "new" } },
    );
    expect(env).toEqual({
      PATH: "/usr/bin",
      FOO: "inline",
      BAR: "new",
    });
    expect(systemEnv).toBeUndefined();
  });

  it("returns daemon env unchanged when body has no env", () => {
    const { env, systemEnv } = prepareCodingRunEnv({ PATH: "/usr/bin" }, {});
    expect(env).toEqual({ PATH: "/usr/bin" });
    expect(systemEnv).toBeUndefined();
  });

  it("accepts web search keys only from the request body", () => {
    const { env } = prepareCodingRunEnv(
      {
        PATH: "/usr/bin",
        BRAVE_API_KEY: "local-brave",
        TAVILY_API_KEY: "local-tavily",
      },
      { env: { TAVILY_API_KEY: "request-tavily" } },
    );
    expect(env).toEqual({
      PATH: "/usr/bin",
      TAVILY_API_KEY: "request-tavily",
    });
  });

  it("omits ambient web search keys when the request does not provide them", () => {
    const { env } = prepareCodingRunEnv(
      {
        PATH: "/usr/bin",
        BRAVE_API_KEY: "local-brave",
        TAVILY_API_KEY: "local-tavily",
      },
      {},
    );
    expect(env).toEqual({ PATH: "/usr/bin" });
  });

  it("sanitizes systemEnv from body", () => {
    const { systemEnv } = prepareCodingRunEnv(
      { PATH: "/usr/bin" },
      { systemEnv: { PATH: "/usr/bin", BAD: 42 } },
    );
    expect(systemEnv).toEqual({ PATH: "/usr/bin" });
  });
});
