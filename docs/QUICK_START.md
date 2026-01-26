# SandAgent 快速开始 - 5 分钟集成 AI Agent 聊天界面

> **🎯 适合人群**：开发小白、想要快速看到效果的开发者  
> **⏱️ 预计时间**：5 分钟  
> **📦 前提条件**：你已经有一个项目，并且让 AI 写好了 skill，现在只想快速集成聊天界面！

这个指南帮你使用 `@sandagent/sdk` 在**已有项目**中快速集成 AI Agent 聊天界面，无需复杂配置。

---

## 🎬 快速集成（3 步搞定）

### 第 1 步：安装依赖

在你的项目根目录运行：

```bash
npm install @sandagent/sdk ai
# 或
pnpm add @sandagent/sdk ai
# 或
yarn add @sandagent/sdk ai
```

**需要的包说明：**
- `@sandagent/sdk` - AI Provider（后端）+ React hooks（前端），自动包含 `@sandagent/manager`
- `ai` - Vercel AI SDK（必需）

**💡 注意**：
- 需要 React 和 Tailwind CSS
- UI 组件需要自己实现，可参考 `apps/sandagent-quickstart` 示例

#### Runner 安装方式（选择一种）

`LocalSandbox` 需要 `@sandagent/runner-cli` 来执行 Claude Agent SDK。有 3 种方式：

**方式 1：npx 自动下载（推荐，零配置）**

无需额外安装，首次运行时 npx 会自动下载 runner-cli：

```typescript
const sandbox = new LocalSandbox({
  runnerCommand: ["npx", "@sandagent/runner-cli", "run"],
  // ...
});
```

**方式 2：全局安装（适合频繁使用）**

```bash
npm install -g @sandagent/runner-cli
```

然后使用默认配置（无需指定 runnerCommand）：

```typescript
const sandbox = new LocalSandbox({
  // runnerCommand 默认为 ["sandagent", "run"]
  // ...
});
```

**方式 3：项目依赖安装（适合团队协作）**

```bash
npm install @sandagent/runner-cli
```

然后指定 node_modules 路径：

```typescript
const sandbox = new LocalSandbox({
  runnerCommand: ["node", "node_modules/@sandagent/runner-cli/dist/cli.js", "run"],
  // ...
});
```

### 第 2 步：创建 API 端点（后端）

你需要创建一个 API 端点来处理 AI 请求。根据你的项目框架选择对应的方式：

#### 方式 A：Next.js App Router

创建 `app/api/ai/route.ts`：

```typescript
import {
  type SandAgentProviderSettings,
  createSandAgent,
  LocalSandbox,
} from "@sandagent/sdk";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from "ai";

export async function POST(request: Request) {
  const body = await request.json();
  const { sessionId, messages, ANTHROPIC_API_KEY } = body;

  // 验证 API Key（也可以从环境变量读取）
  const apiKey = ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // 创建本地沙箱（无需云端配置）
  // 使用 npx 自动下载并运行 runner-cli
  const sandbox = new LocalSandbox({
    baseDir: process.cwd(),
    isolate: true, // 每次对话创建独立目录，保证安全
    runnerCommand: ["npx", "@sandagent/runner-cli", "run"],
    env: {
      ANTHROPIC_API_KEY: apiKey,
    },
  });

  // 创建流式响应
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const workdir = sandbox.getWorkdir?.() || "/sandagent";

      // 创建 SandAgent provider
      const sandagentOptions: SandAgentProviderSettings = {
        sandbox,
        cwd: workdir, // 系统会自动读取这个目录下的 .claude/ 和 CLAUDE.md
        verbose: true,
      };
      const sandagent = createSandAgent(sandagentOptions);

      // 使用 AI SDK 流式生成文本
      const result = streamText({
        model: sandagent("claude-sonnet-4-20250514"),
        messages: messages.map((msg: any) => ({
          role: msg.role,
          content: msg.content,
        })),
        abortSignal: request.signal,
      });

      // 合并流式响应
      writer.merge(
        result.toUIMessageStream({
          sendSources: true,
        })
      );
    },
  });

  return createUIMessageStreamResponse({ stream });
}
```

#### 方式 B：Next.js Pages Router

创建 `pages/api/ai.ts`：

