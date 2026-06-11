import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverAgents } from "../extensions/subagent/agents-loader.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "bunny-subagent-loader-"));
});

afterEach(() => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function writeAgent(
  dir: string,
  name: string,
  frontmatter: Record<string, string>,
  body = "Be helpful.",
): string {
  mkdirSync(dir, { recursive: true });
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const content = `---\n${fm}\n---\n${body}`;
  const path = join(dir, `${name}.md`);
  writeFileSync(path, content);
  return path;
}

describe("discoverAgents", () => {
  it("loads bundled and user agents and dedupes by name (user wins)", () => {
    const bundledDir = join(tmp, "bundled");
    const userDir = join(tmp, "user");
    writeAgent(bundledDir, "scout", {
      name: "scout",
      description: "bundled scout",
    });
    writeAgent(bundledDir, "worker", {
      name: "worker",
      description: "bundled worker",
    });
    writeAgent(userDir, "scout", {
      name: "scout",
      description: "user-overridden scout",
    });

    const result = discoverAgents({
      cwd: tmp,
      scope: "user",
      bundledDir,
      userDir,
    });

    const byName = new Map(result.agents.map((a) => [a.name, a]));
    expect(byName.size).toBe(2);
    expect(byName.get("scout")?.description).toBe("user-overridden scout");
    expect(byName.get("scout")?.source).toBe("user");
    expect(byName.get("worker")?.source).toBe("bundled");
  });

  it("skips bundled defaults under scope:project", () => {
    const bundledDir = join(tmp, "bundled");
    const userDir = join(tmp, "user");
    const projectDir = join(tmp, ".bunny", "agents");
    writeAgent(bundledDir, "worker", {
      name: "worker",
      description: "bundled",
    });
    writeAgent(userDir, "scout", { name: "scout", description: "user" });
    writeAgent(projectDir, "auditor", {
      name: "auditor",
      description: "project-only",
    });

    const result = discoverAgents({
      cwd: tmp,
      scope: "project",
      bundledDir,
      userDir,
    });

    expect(result.agents.map((a) => a.name)).toEqual(["auditor"]);
    expect(result.agents[0].source).toBe("project");
  });

  it("scope:both merges bundled + user + project, project wins", () => {
    const bundledDir = join(tmp, "bundled");
    const userDir = join(tmp, "user");
    const projectDir = join(tmp, ".bunny", "agents");
    writeAgent(bundledDir, "worker", {
      name: "worker",
      description: "bundled",
    });
    writeAgent(userDir, "worker", { name: "worker", description: "user" });
    writeAgent(projectDir, "worker", {
      name: "worker",
      description: "project",
    });

    const result = discoverAgents({
      cwd: tmp,
      scope: "both",
      bundledDir,
      userDir,
    });

    const worker = result.agents.find((a) => a.name === "worker");
    expect(worker?.source).toBe("project");
    expect(worker?.description).toBe("project");
  });

  it("walks up the cwd tree to find .bunny/agents", () => {
    const projectDir = join(tmp, ".bunny", "agents");
    writeAgent(projectDir, "auditor", {
      name: "auditor",
      description: "audit",
    });
    const deep = join(tmp, "src", "deep", "nested");
    mkdirSync(deep, { recursive: true });

    const result = discoverAgents({
      cwd: deep,
      scope: "project",
      bundledDir: join(tmp, "no-such-bundled"),
      userDir: join(tmp, "no-such-user"),
    });

    expect(result.projectAgentsDir).toBe(projectDir);
    expect(result.agents.map((a) => a.name)).toEqual(["auditor"]);
  });

  it("falls back to .pi/agents when .bunny/agents is absent", () => {
    const piProjectDir = join(tmp, ".pi", "agents");
    writeAgent(piProjectDir, "legacy", {
      name: "legacy",
      description: "legacy agent",
    });

    const result = discoverAgents({
      cwd: tmp,
      scope: "project",
      bundledDir: join(tmp, "no-such-bundled"),
      userDir: join(tmp, "no-such-user"),
    });

    expect(result.projectAgentsDir).toBe(piProjectDir);
    expect(result.agents.map((a) => a.name)).toEqual(["legacy"]);
  });

  it("ignores files with malformed frontmatter (missing name/description)", () => {
    const bundledDir = join(tmp, "bundled");
    writeAgent(bundledDir, "valid", {
      name: "valid",
      description: "ok",
    });
    // Missing description.
    writeAgent(bundledDir, "broken", { name: "broken" });
    // Missing name.
    writeAgent(bundledDir, "nameless", { description: "no name" });

    const result = discoverAgents({
      cwd: tmp,
      scope: "user",
      bundledDir,
      userDir: join(tmp, "no-such-user"),
    });

    expect(result.agents.map((a) => a.name)).toEqual(["valid"]);
  });

  it("parses comma-separated tools", () => {
    const bundledDir = join(tmp, "bundled");
    writeAgent(bundledDir, "scout", {
      name: "scout",
      description: "scout",
      tools: "read, grep , find",
      model: "claude-haiku-4-5",
    });

    const result = discoverAgents({
      cwd: tmp,
      scope: "user",
      bundledDir,
      userDir: join(tmp, "no-such-user"),
    });

    expect(result.agents[0].tools).toEqual(["read", "grep", "find"]);
    expect(result.agents[0].model).toBe("claude-haiku-4-5");
  });

  it("returns empty agent list when nothing exists", () => {
    const result = discoverAgents({
      cwd: tmp,
      scope: "user",
      bundledDir: join(tmp, "no-such-bundled"),
      userDir: join(tmp, "no-such-user"),
    });
    expect(result.agents).toEqual([]);
    expect(result.projectAgentsDir).toBeNull();
  });

  it("skipBundled=true loads no bundled agents", () => {
    const bundledDir = join(tmp, "bundled");
    writeAgent(bundledDir, "worker", {
      name: "worker",
      description: "bundled",
    });
    const result = discoverAgents({
      cwd: tmp,
      scope: "user",
      bundledDir,
      userDir: join(tmp, "no-such-user"),
      skipBundled: true,
    });
    expect(result.agents).toEqual([]);
    expect(result.bundledAgentsDir).toBeNull();
  });
});
