import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverAgents } from "../bundled-extensions/subagent/agents.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bunny-subagent-agents-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) =>
      rm(dir, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe("discoverAgents", () => {
  it("includes bundled agents without runtime markdown assets", async () => {
    const cwd = await makeTempDir();

    const result = discoverAgents(cwd, "project");
    const agents = new Map(result.agents.map((agent) => [agent.name, agent]));

    expect(agents.get("scout")?.source).toBe("bundled");
    expect(agents.get("planner")?.source).toBe("bundled");
    expect(agents.get("reviewer")?.source).toBe("bundled");
    expect(agents.get("worker")?.source).toBe("bundled");
    expect(result.projectAgentsDir).toBeNull();
  });

  it("allows project agents to override bundled agents by name", async () => {
    const cwd = await makeTempDir();
    const agentsDir = join(cwd, ".bunny", "agents");
    await mkdir(agentsDir, { recursive: true });
    await writeFile(
      join(agentsDir, "scout.md"),
      [
        "---",
        "name: scout",
        "description: Project-specific scout",
        "tools: read, grep",
        "---",
        "",
        "Use the project-specific scout instructions.",
      ].join("\n"),
      "utf-8",
    );

    const result = discoverAgents(cwd, "project");
    const scout = result.agents.find((agent) => agent.name === "scout");

    expect(scout?.source).toBe("project");
    expect(scout?.description).toBe("Project-specific scout");
    expect(scout?.tools).toEqual(["read", "grep"]);
    expect(result.projectAgentsDir).toBe(agentsDir);
  });
});
