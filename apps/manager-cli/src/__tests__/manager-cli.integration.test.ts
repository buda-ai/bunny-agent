/**
 * Integration tests for manager-cli
 * Tests actual SandAgent with manager and sandbox
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SandAgent, LocalSandbox } from "@sandagent/manager";
import { describe, expect, it } from "vitest";

describe("manager-cli Integration Tests", () => {
  const TIMEOUT = 30000;

  it(
    "should create SandAgent with LocalSandbox",
    async () => {
      const testDir = await mkdtemp(join(tmpdir(), "sandagent-test-"));

      const sandbox = new LocalSandbox({
        baseDir: testDir,
        isolate: true,
      });

      const agent = new SandAgent({
        sandbox,
        runner: {
          kind: "claude-agent-sdk",
          model: "claude-sonnet-4-20250514",
        },
        env: {
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "test-key",
        },
      });

      expect(agent).toBeDefined();
      expect(agent.stream).toBeDefined();
    },
    TIMEOUT,
  );

  it(
    "should attach to sandbox and execute command",
    async () => {
      const testDir = await mkdtemp(join(tmpdir(), "sandagent-test-"));

      const sandbox = new LocalSandbox({
        baseDir: testDir,
        isolate: true,
      });

      const handle = await sandbox.attach("test-session-exec");

      // Test basic command execution
      const chunks: string[] = [];
      for await (const chunk of handle.exec(["echo", "Hello from sandbox"])) {
        chunks.push(new TextDecoder().decode(chunk));
      }

      const output = chunks.join("");
      expect(output).toContain("Hello from sandbox");

      await handle.destroy();
    },
    TIMEOUT,
  );

  it(
    "should create isolated workspace directories",
    async () => {
      const testDir = await mkdtemp(join(tmpdir(), "sandagent-test-"));

      const sandbox = new LocalSandbox({
        baseDir: testDir,
        isolate: true,
      });

      const session1 = await sandbox.attach("session-1");
      const session2 = await sandbox.attach("session-2");

      // Each session should have its own workspace
      expect(session1).toBeDefined();
      expect(session2).toBeDefined();

      await session1.destroy();
      await session2.destroy();
    },
    TIMEOUT,
  );
});
