# SandAgent 架构

## 整体流程

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
│   route.ts 创建:                                                            │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  const sandbox = new E2BSandbox({ apiKey, runnerBundlePath })       │  │
│   │  const agent = new SandAgent({ id, sandbox, runner, env })          │  │
│   │  return agent.stream({ messages, workspace })                       │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                              │                              │
│   SandAgent.stream() 做了什么:                                              │
│   1. handle = await sandbox.attach(id)  // 连接到沙箱                       │
│   2. command = buildCommand()           // 构建 CLI 命令                    │
│   3. stdout = handle.exec(command)      // 在沙箱内执行                     │
│   4. return Response(stream)            // 直接透传 stdout                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     @sandagent/sandbox-e2b (E2BSandbox)                     │
│                                                                             │
│   attach(id):                                                               │
│   1. E2B SDK 创建云端沙箱实例                                                │
│   2. 上传 runner bundle.mjs 到 /sandagent/runner/                           │
│   3. 上传 templates/ 到 /sandagent/templates/                               │
│   4. npm install @anthropic-ai/claude-agent-sdk                            │
│   5. 返回 E2BHandle                                                         │
│                                                                             │
│   E2BHandle.exec(command):                                                  │
│   - 在沙箱内执行: node /sandagent/runner/bundle.mjs run --model ... -- "prompt"│
│   - 流式返回 stdout (AI SDK UI 格式)                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    E2B Cloud Sandbox (远程隔离环境)                          │
│                                                                             │
│   执行命令:                                                                  │
│   node /sandagent/runner/bundle.mjs run \                                   │
│     --model claude-sonnet-4-20250514 \                                      │
│     --cwd /home/user \                                                      │
│     --template default \                                                    │
│     -- "用户的问题"                                                          │
│                                              │                              │
│                                              ▼                              │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │              @sandagent/runner-cli (runner.ts)                      │  │
│   │                                                                     │  │
│   │   1. loadTemplate("default")  // 加载 CLAUDE.md + settings.json    │  │
│   │   2. createClaudeRunner({ model, systemPrompt, ... })              │  │
│   │   3. for await (chunk of runner.run(userInput))                    │  │
│   │        process.stdout.write(chunk)  // 输出 AI SDK UI 流           │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                              │                              │
│                                              ▼                              │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │            @sandagent/runner-claude (claude-runner.ts)             │  │
│   │                                                                     │  │
│   │   1. 加载 @anthropic-ai/claude-agent-sdk                           │  │
│   │   2. sdk.query({ prompt, options })                                │  │
│   │   3. 转换 SDK 消息 → AI SDK UI 格式                                 │  │
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

## 包依赖关系

```
服务端运行：
apps/sandagent-example (Next.js 前端)
    └── @sandagent/core
            └── @sandagent/sandbox-e2b (E2B 沙箱适配器)

沙箱内运行：
apps/runner-cli (沙箱内运行的 CLI)
    └── @sandagent/runner-claude (Claude Agent SDK 封装)
            └── @anthropic-ai/claude-agent-sdk (官方 SDK)
```

## Runner 调用链详解

```
runner-cli/src/cli.ts          # CLI 入口，解析命令行参数
        │
        ▼
runner-cli/src/runner.ts       # 加载模板，调用 claude-runner
        │
        │  import { createClaudeRunner } from "@sandagent/runner-claude"
        │
        ▼
runner-claude/src/claude-runner.ts   # 封装 Claude Agent SDK
        │
        │  import @anthropic-ai/claude-agent-sdk
        │
        ▼
Claude API (Anthropic)
```

### runner-cli 职责
- 解析命令行参数（model、template、cwd 等）
- 加载模板配置（读取 `CLAUDE.md` 作为 system prompt）
- 调用 `createClaudeRunner()` 执行任务
- 把结果以 AI SDK UI 格式写到 stdout

### runner-claude 职责
- 封装 `@anthropic-ai/claude-agent-sdk`
- 把 SDK 的消息格式转换成 AI SDK UI 格式
- 处理 API key 缺失时的 mock 响应

### 为什么分成两个包？
设计上是为了支持多种 runner（比如以后加 `runner-openai`、`runner-gemini`），runner-cli 作为统一入口，根据配置调用不同的 runner 实现。

如果只用 Claude，可以合并成一个包简化结构。

### 打包方式
runner-cli 使用 esbuild 打包成单文件 `bundle.mjs`，会把 runner-claude 的代码一起打包进去：
```bash
esbuild src/cli.ts --bundle --platform=node --format=esm --outfile=dist/bundle.mjs
```

所以实际上传到沙箱的只有一个 `bundle.mjs` 文件，不需要单独发布 runner-claude 到 npm。

## 关键设计点

### 1. 流式透传
从 Claude API 到前端，整个链路都是流式的，服务端不解析/修改内容。

### 2. 沙箱隔离
代码执行在 E2B 云端沙箱，与服务器完全隔离，安全可控。

### 3. 模板系统
通过 `templates/` 目录配置不同 agent 的 system prompt 和工具权限：
- `CLAUDE.md` - System prompt
- `.claude/settings.json` - 工具权限、max_turns 等配置
- `skills/*.md` - 额外技能说明

### 4. AI SDK UI 协议
统一使用 Vercel AI SDK 的流格式，前端可直接用 `useChat()` 消费：
- `0:` - 文本内容
- `9:` - 工具调用
- `a:` - 工具结果
- `d:` - 完成信号

## 文件对应

| 层级 | 文件 | 职责 |
|------|------|------|
| API Route | `app/api/ai/route.ts` | 接收请求，创建 SandAgent，返回流 |
| Core | `packages/core/src/sand-agent.ts` | 编排沙箱和 runner，构建命令 |
| Sandbox | `packages/sandbox-e2b/src/e2b-sandbox.ts` | E2B 沙箱生命周期管理 |
| Runner CLI | `apps/runner-cli/src/runner.ts` | 加载模板，调用 claude-runner |
| Runner | `packages/runner-claude/src/claude-runner.ts` | 封装 Claude Agent SDK，输出 AI SDK UI 流 |
