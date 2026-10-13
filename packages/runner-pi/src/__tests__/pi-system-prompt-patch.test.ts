import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentSession,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BunnyAgentResourceLoader } from "../bunny-agent-resource-loader.js";

// Bunny patch: patches/@earendil-works__pi-coding-agent@*.patch
// The caller's appendSystemPrompt replaces pi's default "operating inside pi"
// opener instead of being appended after it.

const PI_DEFAULT_OPENER = "operating inside pi, a coding agent harness";

describe("Pi system prompt patch", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pi-system-prompt-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function buildPrompt(appendSystemPrompt?: string): Promise<string> {
    const resourceLoader = new BunnyAgentResourceLoader({
      cwd: dir,
      agentDir: join(dir, "agent"),
      appendSystemPrompt,
    });
    await resourceLoader.reload();
    const { session } = await createAgentSession({
      cwd: dir,
      agentDir: join(dir, "agent"),
      resourceLoader,
      sessionManager: SessionManager.inMemory(dir),
      settingsManager: SettingsManager.inMemory({}),
    });
    try {
      return session.systemPrompt;
    } finally {
      session.dispose();
    }
  }

  it("uses the caller prompt as the opening identity", async () => {
    const prompt = await buildPrompt("You are Bunny, a research agent.");
    expect(prompt.startsWith("You are Bunny, a research agent.")).toBe(true);
    expect(prompt).not.toContain(PI_DEFAULT_OPENER);
    expect(prompt.match(/You are Bunny, a research agent\./g)).toHaveLength(1);
    // Tool list, rules and cwd sections are still rendered.
    expect(prompt).toContain("<tools>");
    expect(prompt).toContain(`<cwd>\n${dir}\n</cwd>`);
  });

  it("keeps pi's default opener when no caller prompt is set", async () => {
    const prompt = await buildPrompt();
    expect(prompt).toContain(PI_DEFAULT_OPENER);
  });
});
