# SandAgent Architecture

## Overall Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Frontend (Next.js App)                            │
│                                                                             │
│   User Input  ──►  useChat() hook  ──►  POST /api/ai/route.ts              │
│                                              │                              │
│                                              ▼                              │
│                                    { sessionId, messages,                   │
│                                      ANTHROPIC_API_KEY,                     │
│                                      E2B_API_KEY, template }                │
└─────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        @sandagent/core (SandAgent)                          │
│                                                                             │
│   route.ts creates:                                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  const sandbox = new E2BSandbox({ apiKey, runnerBundlePath })       │  │
│   │  const agent = new SandAgent({ id, sandbox, runner, env })          │  │
│   │  return agent.stream({ messages, workspace })                       │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                              │                              │
│   What SandAgent.stream() does:                                             │
│   1. handle = await sandbox.attach(id)  // Connect to sandbox               │
│   2. command = buildCommand()           // Build CLI command                │
│   3. stdout = handle.exec(command)      // Execute in sandbox               │
│   4. return Response(stream)            // Passthrough stdout directly      │
└─────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     @sandagent/sandbox-e2b (E2BSandbox)                     │
│                                                                             │
│   attach(id):                                                               │
│   1. E2B SDK creates cloud sandbox instance                                 │
│   2. Upload runner bundle.mjs to /sandagent/runner/                         │
│   3. Upload templates/ to /sandagent/templates/                             │
│   4. npm install @anthropic-ai/claude-agent-sdk                            │
│   5. Return E2BHandle                                                       │
│                                                                             │
│   E2BHandle.exec(command):                                                  │
│   - Execute in sandbox: node /sandagent/runner/bundle.mjs run --model ... -- "prompt"│
│   - Stream stdout (AI SDK UI format)                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    E2B Cloud Sandbox (Remote Isolated Environment)          │
│                                                                             │
│   Execute command:                                                          │
│   node /sandagent/runner/bundle.mjs run \                                   │
│     --model claude-sonnet-4-20250514 \                                      │
│     --cwd /home/user \                                                      │
│     --template default \                                                    │
│     -- "user's question"                                                    │
│                                              │                              │
│                                              ▼                              │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │              @sandagent/runner-cli (runner.ts)                      │  │
│   │                                                                     │  │
│   │   1. loadTemplate("default")  // Load CLAUDE.md + settings.json    │  │
│   │   2. createClaudeRunner({ model, systemPrompt, ... })              │  │
│   │   3. for await (chunk of runner.run(userInput))                    │  │
│   │        process.stdout.write(chunk)  // Output AI SDK UI stream     │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                              │                              │
│                                              ▼                              │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │            @sandagent/runner-claude (claude-runner.ts)             │  │
│   │                                                                     │  │
│   │   1. Load @anthropic-ai/claude-agent-sdk                           │  │
│   │   2. sdk.query({ prompt, options })                                │  │
│   │   3. Convert SDK messages → AI SDK UI format                       │  │
│   │      - assistant → 0:text                                          │  │
│   │      - tool_use  → 9:toolCall                                      │  │
│   │      - tool_result → a:toolResult                                  │  │
│   │      - finish → d:{"finishReason":"stop"}                          │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                              │                              │
│                                              ▼                              │
│                        Claude API (Anthropic)                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Package Dependencies

```
Server-side:
apps/sandagent-example (Next.js frontend)
    └── @sandagent/core
            └── @sandagent/sandbox-e2b (E2B sandbox adapter)

Inside sandbox:
apps/runner-cli (CLI running inside sandbox)
    └── @sandagent/runner-claude (Claude Agent SDK wrapper)
            └── @anthropic-ai/claude-agent-sdk (Official SDK)
```

## Runner Call Chain Details

```
runner-cli/src/cli.ts          # CLI entry point, parses command line arguments
        │
        ▼
runner-cli/src/runner.ts       # Loads template, calls claude-runner
        │
        │  import { createClaudeRunner } from "@sandagent/runner-claude"
        │
        ▼
runner-claude/src/claude-runner.ts   # Wraps Claude Agent SDK
        │
        │  import @anthropic-ai/claude-agent-sdk
        │
        ▼
Claude API (Anthropic)
```

### runner-cli Responsibilities
- Parse command line arguments (model, template, cwd, etc.)
- Load template configuration (read `CLAUDE.md` as system prompt)
- Call `createClaudeRunner()` to execute tasks
- Write results to stdout in AI SDK UI format

### runner-claude Responsibilities
- Wrap `@anthropic-ai/claude-agent-sdk`
- Convert SDK message format to AI SDK UI format
- Handle mock responses when API key is missing

### Why Split Into Two Packages?
The design supports multiple runners (e.g., future `runner-openai`, `runner-gemini`). runner-cli serves as a unified entry point that calls different runner implementations based on configuration.

If only using Claude, the packages could be merged to simplify the structure.

### Bundling Approach
runner-cli uses esbuild to bundle into a single `bundle.mjs` file, including runner-claude code:
```bash
esbuild src/cli.ts --bundle --platform=node --format=esm --outfile=dist/bundle.mjs
```

So only one `bundle.mjs` file is uploaded to the sandbox - no need to publish runner-claude to npm separately.

## Key Design Points

### 1. Streaming Passthrough
The entire chain from Claude API to frontend is streaming - the server doesn't parse or modify content.

### 2. Sandbox Isolation
Code execution happens in E2B cloud sandbox, completely isolated from the server, secure and controllable.

### 3. Template System
Configure different agent system prompts and tool permissions via `templates/` directory:
- `CLAUDE.md` - System prompt
- `.claude/settings.json` - Tool permissions, max_turns, etc.
- `skills/*.md` - Additional skill descriptions

### 4. AI SDK UI Protocol
Uses Vercel AI SDK stream format uniformly, frontend can consume directly with `useChat()`:
- `0:` - Text content
- `9:` - Tool call
- `a:` - Tool result
- `d:` - Finish signal

## File Mapping

| Layer | File | Responsibility |
|-------|------|----------------|
| API Route | `app/api/ai/route.ts` | Receive request, create SandAgent, return stream |
| Core | `packages/core/src/sand-agent.ts` | Orchestrate sandbox and runner, build command |
| Sandbox | `packages/sandbox-e2b/src/e2b-sandbox.ts` | E2B sandbox lifecycle management |
| Runner CLI | `apps/runner-cli/src/runner.ts` | Load template, call claude-runner |
| Runner | `packages/runner-claude/src/claude-runner.ts` | Wrap Claude Agent SDK, output AI SDK UI stream |
