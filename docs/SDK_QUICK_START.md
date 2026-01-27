# SandAgent 快速开始

5 分钟为你的项目添加 AI Agent 聊天功能。

![SandAgent Quickstart Demo](./assets/quickstart-demo.png)

## 安装

```bash
npm install @sandagent/sdk ai
```

## 使用

### 1. 创建后端 API

创建 `app/api/ai/route.ts`（Next.js App Router）：

```typescript
import { createSandAgent, LocalSandbox } from "@sandagent/sdk";
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, streamText } from "ai";

export async function POST(request: Request) {
  const { messages } = await request.json();

  // 构建环境变量
  const env: Record<string, string> = {};
  if (process.env.ANTHROPIC_API_KEY) {
    env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  }
  if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
    env.AWS_BEARER_TOKEN_BEDROCK = process.env.AWS_BEARER_TOKEN_BEDROCK;
    env.CLAUDE_CODE_USE_BEDROCK = "1";
  }

  // 选择模型
  const model = process.env.ANTHROPIC_API_KEY
    ? "claude-sonnet-4-20250514"
    : "us.anthropic.claude-sonnet-4-20250514-v1:0"; // AWS Bedrock

  const sandbox = new LocalSandbox({
    baseDir: process.cwd(),
    isolate: true, // 隔离目录，自动复制 .claude 和 CLAUDE.md
    runnerCommand: ["npx", "-y", "@sandagent/runner-cli@latest", "run"],
    env,
  });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const sandagent = createSandAgent({ sandbox, cwd: sandbox.getWorkdir?.() });
      const result = streamText({
        model: sandagent(model),
        messages: await convertToModelMessages(messages),
        abortSignal: request.signal,
      });
      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}
```

### 2. 创建聊天页面

创建 `app/page.tsx`：

```tsx
"use client";

import { useSandAgentChat } from "@sandagent/sdk/react";
import { useState } from "react";

export default function ChatPage() {
  const [input, setInput] = useState("");
  const { messages, isLoading, sendMessage } = useSandAgentChat({
    apiEndpoint: "/api/ai",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input);
    setInput("");
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={msg.role === "user" ? "text-right" : ""}>
            <div className={`inline-block p-3 rounded-lg ${
              msg.role === "user" ? "bg-blue-500 text-white" : "bg-gray-100"
            }`}>
              {msg.parts.map((part, i) => part.type === "text" && <span key={i}>{part.text}</span>)}
            </div>
          </div>
        ))}
        {isLoading && <div className="text-gray-500">思考中...</div>}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入消息..."
          className="flex-1 px-4 py-2 border rounded-lg"
        />
        <button type="submit" disabled={isLoading} className="px-4 py-2 bg-blue-500 text-white rounded-lg">
          发送
        </button>
      </form>
    </div>
  );
}
```

### 3. 设置环境变量

支持两种认证方式：

**Anthropic API（推荐）：**
```
ANTHROPIC_API_KEY=sk-ant-xxx
```

**AWS Bedrock：**
```
AWS_BEARER_TOKEN_BEDROCK=xxx
```

### 4. 启动项目

```bash
npm run dev
```

---

## 自定义 Agent 行为

在项目根目录创建 `CLAUDE.md`，定义 Agent 的角色：

```markdown
# 我的 AI 助手

你是一个友好的助手，擅长回答问题和编写代码。
```

添加自定义技能：

```
.claude/
└── skills/
    └── my-skill/
        └── SKILL.md
```

> **注意**：当 `isolate: true` 时，LocalSandbox 会自动将 `.claude` 目录和 `CLAUDE.md` 复制到隔离的工作目录中。

---

## 其他框架

核心代码相同，适用于 Express、Fastify、Koa 等：

```typescript
// 1. 创建沙箱
const sandbox = new LocalSandbox({
  baseDir: process.cwd(),
  isolate: true,
  runnerCommand: ["npx", "-y", "@sandagent/runner-cli@latest", "run"],
  env: { ANTHROPIC_API_KEY },
});

// 2. 创建 provider
const sandagent = createSandAgent({ sandbox });

// 3. 调用模型
const result = streamText({
  model: sandagent("sonnet"), // 支持: sonnet, opus, haiku 或完整模型 ID
  messages,
});
```

---

## 高级功能

### 使用 Artifacts（工作成果展示）

让 AI 生成的报告、图表、代码等内容自动在你的应用中展示：

```tsx
import { useSandAgentChat } from "@sandagent/sdk/react";

export default function ChatPage() {
  const {
    messages,
    sendMessage,
    artifacts,              // 📦 AI 生成的所有文件
    selectedArtifact,       // 📄 当前选中的文件
    setSelectedArtifact,    // 🔄 切换文件
  } = useSandAgentChat({ apiEndpoint: "/api/ai" });

  return (
    <div className="flex">
      {/* 左侧：聊天区 */}
      <div className="flex-1">
        {/* ... 聊天界面 ... */}
      </div>

      {/* 右侧：Artifacts 展示 */}
      {artifacts.length > 0 && (
        <div className="w-96 border-l">
          {/* Artifact 标签页 */}
          <div className="flex gap-2 p-2 border-b">
            {artifacts.map((artifact) => (
              <button
                key={artifact.artifactId}
                onClick={() => setSelectedArtifact(artifact)}
                className={
                  selectedArtifact?.artifactId === artifact.artifactId
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100"
                }
              >
                {artifact.artifactId}
              </button>
            ))}
          </div>

          {/* Artifact 内容 */}
          {selectedArtifact && (
            <div className="p-4">
              <pre>{selectedArtifact.content}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

当用户问："帮我分析数据并生成报告"，AI 生成的报告会自动出现在右侧面板！

📖 **[完整 Artifacts 使用指南 →](./SDK_ARTIFACTS_GUIDE.md)** - 包含复制、下载、Markdown 渲染等高级功能

---

## 下一步

- **[Artifacts 功能指南](./SDK_ARTIFACTS_GUIDE.md)** - 展示 AI 生成的内容
- [完整示例](../apps/sandagent-quickstart) - 可运行的示例项目
- [使用云端沙箱](../packages/sandbox-e2b/README.md) - 生产环境部署
- [SDK 开发指南](./SDK_DEVELOPMENT_GUIDE.md) - 深入的开发文档
- [API 参考](../spec/API_REFERENCE.md) - 详细配置选项
