import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { EditorTheme } from "@mariozechner/pi-tui";
import {
  CombinedAutocompleteProvider,
  Container,
  Editor,
  Loader,
  matchesKey,
  ProcessTerminal,
  Text,
  TUI,
} from "@mariozechner/pi-tui";
import {
  clearSessionId,
  createRunner,
  parseRunnerStream,
  readSessionId,
  type RunnerChunk,
  writeSessionId,
} from "@sandagent/runner-harness";
import type { AssistantMessage } from "./chat-view.js";
import { ChatView } from "./chat-view.js";
import { Footer } from "./footer.js";
import {
  getAuthStorage,
  getLoggedInProviders,
  getProviders,
  loginProvider,
  providerToModel,
} from "./login.js";
import { t } from "./theme.js";

const execFileAsync = promisify(execFile);

const RUNNERS = ["claude", "pi", "gemini", "codex", "opencode"];

const editorTheme: EditorTheme = {
  borderColor: t.dim,
  selectList: {
    selectedPrefix: (s) => t.accent(`> ${s}`),
    selectedText:   (s) => s,
    description:    (s) => t.dim(s),
    scrollInfo:     (s) => t.dim(s),
    noMatch:        (s) => t.dim(s),
  },
};

const SLASH_COMMANDS = [
  { name: "clear",  description: "Clear chat history" },
  { name: "new",    description: "Start fresh session" },
  { name: "runner", description: "/runner <name> — switch runner" },
  { name: "model",  description: "/model <name> — switch model" },
  { name: "login",  description: "/login [provider] — OAuth login (copilot/anthropic/google/codex)" },
  { name: "logout", description: "/logout [provider] — logout from OAuth provider" },
  { name: "help",   description: "Show commands" },
  { name: "exit",   description: "Exit" },
];

export class App {
  private tui: TUI;
  private chatContainer: Container;
  private statusContainer: Container;
  private chatView: ChatView;
  private footer: Footer;
  private editor: Editor;

  private running = false;
  private abortController: AbortController | null = null;
  private lastCtrlC = 0;
  // Queue: message submitted while agent is running
  private queuedMessage: string | null = null;

  constructor(
    private runner: string,
    private model: string | undefined,
    private cwd: string,
    resume: boolean,
    fresh: boolean,
  ) {
    if (fresh) clearSessionId(cwd);

    const terminal = new ProcessTerminal();
    this.tui = new TUI(terminal);

    // Layout: welcome → chatContainer → statusContainer → editor → footer
    this.chatContainer   = new Container();
    this.statusContainer = new Container();
    this.chatView = new ChatView(this.tui, this.chatContainer);
    this.footer   = new Footer(runner, model ?? "default", cwd);

    const sessionId = readSessionId(cwd);
    if (sessionId) this.footer.setSessionId(sessionId);

    this.tui.addChild(
      new Text(
        t.accent("sandagent") +
          t.dim(` runner:${runner}${model ? ` model:${model}` : ""}`) +
          (sessionId && resume ? t.dim(` resuming:#${sessionId.slice(0, 8)}`) : "") +
          "\n" +
          t.dim("Esc to abort · /help for commands · Ctrl+C twice to exit\n"),
        1, 0,
      ),
    );
    this.tui.addChild(this.chatContainer);
    this.tui.addChild(this.statusContainer);

    this.editor = new Editor(this.tui, editorTheme);
    this.editor.setAutocompleteProvider(new CombinedAutocompleteProvider(SLASH_COMMANDS, cwd));
    this.editor.onSubmit = (text: string) => void this.handleSubmit(text);
    this.tui.addChild(this.editor);
    this.tui.setFocus(this.editor);
    this.tui.addChild(this.footer);

    // Escape: abort run or clear editor
    this.tui.addInputListener((data) => {
      if (matchesKey(data, "escape")) {
        if (this.running) {
          this.abortController?.abort();
          this.queuedMessage = null;
          return { consume: true };
        }
        // Clear editor if non-empty
        if (this.editor.getText?.().length) {
          this.editor.setText("");
          this.tui.requestRender();
          return { consume: true };
        }
      }
      return undefined;
    });

    // Ctrl+C: first hint, second within 2s exits
    process.on("SIGINT", () => {
      const now = Date.now();
      if (this.running) {
        this.abortController?.abort();
        this.queuedMessage = null;
        this.lastCtrlC = now;
      } else if (now - this.lastCtrlC < 2000) {
        process.exit(0);
      } else {
        this.lastCtrlC = now;
        this.showExitHint();
      }
    });
  }

  private exitHintText: Text | null = null;
  private exitHintTimer: ReturnType<typeof setTimeout> | null = null;

