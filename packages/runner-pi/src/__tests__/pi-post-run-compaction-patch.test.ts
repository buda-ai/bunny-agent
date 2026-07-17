import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("Pi post-run compaction patch", () => {
  it("continues after compaction only when queued work remains", () => {
    const packageRoot = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../node_modules/@earendil-works/pi-coding-agent",
    );
    const source = readFileSync(
      join(packageRoot, "dist/core/agent-session.js"),
      "utf8",
    );

    expect(source).toContain(
      "if (await this._checkCompaction(msg)) {\n            // Threshold compaction after a completed assistant turn",
    );
    expect(source).toContain(
      "return this.agent.hasQueuedMessages();\n        }\n        // The agent loop drains both queues",
    );
    expect(source).not.toContain(
      "if (await this._checkCompaction(msg)) {\n            return true;\n        }",
    );
  });
});
