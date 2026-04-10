# Benchmark New Features Guide

## New Features

This update adds four high-priority features:

1. ✅ **Wrong Answers Tracking** - Automatically tracks failed tasks and supports re-running them
2. ✅ **Reflection Helper** - Reflection prompt tool to help improve agent performance
3. ✅ **Resume/Checkpoint** - Checkpoint resume support (already integrated)
4. ✅ **README Matrix Auto-Update** - Automatically updates the benchmark results matrix in README

## README Matrix Auto-Update

### Feature Description

After running a full benchmark, the results matrix table in README.md is automatically updated. The matrix shows:
- Horizontal axis: different agent runners
- Vertical axis: different configurations (dataset/level)
- Cells: correct/total (accuracy %)

### When It Updates

**Scenarios that trigger auto-update:**
- Running a full dataset: `pnpm benchmark:run --runner sandagent`
- Running a full level: `pnpm benchmark:run --runner sandagent --level 1`
- Running a full category: `pnpm benchmark:run --runner sandagent --category code`

**Scenarios that do NOT trigger update:**
- Limiting task count: `--limit 10`
- Random single task: `--random`
- Specific task: `--task-id abc123`

### Viewing Results

The updated matrix appears in the "Benchmark Results Overview" section of [README.md](README.md#benchmark-results-overview).

Example output:

```
✅ Benchmark completed!
📝 Updating README matrix...
✅ README.md matrix updated
```

### Programmatic Interface

```typescript
import { shouldUpdateReadme, updateReadmeMatrix } from "@sandagent/benchmark";

// Check whether README should be updated
const config = { dataset: "validation", level: 1, outputDir: "./results" };
if (shouldUpdateReadme(config)) {
  updateReadmeMatrix(config.outputDir);
}
```

## Answer Extractor

### Feature Description

Optimized answer extraction logic inspired by AI SDK UIMessage stream parsing:

1. **Structured SSE Parsing** - Parses SSE streams into structured message objects
2. **Priority Pattern Matching** - Tries multiple answer patterns in priority order
3. **Tool Output Parsing** - Intelligently extracts answers from tool execution results

### Supported Answer Patterns

| Priority | Pattern | Example |
|----------|---------|---------|
| 1 | FINAL ANSWER marker | `FINAL ANSWER: 42` |
| 2 | Ball number pattern | `Ball #3 has the highest` → `3` |
| 3 | TaskOutput tool | `{ content: "Paris" }` → `Paris` |
| 4 | stdout ANSWER | `ANSWER: 100` → `100` |
| 5 | Bold text | `**The answer is 42**` → `42` |
| 6 | Number pattern | `equals 256` → `256` |
| 7 | List pattern | `comma-separated: a, b, c` → `a, b, c` |

### Programmatic Interface

```typescript
import {
  parseSSEToMessage,
  extractAnswerFromMessage,
  extractAnswerFromSSE,
} from "@sandagent/benchmark";

// Option 1: Extract directly from SSE
const answer = extractAnswerFromSSE(sseOutput);

// Option 2: Step-by-step parsing
const message = parseSSEToMessage(sseOutput);
console.log(message.textContent);     // Text content
console.log(message.toolOutputs);     // Tool output list
const answer = extractAnswerFromMessage(message);
```

## Wrong Answers Feature

### Automatic Tracking

After running any benchmark, failed tasks are automatically saved to `wrong-answers.json`:

```bash
# Run benchmark
pnpm benchmark:run --runner sandagent --limit 10

# Failed tasks are automatically recorded to benchmark-results/wrong-answers.json
```

### Re-running Failed Tasks

```bash
# Re-run all failed tasks
pnpm benchmark:run --runner sandagent wrong

# Re-run only Level 1 failed tasks
pnpm benchmark:run --runner sandagent wrong --level 1

# Re-run first 5 failed tasks with verbose output
pnpm benchmark:run --runner sandagent wrong --limit 5 --verbose
```

### Viewing Failure Statistics

```bash
# The CLI automatically displays a wrong answers summary
# Includes: total count, grouped by level, most-attempted tasks, etc.
```

### Workflow

```
Run Benchmark
     ↓
  Failures? ─No→ Done!
     ↓ Yes
Save to wrong-answers.json
     ↓
Analyze failure reasons
     ↓
Improve agent/prompt
     ↓
Re-run failed tasks (wrong command)
     ↓
Passing tasks are automatically removed
     ↓
Repeat until all pass
```

## Reflection Helper Feature

### What is Reflection?

Periodically pausing during agent execution to "reflect":
- What have I learned?
- Am I closer to the answer?
- What should I do next?

This helps agents avoid:
- Repeating the same failed operations
- Getting stuck in infinite loops
- Running out of steps without finding an answer

### When to Trigger Reflection

```typescript
import { shouldTriggerReflection } from "@sandagent/benchmark";

// In your agent loop
const shouldReflect = shouldTriggerReflection({
  stepCount: currentStep,
  maxSteps: 20,
  lastCommand: "search",
  commandHistory: recentCommands,
  hasError: hadError,
});

if (shouldReflect) {
  // Inject reflection prompt
}
```

Trigger conditions:
- ✅ Every 3 steps (but not too early)
- ✅ Approaching step limit (80%)
- ✅ An error occurred
- ✅ Same tool used 3+ times consecutively

### Reflection Prompt Styles

```typescript
import { buildReflectionPrompt, REFLECTION_PROMPTS } from "@sandagent/benchmark";

// 1. Basic (recommended) - 3 simple questions
const basicPrompt = buildReflectionPrompt({
  stepNumber: 5,
  totalSteps: 20,
  lastCommand: "search",
}, "basic");

// 2. Detailed - comprehensive progress review
const detailedPrompt = buildReflectionPrompt({
  stepNumber: 5,
  totalSteps: 20,
}, "detailed");

// 3. Quick - one-line prompt
const quickPrompt = buildReflectionPrompt({
  stepNumber: 5,
  totalSteps: 20,
}, "quick");

// 4. Auto-detect special scenarios
const errorPrompt = buildReflectionPrompt({
  stepNumber: 5,
  totalSteps: 20,
  hasError: true,  // Automatically uses error recovery prompt
});

const stuckPrompt = buildReflectionPrompt({
  stepNumber: 5,
  totalSteps: 20,
  isRepeating: true,  // Automatically uses loop-breaking prompt
});
```

### Additional Helper Functions

#### Pre-execution Prompt (by task level)

```typescript
import { buildPreExecutionPrompt } from "@sandagent/benchmark";

// Generate guidance prompt for different task levels
const prompt = buildPreExecutionPrompt(1); // Level 1 simple tasks
const prompt = buildPreExecutionPrompt(2); // Level 2 medium tasks
const prompt = buildPreExecutionPrompt(3); // Level 3 hard tasks
```

#### Verification Prompt (self-check before answering)

```typescript
import { buildVerificationPrompt } from "@sandagent/benchmark";

// Inject a self-check prompt before giving the final answer
if (containsFinalAnswer(output)) {
  const verifyPrompt = buildVerificationPrompt();
  // Let the agent verify the answer once more
}
```

### Integrating into Your Runner

To use this in sandagent (requires modifying agent code):

```typescript
// In the agent's main loop
let stepCount = 0;
const commandHistory: string[] = [];

while (stepCount < maxSteps && !hasAnswer) {
  // Execute step
  const result = await executeStep();
  stepCount++;
  commandHistory.push(result.command);

  // Check whether reflection is needed
  const shouldReflect = shouldTriggerReflection({
    stepCount,
    maxSteps,
    lastCommand: result.command,
    commandHistory,
    hasError: result.error,
  });

  if (shouldReflect) {
    // Generate and inject reflection prompt
    const prompt = buildReflectionPrompt({
      stepNumber: stepCount,
      totalSteps: maxSteps,
      lastCommand: result.command,
      hasError: result.error,
      isRepeating: commandHistory.slice(-3).every(c => c === result.command),
    });

    // Send prompt to agent
    await sendToAgent(prompt);
  }
}
```

## Resume/Checkpoint Feature

### Checkpoint Resume

Long-running benchmarks may be interrupted for various reasons (network, API limits, etc.):

```bash
# Start running a large number of tasks
pnpm benchmark:run --runner sandagent --limit 100

# If interrupted, use --resume to continue
pnpm benchmark:run --runner sandagent --limit 100 --resume
```

### How It Works

1. After each completed task, results are automatically saved to `{runner}-{dataset}-latest.json`
2. With `--resume`, execution continues from the last checkpoint
3. Already-completed tasks are skipped
4. A complete result file is generated at the end

### Incremental Saving

All benchmark runs:
- ✅ Save incrementally to `latest.json` in real time
- ✅ Generate a timestamped final file on completion
- ✅ Automatically update wrong-answers.json

## Practical Examples

### Scenario 1: First Run

```bash
# 1. Download dataset (if not already done)
pnpm benchmark:download --dataset validation

# 2. Run 10 tasks as a test
pnpm benchmark:run --runner sandagent --limit 10 --verbose

# 3. View results
# - benchmark-results/sandagent-validation-latest.json
# - benchmark-results/wrong-answers.json
```

### Scenario 2: Iterative Improvement

```bash
# 1. Run benchmark
pnpm benchmark:run --runner sandagent --limit 20

# 2. Suppose 5 tasks failed
# Review wrong-answers.json to analyze failure reasons

# 3. Improve agent or prompt

# 4. Re-run only the failed tasks
pnpm benchmark:wrong --runner sandagent

# 5. Repeat until all pass
```

### Scenario 3: Long-Running Benchmark

```bash
# 1. Start running all validation tasks
pnpm benchmark:run --runner sandagent

# 2. If interrupted (e.g. API rate limit)
# Wait a while, then continue

# 3. Use --resume to continue from checkpoint
pnpm benchmark:run --runner sandagent --resume
```

### Scenario 4: Comparing Different Runners

```bash
# 1. Run multiple runners
pnpm benchmark:run --runner sandagent --limit 50
pnpm benchmark:run --runner claudecode --limit 50
pnpm benchmark:run --runner opencode --limit 50

# 2. Compare results
pnpm benchmark:compare

# 3. Review each runner's wrong answers
# - Identify tasks that are commonly difficult
# - Identify tasks where a specific runner performs better
```

## Output Files

After a run, the following files are generated:

```
benchmark-results/
├── sandagent-validation-latest.json    # Latest results (incremental)
├── sandagent-validation-2024-...json   # Timestamped final results
└── wrong-answers.json                   # Failed task collection
```

## Programmatic Interface

```typescript
import {
  runBenchmark,
  loadWrongAnswers,
  getWrongAnswerTaskIds,
  displayWrongAnswersSummary,
  shouldTriggerReflection,
  buildReflectionPrompt,
} from "@sandagent/benchmark";

// 1. Load wrong answers
const wrongAnswers = await loadWrongAnswers("./benchmark-results");
console.log(`Total wrong: ${wrongAnswers.metadata.totalWrong}`);

// 2. Get failed task IDs
const wrongIds = await getWrongAnswerTaskIds("./benchmark-results");

// 3. Use reflection in a task
const shouldReflect = shouldTriggerReflection({
  stepCount: 5,
  maxSteps: 20,
  commandHistory: ["search", "search", "calculate"],
  lastCommand: "calculate",
});

if (shouldReflect) {
  const prompt = buildReflectionPrompt({
    stepNumber: 5,
    totalSteps: 20,
    lastCommand: "calculate",
  }, "basic");
  // Use prompt
}
```

## Best Practices

1. **Iterative Improvement**
   - Start with a small sample (`--limit 10`)
   - Review wrong answers to identify failure patterns
   - Use the `wrong` command to verify improvements
   - Then scale up to the full dataset

2. **Using Reflection**
   - Especially effective for long tasks
   - The basic prompt is the most balanced
   - Always reflect after an error

3. **Resume Strategy**
   - For large batches, consider running in chunks
   - Use resume when hitting API limits
   - Periodically check latest.json

4. **Comparative Analysis**
   - Run multiple runners on the same dataset
   - Use the compare command to contrast results
   - Analyze each runner's strengths and weaknesses

## FAQ

**Q: Is wrong-answers.json automatically cleaned up?**
A: Yes, tasks are automatically removed when they pass. Delete the file manually to reset.

**Q: Does Reflection increase execution time?**
A: Slightly (once every 3 steps), but it avoids more wasted steps overall and may be faster in total.

**Q: What is the difference between Resume and the wrong command?**
A: Resume continues unfinished tasks; wrong re-runs already-failed tasks.

**Q: Can --resume and --wrong be used together?**
A: Not recommended — the wrong command does not use resume by default.

## Next Steps

1. Try running a small benchmark
2. Review the generated wrong-answers.json
3. Use the wrong command to re-run failures
4. Optionally integrate reflection into your agent
