import { describe, expect, it } from "vitest";
import { smolClaudeEnv } from "../commands/smol-auth-env.js";

describe("Smol Claude auth environment", () => {
  it("passes direct and proxy credentials without forwarding unrelated host secrets", () => {
    expect(
      smolClaudeEnv({
        ANTHROPIC_API_KEY: "direct-token",
        ANTHROPIC_AUTH_TOKEN: "proxy-token",
        ANTHROPIC_BEDROCK_BASE_URL: "https://proxy.example.com",
        CLAUDE_CODE_USE_BEDROCK: "1",
        AWS_REGION: "us-west-2",
        SMOL_CLOUD_TOKEN: "cloud-control-token",
        GITHUB_TOKEN: "unrelated-token",
        AWS_SECRET_ACCESS_KEY: "unrelated-aws-secret",
        EMPTY: "",
      }),
    ).toEqual({
      ANTHROPIC_API_KEY: "direct-token",
      ANTHROPIC_AUTH_TOKEN: "proxy-token",
      ANTHROPIC_BEDROCK_BASE_URL: "https://proxy.example.com",
      CLAUDE_CODE_USE_BEDROCK: "1",
      AWS_REGION: "us-west-2",
    });
  });

  it("rejects a host-only Vertex login before creating a VM", () => {
    expect(() =>
      smolClaudeEnv({
        CLAUDE_CODE_USE_VERTEX: "1",
        ANTHROPIC_VERTEX_PROJECT_ID: "host-project",
        CLOUD_ML_REGION: "us-central1",
        GOOGLE_APPLICATION_CREDENTIALS: "/home/user/adc.json",
      }),
    ).toThrow("host-only Vertex ADC credentials");
  });
});
