/**
 * SWE-bench Lite Dataset
 * 
 * Lightweight version of SWE-bench for testing code editing capabilities
 * https://www.swebench.com/
 */

export interface SWEBenchTask {
  id: string;
  repo: string;
  instance_id: string;
  base_commit: string;
  patch: string;
  test_patch: string;
  problem_statement: string;
  hints_text: string;
  created_at: string;
  version: string;
  FAIL_TO_PASS: string;
  PASS_TO_PASS: string;
}

/**
 * Download SWE-bench Lite dataset
 * 
 * TODO: Implement download from Hugging Face
 * Dataset: princeton-nlp/SWE-bench_Lite
 */
export async function downloadSWEBenchLite(): Promise<void> {
  console.log("SWE-bench Lite download not yet implemented");
  console.log("Dataset: https://huggingface.co/datasets/princeton-nlp/SWE-bench_Lite");
  throw new Error("Not implemented");
}

/**
 * Load SWE-bench Lite tasks
 */
export async function loadSWEBenchTasks(): Promise<SWEBenchTask[]> {
  throw new Error("Not implemented");
}
