# 多轮对话实现指南

SandAgent 支持多轮对话，通过 `resume` 参数实现会话状态的持久化和恢复。

## 架构概览

```
Client (前端)
    ↓ POST /api/ai { sessionId, messages, resume }
API Route (route.ts)
    ↓ agent.stream({ messages, resume })
SandAgent (sand-agent.ts)
    ↓ buildCommand() → --resume <session_id>
Runner CLI (cli.ts)
    ↓ runAgent({ resume })
Claude Runner (claude-runner.ts)
    ↓ sdk.query({ options: { resume } })
Claude Agent SDK
```

## 核心参数

| 参数 | 说明 |
|------|------|
| `sessionId` | 沙箱实例 ID，用于复用同一个 E2B 沙箱 |
| `resume` | Claude Agent SDK 的会话 ID，用于恢复对话上下文 |

## 实现细节

### 1. API Route (`apps/sandagent-example/app/api/ai/route.ts`)

从请求 body 中提取 `resume` 并传给 `agent.stream()`：

```typescript
const { sessionId, messages, resume, ... } = body;

return agent.stream({
  messages: normalizedMessages,
  workspace: { path: "/home/user" },
  resume,  // 传递 resume 参数
});
```

### 2. SandAgent (`packages/core/src/sand-agent.ts`)

在 `buildCommand()` 中将 `resume` 转换为 CLI 参数：

```typescript
private buildCommand(input: StreamInput): string[] {
  const cmd: string[] = ["node", "/sandagent/runner/bundle.mjs", "run"];
  
  // ... 其他参数
  
  // 添加 resume 参数用于多轮对话
  if (input.resume) {
    cmd.push("--resume", input.resume);
  }
  
  // ...
}
```

### 3. Runner CLI (`apps/runner-cli/src/cli.ts`)

解析 `--resume` 命令行参数：

```typescript
const { values, positionals } = parseArgs({
  options: {
    // ... 其他选项
    resume: {
      type: "string",
      short: "r",
    },
  },
});
```

### 4. Claude Runner (`packages/runner-claude/src/claude-runner.ts`)

将 `resume` 传递给 Claude Agent SDK：

```typescript
const sdkOptions: ClaudeAgentSDKOptions = {
  model: options.model,
  // ... 其他选项
  resume: options.resume,  // 传递给 SDK
};

const queryIterator = sdk.query({
  prompt: userInput,
  options: sdkOptions,
});
```

## 沙箱复用机制

`E2BSandbox` 使用静态缓存实现沙箱实例复用：

```typescript
// packages/sandbox-e2b/src/e2b-sandbox.ts
private static readonly instances: Map<string, CachedInstance> = new Map();

async attach(id: string): Promise<SandboxHandle> {
  const cached = E2BSandbox.instances.get(id);
  
  if (cached) {
    // 复用已有实例，更新访问时间
    E2BSandbox.instances.set(id, {
      instance: cached.instance,
      lastAccessTime: Date.now(),
    });
  } else {
    // 创建新实例
    instance = await Sandbox.create(...);
    E2BSandbox.instances.set(id, { instance, lastAccessTime: Date.now() });
  }
}
```

缓存策略：
- 最大缓存数量：50 个实例
- 实例过期时间：30 分钟
- 淘汰策略：LRU（最近最少使用）

## 前端集成示例

```typescript
// 首次对话
const response = await fetch('/api/ai', {
  method: 'POST',
  body: JSON.stringify({
    sessionId: 'user-123-session-1',
    messages: [{ role: 'user', content: '创建一个 hello.py 文件' }],
    ANTHROPIC_API_KEY: '...',
    E2B_API_KEY: '...',
  }),
});

// 从响应中获取 session_id（由 Claude Agent SDK 返回）
const sessionId = extractSessionIdFromStream(response);

// 后续对话，传入 resume
const response2 = await fetch('/api/ai', {
  method: 'POST',
  body: JSON.stringify({
    sessionId: 'user-123-session-1',  // 同一个沙箱
    resume: sessionId,                 // Claude SDK 的会话 ID
    messages: [{ role: 'user', content: '运行这个文件' }],
    ANTHROPIC_API_KEY: '...',
    E2B_API_KEY: '...',
  }),
});
```

## 注意事项

1. `sessionId` 和 `resume` 是两个不同的概念：
   - `sessionId`：用于复用 E2B 沙箱实例
   - `resume`：用于恢复 Claude Agent SDK 的对话上下文

2. 沙箱实例会在 30 分钟无活动后自动过期

3. 当缓存满时，最久未使用的沙箱会被淘汰