```typescript
import type { NextApiRequest, NextApiResponse } from "next";
import {
  type SandAgentProviderSettings,
  createSandAgent,
  LocalSandbox,
} from "@sandagent/sdk";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from "ai";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { sessionId, messages, ANTHROPIC_API_KEY } = req.body;

  const apiKey = ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: "ANTHROPIC_API_KEY is required" });
  }

  const sandbox = new LocalSandbox({
    baseDir: process.cwd(),
    isolate: true,
    runnerCommand: ["npx", "@sandagent/runner-cli", "run"],
    env: {
      ANTHROPIC_API_KEY: apiKey,
    },
  });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const workdir = sandbox.getWorkdir?.() || "/sandagent";

      const sandagentOptions: SandAgentProviderSettings = {
        sandbox,
        cwd: workdir,
        verbose: true,
      };
      const sandagent = createSandAgent(sandagentOptions);

      const result = streamText({
        model: sandagent("claude-sonnet-4-20250514"),
        messages: messages.map((msg: any) => ({
          role: msg.role,
          content: msg.content,
        })),
      });

      writer.merge(
        result.toUIMessageStream({
          sendSources: true,
        })
      );
    },
  });

  return createUIMessageStreamResponse({ stream }).then((response) => {
    response.body?.pipeTo(
      new WritableStream({
        write(chunk) {
          res.write(chunk);
        },
        close() {
          res.end();
        },
      })
    );
  });
}
```

#### 方式 C：Express/Node.js

创建 `routes/ai.js` 或 `server.js`：

```javascript
import express from "express";
import { createSandAgent, LocalSandbox } from "@sandagent/sdk";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from "ai";

const app = express();
app.use(express.json());

app.post("/api/ai", async (req, res) => {
  const { sessionId, messages, ANTHROPIC_API_KEY } = req.body;

  const apiKey = ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: "ANTHROPIC_API_KEY is required" });
  }

  const sandbox = new LocalSandbox({
    baseDir: process.cwd(),
    isolate: true,
    runnerCommand: ["npx", "@sandagent/runner-cli", "run"],
    env: {
      ANTHROPIC_API_KEY: apiKey,
    },
  });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const workdir = sandbox.getWorkdir?.() || "/sandagent";

      const sandagent = createSandAgent({
        sandbox,
        cwd: workdir,
        verbose: true,
      });

      const result = streamText({
        model: sandagent("claude-sonnet-4-20250514"),
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      });

      writer.merge(
        result.toUIMessageStream({
          sendSources: true,
        })
      );
    },
  });

  const response = createUIMessageStreamResponse({ stream });
  
  // 设置响应头
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // 流式传输
  const reader = response.body?.getReader();
  if (reader) {
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        return;
      }
      res.write(value);
      pump();
    };
    pump();
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
```

#### 方式 D：其他框架（Fastify、Koa 等）

API 端点的核心逻辑是一样的，只需要根据你的框架调整请求/响应处理方式。关键代码：

```typescript
// 1. 创建 LocalSandbox
const sandbox = new LocalSandbox({
  baseDir: process.cwd(),
  isolate: true,
  env: { ANTHROPIC_API_KEY },
});

// 2. 创建流式响应
const stream = createUIMessageStream({
  execute: async ({ writer }) => {
    const workdir = sandbox.getWorkdir?.() || "/sandagent";
    const sandagent = createSandAgent({ sandbox, cwd: workdir });
    const result = streamText({
      model: sandagent("claude-sonnet-4-20250514"),
      messages,
    });
    writer.merge(result.toUIMessageStream({ sendSources: true }));
  },
});

// 3. 返回响应
return createUIMessageStreamResponse({ stream });
```

### 第 3 步：添加前端组件（React）

在你的 React 组件中使用 `useSandAgentChat` hook：

