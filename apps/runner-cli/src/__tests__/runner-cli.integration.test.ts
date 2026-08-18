/**
 * Integration tests for runner-cli
 * Tests actual process execution
 */

import { spawn } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Get CLI path - works in both compiled and source context
const CLI_PATH = join(process.cwd(), "dist/bundle.mjs");

describe("runner-cli Integration Tests", () => {
  const TIMEOUT = 10000;

  it(
    "should display top-level help",
    async () => {
      const output = await runCLI(["--help"]);

      expect(output.stdout).toContain("BunnyAgent Runner CLI");
      expect(output.stdout).toContain("run");
      expect(output.stdout).toContain("image build");
      expect(output.exitCode).toBe(0);
    },
    TIMEOUT,
  );

  it(
    "should display run command options in run --help",
    async () => {
      const output = await runCLI(["run", "--help"]);

      expect(output.stdout).toContain("BunnyAgent Runner CLI");
      expect(output.stdout).toContain("--runner");
      expect(output.stdout).toContain("--model");
      expect(output.stdout).toContain("--allowed-tools");
      expect(output.exitCode).toBe(0);
    },
    TIMEOUT,
  );

  it(
    "should show error when no user input provided",
    async () => {
      const output = await runCLI(["run"]);

      expect(output.stderr).toContain("User input is required");
      expect(output.exitCode).toBe(1);
    },
    TIMEOUT,
  );

  it(
    "should show error for invalid runner",
    async () => {
      const output = await runCLI([
        "run",
        "--runner",
        "invalid",
        "--",
        "test task",
      ]);

      expect(output.stderr).toContain("must be one of");
      expect(output.exitCode).toBe(1);
    },
    TIMEOUT,
  );

  it(
    "should reject removed --output-format option",
    async () => {
      const output = await runCLI([
        "run",
        "--output-format",
        "json",
        "--",
        "test task",
      ]);

      expect(output.stderr).toContain("Unknown option '--output-format'");
      expect(output.exitCode).toBe(1);
    },
    TIMEOUT,
  );

  it(
    "should accept claude runner option",
    async () => {
      // Force unauthenticated path so this remains deterministic in CI.
      const output = await runCLI(
        ["run", "--runner", "claude", "--", "echo hello"],
        {
          env: {
            ...process.env,
            ANTHROPIC_API_KEY: "",
            AWS_BEARER_TOKEN_BEDROCK: "",
            ANTHROPIC_AUTH_TOKEN: "",
            LITELLM_MASTER_KEY: "",
            CLAUDE_CODE_USE_BEDROCK: "",
            ANTHROPIC_BEDROCK_BASE_URL: "",
          },
        },
      );

      expect(output.exitCode).toBe(0);
      expect(output.stdout).toContain("data:");
    },
    TIMEOUT,
  );

  it(
    "should list acp alongside run in top-level help",
    async () => {
      const output = await runCLI(["--help"]);

      expect(output.stdout).toContain("acp");
      expect(output.exitCode).toBe(0);
    },
    TIMEOUT,
  );

  it(
    "should display acp command options in acp --help",
    async () => {
      const output = await runCLI(["acp", "--help"]);

      expect(output.stdout).toContain("--runner");
      expect(output.stdout).toContain("--model");
      expect(output.stdout).toContain("stdio");
      expect(output.exitCode).toBe(0);
    },
    TIMEOUT,
  );

  it(
    "should reject an invalid runner for acp the same way run does",
    async () => {
      const output = await runCLI(["acp", "--runner", "invalid"]);

      expect(output.stderr).toContain("must be one of");
      expect(output.exitCode).toBe(1);
    },
    TIMEOUT,
  );

  it(
    "should serve a real ACP initialize + session/new handshake over stdio",
    async () => {
      // initialize/session/new never touch the runner SDKs, so this needs no
      // API credentials — only session/prompt would invoke createRunner().
      const result = await runAcpHandshake([
        {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: 1, clientCapabilities: {} },
        },
        {
          jsonrpc: "2.0",
          id: 2,
          method: "session/new",
          params: { cwd: process.cwd(), mcpServers: [] },
        },
      ]);

      expect(result.responses).toHaveLength(2);
      expect(result.responses[0].result.agentInfo?.name).toBe("bunny-agent");
      expect(typeof result.responses[1].result.sessionId).toBe("string");
      expect(result.exitCode).toBe(0);
    },
    TIMEOUT,
  );

  it(
    "reports an unknown runner from _meta as invalid params, not an internal error",
    async () => {
      // Fully unmocked, and credential-free: dispatch rejects the runner name
      // before any agent SDK is constructed.
      const result = await runAcpHandshake([
        {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: 1, clientCapabilities: {} },
        },
        {
          jsonrpc: "2.0",
          id: 2,
          method: "session/new",
          params: {
            cwd: process.cwd(),
            mcpServers: [],
            _meta: { "bunny-agent": { runner: "claude-code" } },
          },
        },
        (prior) => ({
          jsonrpc: "2.0",
          id: 3,
          method: "session/prompt",
          params: {
            sessionId: prior[1].result.sessionId,
            prompt: [{ type: "text", text: "hi" }],
          },
        }),
      ]);

      const promptResponse = result.responses[2];
      expect(promptResponse.error).toBeDefined();
      // -32602 invalid params, not -32603 internal error.
      expect(promptResponse.error?.code).toBe(-32602);
      expect(promptResponse.error?.message).toMatch(
        /Unknown runner: claude-code/,
      );
    },
    TIMEOUT,
  );
});

