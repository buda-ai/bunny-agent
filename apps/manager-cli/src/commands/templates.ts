/**
 * sandagent templates command
 *
 * List available agent templates.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";

export async function templatesCommand(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      help: {
        type: "boolean",
        short: "h",
      },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help) {
    console.log(`
sandagent templates - List available agent templates

Usage:
  sandagent templates

Templates define the agent's behavior, system prompt, and available skills.
`);
    return;
  }

  console.log("📋 Available Agent Templates");
  console.log("");
  console.log(
    "┌─────────────┬─────────────────────────────────────────┬─────────────────────────────┐",
  );
  console.log(
    "│ Template    │ Description                             │ Best For                    │",
  );
  console.log(
    "├─────────────┼─────────────────────────────────────────┼─────────────────────────────┤",
  );
  console.log(
    "│ default     │ General-purpose assistant               │ Starting point              │",
  );
  console.log(
    "│ coder       │ Software development focused            │ Coding, debugging, refactor │",
  );
  console.log(
    "│ analyst     │ Data analysis optimized                 │ Data processing, SQL, viz   │",
  );
  console.log(
    "│ researcher  │ Web research capabilities               │ Research, summarization     │",
  );
  console.log(
    "└─────────────┴─────────────────────────────────────────┴─────────────────────────────┘",
  );
  console.log("");
  console.log("Usage:");
  console.log('  sandagent run --template coder "Build a REST API"');
  console.log('  sandagent run --template analyst "Analyze sales.csv"');
  console.log('  sandagent run --template researcher "Research AI trends"');
  console.log("");
  console.log("Template Structure:");
  console.log("  templates/<name>/");
  console.log("  ├─ .claude/");
  console.log("  │  ├─ settings.json    # Claude settings (tokens, tools)");
  console.log("  │  └─ mcp.json         # MCP server configuration");
  console.log("  ├─ CLAUDE.md           # System instructions");
  console.log("  └─ skills/             # Pre-defined skills");
  console.log("");
  console.log("See templates/README.md for creating custom templates.");
}
