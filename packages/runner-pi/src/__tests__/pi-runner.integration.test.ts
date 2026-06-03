import { describe, expect, it } from "vitest";
import { createPiRunner } from "../pi-runner.js";

const RUN_AI_INTEGRATION = process.env.RUN_AI_INTEGRATION === "1";
const describeIntegration = RUN_AI_INTEGRATION ? describe : describe.skip;

function hasPiCredentials(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.AWS_BEARER_TOKEN_BEDROCK ||
      process.env.ANTHROPIC_AUTH_TOKEN ||
      process.env.LITELLM_MASTER_KEY,
  );
}

function getIntegrationModel(): string {
  return process.env.BUNNY_AI_INTEGRATION_PI_MODEL ?? "openai:gpt-5.4";
}

function expectNoCredentialLeak(output: string): void {
  for (const credential of [
    process.env.OPENAI_API_KEY,
    process.env.GEMINI_API_KEY,
    process.env.ANTHROPIC_API_KEY,
    process.env.AWS_BEARER_TOKEN_BEDROCK,
    process.env.ANTHROPIC_AUTH_TOKEN,
    process.env.LITELLM_MASTER_KEY,
  ]) {
    if (credential) {
      expect(output).not.toContain(credential);
    }
  }
}

function extractDataPayloads(chunks: string[]): unknown[] {
  const payloads: unknown[] = [];
  for (const chunk of chunks) {
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice("data: ".length).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        payloads.push(JSON.parse(payload));
      } catch {
        // Ignore non-JSON lines; the assertion checks for expected JSON events.
      }
    }
  }
  return payloads;
}

describeIntegration("createPiRunner AI integration", () => {
  it("streams a real model response with Bunny effort mapped to Pi thinkingLevel", async () => {
    expect(hasPiCredentials()).toBe(true);

    const runner = createPiRunner({
      model: getIntegrationModel(),
      cwd: process.cwd(),
      effort: "medium",
      yolo: true,
    });

    const chunks: string[] = [];
    for await (const chunk of runner.run("Reply with exactly: pong")) {
      chunks.push(chunk);
    }

    const output = chunks.join("");
    const payloads = extractDataPayloads(chunks);

    expect(output.toLowerCase()).toContain("pong");
    expect(
      payloads.some(
        (payload) =>
          typeof payload === "object" &&
          payload !== null &&
          (payload as { type?: string }).type === "finish",
      ),
    ).toBe(true);
    expectNoCredentialLeak(output);
  }, 120_000);
});
