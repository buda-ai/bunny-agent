import { describe, expect, it } from "vitest";
import { categorizeTask, filterTasks } from "../evaluator.js";
import type { BenchmarkConfig, GaiaTask } from "../types.js";

describe("categorizeTask", () => {
  const createTask = (question: string, hasFiles = false): GaiaTask => ({
    id: "test-task",
    question,
    level: 1,
    answer: "test answer",
    files: hasFiles
      ? [{ name: "test.txt", path: "/test.txt", type: "text/plain" }]
      : undefined,
  });

  it("should categorize tasks with files as 'files'", () => {
    const task = createTask("What is in this image?", true);
    const categories = categorizeTask(task);
    expect(categories).toContain("files");
  });

  it("should categorize calculation tasks as 'code'", () => {
    const task = createTask("Calculate the sum of 2 + 3");
    const categories = categorizeTask(task);
    expect(categories).toContain("code");
  });

  it("should categorize compute tasks as 'code'", () => {
    const task = createTask("Compute the factorial of 5");
    const categories = categorizeTask(task);
    expect(categories).toContain("code");
  });

  it("should categorize search tasks as 'search'", () => {
    const task = createTask("Search for articles about AI");
    const categories = categorizeTask(task);
    expect(categories).toContain("search");
  });

  it("should categorize Wikipedia tasks as 'search'", () => {
    const task = createTask("Find the Wikipedia page about Python");
    const categories = categorizeTask(task);
    expect(categories).toContain("search");
  });

  it("should categorize browser tasks as 'browser'", () => {
    const task = createTask("Navigate to google.com and take a screenshot");
    const categories = categorizeTask(task);
    expect(categories).toContain("browser");
  });

  it("should categorize pure reasoning tasks as 'reasoning'", () => {
    const task = createTask("What color is the sky?");
    const categories = categorizeTask(task);
    expect(categories).toContain("reasoning");
  });

  it("should return multiple categories when applicable", () => {
    const task = createTask("Calculate the result from this spreadsheet", true);
    const categories = categorizeTask(task);
    expect(categories).toContain("files");
    expect(categories).toContain("code");
  });
});

describe("filterTasks", () => {
  const createTasks = (): GaiaTask[] => [
    { id: "task-1", question: "Level 1 question", level: 1, answer: "answer1" },
    { id: "task-2", question: "Level 2 question", level: 2, answer: "answer2" },
    { id: "task-3", question: "Level 3 question", level: 3, answer: "answer3" },
    { id: "task-4", question: "Another level 1", level: 1, answer: "answer4" },
  ];

  const createConfig = (
    overrides: Partial<BenchmarkConfig> = {},
  ): BenchmarkConfig => ({
    dataset: "validation",
    outputDir: "./results",
    verbose: false,
    ...overrides,
  });

  it("should return all tasks with no filters", () => {
    const tasks = createTasks();
    const config = createConfig();
    const filtered = filterTasks(tasks, config);
    expect(filtered.length).toBe(4);
  });

  it("should filter by level", () => {
    const tasks = createTasks();
    const config = createConfig({ level: 1 });
    const filtered = filterTasks(tasks, config);
    expect(filtered.length).toBe(2);
    expect(filtered.every((t) => t.level === 1)).toBe(true);
  });

  it("should filter by specific task ID", () => {
    const tasks = createTasks();
    const config = createConfig({ taskId: "task-2" });
    const filtered = filterTasks(tasks, config);
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe("task-2");
  });

  it("should throw error for non-existent task ID", () => {
    const tasks = createTasks();
    const config = createConfig({ taskId: "non-existent" });
    expect(() => filterTasks(tasks, config)).toThrow(
      'Task with ID "non-existent" not found',
    );
  });

  it("should limit number of tasks", () => {
    const tasks = createTasks();
    const config = createConfig({ limit: 2 });
    const filtered = filterTasks(tasks, config);
    expect(filtered.length).toBe(2);
  });

  it("should return random single task", () => {
    const tasks = createTasks();
    const config = createConfig({ random: true });
    const filtered = filterTasks(tasks, config);
    expect(filtered.length).toBe(1);
    expect(tasks).toContainEqual(filtered[0]);
  });

  it("should combine level and limit filters", () => {
    const tasks = createTasks();
    const config = createConfig({ level: 1, limit: 1 });
    const filtered = filterTasks(tasks, config);
    expect(filtered.length).toBe(1);
    expect(filtered[0].level).toBe(1);
  });
});