/**
 * Helper to run CLI and capture output
 */
function runCLI(
  args: string[],
  options: { env?: Record<string, string> } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", [CLI_PATH, ...args], {
      env: options.env || process.env,
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
      });
    });

    proc.on("error", reject);

    // Timeout
    setTimeout(() => {
      proc.kill();
      reject(new Error("Process timed out"));
    }, 15000);
  });
}

interface AcpRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: unknown;
}

interface AcpRpcResponse {
  jsonrpc: "2.0";
  id: number;
  // biome-ignore lint/suspicious/noExplicitAny: test-only, response shape varies by method
  result?: any;
  error?: { code: number; message: string; data?: unknown };
}

/** A request, or one built from the responses received so far. */
type AcpRpcStep = AcpRpcRequest | ((prior: AcpRpcResponse[]) => AcpRpcRequest);

/**
 * Drives `bunny-agent acp` as a real subprocess over its actual stdin/stdout:
 * sends each step, waits for the matching response before sending the next
 * (so a step can depend on an earlier `sessionId`), then closes stdin — how a
 * disconnecting editor looks on the wire — and waits for a clean exit.
 */
function runAcpHandshake(
  steps: AcpRpcStep[],
): Promise<{ responses: AcpRpcResponse[]; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", [CLI_PATH, "acp", "--runner", "claude"], {
      env: process.env,
      stdio: "pipe",
    });

    const responses: AcpRpcResponse[] = [];
    let buffer = "";
    let stderr = "";
    let stepIndex = 0;
    let awaitingId: number | null = null;

    const sendNext = () => {
      if (stepIndex >= steps.length) {
        proc.stdin?.end();
        return;
      }
      const step = steps[stepIndex++];
      const req = typeof step === "function" ? step(responses) : step;
      awaitingId = req.id;
      proc.stdin?.write(`${JSON.stringify(req)}\n`);
    };

    proc.stdout?.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let msg: AcpRpcResponse;
        try {
          msg = JSON.parse(line) as AcpRpcResponse;
        } catch {
          reject(
            new Error(
              `acp stdout emitted a non-JSON line, which would corrupt real ACP framing: ${line}`,
            ),
          );
          return;
        }
        if (msg.id === awaitingId) {
          responses.push(msg);
          awaitingId = null;
          sendNext();
        }
      }
    });

    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (responses.length < steps.length) {
        reject(
          new Error(
            `acp process exited after ${responses.length}/${steps.length} responses. stderr: ${stderr}`,
          ),
        );
        return;
      }
      resolve({ responses, exitCode: code ?? 0 });
    });

    proc.on("error", reject);

    sendNext();

    setTimeout(() => {
      proc.kill();
      reject(new Error("acp handshake timed out"));
    }, 15000);
  });
}
