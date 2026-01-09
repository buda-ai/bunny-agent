import path from "node:path";
import { SandAgent } from "@sandagent/core";
import { E2BSandbox } from "@sandagent/sandbox-e2b";
import { SandockSandbox } from "@sandagent/sandbox-sandock";

const MONOREPO_ROOT = path.resolve(process.cwd(), "../..");
const RUNNER_BUNDLE_PATH = path.join(
  MONOREPO_ROOT,
  "apps/runner-cli/dist/bundle.mjs",
);
const TEMPLATES_PATH = path.join(MONOREPO_ROOT, "templates");

/**
 * POST /api/ai/approval
 *
 * Submit tool approval result and resume the conversation.
 *
 * Request body:
 * {
 *   toolCallId: string,      // The tool call ID to respond to
 *   result: string,          // JSON string of the user's response
 *   sessionId: string,       // Session ID to resume
 *   template?: string,
 *   ANTHROPIC_API_KEY?: string,
 *   E2B_API_KEY?: string,
 *   SANDOCK_API_KEY?: string,
 *   SANDBOX_PROVIDER?: string,
 * }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const {
    toolCallId,
    result,
    sessionId,
    template = "default",
    ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL,
    E2B_API_KEY,
    SANDOCK_API_KEY,
    SANDBOX_PROVIDER = "e2b",
  } = body;

  // Validate required fields
  if (!toolCallId) {
    return new Response(JSON.stringify({ error: "toolCallId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!result) {
    return new Response(JSON.stringify({ error: "result is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!sessionId) {
    return new Response(JSON.stringify({ error: "sessionId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Validate sandbox provider
  if (SANDBOX_PROVIDER === "e2b" && !E2B_API_KEY) {
    return new Response(
      JSON.stringify({ error: "E2B_API_KEY is required for E2B sandbox" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (SANDBOX_PROVIDER === "sandock" && !SANDOCK_API_KEY) {
    return new Response(
      JSON.stringify({
        error: "SANDOCK_API_KEY is required for Sandock sandbox",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Create sandbox
  const sandbox =
    SANDBOX_PROVIDER === "sandock"
      ? new SandockSandbox({
          apiKey: SANDOCK_API_KEY,
          runnerBundlePath: RUNNER_BUNDLE_PATH,
          templatesPath: path.join(TEMPLATES_PATH, template),
        })
      : new E2BSandbox({
          apiKey: E2B_API_KEY,
          runnerBundlePath: RUNNER_BUNDLE_PATH,
          templatesPath: path.join(TEMPLATES_PATH, template),
        });

  const agent = new SandAgent({
    id: sessionId,
    sandbox,
    runner: {
      kind: "claude-agent-sdk",
      model: "claude-sonnet-4-20250514",
      template,
    },
    env: {
      ANTHROPIC_API_KEY,
      ...(ANTHROPIC_BASE_URL && { ANTHROPIC_BASE_URL }),
    },
  });

  // Resume with tool result
  return agent.stream({
    messages: [],
    workspace: { path: "/sandagent" },
    resume: sessionId,
  });
}
