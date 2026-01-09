import path from "node:path";
import { E2BSandbox } from "@sandagent/sandbox-e2b";

/**
 * POST /api/approval/submit
 *
 * Submit a single answer for a tool approval request.
 *
 * Request body:
 * {
 *   sessionId: string,  // E2B sandbox session ID
 *   toolCallId: string,
 *   question: string,   // Question text used as key
 *   answer: any
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   error?: string
 * }
 */
export async function POST(request: Request) {
  const { sessionId, toolCallId, question, answer } = await request.json();

  if (!sessionId || !toolCallId || !question) {
    return Response.json(
      {
        success: false,
        error: "sessionId, toolCallId, and question are required",
      },
      { status: 400 },
    );
  }

  try {
    // Resolve paths relative to the monorepo root
    const MONOREPO_ROOT = path.resolve(process.cwd(), "../..");
    const RUNNER_BUNDLE_PATH = path.join(
      MONOREPO_ROOT,
      "apps/runner-cli/dist/bundle.mjs",
    );
    const TEMPLATES_PATH = path.join(MONOREPO_ROOT, "templates");

    // Get E2B API key from request or environment
    const E2B_API_KEY = process.env.E2B_API_KEY;
    if (!E2B_API_KEY) {
      return Response.json(
        {
          success: false,
          error: "E2B_API_KEY not configured",
        },
        { status: 500 },
      );
    }

    // Create sandbox adapter and attach to existing session
    const sandbox = new E2BSandbox({
      apiKey: E2B_API_KEY,
      runnerBundlePath: RUNNER_BUNDLE_PATH,
      templatesPath: TEMPLATES_PATH,
    });

    const handle = await sandbox.attach(sessionId);

    // Read approval file using exec
    const approvalFile = `/sandagent/approvals/${toolCallId}.json`;

    // Read file content
    const readChunks: Uint8Array[] = [];
    for await (const chunk of handle.exec(["cat", approvalFile])) {
      readChunks.push(chunk);
    }
    const fileContent = new TextDecoder().decode(Buffer.concat(readChunks));
    const approval = JSON.parse(fileContent);

    // Update answers
    approval.answers[question] = answer;

    // Check if all questions are answered
    const allAnswered = approval.questions.every(
      (q: { question: string }) => approval.answers[q.question] !== undefined,
    );

    if (allAnswered) {
      approval.status = "completed";
    }

    // Write back to file using a temporary file and atomic move
    const updatedContent = JSON.stringify(approval);
    const tempFile = `${approvalFile}.tmp`;

    // Write to temp file
    const writeChunks: Uint8Array[] = [];
    for await (const chunk of handle.exec([
      "sh",
      "-c",
      `cat > ${tempFile} << 'EOF'\n${updatedContent}\nEOF`,
    ])) {
      writeChunks.push(chunk);
    }

    // Atomic move
    const moveChunks: Uint8Array[] = [];
    for await (const chunk of handle.exec(["mv", tempFile, approvalFile])) {
      moveChunks.push(chunk);
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to submit answer:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
