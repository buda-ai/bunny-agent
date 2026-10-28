import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSecretGuardExtension } from "../tool-overrides.js";
import { runFauxToolCall } from "./faux-session.js";

const SECRET = "dpl-live-7c1e9a4f2b6d8e03";
let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "pi-secret-guard-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

/** Shaped like an MCP tool: the raw result rides along in details. */
const deployTool = (token: string) =>
  defineTool({
    name: "deploy_info",
    label: "deploy_info",
    description: "Return the deploy target and token",
    parameters: Type.Object({}),
    outputSchema: Type.Object({ target: Type.String(), token: Type.String() }),
    execute: async () => ({
      content: [{ type: "text", text: `Deploy token: ${token}` }],
      details: { mcpResult: { content: [{ type: "text", text: token }] } },
      structuredContent: { target: "prod-eu", token },
    }),
  });

/** Calls deploy_info the way a codemode script does and records what it got. */
function scriptTool(received: { structuredContent?: unknown }) {
  return defineTool({
    name: "script",
    label: "script",
    description: "Run deploy_info programmatically",
    parameters: Type.Object({}),
    execute: async (_id, _params, signal, _onUpdate, ctx) => {
      const call = await ctx.executeTool("deploy_info", {}, { signal });
      received.structuredContent = call.result.structuredContent;
      return {
        content: [{ type: "text", text: "script ran" }],
        details: undefined,
      };
    },
  });
}

describe("createSecretGuardExtension (real pi session)", () => {
  it("keeps env values out of the model context and the stored session", async () => {
    const { seenResult, persisted } = await runFauxToolCall({
      cwd,
      toolName: "deploy_info",
      customTools: [deployTool(SECRET)],
      extensions: [createSecretGuardExtension({ DEPLOY_TOKEN: SECRET })],
    });

    expect(seenResult).toContain("Deploy token: ***");
    expect(seenResult).not.toContain(SECRET);
    expect(persisted).not.toContain(SECRET);
  });

  it("hands programmatic callers masked structured content instead of dropping it", async () => {
    const received: { structuredContent?: unknown } = {};
    await runFauxToolCall({
      cwd,
      toolName: "script",
      customTools: [deployTool(SECRET), scriptTool(received)],
      extensions: [createSecretGuardExtension({ DEPLOY_TOKEN: SECRET })],
    });

    expect(received.structuredContent).toEqual({
      target: "prod-eu",
      token: "***",
    });
  });

  it("leaves results without env values untouched", async () => {
    const received: { structuredContent?: unknown } = {};
    const { persisted } = await runFauxToolCall({
      cwd,
      toolName: "script",
      customTools: [deployTool("public-demo-token"), scriptTool(received)],
      extensions: [createSecretGuardExtension({ DEPLOY_TOKEN: SECRET })],
    });

    expect(received.structuredContent).toEqual({
      target: "prod-eu",
      token: "public-demo-token",
    });
    expect(persisted).not.toContain("***");
  });
});
