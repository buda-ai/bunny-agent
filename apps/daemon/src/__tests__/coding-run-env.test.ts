import { describe, expect, it } from "vitest";
import {
  mergeCodingRunProcessEnv,
  sanitizeCodingRunBodyEnv,
} from "../coding-run-env.js";

describe("coding-run-env", () => {
  it("keeps only valid string env entries", () => {
    expect(
      sanitizeCodingRunBodyEnv({
        OPENAI_API_KEY: "sk-test",
        "bad-key": "ignored",
        NUMBER_VALUE: 1,
        _OK: "yes",
      }),
    ).toEqual({
      OPENAI_API_KEY: "sk-test",
      _OK: "yes",
    });
  });

  it("returns undefined for non-object or empty sanitized env", () => {
    expect(sanitizeCodingRunBodyEnv(null)).toBeUndefined();
    expect(sanitizeCodingRunBodyEnv([])).toBeUndefined();
    expect(sanitizeCodingRunBodyEnv({ "bad-key": "x" })).toBeUndefined();
  });

  it("merges inline env over daemon env", () => {
    expect(
      mergeCodingRunProcessEnv(
        { OPENAI_API_KEY: "daemon", PATH: "/usr/bin" },
        { env: { OPENAI_API_KEY: "inline", NEW_KEY: "new" } },
      ),
    ).toEqual({
      OPENAI_API_KEY: "inline",
      PATH: "/usr/bin",
      NEW_KEY: "new",
    });
  });
});
