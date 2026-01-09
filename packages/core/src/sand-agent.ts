import type {
  Message,
  RunnerSpec,
  SandAgentOptions,
  SandboxAdapter,
  SandboxHandle,
  StreamInput,
} from "./types.js";

/**
 * SandAgent - A sandboxed agent runtime that speaks AI SDK UI natively.
 *
 * Represents one persistent agent instance with:
 * - An isolated sandbox
 * - A dedicated filesystem volume
 * - Direct passthrough of AI SDK UI messages
 */
export class SandAgent {
  private readonly id: string;
  private readonly sandbox: SandboxAdapter;
  private readonly runner: RunnerSpec;
  private readonly env: Record<string, string>;
  private handle: SandboxHandle | null = null;

  constructor(options: SandAgentOptions) {
    this.id = options.id;
    this.sandbox = options.sandbox;
    this.runner = options.runner;
    this.env = options.env ?? {};
  }

  /**
   * Get the unique identifier for this agent
   */
  getId(): string {
    return this.id;
  }

  /**
   * Attach to the sandbox if not already attached
   */
  private async ensureAttached(): Promise<SandboxHandle> {
    if (!this.handle) {
      this.handle = await this.sandbox.attach(this.id);
    }
    return this.handle;
  }

  /**
   * Build the CLI command to execute
   */
  private buildCommand(input: StreamInput): string[] {
    // const cmd: string[] = ["sandagent", "run"];

    const cmd: string[] = ["node", "/sandagent/runner/bundle.mjs", "run"];

    // Add model
    cmd.push("--model", this.runner.model);

    // Add workspace path
    const workspacePath = input.workspace?.path ?? "/workspace";
    cmd.push("--cwd", workspacePath);

    // Add template (defaults to "default")
    const template = this.runner.template ?? "default";
    cmd.push("--template", template);

    // Add optional system prompt
    if (this.runner.systemPrompt) {
      cmd.push("--system-prompt", this.runner.systemPrompt);
    }

    // Add optional max turns
    if (this.runner.maxTurns !== undefined) {
      cmd.push("--max-turns", String(this.runner.maxTurns));
    }

    // Add optional allowed tools
    if (this.runner.allowedTools) {
      cmd.push("--allowed-tools", this.runner.allowedTools.join(","));
    }

    // Add resume parameter for multi-turn conversation
    if (input.resume) {
      cmd.push("--resume", input.resume);
    }

    // Add toolSseUrl for tool approval flow
    if (this.runner.toolSseUrl) {
      cmd.push("--tool-sse", this.runner.toolSseUrl);
    }

    // Add separator and user input
    cmd.push("--");

    // Get the last user message as input
    const lastUserMessage = input.messages
      .filter((m): m is Message & { role: "user" } => m.role === "user")
      .pop();

    if (lastUserMessage) {
      cmd.push(lastUserMessage.content);
    }

    return cmd;
  }

  /**
   * Stream a task through the agent.
   *
   * This method:
   * 1. Attaches to the sandbox
   * 2. Executes the CLI runner inside the sandbox
   * 3. Streams AI SDK UI messages from stdout to the response
   * 4. Returns the response for direct passthrough to the client
   *
   * The server NEVER parses or modifies the stream.
   *
   * @param input - Stream input including messages and optional transcript writer
   * @returns Response with AI SDK UI stream
   */
  async stream(input: StreamInput): Promise<Response> {
    const handle = await this.ensureAttached();

    const command = this.buildCommand(input);

    const workspacePath = input.workspace?.path ?? "/workspace";
    const transcriptWriter = input.transcriptWriter;
    const agentId = this.id;

    // Write start entry if transcript is enabled
    if (transcriptWriter) {
      await transcriptWriter.write({
        timestamp: new Date().toISOString(),
        type: "start",
        agentId,
        metadata: {
          command: command.join(" "),
          workspace: workspacePath,
          runner: this.runner,
        },
      });
    }

    // Execute the command and get stdout as an async iterable
    const stdout = handle.exec(command, {
      cwd: workspacePath,
      env: this.env,
    });

    // Create a ReadableStream that passes through the stdout chunks
    // and optionally writes to transcript
    const readableStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of stdout) {
            // Write to transcript if enabled
            if (transcriptWriter) {
              const text = new TextDecoder().decode(chunk);
              await transcriptWriter.write({
                timestamp: new Date().toISOString(),
                type: "chunk",
                agentId,
                data: Buffer.from(chunk).toString("base64"),
                text,
              });
            }

            // Passthrough to response
            controller.enqueue(chunk);
          }

          // Write end entry if transcript is enabled
          if (transcriptWriter) {
            await transcriptWriter.write({
              timestamp: new Date().toISOString(),
              type: "end",
              agentId,
            });
          }

          controller.close();
        } catch (error) {
          // Write error entry if transcript is enabled
          if (transcriptWriter) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            await transcriptWriter.write({
              timestamp: new Date().toISOString(),
              type: "error",
              agentId,
              text: errorMessage,
            });
          }

          controller.error(error);
        }
      },
    });

    // Return a Response with the stream and appropriate headers
    // Use configurable content type for flexibility with different AI SDK versions
    const contentType = input.contentType ?? "text/event-stream";
    return new Response(readableStream, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  /**
   * Upload files to the agent's workspace
   */
  async uploadFiles(
    files: Array<{ path: string; content: Uint8Array | string }>,
    targetDir = "/workspace",
  ): Promise<void> {
    const handle = await this.ensureAttached();
    await handle.upload(files, targetDir);
  }

  /**
   * Destroy the sandbox and release resources
   */
  async destroy(): Promise<void> {
    if (this.handle) {
      await this.handle.destroy();
      this.handle = null;
    }
  }
}