```tsx
"use client";

import { useSandAgentChat } from "@sandagent/sdk/react";
import {
  Conversation,
  ConversationContent,
  Loader,
} from "@sandagent/sdk/react";
import { useState } from "react";

export default function ChatPage() {
  const [input, setInput] = useState("");
  const {
    messages,
    status,
    isLoading,
    sendMessage,
    stop,
  } = useSandAgentChat({
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
      <header className="px-4 py-3 border-b">
        <h1 className="text-lg font-semibold">我的 AI Agent</h1>
      </header>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.role === "user"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 text-gray-900"
              }`}
            >
              {message.parts.map((part, i) =>
                part.type === "text" ? <span key={i}>{part.text}</span> : null
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg p-3">思考中...</div>
          </div>
        )}
      </div>

      {/* 输入框 */}
      <form onSubmit={handleSubmit} className="p-4 border-t flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入你的问题..."
          className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50"
        >
          {isLoading ? "发送中..." : "发送"}
        </button>
      </form>
    </div>
  );
}
```

**💡 重要**：
- 确保你的项目已配置 Tailwind CSS
- `apiEndpoint` 指向你创建的 API 路由
- 上面是最简示例，可以根据需求自定义样式

### 第 4 步：配置环境变量（可选）

在项目根目录创建 `.env` 或 `.env.local` 文件：

```bash
ANTHROPIC_API_KEY=sk-ant-你的API密钥
```

**📝 如何获取 API Key？**
- 访问 [Anthropic Console](https://console.anthropic.com/)
- 登录后，在设置中找到 API Keys
- 创建一个新的 API Key 并复制

**💡 提示**：如果设置了环境变量，API 端点会自动读取，前端不需要传递 API Key。

### 第 5 步：配置你的 Skill（如果已有）

如果你已经让 AI 写好了 skill，将它们放在项目根目录：

```
项目根目录/
├── CLAUDE.md                    # Agent 的系统提示词（角色定义）
└── .claude/
    ├── settings.json            # SDK 配置（超时、温度等）
    └── skills/                  # 你的 skill 文件
        └── your-skill-name/     # 你的 skill
            └── SKILL.md
```

**✅ 系统会自动读取这些文件**，你不需要做任何额外配置！

**示例 `CLAUDE.md`：**

```markdown
# 代码助手 Agent

你是一个专业的代码助手，擅长：
- 编写清晰的代码
- 解释代码逻辑
- 修复 bug
- 优化性能

请用简洁明了的语言回答用户的问题。
```

**示例 `.claude/settings.json`：**

```json
{
  "max_tokens": 8096,
  "temperature": 0.7,
  "timeout_ms": 300000
}
```

---

## 🎨 界面是什么样的？

启动项目后，打开包含 `SandAgentChat` 组件的页面，你会看到：

- **顶部标题栏**：显示你自定义的标题
- **聊天输入框**：在底部，可以输入消息
- **消息区域**：显示你和 AI 的对话历史
- **实时响应**：AI 的回复会实时流式显示（打字效果）

**试试输入一条消息**，看看 AI 如何响应！

---

## 📁 项目结构示例

集成后的项目结构应该是这样的：

```
你的项目/
├── app/                          # Next.js App Router（如果使用）
│   ├── api/
│   │   └── ai/
│   │       └── route.ts          # API 路由（后端）
│   └── page.tsx                  # 主页面（前端 UI）
├── pages/                        # Next.js Pages Router（如果使用）
│   ├── api/
│   │   └── ai.ts                 # API 路由
│   └── chat.tsx                  # 聊天页面
├── .claude/                      # Claude Agent SDK 配置（可选）
│   ├── settings.json
│   └── skills/
│       └── your-skill/
│           └── SKILL.md
├── CLAUDE.md                     # Agent 系统提示词（可选）
├── .env                          # 环境变量（API Key）
└── package.json                  # 项目依赖
```

---

## 🔍 常见问题

### Q1: 我的项目没有 Tailwind CSS，怎么办？

**解决**：需要先配置 Tailwind CSS：

```bash
# 安装 Tailwind
npm install -D tailwindcss postcss autoprefixer

# 初始化配置
npx tailwindcss init -p
```

然后配置 `tailwind.config.js`：

```javascript
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

### Q2: 我的项目不是 React，能用吗？

**前端**：`@sandagent/sdk/react` 是 React hooks，需要 React 项目。如果你的项目不是 React，可以考虑：
- 使用 `@sandagent/sdk` 只做后端，前端自己实现
- 或者将 React 组件嵌入到你的项目中

**后端**：`@sandagent/sdk` 可以在任何 Node.js 框架中使用（Express、Fastify、Koa 等）。

### Q3: 如何传递 API Key？

**推荐方式**：从环境变量读取（更安全）

```typescript
// API 路由中
const apiKey = process.env.ANTHROPIC_API_KEY;
```

**备选方式**：从前端传递（方便测试）

```tsx
<SandAgentChat
  apiEndpoint="/api/ai"
  body={{
    ANTHROPIC_API_KEY: "sk-ant-...", // 不推荐，仅用于测试
  }}
/>
```

### Q4: 如何修改 Agent 的行为？

编辑 `CLAUDE.md` 文件，这是 Agent 的"性格"和"能力"定义。

### Q5: 如何添加自己的 Skill？

