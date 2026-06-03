import { afterEach, describe, expect, it } from "vitest";
import {
  __resetSandboxProcessInspectorsForTests,
  __setSandboxProcessInspectorsForTests,
  sandboxProcesses,
} from "../routes/processes.js";

describe("sandboxProcesses", () => {
  afterEach(() => {
    __resetSandboxProcessInspectorsForTests();
  });

  it("joins processes with listening ports, deduplicates, filters daemon ports, and sorts", async () => {
    __setSandboxProcessInspectorsForTests({
      listProcesses: async () => [
        { pid: 2, name: "api", cmd: "node api.js", cpu: 1, memory: 2 },
        { pid: 1, name: "web", path: "/usr/bin/web" },
        { pid: 3, name: "hidden" },
      ],
      listListeningSockets: async () => [
        { pid: 2, port: 8080 },
        { pid: 2, port: 8080 },
        { pid: 1, port: 3000 },
        { pid: 2, port: 3080 },
        { pid: 3, port: 9002 },
      ],
    });

    const result = await sandboxProcesses({ root: "/tmp/root" });

    expect(result).toEqual({
      ok: true,
      data: {
        processes: [
          {
            pid: 1,
            ppid: undefined,
            name: "web",
            cmd: undefined,
            path: "/usr/bin/web",
            cpu: undefined,
            memory: undefined,
            ports: [3000],
          },
          {
            pid: 2,
            ppid: undefined,
            name: "api",
            cmd: "node api.js",
            path: undefined,
            cpu: 1,
            memory: 2,
            ports: [8080],
          },
        ],
      },
      error: null,
    });
  });

  it("propagates inspector failures", async () => {
    __setSandboxProcessInspectorsForTests({
      listProcesses: async () => {
        throw new Error("ps failed");
      },
      listListeningSockets: async () => [],
    });

    await expect(sandboxProcesses({ root: "/tmp/root" })).rejects.toThrow(
      "ps failed",
    );
  });
});
