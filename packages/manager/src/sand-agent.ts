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
  private readonly sandbox: SandboxAdapter;
  private readonly runner: RunnerSpec;
  private readonly env: Record<string, string>;
  private handle: SandboxHandle | null = null;

  constructor(options: SandAgentOptions) {
    this.sandbox = options.sandbox;
    this.runner = options.runner;
    this.env = options.env ?? {};
  }

  /**
   * Attach to the sandbox if not already attached
   */
  private async ensureAttached(): Promise<SandboxHandle> {
    if (!this.handle) {
      this.handle = await this.sandbox.attach();
    }
    return this.handle;
  }

  /**
   * Build the CLI command to execute
   */
  private buildCommand(input: StreamInput): string[] {
    // Get runner command from sandbox, or use default "sandagent run"
    const cmd: string[] = this.sandbox.getRunnerCommand?.() ?? [
      "sandagent",
      "run",
    ];

    // Add model
    cmd.push("--model", this.runner.model);

    // Add workspace path
    const workspacePath = input.workspace?.path ?? "/workspace";
    cmd.push("--cwd", workspacePath);

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

    // Add approvalDir for tool approval flow
    if (this.runner.approvalDir) {
      cmd.push("--approval-dir", this.runner.approvalDir);
    }

    // Add output format
    if (this.runner.outputFormat) {
      cmd.push("--output-format", this.runner.outputFormat);
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
   * 3. Returns a ReadableStream of AI SDK UI messages from stdout
   *
   * The server NEVER parses or modifies the stream.
   *
   * @param input - Stream input including messages and optional transcript writer
   * @returns ReadableStream of AI SDK UI messages
   */
  async stream(input: StreamInput): Promise<ReadableStream<Uint8Array>> {
    const handle = await this.ensureAttached();

    // Use sandbox's actual workdir after attach (for isolated sandboxes)
    const actualWorkdir = handle.getWorkdir();
    const inputWithWorkdir: StreamInput = {
      ...input,
      workspace: {
        ...input.workspace,
        path: actualWorkdir,
      },
    };

    const command = this.buildCommand(inputWithWorkdir);

    const workspacePath = actualWorkdir;
    const transcriptWriter = input.transcriptWriter;
    const signal = input.signal;

    // Check if signal is already aborted
    if (signal?.aborted) {
      throw new Error("Operation was aborted");
    }

    // Write start entry if transcript is enabled
    if (transcriptWriter) {
      await transcriptWriter.write({
        timestamp: new Date().toISOString(),
        type: "start",
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
      signal,
    });

    // Create a ReadableStream that passes through the stdout chunks
    // and optionally writes to transcript
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        let controllerClosed = false;

        try {
          for await (const chunk of stdout) {
            // Write to transcript if enabled
            if (transcriptWriter) {
              const text = new TextDecoder().decode(chunk);
              await transcriptWriter.write({
                timestamp: new Date().toISOString(),
                type: "chunk",
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
            });
          }

          controller.close();
          controllerClosed = true;
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            // Normal abort operation - log appropriately
            console.log("[SandAgent] Operation aborted by user");
          } else {
            // Other errors
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            console.error("[SandAgent] Error:", errorMessage);
            if (transcriptWriter) {
              await transcriptWriter.write({
                timestamp: new Date().toISOString(),
                type: "error",
                text: errorMessage,
              });
            }
          }

          // Only call controller.error if controller hasn't been closed yet
          if (!controllerClosed) {
            controller.error(error);
          }
        }
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
