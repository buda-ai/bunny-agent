import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { WebSearchCallRecord } from "@bunny-agent/manager/contracts";
import { buildSync } from "esbuild";
import { describe, expect, it } from "vitest";
import { CitationTextProcessor } from "../citation-processor.js";
import { SourceRegistry } from "../source-registry.js";

// Bundle the sibling tool's source, so this integration checks the current
// implementation without adding a production dependency or relying on dist.
const harnessTool = buildSync({
  entryPoints: [
    fileURLToPath(
      new URL(
        "../../../runner-harness/src/tools/web-search.ts",
        import.meta.url,
      ),
    ),
  ],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
}).outputFiles[0].text;

describe("Harness search to Pi citation projection", () => {
  it.each([
    "brave",
    "tavily",
  ])("links duplicate %s result rows to the same canonical source after an empty search", (provider) => {
    const script = `${harnessTool}
        const provider = ${JSON.stringify(provider)};
        const rows = [
          {title: "A", url: "https://example.com/a", description: "A", content: "A"},
          {title: "A again", url: "https://EXAMPLE.com/a", description: "A again", content: "A again"},
          {title: "B", url: "https://example.com/b", description: "B", content: "B"},
        ];
        const responses = [[], rows];
        globalThis.fetch = async () => ({
          ok: true, status: 200,
          json: async () => {
            const results = responses.shift();
            return provider === "brave" ? {web: {results}} : {results};
          },
        });
        const tool = buildWebSearchTool(
          provider === "brave" ? {BRAVE_API_KEY: "fixture"} : {TAVILY_API_KEY: "fixture"}, 1,
        );
        const empty = await tool.execute("empty-search", {query: "no hits"});
        const result = await tool.execute("search", {query: "A and B"});
        console.log(JSON.stringify({empty, result}));
      `;
    const output = execFileSync(
      process.execPath,
      ["--input-type=module", "--eval", script],
      { encoding: "utf8" },
    );
    const { empty, result } = JSON.parse(output) as {
      empty: { details: { web_search: WebSearchCallRecord } };
      result: {
        content: Array<{ text: string }>;
        details: { web_search: WebSearchCallRecord };
      };
    };
    expect(result.details.web_search.results).toHaveLength(3);
    expect(result.details.web_search.action.sources).toHaveLength(2);
    const markers = [
      ...result.content[0].text.matchAll(/^Citation Marker: (.+)$/gm),
    ].map((match) => match[1]);
    expect(markers).toHaveLength(3);

    const registry = new SourceRegistry();
    registry.registerSearch(empty.details.web_search);
    registry.registerSearch(result.details.web_search);
    const processor = new CitationTextProcessor(
      "answer",
      "explicit-marker",
      registry,
      new Map(),
    );
    const rendered = processor.push(markers.join(" ")) + processor.finish();
    expect(rendered).toBe("[1] [1] [2]");
    expect(processor.metadata.annotations.map(({ url }) => url)).toEqual([
      "https://example.com/a",
      "https://example.com/a",
      "https://example.com/b",
    ]);
    expect(
      processor.metadata.bindings.map(({ tool_call_ids }) => tool_call_ids),
    ).toEqual([["search"], ["search"], ["search"]]);
    expect(processor.metadata.processing).toBe("complete");
    expect(processor.metadata.diagnostics ?? []).toEqual([]);
  });
});
