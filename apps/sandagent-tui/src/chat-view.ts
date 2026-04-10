import { readFileSync } from "node:fs";
import type { Component, TUI } from "@mariozechner/pi-tui";
import {
  Box,
  Container,
  getImageDimensions,
  Image,
  Markdown,
  Spacer,
  Text,
} from "@mariozechner/pi-tui";
import { markdownTheme, reasoningTheme, t } from "./theme.js";

const imageTheme = { fallbackColor: t.dim };

// ---------------------------------------------------------------------------
// UserMessage
// ---------------------------------------------------------------------------

export class UserMessage extends Container {
  constructor(text: string) {
    super();
    this.addChild(new Spacer(1));
    this.addChild(
      new Markdown(text, 1, 0, markdownTheme, {
        bgColor: t.userBg,
        color: (s) => s, // keep markdown colors on top of bg
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// ToolCallComponent — pending → done/error, expandable
// ---------------------------------------------------------------------------

const MAX_PREVIEW = 200;

function preview(v: unknown, max = MAX_PREVIEW): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export class ToolCallComponent implements Component {
  private container = new Container();
  private headerText: Text;
  private inputText: Text;
  private resultBox: Box | null = null;
  private resultText: Text | null = null;
  private imageComp: Image | null = null;
  private expanded = false;
  private resultValue: unknown = null;
  private isError = false;

  constructor(private name: string) {
    this.headerText = new Text(t.tool(`  ⚙ ${name}`) + t.dim(" …"), 1, 0);
    this.inputText  = new Text("", 0, 0);
    this.container.addChild(this.headerText);
    this.container.addChild(this.inputText);
  }

  setInput(input: unknown) {
    this.inputText.setText(t.dim(`    ${preview(input, 120)}`));
  }

  setResult(output: unknown, isError = false) {
    this.resultValue = output;
    this.isError = isError;
    const icon = isError ? "✗" : "✓";
    const colorFn = isError ? t.toolErr : t.toolOk;
    this.headerText.setText(t.tool(`  ⚙ ${this.name}`) + " " + colorFn(icon));

    if (!this.resultBox) {
      this.resultBox = new Box(1, 0, t.toolBg);
      this.resultText = new Text("", 0, 0);
      this.resultBox.addChild(this.resultText!);
      this.container.addChild(this.resultBox);
    }
    this.resultText!.setText(colorFn(preview(output)));
  }

  setImageResult(filePath: string) {
    try {
      const data = readFileSync(filePath);
      const b64 = data.toString("base64");
      const mime = /\.png$/i.test(filePath) ? "image/png"
        : /\.gif$/i.test(filePath) ? "image/gif"
        : "image/jpeg";
      const dims = getImageDimensions(b64, mime);
      if (dims) {
        this.headerText.setText(t.tool(`  ⚙ ${this.name}`) + " " + t.toolOk("✓ image"));
        if (!this.resultBox) {
          this.resultBox = new Box(1, 0, t.toolBg);
          this.container.addChild(this.resultBox);
        }
        this.imageComp = new Image(b64, mime, imageTheme, { maxWidthCells: 60 }, dims);
        this.resultBox.addChild(this.imageComp);
        return;
      }
    } catch {}
    this.setResult(filePath);
  }

  abort() {
    this.headerText.setText(t.tool(`  ⚙ ${this.name}`) + " " + t.dim("⊘ aborted"));
    if (this.resultText) this.resultText.setText("");
  }

  render(width: number): string[] { return this.container.render(width); }
  invalidate() { this.container.invalidate(); }
}

// ---------------------------------------------------------------------------
// AssistantMessage — streaming text + reasoning
// ---------------------------------------------------------------------------

export class AssistantMessage extends Container {
  private textContent = "";
  private reasoningContent = "";
  private md: Markdown;
  private reasoningMd: Markdown | null = null;
  private errorText: Text | null = null;

  constructor(private tui: TUI) {
    super();
    this.addChild(new Spacer(1));
    this.md = new Markdown("", 1, 0, markdownTheme);
    this.addChild(this.md);
  }

  appendText(delta: string) {
    this.textContent += delta;
    this.md.setText(this.textContent);
    this.tui.requestRender();
  }

  appendReasoning(delta: string) {
    this.reasoningContent += delta;
    if (!this.reasoningMd) {
      this.reasoningMd = new Markdown("", 1, 0, reasoningTheme);
      this.clear();
      this.addChild(new Spacer(1));
      this.addChild(this.reasoningMd);
      this.addChild(this.md);
    }
    this.reasoningMd.setText(this.reasoningContent);
    this.tui.requestRender();
  }

  setError(message: string) {
    if (!this.errorText) {
      this.errorText = new Text("", 1, 0);
      this.addChild(this.errorText);
    }
    this.errorText.setText(t.error(`\nError: ${message}`));
    this.tui.requestRender();
  }
}

// ---------------------------------------------------------------------------
// ChatView — operates on a Container, not tui.children directly
// ---------------------------------------------------------------------------

export class ChatView {
  private container: Container;
  private toolCalls = new Map<string, ToolCallComponent>();

  constructor(private tui: TUI, container: Container) {
    this.container = container;
  }

  addUserMessage(text: string) {
    this.container.addChild(new UserMessage(text));
  }

  startAssistantMessage(): AssistantMessage {
    this.container.addChild(new Text(t.assistant("Assistant"), 1, 0));
    const msg = new AssistantMessage(this.tui);
    this.container.addChild(msg);
    return msg;
  }

  addToolCall(toolCallId: string, name: string): ToolCallComponent {
    const comp = new ToolCallComponent(name);
    this.toolCalls.set(toolCallId, comp);
    this.container.addChild(comp);
    return comp;
  }

  updateToolCall(toolCallId: string, input: unknown) {
    this.toolCalls.get(toolCallId)?.setInput(input);
    this.tui.requestRender();
  }

  resolveToolCall(toolCallId: string, output: unknown, isError = false) {
    this.toolCalls.get(toolCallId)?.setResult(output, isError);
    this.tui.requestRender();
  }

  resolveToolCallWithImage(toolCallId: string, filePath: string) {
    this.toolCalls.get(toolCallId)?.setImageResult(filePath);
    this.tui.requestRender();
  }

  abortPendingTools() {
    for (const comp of this.toolCalls.values()) comp.abort();
    this.toolCalls.clear();
    this.tui.requestRender();
  }

  addError(message: string) {
    this.container.addChild(new Text(t.error(`\n✗ ${message}\n`), 1, 0));
    this.tui.requestRender();
  }

  addInfo(message: string) {
    this.container.addChild(new Text(t.info(`${message}\n`), 1, 0));
    this.tui.requestRender();
  }

  addHelp(commands: Array<{ name: string; description: string }>) {
    const lines = commands
      .map((c) => t.accent(`/${c.name}`) + t.dim(` — ${c.description}`))
      .join("\n");
    this.container.addChild(new Text(`\n${lines}\n`, 1, 0));
    this.tui.requestRender();
  }

  addBashResult(cmd: string, output: string, isError: boolean) {
    const header = new Text(t.tool(`  $ ${cmd}`), 1, 0);
    const body = new Box(1, 0, t.toolBg);
    body.addChild(new Text(isError ? t.toolErr(output) : t.toolOk(output), 0, 0));
    this.container.addChild(header);
    this.container.addChild(body);
    this.tui.requestRender();
  }

  clear() {
    this.container.clear();
    this.toolCalls.clear();
    this.tui.requestRender();
  }
}