1. 在 `.claude/skills/` 目录下创建一个新文件夹（比如 `my-skill`）
2. 在文件夹里创建 `SKILL.md` 文件
3. 按照示例格式编写 skill 内容
4. 重启开发服务器

**Skill 文件格式示例：**

```markdown
---
name: my-skill
description: 这个 skill 的功能描述
---

# My Skill

这里是 skill 的详细说明...
```

### Q6: 生成的文件保存在哪里？

文件会保存在项目目录下的 `sandbox-xxx` 文件夹中（每次对话会创建新的隔离目录，保证安全）。

### Q7: 可以自定义界面样式吗？

可以！`SandAgentChat` 组件支持自定义：

```tsx
<SandAgentChat
  apiEndpoint="/api/ai"
  header={<div>自定义标题</div>}      // 自定义头部
  placeholder="自定义占位符"          // 自定义输入框提示
  emptyStateTitle="欢迎"               // 自定义空状态标题
  className="custom-class"             // 自定义样式类
  showArtifactPanel={false}            // 隐藏 artifact 面板
/>
```

---

## 🆚 LocalSandbox vs 云端沙箱

这个快速开始使用的是 **LocalSandbox**（本地沙箱），适合开发和小规模使用。

| 特性 | LocalSandbox（推荐） | 云端沙箱（E2B/Daytona） |
|------|---------------------|----------------------|
| **设置难度** | ✅ 超简单，无需配置 | ❌ 需要注册账号和 API Key |
| **运行速度** | ✅ 很快（本地运行） | ⚠️ 需要网络请求 |
| **安全性** | ⚠️ 本地运行，有隔离 | ✅ 完全隔离 |
| **费用** | ✅ 完全免费 | ⚠️ 可能收费 |
| **适用场景** | 开发、测试、学习 | 生产环境、大规模使用 |

**💡 建议：**
- **现在**：用 LocalSandbox 快速开发和测试
- **以后**：如果需要部署到生产环境，再考虑切换到云端沙箱

---

## 📚 想了解更多？

### 深入学习

- 📖 [SandAgent 完整文档](../README.md) - 了解更多高级功能
- 🔧 [@sandagent/sdk 文档](../packages/sdk/README.md) - AI Provider + React hooks
- 🛠️ [Anthropic Skills 示例](https://github.com/anthropics/skills) - 更多 Skill 参考
- 📘 [Claude Agent SDK 文档](https://docs.anthropic.com/claude/docs/agent-sdk) - 深入了解 SDK

### 使用云端沙箱

如果你需要生产环境或更强大的隔离能力，可以查看：
- [E2B Sandbox 集成](../packages/sandbox-e2b/README.md)
- [Daytona Sandbox 集成](../packages/sandbox-daytona/README.md)

### 完整示例项目

- **sandagent-quickstart** - 最简单的快速开始项目（Next.js）
- **sandagent-example** - 完整功能示例（包含模板选择、设置页面等）

---

## 🆘 遇到问题？

### 问题 1：页面显示 "ANTHROPIC_API_KEY is required"

**解决**：
1. 检查是否创建了 `.env` 文件
2. 确认 API Key 格式正确：`ANTHROPIC_API_KEY=sk-ant-...`
3. 重启开发服务器（修改 `.env` 后需要重启）
4. 或者在前端 `body` 中传递 API Key（仅用于测试）

### 问题 2：样式不显示

**解决**：
1. 检查 Tailwind CSS 是否已配置
2. 确认 `tailwind.config.js` 的 `content` 包含了你的组件路径
3. 确认 `globals.css` 中有 `@tailwind` 指令

### 问题 3：AI 回复很慢或超时

**解决**：
1. 检查网络连接
2. 确认 API Key 是否有效
3. 检查 `.claude/settings.json` 中的 `timeout_ms` 设置

### 问题 4：Skill 没有被加载

**解决**：
1. 确认 Skill 在 `.claude/skills/你的skill名/SKILL.md`
2. 检查 `SKILL.md` 文件格式（必须有 frontmatter）
3. 重启开发服务器

---

## 🎉 开始使用

现在你已经了解了如何快速集成，**开始在你的项目中使用 SandAgent 吧！**

**下一步：**
1. ✅ 安装依赖
2. ✅ 创建 API 端点
3. ✅ 添加前端组件
4. ✅ 配置 Skill（如果已有）
5. ✅ 测试聊天界面

**祝你使用愉快！** 🚀
