/**
 * Wrong answers collection manager
 * Tracks incorrect answers and provides retry functionality
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BenchmarkResult, GaiaTask } from "./types.js";

export interface WrongAnswerEntry {
  taskId: string;
  question: string;
  expectedAnswer: string;
  agentAnswer: string;
  level: number;
  firstFailedAt: string;
  lastFailedAt: string;
  attemptCount: number;
  error?: string;
  rawOutput?: string;
}

export interface WrongAnswersCollection {
  metadata: {
    totalWrong: number;
    lastUpdated: string;
  };
  tasks: Record<string, WrongAnswerEntry>;
}

const WRONG_ANSWERS_FILE = "wrong-answers.json";

/**
 * Load wrong answers collection from file
 */
export async function loadWrongAnswers(
  outputDir: string,
): Promise<WrongAnswersCollection> {
  const filepath = join(outputDir, WRONG_ANSWERS_FILE);

  if (!existsSync(filepath)) {
    return {
      metadata: {
        totalWrong: 0,
        lastUpdated: new Date().toISOString(),
      },
      tasks: {},
    };
  }

  try {
    const content = await readFile(filepath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.warn(`⚠️  Failed to load wrong answers: ${error}`);
    return {
      metadata: {
        totalWrong: 0,
        lastUpdated: new Date().toISOString(),
      },
      tasks: {},
    };
  }
}

/**
 * Save wrong answers collection to file
 */
export async function saveWrongAnswers(
  collection: WrongAnswersCollection,
  outputDir: string,
): Promise<void> {
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  const filepath = join(outputDir, WRONG_ANSWERS_FILE);

  collection.metadata.totalWrong = Object.keys(collection.tasks).length;
  collection.metadata.lastUpdated = new Date().toISOString();

  await writeFile(filepath, JSON.stringify(collection, null, 2));
}

/**
 * Update wrong answers collection based on benchmark results
 */
export async function updateWrongAnswers(
  results: BenchmarkResult[],
  tasks: GaiaTask[],
  outputDir: string,
): Promise<void> {
  const collection = await loadWrongAnswers(outputDir);
  const now = new Date().toISOString();

  // Create a map of tasks for quick lookup
  const taskMap = new Map(tasks.map((task) => [task.id, task]));

  for (const result of results) {
    const task = taskMap.get(result.taskId);
    if (!task) continue;

    if (result.correct) {
      // Remove from wrong answers if it was there
      if (collection.tasks[result.taskId]) {
        delete collection.tasks[result.taskId];
        console.log(
          `✅ Removed ${result.taskId} from wrong answers (now correct)`,
        );
      }
    } else {
      // Add or update wrong answer entry
      const existing = collection.tasks[result.taskId];

      collection.tasks[result.taskId] = {
        taskId: result.taskId,
        question: task.question,
        expectedAnswer: result.expectedAnswer,
        agentAnswer: result.answer,
        level: task.level,
        firstFailedAt: existing?.firstFailedAt || now,
        lastFailedAt: now,
        attemptCount: (existing?.attemptCount || 0) + 1,
        error: result.error,
        rawOutput: result.rawOutput,
      };

      if (existing) {
        console.log(
          `📝 Updated ${result.taskId} wrong answer (attempt #${collection.tasks[result.taskId].attemptCount})`,
        );
      } else {
        console.log(`❌ Added ${result.taskId} to wrong answers`);
      }
    }
  }

  await saveWrongAnswers(collection, outputDir);

  const wrongCount = Object.keys(collection.tasks).length;
  if (wrongCount > 0) {
    console.log(`\n📚 Wrong answers collection: ${wrongCount} tasks`);
    console.log(`   File: ${join(outputDir, WRONG_ANSWERS_FILE)}`);
  } else {
    console.log("\n🎉 No wrong answers! All tasks passed.");
  }
}

/**
 * Get list of task IDs from wrong answers collection
 */
export async function getWrongAnswerTaskIds(
  outputDir: string,
): Promise<string[]> {
  const collection = await loadWrongAnswers(outputDir);
  return Object.keys(collection.tasks);
}

/**
 * Display wrong answers summary
 */
export async function displayWrongAnswersSummary(
  outputDir: string,
): Promise<void> {
  const collection = await loadWrongAnswers(outputDir);
  const wrongCount = Object.keys(collection.tasks).length;

  if (wrongCount === 0) {
    console.log("\n🎉 No wrong answers! All previous tasks passed.");
    return;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("📚 Wrong Answers Collection");
  console.log("=".repeat(60));
  console.log(`Total wrong:     ${wrongCount}`);
  console.log(
    `Last updated:    ${new Date(collection.metadata.lastUpdated).toLocaleString()}`,
  );

  // Group by level
  const byLevel: Record<number, WrongAnswerEntry[]> = {};
  for (const entry of Object.values(collection.tasks)) {
    if (!byLevel[entry.level]) {
      byLevel[entry.level] = [];
    }
    byLevel[entry.level].push(entry);
  }

  console.log("\nBy difficulty level:");
  for (const level of [1, 2, 3]) {
    const count = byLevel[level]?.length || 0;
    console.log(`  Level ${level}: ${count} tasks`);
  }

  console.log("\nTop 5 most attempted:");
  const sorted = Object.values(collection.tasks)
    .sort((a, b) => b.attemptCount - a.attemptCount)
    .slice(0, 5);

  for (const entry of sorted) {
    const questionPreview =
      entry.question.length > 60
        ? `${entry.question.substring(0, 60)}...`
        : entry.question;
    console.log(
      `  [${entry.attemptCount}x] ${entry.taskId.substring(0, 8)}... - ${questionPreview}`,
    );
  }

  console.log(`\n${"=".repeat(60)}\n`);
}
