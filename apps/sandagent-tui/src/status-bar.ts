import type { Component } from "@mariozechner/pi-tui";
import { Text } from "@mariozechner/pi-tui";
import chalk from "chalk";

export class StatusBar implements Component {
  private text = new Text();

  constructor(private runner: string, private model: string) {
    this.refresh(null);
  }

  update(runner: string, model: string, tokens: number | null) {
    this.runner = runner;
    this.model = model;
    this.refresh(tokens);
  }

  private refresh(tokens: number | null) {
    const parts = [
      chalk.bold.cyan("sandagent"),
      chalk.dim(`runner:${this.runner}`),
      chalk.dim(`model:${this.model}`),
    ];
    if (tokens !== null) parts.push(chalk.dim(`tokens:${tokens}`));
    this.text.setText(parts.join("  ") + "\n");
  }

  render(width: number): string[] {
    return this.text.render(width);
  }

  invalidate() {
    this.text.invalidate();
  }
}