  private showExitHint() {
    // Clear previous hint if still showing
    if (this.exitHintTimer) clearTimeout(this.exitHintTimer);
    if (this.exitHintText) this.statusContainer.removeChild(this.exitHintText);

    this.exitHintText = new Text(t.dim("Press Ctrl+C again to exit\n"), 1, 0);
    this.statusContainer.addChild(this.exitHintText);
    this.tui.requestRender();

    this.exitHintTimer = setTimeout(() => {
      if (this.exitHintText) {
        this.statusContainer.removeChild(this.exitHintText);
        this.exitHintText = null;
        this.tui.requestRender();
      }
      this.exitHintTimer = null;
    }, 2000);
  }

  // ---------------------------------------------------------------------------
  // Chunk handler
  // ---------------------------------------------------------------------------

  private handleChunk(value: RunnerChunk, msg: AssistantMessage) {
    switch (value.type) {
      case "text-delta":
        msg.appendText(value.delta);
        break;
      case "reasoning":
        msg.appendReasoning(value.text);
        break;
      case "tool-input-start":
        this.chatView.addToolCall(value.toolCallId, value.toolName);
        break;
      case "tool-input-available":
        this.chatView.updateToolCall(value.toolCallId, value.input);
        break;
      case "tool-output-available": {
        const out = value.output;
        if (typeof out === "string" && /\.(png|jpg|jpeg|gif|webp)$/i.test(out)) {
          this.chatView.resolveToolCallWithImage(value.toolCallId, out);
        } else {
          this.chatView.resolveToolCall(value.toolCallId, out, value.isError);
        }
        break;
      }
      case "tool-output-error":
        this.chatView.resolveToolCall(value.toolCallId, value.errorText, true);
        break;
      case "finish":
      case "step-finish": {
        const meta = (value as { messageMetadata?: { usage?: { inputTokens?: number; outputTokens?: number }; sessionId?: string } }).messageMetadata;
        const u = meta?.usage ?? (value as { usage?: { inputTokens?: number; outputTokens?: number } }).usage;
        if (u) this.footer.addUsage(u.inputTokens ?? 0, u.outputTokens ?? 0);
        const sid = meta?.sessionId;
        if (sid) { writeSessionId(this.cwd, sid); this.footer.setSessionId(sid); }
        this.tui.requestRender();
        break;
      }
      case "message-metadata": {
        const meta = value.messageMetadata as { sessionId?: string } | undefined;
        if (meta?.sessionId) { writeSessionId(this.cwd, meta.sessionId); this.footer.setSessionId(meta.sessionId); }
        break;
      }
      case "error":
        msg.setError(value.errorText);
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Submit handler
  // ---------------------------------------------------------------------------

  private async handleSubmit(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Slash commands
    if (trimmed === "/clear") { this.chatView.clear(); return; }
    if (trimmed === "/exit")  { process.exit(0); }
    if (trimmed === "/new") {
      clearSessionId(this.cwd);
      this.footer.setSessionId(undefined);
      this.chatView.clear();
      this.chatView.addInfo("New session started");
      return;
    }
    if (trimmed === "/help") { this.chatView.addHelp(SLASH_COMMANDS); return; }
    if (trimmed.startsWith("/runner ")) {
      const r = trimmed.slice(8).trim();
      if (RUNNERS.includes(r)) {
        this.runner = r; this.footer.runner = r;
        this.chatView.addInfo(`Runner → ${r}`);
      } else {
        this.chatView.addError(`Unknown runner: ${r}`);
      }
      this.tui.requestRender(); return;
    }
    if (trimmed.startsWith("/model ")) {
      const m = trimmed.slice(7).trim();
      this.model = m || undefined; this.footer.model = m || "default";
      this.chatView.addInfo(`Model → ${m || "default"}`);
      this.tui.requestRender(); return;
    }

    // /login [provider]
    if (trimmed === "/login" || trimmed.startsWith("/login ")) {
      const arg = trimmed.slice(6).trim();
      await this.handleLogin(arg);
      return;
    }

    // /logout [provider]
    if (trimmed === "/logout" || trimmed.startsWith("/logout ")) {
      const arg = trimmed.slice(7).trim();
      this.handleLogout(arg);
      return;
    }

    // `!cmd` — local bash execution
    if (trimmed.startsWith("!")) {
      const cmd = trimmed.slice(1).trim();
      if (cmd) {
        this.editor.addToHistory(trimmed);
        await this.runBash(cmd);
      }
      return;
    }

    // If running: queue the message (steer)
    if (this.running) {
      this.queuedMessage = trimmed;
      this.chatView.addInfo(t.dim(`Queued: "${trimmed.slice(0, 60)}"`));
      return;
    }

    this.editor.addToHistory(trimmed);
    await this.runAgent(trimmed);
  }

  // ---------------------------------------------------------------------------
  // Local bash (`!cmd`)
  // ---------------------------------------------------------------------------

  private async runBash(cmd: string) {
    const loader = this.showLoader(`$ ${cmd}`);
    try {
      const { stdout, stderr } = await execFileAsync("bash", ["-c", cmd], {
        cwd: this.cwd, timeout: 30_000, maxBuffer: 512 * 1024,
      });
      this.hideLoader(loader);
      const out = [stdout, stderr].filter(Boolean).join("\n").trim();
      this.chatView.addBashResult(cmd, out || "(no output)", false);
    } catch (e: unknown) {
      this.hideLoader(loader);
      const msg = e instanceof Error ? e.message : String(e);
      this.chatView.addBashResult(cmd, msg, true);
    }
  }

  // ---------------------------------------------------------------------------
  // Agent run
  // ---------------------------------------------------------------------------

  private async runAgent(userInput: string) {
    this.running = true;
    this.editor.disableSubmit = true;
    this.abortController = new AbortController();

    this.chatView.addUserMessage(userInput);
    const loader = this.showLoader("Thinking…");

    try {
      const rawStream = createRunner({
        runner: this.runner,
        userInput,
        model: this.model,
        cwd: this.cwd,
        env: process.env as Record<string, string>,
        abortController: this.abortController,
      });

      this.hideLoader(loader);
      const assistantMsg = this.chatView.startAssistantMessage();

      for await (const chunk of parseRunnerStream(rawStream)) {
        if (this.abortController.signal.aborted) break;
        this.handleChunk(chunk, assistantMsg);
      }
    } catch (e: unknown) {
      this.hideLoader(loader);
      if (e instanceof Error && e.name !== "AbortError") {
        this.chatView.addError(e.message);
      }
    } finally {
      this.hideLoader(loader);
      this.chatView.abortPendingTools();
      this.running = false;
      this.abortController = null;
      this.editor.disableSubmit = false;
      this.tui.requestRender();

      // Drain queued message
      const queued = this.queuedMessage;
      this.queuedMessage = null;
      if (queued) {
        this.editor.addToHistory(queued);
        await this.runAgent(queued);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Status helpers
  // ---------------------------------------------------------------------------

  private showLoader(message: string): Loader {
    const loader = new Loader(this.tui, t.accent, t.dim, message);
    this.statusContainer.addChild(loader);
    this.tui.requestRender();
    return loader;
  }

  private hideLoader(loader: Loader) {
    loader.stop();
    this.statusContainer.removeChild(loader);
    this.tui.requestRender();
  }

  // ---------------------------------------------------------------------------
  // OAuth login / logout
  // ---------------------------------------------------------------------------

  private async handleLogin(arg: string) {
    const providers = getProviders();
    const loggedIn = getLoggedInProviders();

    if (!arg) {
      // Show available providers
      const lines = providers.map((p) => {
        const ok = loggedIn.includes(p.id);
        return (ok ? t.toolOk("✓ ") : t.dim("  ")) +
          t.accent(p.id) + t.dim(` — ${p.name}`) +
          (ok ? t.dim(" (logged in)") : "");
      }).join("\n");
      this.chatView.addInfo(
        `OAuth providers:\n${lines}\n\n` +
        t.dim("Usage: /login <provider-id>"),
      );
      return;
    }

    const provider = providers.find((p) => p.id === arg);
    if (!provider) {
      this.chatView.addError(`Unknown provider: ${arg}\nAvailable: ${providers.map((p) => p.id).join(", ")}`);
      return;
    }

    const err = await loginProvider(arg, this.tui, this.statusContainer);
    if (err) {
      this.chatView.addError(`Login failed: ${err}`);
    } else {
      // Auto-switch to pi runner with this provider's model
      const model = providerToModel(arg);
      this.runner = "pi";
      this.model = model;
      this.footer.runner = "pi";
      this.footer.model = model;
      this.chatView.addInfo(t.toolOk(`✓ Logged in · switched to pi runner · model: ${model}`));
      this.tui.requestRender();
    }
  }

  private handleLogout(arg: string) {
    const providers = getProviders();
    const storage = getAuthStorage();

    if (!arg) {
      const loggedIn = getLoggedInProviders();
      if (loggedIn.length === 0) {
        this.chatView.addInfo(t.dim("Not logged in to any OAuth provider"));
      } else {
        this.chatView.addInfo(
          `Logged in: ${loggedIn.join(", ")}\n` + t.dim("Usage: /logout <provider-id>"),
        );
      }
      return;
    }

    const provider = providers.find((p) => p.id === arg);
    if (!provider) {
      this.chatView.addError(`Unknown provider: ${arg}`);
      return;
    }

    storage.remove(arg);
    this.chatView.addInfo(t.dim(`Logged out from ${provider.name}`));
    this.tui.requestRender();
  }

  start() { this.tui.start(); }
}
