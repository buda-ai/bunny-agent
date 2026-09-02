import { describe, expect, it } from "vitest";
import {
  normalizeBunnyAgentError,
  WORKSPACE_STORAGE_FULL_ERROR_CODE,
  WORKSPACE_STORAGE_FULL_ERROR_TEXT,
} from "../errors.js";

describe("normalizeBunnyAgentError", () => {
  it.each([
    "EDQUOT",
    "ENOSPC",
  ])("normalizes the %s system code without exposing paths", (code) => {
    const error = Object.assign(new Error("write failed at /agent/private"), {
      code,
      path: "/agent/private",
    });

    expect(normalizeBunnyAgentError(error)).toEqual({
      errorCode: WORKSPACE_STORAGE_FULL_ERROR_CODE,
      errorText: WORKSPACE_STORAGE_FULL_ERROR_TEXT,
    });
  });

  it.each([
    -122,
    -28,
    "-122",
    "-28",
  ])("normalizes numeric errno %s", (errno) => {
    expect(normalizeBunnyAgentError({ errno })).toEqual({
      errorCode: WORKSPACE_STORAGE_FULL_ERROR_CODE,
      errorText: WORKSPACE_STORAGE_FULL_ERROR_TEXT,
    });
  });

  it("is idempotent for a normalized error", () => {
    const normalized = normalizeBunnyAgentError({
      errorCode: WORKSPACE_STORAGE_FULL_ERROR_CODE,
      errorText: WORKSPACE_STORAGE_FULL_ERROR_TEXT,
    });
    expect(normalized).toEqual({
      errorCode: WORKSPACE_STORAGE_FULL_ERROR_CODE,
      errorText: WORKSPACE_STORAGE_FULL_ERROR_TEXT,
    });
  });

  it.each([
    "Unknown system error -122",
    "Unknown system error -122, close",
    "EDQUOT: disk quota exceeded, write",
    "ENOSPC: no space left on device, write",
  ])("normalizes the legacy message %j", (message) => {
    expect(normalizeBunnyAgentError(new Error(message))).toEqual({
      errorCode: WORKSPACE_STORAGE_FULL_ERROR_CODE,
      errorText: WORKSPACE_STORAGE_FULL_ERROR_TEXT,
    });
  });

  it("inspects the typed cause chain", () => {
    const cause = Object.assign(new Error("write failed"), { code: "ENOSPC" });
    expect(
      normalizeBunnyAgentError(new Error("session failed", { cause })),
    ).toEqual({
      errorCode: WORKSPACE_STORAGE_FULL_ERROR_CODE,
      errorText: WORKSPACE_STORAGE_FULL_ERROR_TEXT,
    });
  });

  it.each([
    "Quota exceeded for model tokens",
    "API quota exceeded",
    "Usage limit exceeded",
  ])("does not misclassify a provider quota message %j", (message) => {
    expect(normalizeBunnyAgentError(new Error(message))).toEqual({
      errorText: message,
    });
  });
});
