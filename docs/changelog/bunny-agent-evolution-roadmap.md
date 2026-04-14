# Bunny Agent — Evolution Flywheel Roadmap

## Vision

Bunny Agent evolves through a **skills + benchmark flywheel**:
- Run benchmarks → find failures → extract skills → re-run → pass rate improves
- No model training needed. Evolution happens at the tools/prompt/skills layer.

---

## Phase 1 — Benchmark Foundation (Now)

**Goal:** Know where bunny stands. Establish baseline.

### 1.1 Migrate bunny-agent benchmark → bunny
- [x] Add `bunny` runner to `packages/benchmark-cli/src/runners/bunny.ts`
  - Uses pi's `--print` mode (non-interactive, plain text output)
  - Registered in `AgentRunner` type + runners registry
- [ ] Run existing GAIA smoking test with bunny runner (needs valid API key/OAuth)
- [ ] Record baseline pass rate

### 1.2 Add SWE-bench Verified
- [ ] New runner environment: `packages/benchmark-cli/src/runners/swe-bench.ts`
- [ ] Dataset: `princeton-nlp/SWE-bench_Verified` (500 real GitHub issues)
- [ ] Scoring: patch applied → tests pass → binary 1/0
- [ ] Requires E2B/Sandock sandbox per task (already have)
- [ ] Target: establish bunny baseline on SWE-bench

### 1.3 CI integration
- [ ] GitHub Action: run smoking test on every PR
- [ ] Report pass rate delta in PR comment
- [ ] Block merge if pass rate drops > 5%

---

## Phase 2 — Skills Flywheel (Next)

**Goal:** Learn from failures. Auto-accumulate skills.

### 2.1 Failure analysis pipeline
- [ ] After benchmark run, collect all failed tasks
- [ ] For each failure: save task + trajectory + error
- [ ] Script: `bunny analyze-failures --run <id>` → shows failure patterns

### 2.2 Skill extraction
- [ ] Manual: human reviews failures, writes SKILL.md
- [ ] Semi-auto: `bunny extract-skill --task <id>` → bunny analyzes its own failure and drafts SKILL.md
- [ ] Skills stored in `skills/` dir, auto-loaded by bunny via `discoverSkillPaths()`

### 2.3 Skill effectiveness tracking
- [ ] Each skill tagged with benchmark tasks it was designed for
- [ ] After adding skill, re-run those tasks → measure improvement
- [ ] Skills with zero improvement get flagged for review

### 2.4 Skills Hub (community)
- [ ] `bunny install skill <github-url>` — install community skill
- [ ] `bunny list skills` — show installed skills + their benchmark scores
- [ ] Publish curated skill packs: `bunny-skills-coding`, `bunny-skills-research`

---

## Phase 3 — Memory Flywheel (Medium term)

**Goal:** Cross-session knowledge accumulation.

### 3.1 Session search
- [ ] pi already stores sessions in `~/.bunny/agent/sessions/`
- [ ] Add FTS5 search: `bunny search "how did I fix the webpack config"`
- [ ] Surface relevant past sessions at start of new session

### 3.2 Auto memory extraction
- [ ] After session ends, bunny summarizes key facts/decisions
- [ ] Stored in `~/.bunny/memory.md` (appended)
- [ ] Injected into system prompt on next session start

### 3.3 Project context
- [ ] `bunny init` in project dir → creates `.bunny/context.md`
- [ ] Bunny fills it in as it learns about the project
- [ ] Auto-injected as system prompt when working in that dir

---

## Phase 4 — Trajectory Collection (Long term)

**Goal:** Build open dataset for tool-calling model training.

### 4.1 Trajectory recording
- [ ] Record every benchmark run: task + tool calls + results + final score
- [ ] Format: JSONL, compatible with standard RL frameworks
- [ ] Store in `benchmark-results/trajectories/`

### 4.2 Trajectory compression
- [ ] Remove redundant steps (failed attempts before success)
- [ ] Keep: task → key decisions → successful tool sequence → result
- [ ] Script: `bunny compress-trajectory --run <id>`

### 4.3 Open dataset
- [ ] Publish `bunny-trajectories` on HuggingFace
- [ ] Include: task, trajectory, pass/fail, model used, skills active
- [ ] Update with each benchmark run

### 4.4 RL-ready format
- [ ] Export trajectories in Atropos-compatible format
- [ ] Enable community to fine-tune tool-calling models on bunny data

---

## Flywheel Summary

```
bunny runs benchmark
    ↓ collect failures
    ↓ extract skills (manual → semi-auto → auto)
    ↓ skills improve pass rate
    ↓ record trajectories
    ↓ publish open dataset
    ↓ community trains better models
    ↓ better models run bunny better
    ↓ repeat
```

## Immediate Next Actions

1. **Add bunny runner to benchmark-cli** (1 day)
   - `packages/benchmark-cli/src/runners/bunny.ts`
   - Run: `./run-benchmark.sh --runner bunny --runs 3`

2. **Run GAIA smoking test with bunny** (1 hour)
   - Establish baseline pass rate

3. **Write first skill from failure** (1 hour)
   - Pick one failed task, write `skills/debugging/SKILL.md`
   - Re-run, measure improvement

That's the flywheel start.
