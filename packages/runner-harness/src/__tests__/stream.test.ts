import { describe, expect, it } from "vitest";
import { parseRunnerStream } from "../stream.js";

describe("parseRunnerStream", () => {
  it("normalizes a thrown storage-full error", async () => {
    const stream = (async function* () {
      yield 'data: {"type":"start"}\n\n';
      throw Object.assign(new Error("ENOSPC at /agent/private"), {
        code: "ENOSPC",
        path: "/agent/private",
      });
    })();

    const chunks = [];
    for await (const chunk of parseRunnerStream(stream)) chunks.push(chunk);

    expect(chunks).toEqual([
      { type: "start" },
      {
        type: "error",
        errorCode: "WORKSPACE_STORAGE_FULL",
        errorText: "Workspace storage is full.",
      },
    ]);
  });
});
