import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import {
  type AgentSession,
  createAgentSession,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

// Bunny patch: patches/@earendil-works__pi-coding-agent@*.patch
// Post-run retry/compaction can leave an assistant-tailed transcript with
// empty queues; agent.continue() throws "Cannot continue from message role:
// assistant" in that state. The patch routes every post-run continuation
// through _continueAgentIfPossible().

type PatchedSession = AgentSession & {
  _continueAgentIfPossible(): Promise<boolean>;
};

const agentSessionSource = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js",
  ),
  "utf8",
);

async function createSession(): Promise<PatchedSession> {
  const { session } = await createAgentSession({
    cwd: "/tmp",
    sessionManager: SessionManager.inMemory("/tmp"),
    settingsManager: SettingsManager.inMemory({}),
    noTools: "builtin",
  });
  return session as PatchedSession;
}

describe("Pi post-run continuation patch", () => {
  it("routes every post-run continuation through the guard", () => {
    const runLoop = agentSessionSource.slice(
      agentSessionSource.indexOf("await this.agent.prompt(messages);"),
      agentSessionSource.indexOf(
        "this._flushPendingBashMessages();",
        agentSessionSource.indexOf("await this.agent.prompt(messages);"),
      ),
    );
    expect(runLoop).toContain("_continueAgentIfPossible()");
    expect(runLoop).not.toContain("await this.agent.continue();");
  });

  it("does not continue from an assistant tail with empty queues", async () => {
    const session = await createSession();
    try {
      session.agent.state.messages = [fauxAssistantMessage("done")];
      const continueSpy = vi.spyOn(session.agent, "continue");
      await expect(session._continueAgentIfPossible()).resolves.toBe(false);
      expect(continueSpy).not.toHaveBeenCalled();
    } finally {
      session.dispose();
    }
  });

  it("continues when the transcript tail is continuable", async () => {
    const session = await createSession();
    try {
      session.agent.state.messages = [
        { role: "user", content: [{ type: "text", text: "hi" }], timestamp: 1 },
      ];
      const continueSpy = vi
        .spyOn(session.agent, "continue")
        .mockResolvedValue(undefined);
      await expect(session._continueAgentIfPossible()).resolves.toBe(true);
      expect(continueSpy).toHaveBeenCalledOnce();
    } finally {
      session.dispose();
    }
  });
});
