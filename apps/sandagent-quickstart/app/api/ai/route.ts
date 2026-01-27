import path from "path";
import { TaskDrivenArtifactProcessor } from "@/lib/artifact-processor";
import { LocalSandbox, createSandAgent } from "@sandagent/sdk";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from "ai";

export async function POST(request: Request) {
  const { messages, sessionId } = await request.json();

  // 构建环境变量，只传递已配置的
  const env: Record<string, string> = {};
  if (process.env.ANTHROPIC_API_KEY) {
    env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  }
  if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
    env.AWS_BEARER_TOKEN_BEDROCK = process.env.AWS_BEARER_TOKEN_BEDROCK;
    env.CLAUDE_CODE_USE_BEDROCK = "1";
  }
  // Determine model based on whether using AWS Bedrock
  const model = process.env.ANTHROPIC_API_KEY
    ? "claude-sonnet-4-20250514" // Standard Anthropic model ID
    : "us.anthropic.claude-sonnet-4-20250514-v1:0"; // AWS Bedrock model ID

  const sandbox = new LocalSandbox({
    workdir: path.join(process.cwd(), "workspace"),
    templatesPath: process.cwd(),
    runnerCommand: ["npx", "-y", "@sandagent/runner-cli@0.2.1", "run"],
    defaultTimeout: 300000, // 5 分钟
    env,
  });

  console.log(`[API] Session ID: ${sessionId || "default"}`);
  console.log(`[API] Env keys: ${Object.keys(env).join(", ")}`);

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const workdir = sandbox.getWorkdir?.() || "/sandagent";

      // ✨ 创建 artifact processor
      const artifactProcessor = new TaskDrivenArtifactProcessor({
        sandbox,
        workdir,
        writer,
      });

      const sandagent = createSandAgent({
        sandbox,
        cwd: workdir,
        verbose: true,
        artifactProcessors: [artifactProcessor], // 传递 processor 数组
      });

      const result = streamText({
        model: sandagent(model),
        messages: await convertToModelMessages(messages),
        abortSignal: request.signal,
      });

      writer.merge(result.toUIMessageStream({ sendSources: true }));
    },
  });

  return createUIMessageStreamResponse({ stream });
}
