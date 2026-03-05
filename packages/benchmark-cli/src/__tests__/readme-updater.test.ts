/**
 * Tests for README matrix updater
 */

import { describe, expect, it } from "vitest";
import { shouldUpdateReadme } from "../readme-updater.js";
import type { BenchmarkConfig, GaiaLevel } from "../types.js";

describe("shouldUpdateReadme", () => {
  const baseConfig: BenchmarkConfig = {
    dataset: "validation",
    outputDir: "./test-output",
    verbose: false,
  };

  it("should return true for full benchmark run", () => {
    const config = { ...baseConfig };
    expect(shouldUpdateReadme(config)).toBe(true);
  });

  it("should return true for full level run", () => {
    const config = { ...baseConfig, level: 1 as GaiaLevel };
    expect(shouldUpdateReadme(config)).toBe(true);
  });

  it("should return false for limited runs", () => {
    const config = { ...baseConfig, limit: 10 };
    expect(shouldUpdateReadme(config)).toBe(false);
  });

  it("should return false for random runs", () => {
    const config = { ...baseConfig, random: true };
    expect(shouldUpdateReadme(config)).toBe(false);
  });

  it("should return false for single task runs", () => {
    const config = { ...baseConfig, taskId: "abc123" };
    expect(shouldUpdateReadme(config)).toBe(false);
  });

  it("should return false for limited level runs", () => {
    const config = { ...baseConfig, level: 1 as GaiaLevel, limit: 5 };
    expect(shouldUpdateReadme(config)).toBe(false);
  });
});
