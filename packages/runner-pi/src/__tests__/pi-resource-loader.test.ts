import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPiResourceLoader } from "../pi-runner.js";

let root: string;

function writeSkill(dir: string, name: string): void {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(
    join(dir, name, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} skill\n---\n\n${name} body\n`,
  );
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pi-loader-"));
  vi.stubEnv("HOME", join(root, "home"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe("createPiResourceLoader skills", () => {
  it("loads agent-dir, project and caller skills but not personal .agents skills", async () => {
    const cwd = join(root, "home", "work", "project");
    const agentDir = join(root, "home", ".pi", "agent");
    writeSkill(join(agentDir, "skills"), "global-skill");
    writeSkill(join(cwd, ".pi", "skills"), "project-skill");
    writeSkill(join(root, "extra"), "caller-skill");
    writeSkill(join(root, "home", ".agents", "skills"), "personal-skill");
    writeSkill(
      join(root, "home", "work", ".agents", "skills"),
      "ancestor-skill",
    );

    const loader = await createPiResourceLoader({
      cwd,
      agentDir,
      skillPaths: [join(root, "extra")],
    });

    expect(
      loader
        .getSkills()
        .skills.map((s) => s.name)
        .sort(),
    ).toEqual(["caller-skill", "global-skill", "project-skill"]);
  });
});
