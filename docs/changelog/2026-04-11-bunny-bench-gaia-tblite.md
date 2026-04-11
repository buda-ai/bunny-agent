# bunny-bench: GAIA + TBLite Benchmark Datasets

## Summary

Added two standard benchmark datasets to `apps/bunny-bench`, downloadable from HuggingFace.

## Changes

### `apps/bunny-bench/`

**New files:**
- `scripts/download-datasets.py` — unified download script for all datasets (`gaia`, `tblite`)
- `scripts/download-gaia.py` — standalone GAIA-only download script
- `src/datasets/gaia.ts` — GAIA benchmark dataset loader (all 3 levels, with/without file filter)
- `src/datasets/tblite.ts` — TBLite dataset loader + Docker-based task runner
- `.gitignore` — ignores `data/` directory (downloaded data files, up to ~11 MB)

**Modified:**
- `src/datasets.ts` — registers `gaia-l1`, `gaia-l2`, `gaia-l3`, `gaia-all`, `gaia-full`, `tblite-easy`, `tblite-medium`, `tblite-all`
- `src/runner.ts` — fixed `stderr` destructuring bug; routes `tblite-*` task IDs to Docker runner
- `src/index.ts` — updated `--help` text listing all datasets with descriptions

## New Datasets

### GAIA (`gaia-benchmark/GAIA`, validation split)

| Dataset | Tasks | Notes |
|---------|-------|-------|
| `gaia-l1` | 42 | Level 1, no file attachments, local |
| `gaia-l2` | 66 | Level 2, no file attachments, local |
| `gaia-l3` | 19 | Level 3, no file attachments, local |
| `gaia-all` | 127 | All levels, no file attachments |
| `gaia-full` | 165 | All tasks including file-attachment ones |

Scoring: case-insensitive word-boundary match against `Final answer`.  
No Docker required. Agent needs web search + multi-step reasoning.

### TBLite (`NousResearch/openthoughts-tblite`)

| Dataset | Tasks | Notes |
|---------|-------|-------|
| `tblite-easy` | 24 | Easy tasks, Docker-based |
| `tblite-medium` | 43 | Medium tasks, Docker-based |
| `tblite-all` | 100 | All 100 tasks |

Each task uses a pre-built Docker image. The runner:
1. Starts the task container (`docker run -d ... sleep 3600`)
2. Extracts `environment_tar` into the container
3. Runs the agent with the original instruction + Docker exec context injected into the prompt
4. Uploads `tests_tar` and runs `test_sh` inside the container
5. Reads `/logs/verifier/reward.txt` for pass/fail (`1` = pass)
6. Removes the container on completion

## Usage

```bash
# Download all datasets (one-time setup)
pip install datasets
python scripts/download-datasets.py

# Run GAIA Level 1
bunny-bench --dataset gaia-l1 --runner "bunny --print"

# Run a random sample of 5 tasks
bunny-bench --dataset gaia-l1 --limit 5

# Run only previously failed tasks (wrong-answer book)
bunny-bench --dataset gaia-l1 --only-failed

# Run a single GAIA task
bunny-bench --dataset gaia-l1 --id gaia-l1-e1fc63a2

# Run TBLite easy tasks (requires Docker)
bunny-bench --dataset tblite-easy --runner "bunny --print"
```

## Benchmark Results

First full GAIA L1 run with `openai-compatible/gemini-3.1-pro` (2026-04-11):

| Metric | Score |
|--------|-------|
| **Overall** | **31/42 (74%)** |
| tool:web | 20/26 (77%) |
| reasoning | 11/16 (69%) |
| Duration | ~34 min |

Failures: 8 timeouts (web-search tasks hitting 120s limit) + 3 wrong answers.  
Ledger saved to `benchmark-results/bunny/gaia-l1-ledger.json`.

## Wrong-Answer Ledger (`--only-failed`)

Each run updates `benchmark-results/bunny/{dataset}-ledger.json` tracking per-task
`passCount`, `failCount`, `lastPassed`, `lastRunAt`.

Use `--only-failed` on subsequent runs to drill only on unsolved tasks — tasks with
`passCount === 0`. Once all tasks are solved, the command exits immediately with a
success message.

