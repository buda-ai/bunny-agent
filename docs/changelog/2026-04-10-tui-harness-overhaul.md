# 2026-04-10 sandagent-tui + runner-harness overhaul

## Completed

### runner-harness restructure
- [x] Moved `image-tools.ts` → `src/tools/image-generate.ts`
- [x] Moved `web-tools.ts` → `src/tools/web-search.ts` + `src/tools/web-fetch.ts`
- [x] Added `src/tools/types.ts` (shared `ToolDefinition`, `SearchResult`)
- [x] Added `src/stream.ts` — `parseRunnerStream()`: `AsyncIterable<string>` → `ReadableStream<UIMessageChunk>` via AI SDK `parseJsonEventStream` + `uiMessageChunkSchema`
- [x] Extracted `createRunner()` to `src/runner.ts`
- [x] Breaking change: removed `./web-tools` and `./image-tools` subpath exports; new `./tools` export
- [x] Added `ai` as real dependency (for stream parsing)
- [x] Updated all consumers (runner-pi, runner-pi tests, vitest config)

### sandagent-tui rewrite
- [x] Removed `@mariozechner/pi-coding-agent` dependency (was shell-wrapping pi TUI)
- [x] New TUI using `@mariozechner/pi-tui` directly
- [x] `src/chat-view.ts` — `UserMessage` (Container+Spacer+bg), `AssistantMessage` (streaming markdown + reasoning), `ToolCallComponent` (input preview + result update), `ChatView` (insertBeforeEditor pattern)
- [x] `src/footer.ts` — pi-style footer: left=cwd, right=runner·model·tokens, separator line
- [x] `src/app.ts` — slash commands (/clear, /exit), abort on Ctrl+C, tool-output-available/error handling, step-finish token tracking
- [x] `src/index.ts` — CLI entry: `--runner`, `--model`, `--cwd` flags

---

## TODO (priority order)

### P0 — Must have to be useful

- [x] **4.1/4.2 stream format fix** (`runner-harness/stream.ts`)
  - Replaced `parseJsonEventStream` + `uiMessageChunkSchema` with custom SSE parser
  - New `RunnerChunk` type: superset covering all runner-specific fields (`isError`, `reasoning.text`, `finish`, `message-metadata`, etc.)
  - `parseRunnerStream()` now returns `AsyncIterable<RunnerChunk>` (was `ReadableStream`)
  - All chunk types pass through without being silently dropped

- [x] **3.3 DuckDuckGo fallback** (`runner-harness/tools/web-search.ts`)
  - Zero-config HTML scrape fallback when no BRAVE_API_KEY / TAVILY_API_KEY
  - Tried after all configured providers fail

- [x] **1.4 CLAUDE.md / AGENTS.md injection** (`runner-harness/prompt.ts`)
  - `loadSystemPrompt(cwd)`: walks up 5 levels looking for CLAUDE.md or AGENTS.md
  - Auto-injected into `createRunner()` when `systemPrompt` not explicitly provided

- [x] **2.5 session persistence** (`runner-harness/session.ts`)
  - `readSessionId(cwd)` / `writeSessionId(cwd, id)` / `clearSessionId(cwd)`
  - Stored in `.sandagent/session-id`
  - `createRunner()` auto-reads session ID for resume, auto-writes from stream chunks

- [x] **tools flat structure** (`runner-harness/src/tools/`)
  - Moved `web/search.ts` → `web-search.ts`, `web/fetch.ts` → `web-fetch.ts`
  - Moved `image/generate.ts` → `image-generate.ts`
  - Removed subdirectories

- [x] **TUI improvements** (`sandagent-tui`)
  - `handleChunk()` method handles all RunnerChunk types
  - `/help` slash command
  - `addHelp()` in ChatView
  - Footer: left=cwd, right=runner·model·tokens

### P1 — Experience quality

- [x] **2.1 session resume** (`sandagent-tui`)
  - `--resume` flag: reads `.sandagent/session-id` on start
  - `--new` flag: clears saved session ID before starting
  - `/new` slash command: clear session mid-session
  - Footer shows `sid:xxxxxxxx` (first 8 chars of session ID)
  - Session ID auto-captured from `message-metadata` chunks and persisted

- [x] **2.2 `/model` slash command** (`sandagent-tui`)
  - `/model <name>` switches model mid-session
  - Footer updates immediately

- [x] **2.3 `/runner` slash command** (`sandagent-tui`)
  - `/runner <claude|pi|gemini|codex|opencode>` switches runner mid-session
  - Validates against known runner list

- [x] **2.4 image rendering** (`sandagent-tui`)
  - `resolveToolCallWithImage()` in ChatView
  - Detects image file paths (`.png/.jpg/.gif/.webp`) in `tool-output-available`
  - Renders with pi-tui `Image` component (Kitty/iTerm2 protocol)
  - Falls back to text path if image load fails

- [x] **2.7 Ctrl+C double-tap exit** (`sandagent-tui`)
  - First Ctrl+C: aborts running request
  - Second Ctrl+C within 2s: exits process
  - When idle: shows hint, second press exits

### P2 — Power features

- [x] **1.3 skill auto-discovery** (`runner-harness/skills.ts`)
  - `discoverSkillPaths(cwd)`: scans `cwd/skills/` and `~/.sandagent/skills/`
  - Auto-passed to runner-pi when `skillPaths` not explicitly provided

- [x] **3.1 `bash` tool** (`runner-harness/tools/bash-execute.ts`)
  - `buildBashTool(cwd)`: executes bash commands with timeout and abort signal

- [x] **3.2 `read_file` / `write_file` tools** (`runner-harness/tools/file-ops.ts`)
  - `buildReadFileTool(cwd)` / `buildWriteFileTool(cwd)`
  - For runners without built-in file tools

- [x] **4.3 error recovery** (`runner-harness/stream.ts`)
  - `parseRunnerStream()` catches errors and emits `{ type: "error" }` chunk ✓

---

## Session 2 — TUI full overhaul (pi coding agent parity)

### Architecture
- `TUI children`: welcome → `chatContainer` (Container) → `statusContainer` (Container) → editor → footer
- `ChatView` operates on `chatContainer` directly — no more fragile `splice(length-2)` hacks
- `statusContainer` dedicated to loader/status — clean show/hide
- `theme.ts` — single source of truth for all colors

### Interactions
- **Escape** — `tui.addInputListener`: aborts run if running, clears editor if idle
- **Ctrl+C** — first: abort; second within 2s: exit; idle: hint
- **`!cmd`** — local bash execution with loader, result in chat with Box background
- **Steer/queue** — submitting while agent runs queues message; auto-sent after run completes
- **`editor.addToHistory`** — all submissions added to history (↑↓ navigation)

### Components
- `ToolCallComponent` — Box background, pending/done/error/abort states, image rendering
- `AssistantMessage` — streaming text + reasoning (separate reasoningTheme)
- `ChatView.abortPendingTools()` — marks all pending tool calls aborted on run abort
- `ChatView.addBashResult()` — `!cmd` output with Box background

### Footer
- Git branch via `git rev-parse --abbrev-ref HEAD` (async, non-blocking)
- Session ID short hash `#xxxxxxxx`
- Token counts `↑Xk ↓Xk`

### Slash commands
- `/clear` `/new` `/runner <name>` `/model <name>` `/help` `/exit`
- All with autocomplete
