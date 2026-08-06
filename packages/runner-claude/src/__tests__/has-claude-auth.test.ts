import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasClaudeAuth } from "../claude-runner.js";

const AUTH_VARS = [
  "ANTHROPIC_API_KEY",
  "AWS_BEARER_TOKEN_BEDROCK",
  "ANTHROPIC_AUTH_TOKEN",
  "LITELLM_MASTER_KEY",
  "CLAUDE_CODE_USE_BEDROCK",
  "ANTHROPIC_BEDROCK_BASE_URL",
  "CLAUDE_CODE_USE_VERTEX",
  "ANTHROPIC_VERTEX_PROJECT_ID",
  "CLOUD_ML_REGION",
];

describe("hasClaudeAuth", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const key of AUTH_VARS) delete process.env[key];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns false with no auth env", () => {
    expect(hasClaudeAuth()).toBe(false);
  });

  it("accepts ANTHROPIC_API_KEY", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect(hasClaudeAuth()).toBe(true);
  });

  it("accepts Bedrock proxy config", () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = "1";
    process.env.ANTHROPIC_BEDROCK_BASE_URL = "https://proxy.example.com";
    expect(hasClaudeAuth()).toBe(true);
  });

  it("accepts Vertex config with project and region", () => {
    process.env.CLAUDE_CODE_USE_VERTEX = "1";
    process.env.ANTHROPIC_VERTEX_PROJECT_ID = "my-project";
    process.env.CLOUD_ML_REGION = "us-east5";
    expect(hasClaudeAuth()).toBe(true);
  });

  it("rejects Vertex flag without project id", () => {
    process.env.CLAUDE_CODE_USE_VERTEX = "1";
    process.env.CLOUD_ML_REGION = "us-east5";
    expect(hasClaudeAuth()).toBe(false);
  });

  it("rejects Vertex flag without region", () => {
    process.env.CLAUDE_CODE_USE_VERTEX = "1";
    process.env.ANTHROPIC_VERTEX_PROJECT_ID = "my-project";
    expect(hasClaudeAuth()).toBe(false);
  });

  it("rejects Vertex project/region without the flag", () => {
    process.env.ANTHROPIC_VERTEX_PROJECT_ID = "my-project";
    process.env.CLOUD_ML_REGION = "us-east5";
    expect(hasClaudeAuth()).toBe(false);
  });
});
