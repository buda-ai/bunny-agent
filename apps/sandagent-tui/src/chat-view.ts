import type { Component, MarkdownTheme, TUI } from "@mariozechner/pi-tui";
import { Markdown, Text } from "@mariozechner/pi-tui";
import chalk from "chalk";

const theme: MarkdownTheme = {
  heading: (t) => chalk.bold.white(t),
  link: (t) => chalk.cyan(t),
  linkUrl: (t) => chalk.dim(t),
  code: (t) => chalk.green(t),
  codeBlock: (t) => chalk.green(t),
  codeBlockBorder: (t) => chalk.dim(t),
  quote: (t) => chalk.dim(t),
  quoteBorder: (t) => chalk.dim("|"),
  hr: (t) => chalk.dim(t),
  listBullet: (t) => chalk.dim(t),
  bold: (t) => chalk.bold(t),
  italic: (t) => chalk.italic(t),
  strikethrough: (t) => chalk.strikethrough(t),
  underline: (t) => chalk.underline(t),
};

export class AssistantMessage implements Component {
  private content = "";
  private md: Markdown;

  constructor(private tui: TUI) {
    this.md = new Markdown("", 1, 0, theme);
  }

  append(delta: string) {
    this.content += delta;
    this.md.setText(this.content);
    this.tui.requestRender();
  }

  render(width: number): string[] {
    return this.md.render(width);
  }

  invalidate() {
    this.md.invalidate();
  }
}

export class ChatView {
  constructor(private tui: TUI) {}

  addUserMessage(text: string) {
    this.tui.addChild(new Text(chalk.bold.blue("You") + "\n"));
    this.tui.addChild(new Markdown(text, 1, 0, theme));
    this.tui.addChild(new Text("\n"));
  }

  startAssistantMessage(): AssistantMessage {
    this.tui.addChild(new Text(chalk.bold.green("Assistant") + "\n"));
    const msg = new AssistantMessage(this.tui);
    this.tui.addChild(msg);
    this.tui.addChild(new Text("\n"));
    return msg;
  }

  addToolCall(name: string, input: unknown) {
    const summary = typeof input === "string" ? input : JSON.stringify(input).slice(0, 120);
    this.tui.addChild(new Text(chalk.dim(`  ⚙ ${name}(${summary})\n`)));
  }

  addError(message: string) {
    this.tui.addChild(new Text(chalk.red(`Error: ${message}\n`)));
  }
}
