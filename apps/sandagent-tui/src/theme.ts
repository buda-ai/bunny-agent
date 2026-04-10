/**
 * Shared theme — single source of truth for all colors.
 * Swap chalk calls here to change the whole TUI look.
 */
import chalk from "chalk";
import type { MarkdownTheme } from "@mariozechner/pi-tui";

export const markdownTheme: MarkdownTheme = {
  heading:        (t) => chalk.bold.white(t),
  link:           (t) => chalk.cyan(t),
  linkUrl:        (t) => chalk.dim(t),
  code:           (t) => chalk.yellow(t),
  codeBlock:      (t) => chalk.green(t),
  codeBlockBorder:(t) => chalk.dim(t),
  quote:          (t) => chalk.italic.dim(t),
  quoteBorder:    (t) => chalk.dim(t),
  hr:             (t) => chalk.dim(t),
  listBullet:     (t) => chalk.cyan(t),
  bold:           (t) => chalk.bold(t),
  italic:         (t) => chalk.italic(t),
  strikethrough:  (t) => chalk.strikethrough(t),
  underline:      (t) => chalk.underline(t),
};

export const reasoningTheme: MarkdownTheme = {
  ...markdownTheme,
  heading:  (t) => chalk.dim.bold(t),
  code:     (t) => chalk.dim(t),
  codeBlock:(t) => chalk.dim(t),
  bold:     (t) => chalk.dim.bold(t),
  italic:   (t) => chalk.dim.italic(t),
};

export const t = {
  user:       (s: string) => chalk.bold.blue(s),
  assistant:  (s: string) => chalk.bold.green(s),
  tool:       (s: string) => chalk.bold.magenta(s),
  toolOk:     (s: string) => chalk.dim(s),
  toolErr:    (s: string) => chalk.red(s),
  info:       (s: string) => chalk.dim(s),
  error:      (s: string) => chalk.red(s),
  dim:        (s: string) => chalk.dim(s),
  accent:     (s: string) => chalk.cyan(s),
  userBg:     (s: string) => chalk.bgHex("#1a1a2e")(s),
  toolBg:     (s: string) => chalk.bgHex("#0d1117")(s),
  separator:  (w: number) => chalk.dim("─".repeat(w)),
};
