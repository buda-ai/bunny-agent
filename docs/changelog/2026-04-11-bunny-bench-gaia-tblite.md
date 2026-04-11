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

# Run a single GAIA task
bunny-bench --dataset gaia-l1 --id gaia-l1-e1fc63a2

# Run TBLite easy tasks (requires Docker)
bunny-bench --dataset tblite-easy --runner "bunny --print"
```
