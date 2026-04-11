import type { Task } from "./types.js";
import { GAIA_L1, GAIA_L2, GAIA_L3, GAIA_ALL, GAIA_FULL } from "./datasets/gaia.js";
import { TBLITE_EASY, TBLITE_MEDIUM, TBLITE_ALL } from "./datasets/tblite.js";

export { GAIA_L1, GAIA_L2, GAIA_L3, GAIA_ALL, GAIA_FULL };
export { TBLITE_EASY, TBLITE_MEDIUM, TBLITE_ALL };

/**
 * Smoking dataset — fast validation of core bunny capabilities.
 * Covers: reasoning, web tools, code/file tools.
 */
export const SMOKING: Task[] = [
  // --- Reasoning (no tools needed) ---
  {
    id: "s-001",
    name: "Simple math",
    prompt: "What is 123 + 456? Reply with ONLY the number.",
    expected: /579/,
    category: "reasoning",
    timeoutMs: 30_000,
  },
  {
    id: "s-002",
    name: "JSON extract",
    prompt: 'Extract the value of "name" from this JSON and reply with ONLY that value: {"name":"bunny","version":1}',
    expected: /bunny/i,
    category: "reasoning",
    timeoutMs: 30_000,
  },
  {
    id: "s-003",
    name: "Capital city",
    prompt: "What is the capital of France? Reply with ONLY the city name.",
    expected: /paris/i,
    category: "reasoning",
    timeoutMs: 30_000,
  },

  // --- Web tools ---
  {
    id: "s-004",
    name: "Web search",
    prompt: "Use web_search to find the current year. Reply with ONLY the 4-digit year.",
    expected: /20\d\d/,
    category: "tool:web",
    timeoutMs: 60_000,
  },
  {
    id: "s-005",
    name: "Web fetch",
    prompt: "Use web_fetch to get https://example.com and reply with ONLY the word 'success' if you got a response.",
    expected: /success/i,
    category: "tool:web",
    timeoutMs: 60_000,
  },

  // --- Code / file tools ---
  {
    id: "s-006",
    name: "Create file",
    prompt: "Create a file named bench_test.txt with content 'hello bunny'. Then reply with ONLY the file content.",
    expected: /hello bunny/i,
    category: "tool:file",
    timeoutMs: 90_000,
  },
  {
    id: "s-007",
    name: "Run bash",
    prompt: "Run `echo 'bench_ok'` in bash and reply with ONLY the output.",
    expected: /bench_ok/,
    category: "tool:code",
    timeoutMs: 60_000,
  },
  {
    id: "s-008",
    name: "Write Python",
    prompt: "Write a Python script that prints 'py_ok', run it, and reply with ONLY the output.",
    expected: /py_ok/,
    category: "tool:code",
    timeoutMs: 90_000,
  },
];

export const DATASETS: Record<string, Task[]> = {
  smoking: SMOKING,
  "gaia-l1": GAIA_L1,
  "gaia-l2": GAIA_L2,
  "gaia-l3": GAIA_L3,
  "gaia-all": GAIA_ALL,
  "gaia-full": GAIA_FULL,
  "tblite-easy": TBLITE_EASY,
  "tblite-medium": TBLITE_MEDIUM,
  "tblite-all": TBLITE_ALL,
};
