/**
 * SandAgent Benchmark
 *
 * GAIA benchmark runner for comparing agent CLIs
 */

// Types
export type {
  GaiaTask,
  GaiaFile,
  GaiaLevel,
  TaskCategory,
  AgentRunner,
  BenchmarkConfig,
  BenchmarkResult,
  BenchmarkReport,
  BenchmarkMetadata,
  RunnerConfig,
  ComparisonResult,
  ComparisonSummary,
} from "./types.js";

// Downloader
export {
  downloadGaiaDataset,
  saveTasksToJson,
  loadTasksFromJson,
  getFileDataUrl,
} from "./downloader.js";

// Runner
export {
  runTask,
  runTaskWithReflection,
  normalizeAnswer,
  checkAnswer,
  isRunnerAvailable,
  getAvailableRunners,
  createRunnerConfig,
} from "./runner.js";

// Evaluator
export {
  categorizeTask,
  filterTasks,
  loadCheckpoint,
  saveResults,
  displaySummary,
  runBenchmark,
} from "./evaluator.js";

// Comparison
export {
  loadRunnerResults,
  loadAllRunnerResults,
  compareResults,
  generateComparisonSummary,
  displayComparisonTable,
  generateMarkdownReport,
  saveComparisonReport,
} from "./compare.js";
