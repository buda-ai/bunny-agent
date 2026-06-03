/**
 * Agent discovery and configuration
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";

export type AgentScope = "user" | "project" | "both";
export type AgentSource = "bundled" | "user" | "project";

export interface AgentConfig {
  name: string;
  description: string;
  tools?: string[];
  model?: string;
  systemPrompt: string;
  source: AgentSource;
  filePath: string;
}

export interface AgentDiscoveryResult {
  agents: AgentConfig[];
  projectAgentsDir: string | null;
}

const BUNDLED_AGENTS: AgentConfig[] = [
  {
    name: "scout",
    description:
      "Fast codebase recon that returns compressed context for handoff to other agents",
    tools: ["read", "grep", "find", "ls", "bash"],
    systemPrompt: `You are a scout. Quickly investigate a codebase and return structured findings that another agent can use without re-reading everything.

Your output will be passed to an agent who has NOT seen the files you explored.

Thoroughness (infer from task, default medium):
- Quick: Targeted lookups, key files only
- Medium: Follow imports, read critical sections
- Thorough: Trace all dependencies, check tests/types

Strategy:
1. grep/find to locate relevant code
2. Read key sections, not entire files
3. Identify types, interfaces, key functions
4. Note dependencies between files

Output format:

## Files Retrieved
List with exact line ranges:
1. \`path/to/file.ts\` (lines 10-50) - Description of what's here
2. \`path/to/other.ts\` (lines 100-150) - Description

## Key Code
Critical types, interfaces, or functions.

## Architecture
Brief explanation of how the pieces connect.

## Start Here
Which file to look at first and why.`,
    source: "bundled",
    filePath: "bundled:scout",
  },
  {
    name: "planner",
    description: "Creates implementation plans from context and requirements",
    tools: ["read", "grep", "find", "ls"],
    systemPrompt: `You are a planning specialist. You receive context and requirements, then produce a clear implementation plan.

You must NOT make any changes. Only read, analyze, and plan.

Input format you'll receive:
- Context or findings from a scout agent
- Original query or requirements

Output format:

## Goal
One sentence summary of what needs to be done.

## Plan
Numbered steps, each small and actionable:
1. Step one - specific file/function to modify
2. Step two - what to add/change

## Files to Modify
- \`path/to/file.ts\` - what changes

## New Files
- \`path/to/new.ts\` - purpose

## Risks
Anything to watch out for.

Keep the plan concrete. The worker agent will execute it verbatim.`,
    source: "bundled",
    filePath: "bundled:planner",
  },
  {
    name: "reviewer",
    description: "Code review specialist for quality and security analysis",
    tools: ["read", "grep", "find", "ls", "bash"],
    systemPrompt: `You are a senior code reviewer. Analyze code for quality, security, and maintainability.

Bash is for read-only commands only: git diff, git log, git show. Do NOT modify files or run builds.
Assume tool permissions are not perfectly enforceable; keep all bash usage strictly read-only.

Strategy:
1. Run git diff to see recent changes when applicable
2. Read the modified files
3. Check for bugs, security issues, and maintainability problems

Output format:

## Files Reviewed
- \`path/to/file.ts\` (lines X-Y)

## Critical
- \`file.ts:42\` - Issue description

## Warnings
- \`file.ts:100\` - Issue description

## Suggestions
- \`file.ts:150\` - Improvement idea

## Summary
Overall assessment in 2-3 sentences.

Be specific with file paths and line numbers.`,
    source: "bundled",
    filePath: "bundled:reviewer",
  },
  {
    name: "worker",
    description:
      "General-purpose subagent with full capabilities, isolated context",
    systemPrompt: `You are a worker agent with full capabilities. You operate in an isolated context window to handle delegated tasks without polluting the main conversation.

Work autonomously to complete the assigned task. Use all available tools as needed.

Output format when finished:

## Completed
What was done.

## Files Changed
- \`path/to/file.ts\` - what changed

## Notes
Anything the main agent should know.

If handing off to another agent, include exact file paths changed and the key functions or types touched.`,
    source: "bundled",
    filePath: "bundled:worker",
  },
];

function loadAgentsFromDir(
  dir: string,
  source: "user" | "project",
): AgentConfig[] {
  const agents: AgentConfig[] = [];

  if (!fs.existsSync(dir)) {
    return agents;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return agents;
  }

  for (const entry of entries) {
    if (!entry.name.endsWith(".md")) continue;
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;

    const filePath = path.join(dir, entry.name);
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const { frontmatter, body } =
      parseFrontmatter<Record<string, string>>(content);

    if (!frontmatter.name || !frontmatter.description) {
      continue;
    }

    const tools = frontmatter.tools
      ?.split(",")
      .map((t: string) => t.trim())
      .filter(Boolean);

    agents.push({
      name: frontmatter.name,
      description: frontmatter.description,
      tools: tools && tools.length > 0 ? tools : undefined,
      model: frontmatter.model,
      systemPrompt: body,
      source,
      filePath,
    });
  }

  return agents;
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function findNearestProjectAgentsDir(cwd: string): string | null {
  let currentDir = cwd;
  while (true) {
    const candidate = path.join(currentDir, ".bunny", "agents");
    if (isDirectory(candidate)) return candidate;

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) return null;
    currentDir = parentDir;
  }
}

export function discoverAgents(
  cwd: string,
  scope: AgentScope,
): AgentDiscoveryResult {
  const userDir = path.join(getAgentDir(), "agents");
  const projectAgentsDir = findNearestProjectAgentsDir(cwd);

  const userAgents =
    scope === "project" ? [] : loadAgentsFromDir(userDir, "user");
  const projectAgents =
    scope === "user" || !projectAgentsDir
      ? []
      : loadAgentsFromDir(projectAgentsDir, "project");

  const agentMap = new Map<string, AgentConfig>();

  for (const agent of BUNDLED_AGENTS) agentMap.set(agent.name, agent);

  if (scope === "both") {
    for (const agent of userAgents) agentMap.set(agent.name, agent);
    for (const agent of projectAgents) agentMap.set(agent.name, agent);
  } else if (scope === "user") {
    for (const agent of userAgents) agentMap.set(agent.name, agent);
  } else {
    for (const agent of projectAgents) agentMap.set(agent.name, agent);
  }

  return { agents: Array.from(agentMap.values()), projectAgentsDir };
}

export function formatAgentList(
  agents: AgentConfig[],
  maxItems: number,
): { text: string; remaining: number } {
  if (agents.length === 0) return { text: "none", remaining: 0 };
  const listed = agents.slice(0, maxItems);
  const remaining = agents.length - listed.length;
  return {
    text: listed
      .map((a) => `${a.name} (${a.source}): ${a.description}`)
      .join("; "),
    remaining,
  };
}
