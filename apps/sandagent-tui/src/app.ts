import type { EditorTheme } from "@mariozechner/pi-tui";
import { Editor, Loader, ProcessTerminal, Text, TUI } from "@mariozechner/pi-tui";
import chalk from "chalk";
import { createRunner, parseRunnerStream } from "@sandagent/runner-harness";
import { ChatView } from "./chat-view.js";
import { StatusBar } from "./status-bar.js";

const editorTheme: EditorTheme = {
  borderColor: chalk.dim,
  selectList: {
    selectedPrefix: (t) => chalk.cyan(`> ${t}`),
    selectedText: (t) => chalk.bold(t),
    description: (t) => chalk.dim(t),
    scrollInfo: (t) => chalk.dim(t),
    noMatch: (t) => chalk.dim(t),
  },
};

export class App {
  private tui: TUI;
  private statusBar: StatusBar;
  private chatView: ChatView;
  private editor: Editor;
  private running = false;
  private totalTokens = 0;

  constructor(
    private runner: string,
    private model: string | undefined,
    private cwd: string,
  ) {
    const terminal = new ProcessTerminal();
    this.tui = new TUI(terminal);

    this.statusBar = new StatusBar(runner, model ?? "default");
    this.chatView = new ChatView(this.tui);

    this.tui.addChild(this.statusBar);
    this.tui.addChild(new Text(chalk.dim("─".repeat(40)) + "\n"));

    this.editor = new Editor(this.tui, editorTheme);
    this.editor.placeholder = "Type your message… (Enter to send, Ctrl+C to exit)";
    this.editor.onSubmit = (text: string) => void this.handleSubmit(text);
    this.tui.addChild(this.editor);
    this.tui.setFocus(this.editor);
  }

  private async handleSubmit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || this.running) return;

    this.running = true;
    this.editor.disableSubmit = true;

    this.chatView.addUserMessage(trimmed);

    const loader = new Loader(
      this.tui,
      (s) => chalk.cyan(s),
      (s) => chalk.dim(s),
      "Thinking…",
    );
    this.tui.addChild(loader);
    this.tui.requestRender();

    try {
      const rawStream = createRunner({
        runner: this.runner,
        userInput: trimmed,
        model: this.model,
        cwd: this.cwd,
        env: process.env as Record<string, string>,
      });

      const chunkStream = parseRunnerStream(rawStream);
      const reader = chunkStream.getReader();

      this.tui.removeChild(loader);
      const assistantMsg = this.chatView.startAssistantMessage();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        switch (value.type) {
          case "text-delta":
            assistantMsg.append(value.delta);
            break;
          case "tool-input-start":
            this.chatView.addToolCall(value.toolName, "…");
            break;
          case "tool-input-available":
            this.chatView.addToolCall(value.toolName, value.input);
            break;
          case "step-finish":
            if ("usage" in value && value.usage) {
              const u = value.usage as { inputTokens?: number; outputTokens?: number };
              this.totalTokens += (u.inputTokens ?? 0) + (u.outputTokens ?? 0);
              this.statusBar.update(this.runner, this.model ?? "default", this.totalTokens);
            }
            break;
        }
      }
    } catch (e: unknown) {
      this.tui.removeChild(loader);
      this.chatView.addError(e instanceof Error ? e.message : String(e));
    } finally {
      this.running = false;
      this.editor.disableSubmit = false;
      this.tui.requestRender();
    }
  }

  start() {
    this.tui.start();
  }
}
