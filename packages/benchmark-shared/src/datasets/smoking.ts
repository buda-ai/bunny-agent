/**
 * Smoking Coding Benchmark
 *
 * Quick validation tests for basic coding agent capabilities
 */

export interface SmokingTask {
  id: string;
  name: string;
  description: string;
  expectedOutput: string | RegExp;
  category: "file" | "code" | "bash" | "reasoning";
  timeoutMs: number;
}

/**
 * Smoking test suite - fast validation of basic capabilities
 */
export const SMOKING_TESTS: SmokingTask[] = [
  {
    id: "smoke-001",
    name: "Create Hello World",
    description:
      "Create a file named hello.txt with content 'Hello, World!' and return ONLY the content of the file",
    expectedOutput: /Hello,?\s*World!?/i,
    category: "file",
    timeoutMs: 90000,
  },
  {
    id: "smoke-002",
    name: "Simple Math",
    description: "Calculate 123 + 456 and return ONLY the number result",
    expectedOutput: /579/,
    category: "reasoning",
    timeoutMs: 30000,
  },
  {
    id: "smoke-003",
    name: "List Files",
    description: "List all .txt files in the current directory",
    expectedOutput: /\.txt/,
    category: "bash",
    timeoutMs: 60000, // Claude Agent SDK Bash tool needs more time
  },
  {
    id: "smoke-004",
    name: "Write Python Script",
    description: "Create a Python script that prints 'Hello from Python'",
    expectedOutput: /print.*Hello from Python/i,
    category: "code",
    timeoutMs: 90000,
  },
  {
    id: "smoke-005",
    name: "JSON Parse",
    description:
      'Parse this JSON and return ONLY the value of the \'name\' field: {"name":"test","value":42}',
    expectedOutput: /test/,
    category: "reasoning",
    timeoutMs: 30000,
  },
];

/**
 * Get smoking test by ID
 */
export function getSmokingTest(id: string): SmokingTask | undefined {
  return SMOKING_TESTS.find((t) => t.id === id);
}

/**
 * Get all smoking tests
 */
export function getAllSmokingTests(): SmokingTask[] {
  return SMOKING_TESTS;
}

/**
 * Get smoking tests by category
 */
export function getSmokingTestsByCategory(
  category: SmokingTask["category"],
): SmokingTask[] {
  return SMOKING_TESTS.filter((t) => t.category === category);
}
