import {
  type SandAgentProviderSettings,
  createSandAgent,
} from "@sandagent/sdk";
import { LocalSandbox } from "@sandagent/manager";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from "ai";

/**
 * POST /api/ai
 *
 * Stream AI SDK UI messages from a SandAgent using LocalSandbox.
 *
 * Request body:
 * {
 *   sessionId: string,
 *   messages: [{ role: "user" | "assistant", content: string }],
 *   template?: string,
 *   ANTHROPIC_API_KEY?: string,
 * }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const {
    sessionId,
    messages,
    template = "default",
    resume,
    ANTHROPIC_API_KEY,
  } = body;

  const signal = request.signal;

  // Validate required fields
  if (!sessionId) {
    return new Response(JSON.stringify({ error: "sessionId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ANTHROPIC_API_KEY is required
  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({
        error:
          "ANTHROPIC_API_KEY is required. Please set it in the request body.",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Normalize messages format
  const normalizedMessages = messages.map((msg: any) => ({
    role: msg.role,
    content: msg.content,
  }));

  // Create LocalSandbox
  // LocalSandbox.attach() will automatically copy .claude/ and CLAUDE.md
  // from baseDir to the isolated workdir if isolate: true
  const sandbox = new LocalSandbox({
    baseDir: process.cwd(), // Use current directory as base
    isolate: true, // Isolate each session for safety
    env: {
      ANTHROPIC_API_KEY,
    },
  });

  // Determine model
  const model = "claude-sonnet-4-20250514";

  // Streaming - use createUIMessageStream
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // SandAgent will call sandbox.attach() internally, which will:
      // 1. Create isolated directory (if isolate: true)
      // 2. Automatically copy .claude/ and CLAUDE.md from baseDir
      // 3. Return the workdir
      // Get workdir after attach (SandAgent calls attach internally)
      const workdir = sandbox.getWorkdir?.() || "/sandagent";
      console.log(`[API] Using LocalSandbox with workdir: ${workdir}`);
      console.log(`[API] Claude Agent SDK will read .claude/ from: ${workdir}`);

      // Create the provider
      // cwd is set to workdir (isolated directory) where LocalSandbox automatically
      // copied .claude/ and CLAUDE.md from baseDir
      // This allows Claude Agent SDK to find the skill configuration
      const sandagentOptions: SandAgentProviderSettings = {
        sandbox,
        cwd: workdir, // Isolated directory with auto-copied .claude/ and CLAUDE.md
        verbose: true,
        resume,
      };
      const sandagent = createSandAgent(sandagentOptions);

      const result = streamText({
        model: sandagent(model),
        messages: normalizedMessages,
        abortSignal: signal,
      });

      // Merge the AI text stream
      writer.merge(
        result.toUIMessageStream({
          sendSources: true,
        }),
      );
    },
  });

  return createUIMessageStreamResponse({ stream });
}
