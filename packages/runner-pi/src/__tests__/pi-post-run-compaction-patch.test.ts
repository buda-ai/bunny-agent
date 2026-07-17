import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../node_modules/@earendil-works/pi-coding-agent",
);
const source = readFileSync(
  join(packageRoot, "dist/core/agent-session.js"),
  "utf8",
);

describe("Pi post-run continuation patch", () => {
  it("guards every post-run continuation against an assistant tail with empty queues", () => {
    expect(source).toContain("async _continueAgentIfPossible() {");
    expect(source).toContain(
      'lastMessage.role === "assistant" && !this.agent.hasQueuedMessages()',
    );
    expect(source).toContain(
      "if (!(await this._continueAgentIfPossible())) {\n                    break;",
    );
    expect(source).not.toContain(
      "while (await this._handlePostAgentRun()) {\n                await this.agent.continue();",
    );
  });

  it("still continues when the transcript or queue state is continuable", () => {
    expect(source).toContain(
      "await this.agent.continue();\n        return true;",
    );
  });
});
