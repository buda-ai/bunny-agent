import * as fs from "node:fs/promises";
import type * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createDaemon } from "../server.js";

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

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Failed to bind daemon test server.");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

describeIntegration("daemon Pi AI integration", () => {
  it("streams a real Pi runner response from POST /api/coding/run", async () => {
    expect(hasPiCredentials()).toBe(true);

    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bunny-daemon-it-"));
    const server = createDaemon({ host: "127.0.0.1", port: 0, root });

    try {
      const baseUrl = await listen(server);
      const response = await fetch(`${baseUrl}/api/coding/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runner: "pi",
          model: getIntegrationModel(),
          effort: "medium",
          yolo: true,
          cwd: root,
          userInput: "Reply with exactly: pong",
        }),
      });

      expect(response.status).toBe(200);
      const output = await response.text();

      expect(output.toLowerCase()).toContain("pong");
      expect(output).toContain('"type":"finish"');
      expect(output).toContain("data: [DONE]");
      expectNoCredentialLeak(output);
    } finally {
      await close(server).catch(() => {});
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 120_000);
});
