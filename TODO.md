# Bunny Agent TODO List

This document tracks remaining features and improvements needed to complete the Bunny Agent implementation.

## Priority 1: Core Functionality Gaps

### 1.1 JSONL Transcript Export (Roadmap Item)
- [x] Add `TranscriptWriter` interface in `@bunny-agent/core`
- [x] Add `JsonlTranscriptWriter` class for file output
- [x] Add `MemoryTranscriptWriter` class for testing
- [x] Add `ConsoleTranscriptWriter` class for debugging
- [x] Add `MultiTranscriptWriter` for multiple outputs
- [x] Include timestamps, message types, and full content
- [x] Add `transcriptWriter` option to `Bunny Agent.stream()` options
- [x] Document transcript format in spec/DEBUGGING_GUIDE.md
- [x] Add tests for transcript writers

### 1.2 CLI Binary Configuration
- [ ] Add shebang to `packages/cli/src/cli.ts`
- [ ] Add `bin` entry to `packages/cli/package.json`
- [ ] Add shebang to `packages/benchmark/src/cli.ts`
- [ ] Add `bin` entry to `packages/benchmark/package.json`
- [ ] Test CLI invocation

### 1.3 Multi-turn Conversation Support
- [ ] Enhance `runAgent()` to accept conversation history
- [ ] Pass full message history to Claude Agent SDK
- [ ] Support continued conversations in same sandbox session

## Priority 2: Roadmap Features

### 2.1 Snapshot & Restore
- [ ] Add `snapshot()` method to `SandboxHandle` interface
- [ ] Implement snapshot in E2BSandbox (E2B supports this)
- [ ] Implement snapshot in SandockSandbox (Docker commit)
- [ ] Add `restore()` method to recreate sandbox from snapshot
- [ ] Add tests for snapshot/restore functionality

### 2.2 Volume Export
- [ ] Add `export()` method to `SandboxHandle`
- [ ] Support exporting workspace as tar archive
- [ ] Support exporting specific files/directories
- [ ] Add download endpoint example in Next.js app

### 2.3 Additional Agent Runtimes
- [ ] Create `@bunny-agent/runner-openai` package (OpenAI Assistants API)
- [ ] Create `@bunny-agent/runner-gemini` package (Google Gemini)
- [ ] Create runner interface/type for standardization
- [ ] Update RunnerSpec to support multiple kinds

## Priority 3: Developer Experience

### 3.1 Integration Tests
- [ ] Add integration test suite with real E2B (when E2B_API_KEY set)
- [ ] Add integration test suite with real Claude (when ANTHROPIC_API_KEY set)
- [ ] Add end-to-end test for full flow
- [ ] Add CI configuration for optional integration tests

### 3.2 Error Handling Improvements
- [ ] Add stream interruption handling
- [ ] Add timeout configuration for long-running tasks
- [ ] Add graceful shutdown for sandboxes on error
- [ ] Improve error messages with actionable guidance

### 3.3 MCP Integration
- [ ] Load MCP configuration from template `.claude/mcp.json`
- [ ] Pass MCP servers to Claude Agent SDK
- [ ] Document MCP usage in templates

## Priority 4: Documentation & Examples

### 4.1 Additional Examples
- [ ] Add weather task example (end-to-end demo)
- [ ] Add file processing example
- [ ] Add code review example using coder template

### 4.2 Debugging Guide
- [x] Create spec/DEBUGGING_GUIDE.md
- [x] Document transcript analysis
- [x] Document common error scenarios
- [x] Add troubleshooting checklist

## Completed ✅

- [x] Create comprehensive README.md
- [x] Create spec/TECHNICAL_SPEC.md
- [x] Set up monorepo structure with pnpm workspaces
- [x] Implement @bunny-agent/core package
- [x] Implement @bunny-agent/cli package
- [x] Implement @bunny-agent/sdk package
- [x] Implement @bunny-agent/sandbox-sandock package
- [x] Implement @bunny-agent/sandbox-e2b package
- [x] Implement @bunny-agent/runner-claude package (with real SDK)
- [x] Create example Next.js application
- [x] Add @bunny-agent/benchmark package
- [x] Update AI SDK to v6 (beta version)
- [x] Add vitest tests for all packages (77 tests)
- [x] Add comprehensive documentation
- [x] Add Agent Templates (default, coder, analyst, researcher)

---

*Last updated: 2024-12-24*
