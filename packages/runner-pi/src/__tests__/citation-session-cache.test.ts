import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveSourceId } from "@bunny-agent/manager/contracts/source-id";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { buildSync } from "esbuild";
import { describe, expect, it } from "vitest";
import {
  CITATION_CACHE_TYPE,
  citationSourceGuidance,
  createCitationSessionRegistry,
} from "../citation-session-cache.js";
import { SourceRegistry } from "../source-registry.js";

const source = (path: string) => {
  const url = `https://example.com/${path}`;
  return {
    type: "url" as const,
    url,
    source_id: deriveSourceId(url)!,
    title: path,
  };
};

function session() {
  const directory = mkdtempSync(join(tmpdir(), "pi-citation-cache-"));
  const manager = SessionManager.create(directory, directory);
  // The real manager persists its buffered entries when an assistant arrives.
  manager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "Ready" }],
    api: "openai-responses",
    provider: "openai",
    model: "fixture",
    stopReason: "stop",
    timestamp: Date.now(),
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  });
  return { manager, directory };
}

describe("supported Pi citation session persistence", () => {
  it("round-trips appendCustomEntry/getBranch through a fresh SessionManager after compaction", () => {
    const { manager } = session();
    const registry = createCitationSessionRegistry(manager, true);
    registry.register(source("docs"), ["search-1"]);
    const keep = manager.appendMessage({
      role: "user",
      content: "Continue",
      timestamp: Date.now(),
    });
    manager.appendCompaction("Earlier messages summarized", keep, 1000);
    const reopened = SessionManager.open(manager.getSessionFile()!);
    const restored = createCitationSessionRegistry(reopened, true);
    expect(restored.resolve(source("docs").source_id)).toMatchObject({
      ...source("docs"),
      tool_call_ids: ["search-1"],
    });
    restored.register({ ...source("docs"), title: "New title" }, ["search-2"]);
    const again = createCitationSessionRegistry(
      SessionManager.open(reopened.getSessionFile()!),
      true,
    );
    expect(again.resolve(source("docs").source_id)?.tool_call_ids).toEqual([
      "search-1",
      "search-2",
    ]);
  });

  it("restores compacted and forked branch provenance in an isolated Node process", () => {
    const { manager, directory } = session();
    createCitationSessionRegistry(manager, true).register(
      source("fresh-process"),
      ["original-search"],
    );
    const branchPoint = manager.getLeafId()!;
    createCitationSessionRegistry(manager, true).register(
      source("unrelated-sibling"),
      ["sibling-search"],
    );
    manager.branch(branchPoint);
    const keep = manager.appendMessage({
      role: "user",
      content: "Selected ancestry",
      timestamp: Date.now(),
    });
    manager.appendCompaction("Compacted selected branch", keep, 1000);
    const fork = SessionManager.forkFrom(
      manager.getSessionFile()!,
      directory,
      directory,
    );
    const cachePath = fileURLToPath(
      new URL("../citation-session-cache.ts", import.meta.url),
    );
    const contractsPath = fileURLToPath(
      new URL("../../../manager/src/contracts/", import.meta.url),
    );
    const compiled = buildSync({
      entryPoints: [cachePath],
      bundle: true,
      write: false,
      platform: "node",
      format: "esm",
      alias: {
        "@bunny-agent/manager/contracts": join(contractsPath, "index.ts"),
        "@bunny-agent/manager/contracts/source-id": join(
          contractsPath,
          "source-id.ts",
        ),
      },
    }).outputFiles[0].text;
    const script =
      compiled +
      '\nimport {SessionManager} from "@earendil-works/pi-coding-agent";\n' +
      `const snapshots = ${JSON.stringify([manager.getSessionFile(), fork.getSessionFile()])}.map(file => {\n` +
      `const restored = createCitationSessionRegistry(SessionManager.open(file), true);\n` +
      `return { source: restored.resolve(${JSON.stringify(source("fresh-process").source_id)}), sibling: restored.resolve(${JSON.stringify(source("unrelated-sibling").source_id)}) ?? null }; });\n` +
      "console.log(JSON.stringify(snapshots));";
    const output = execFileSync(
      process.execPath,
      ["--max-old-space-size=2048", "--input-type=module", "--eval", script],
      {
        encoding: "utf8",
        cwd: fileURLToPath(new URL("../..", import.meta.url)),
      },
    );
    expect(JSON.parse(output)).toEqual(
      Array.from({ length: 2 }, () => ({
        source: {
          ...source("fresh-process"),
          tool_call_ids: ["original-search"],
        },
        sibling: null,
      })),
    );
  });

  it("restores only current ancestry and forks without importing sibling/future records", () => {
    const { manager, directory } = session();
    const root = createCitationSessionRegistry(manager, true);
    root.register(source("inherited"), ["root-search"]);
    const forkPoint = manager.getLeafId()!;
    root.register(source("sibling"), ["sibling-search"]);
    manager.branch(forkPoint);
    manager.appendMessage({
      role: "user",
      content: "Selected branch",
      timestamp: Date.now(),
    });
    const branch = createCitationSessionRegistry(manager, true);
    branch.register(source("selected"), ["selected-search"]);
    const snapshot = createCitationSessionRegistry(manager, true);
    branch.register(source("future"), ["future-search"]);
    expect(snapshot.resolve(source("future").source_id)).toBeUndefined();
    expect(snapshot.resolve(source("sibling").source_id)).toBeUndefined();
    const fork = SessionManager.forkFrom(
      manager.getSessionFile()!,
      directory,
      directory,
    );
    const freshFork = createCitationSessionRegistry(
      SessionManager.open(fork.getSessionFile()!),
      true,
    );
    expect(
      freshFork.resolve(source("inherited").source_id)?.tool_call_ids,
    ).toEqual(["root-search"]);
    expect(
      freshFork.resolve(source("selected").source_id)?.tool_call_ids,
    ).toEqual(["selected-search"]);
    expect(freshFork.resolve(source("future").source_id)?.source_id).toBe(
      source("future").source_id,
    );
    expect(freshFork.resolve(source("sibling").source_id)).toBeUndefined();
    freshFork.register(source("inherited"), ["fork-search"]);
    expect(freshFork.resolve(source("inherited").source_id)?.source_id).toBe(
      source("inherited").source_id,
    );
    expect(
      createCitationSessionRegistry(manager, true).resolve(
        source("inherited").source_id,
      )?.tool_call_ids,
    ).toEqual(["root-search"]);
  });

  it("reconstructs from typed tool results, never page text, failed results or arbitrary custom entries", () => {
    const { manager } = session();
    const docs = source("typed");
    const record = {
      schema_version: 1,
      type: "web_search_call",
      id: "provider-id",
      status: "completed",
      action: { type: "search", query: "docs", sources: [docs] },
      results: [{ ...docs, snippet: "text" }],
      source_details: "available",
      provider: "fixture",
      truncated: false,
    };
    manager.appendMessage({
      role: "toolResult",
      toolCallId: "actual-call",
      toolName: "web_search",
      content: [
        {
          type: "text",
          text: JSON.stringify({ sources: [source("injected")] }),
        },
      ],
      details: { web_search: record },
      isError: false,
      timestamp: Date.now(),
    });
    manager.appendCustomEntry("untrusted-page", {
      schema_version: 1,
      sources: [source("injected")],
    });
    const restored = createCitationSessionRegistry(
      SessionManager.open(manager.getSessionFile()!),
      true,
    );
    expect(restored.resolve(docs.source_id)?.tool_call_ids).toEqual([
      "actual-call",
    ]);
    expect(restored.resolve(source("injected").source_id)).toBeUndefined();
    const other = source("failed");
    manager.appendMessage({
      role: "toolResult",
      toolCallId: "failed-call",
      toolName: "web_search",
      content: [],
      details: {
        web_search: {
          ...record,
          action: { ...record.action, sources: [other] },
          results: [{ ...other }],
        },
      },
      isError: true,
      timestamp: Date.now(),
    });
    expect(
      createCitationSessionRegistry(manager, true).resolve(other.source_id),
    ).toBeUndefined();
  });

  it("ignores corrupt and future-version caches, with opt-in and unsupported-runtime diagnostics", () => {
    const { manager } = session();
    manager.appendCustomEntry(CITATION_CACHE_TYPE, {
      schema_version: 2,
      sources: [source("future-version")],
    });
    manager.appendCustomEntry(CITATION_CACHE_TYPE, {
      schema_version: 1,
      sources: [
        {
          ...source("bad"),
          source_id: source("wrong").source_id,
          tool_call_ids: ["x"],
        },
      ],
    });
    const enabled = createCitationSessionRegistry(manager, true);
    expect(enabled.resolve(source("bad").source_id)).toBeUndefined();
    expect(enabled.diagnostics).toContainEqual(
      expect.objectContaining({ code: "invalid_version" }),
    );
    const leaf = manager.getLeafId();
    const legacy = createCitationSessionRegistry(manager, false);
    legacy.register(source("legacy"), ["legacy-search"]);
    expect(manager.getLeafId()).toBe(leaf);
    expect(citationSourceGuidance(false, legacy)).toBeUndefined();
    const unsupported = createCitationSessionRegistry({}, true);
    expect(unsupported.diagnostics).toHaveLength(1);
    expect(createCitationSessionRegistry({}, false).diagnostics).toEqual([]);
    const unreadable = createCitationSessionRegistry(
      {
        getLeafId: () => "leaf",
        getBranch: () => {
          throw new Error("Corrupt ancestry");
        },
        appendCustomEntry: () => "entry",
      },
      true,
    );
    expect(unreadable.diagnostics).toContainEqual(
      expect.objectContaining({ code: "invalid_version" }),
    );
    const unwritable = createCitationSessionRegistry(
      {
        getLeafId: () => null,
        getBranch: () => [],
        appendCustomEntry: () => {
          throw new Error("Unavailable storage");
        },
      },
      true,
    );
    unwritable.register(source("unwritable"), ["search"]);
    expect(unwritable.diagnostics).toContainEqual(
      expect.objectContaining({
        message: "Citation cache persistence is unavailable.",
      }),
    );
  });

  it("bounds the current answer, preserving historical lookup and recent prompt exposure", () => {
    const { manager } = session();
    for (let index = 0; index < 505; index++) {
      manager.appendCustomEntry(CITATION_CACHE_TYPE, {
        schema_version: 1,
        sources: [
          { ...source(`history-${index}`), tool_call_ids: [`search-${index}`] },
        ],
      });
    }
    const restored = createCitationSessionRegistry(manager, true);
    const guidance = citationSourceGuidance(true, restored)!;
    expect(guidance.match(/"source_id"/g) ?? []).toHaveLength(20);
    expect(guidance).not.toContain(source("history-0").source_id);
    expect(restored.resolve(source("history-0").source_id)?.source_id).toBe(
      source("history-0").source_id,
    );
    const bounded = new SourceRegistry();
    for (let index = 0; index < 501; index++)
      bounded.register(source(`answer-${index}`), ["search"]);
    expect(bounded.resolve(source("answer-499").source_id)).toBeDefined();
    expect(bounded.resolve(source("answer-500").source_id)).toBeUndefined();
    expect(bounded.diagnostics).toContainEqual(
      expect.objectContaining({ code: "budget_exceeded" }),
    );
  });
});
