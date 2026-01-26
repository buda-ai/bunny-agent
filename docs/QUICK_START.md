# SandAgent 快速开始

**5 分钟接入 SandAgent，让你的项目拥有 Claude Agent 能力**

## 概述

SandAgent 是一个让 Claude Agent SDK 在隔离沙箱中运行的框架。你只需：
1. 安装依赖
2. 配置 API Key
3. 写 3 行代码

就可以在你的应用中集成强大的 AI Agent 功能。

---

## 快速开始

### 1. 安装依赖

```bash
npm install @sandagent/ai-provider @sandagent/sandbox-e2b ai
```

### 2. 配置环境变量

创建 `.env` 文件：

```bash
# E2B Sandbox API Key（从 https://e2b.dev 获取）
E2B_API_KEY=e2b_xxx

# Anthropic API Key
ANTHROPIC_API_KEY=sk-ant-xxx
```

### 3. 编写代码

创建 `agent.ts`：

```typescript
import "dotenv/config";
import { createSandAgent } from "@sandagent/ai-provider";
import { E2BSandbox } from "@sandagent/sandbox-e2b";
import { streamText } from "ai";

async function main() {
  // 创建 sandbox
  const sandbox = new E2BSandbox({
    template: "base",
    workdir: "/workspace",
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
    },
  });

  // 创建 agent provider
  const sandagent = createSandAgent({ sandbox });

  // 使用 Vercel AI SDK 调用
  const result = streamText({
    model: sandagent("claude-sonnet-4-20250514"),
    prompt: "Write a hello world in Python and run it",
  });

  // 流式输出
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
}

main();
```

### 4. 运行

```bash
npx tsx agent.ts
```

就这么简单！Claude Agent 会在隔离的沙箱中执行你的任务。

---

## 使用自定义模板（可选）

### 创建模板

在项目根目录创建 `templates/my-agent/CLAUDE.md`：

```markdown
# 数据分析专家

你是一个数据分析专家，擅长：
- SQL 查询和优化
- Python 数据分析（pandas, numpy）
- 数据可视化（matplotlib）

## 工作流程
1. 先理解数据结构
2. 编写清晰的 SQL/Python 代码
3. 验证结果后再展示
4. 提供清晰的可视化图表
```

### 使用模板

```typescript
import path from "path";

const sandbox = new E2BSandbox({
  template: "base",
  templatesPath: path.join(__dirname, "templates/my-agent"), // 指定模板路径
  workdir: "/workspace",
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  },
});
```

模板文件会在运行时自动上传到沙箱。

---

## Next.js 集成

### 创建 API Route

`app/api/ai/route.ts`：

```typescript
import { createSandAgent } from "@sandagent/ai-provider";
import { E2BSandbox } from "@sandagent/sandbox-e2b";
import { streamText } from "ai";

export const runtime = "edge";

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const sandbox = new E2BSandbox({
    template: "base",
    workdir: "/workspace",
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
    },
  });

  const sandagent = createSandAgent({ sandbox });

  const result = streamText({
    model: sandagent("claude-sonnet-4-20250514"),
    prompt,
  });

  return result.toDataStreamResponse();
}
```

### 客户端调用

```typescript
import { useChat } from "ai/react";

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: "/api/ai",
  });

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>
          {m.role}: {m.content}
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="输入任务..."
        />
      </form>
    </div>
  );
}
```

---

## 常见使用场景

### 1. 不使用模板（纯 Claude Agent SDK）

```typescript
const sandbox = new E2BSandbox({
  template: "base",
  // 不提供 templatesPath
  workdir: "/workspace",
});
```

### 2. 使用本地模板

```typescript
const sandbox = new E2BSandbox({
  template: "base",
  templatesPath: path.join(__dirname, "templates/my-agent"),
  workdir: "/workspace",
});
```

### 3. 使用 AWS Bedrock

```typescript
const sandbox = new E2BSandbox({
  template: "base",
  workdir: "/workspace",
  env: {
    AWS_BEARER_TOKEN_BEDROCK: process.env.AWS_BEARER_TOKEN_BEDROCK!,
  },
});

// 使用 Bedrock 模型 ID
const result = streamText({
  model: sandagent("us.anthropic.claude-sonnet-4-20250514-v1:0"),
  prompt: "...",
});
```

### 4. 使用 Daytona（支持持久化）

```bash
npm install @sandagent/sandbox-daytona
```

```typescript
import { DaytonaSandbox } from "@sandagent/sandbox-daytona";

const sandbox = new DaytonaSandbox({
  name: "my-agent",
  volumeName: "my-agent-volume", // 持久化存储
  workdir: "/workspace",
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  },
});
```

---

## 下一步

### 📖 深入学习

- **[创建自定义模板](../templates/README.md)** - 定制你的 Agent
- **[部署到生产环境](./DEPLOY_CUSTOM_TEMPLATE.md)** - 预部署模板到 Docker 镜像
- **[完整示例](../apps/sandagent-example)** - Next.js 完整应用示例

### 🎯 模板库

SandAgent 提供了多个预置模板：

| 模板 | 适用场景 |
|------|---------|
| `default` | 通用任务 |
| `coder` | 软件开发、代码审查、重构 |
| `analyst` | 数据分析、SQL、可视化 |
| `researcher` | 网络研究、信息收集 |
| `seo-agent` | SEO 优化、关键词研究 |

### 🚀 生产环境优化

如果你的应用需要更快的启动速度（跳过依赖安装），可以预部署模板到 Docker 镜像：

```bash
cd docker/sandagent-claude

# 部署到 E2B（包含你的模板）
make e2b TEMPLATE=my-agent
```

然后在代码中使用：

```typescript
const sandbox = new E2BSandbox({
  template: "sandagent-claude-my-agent", // 预部署的模板
  workdir: "/workspace",
});
```

详见 [部署文档](./DEPLOY_CUSTOM_TEMPLATE.md)。

---

## 常见问题

### Q: E2B API Key 如何获取？

访问 https://e2b.dev 注册并创建 API Key。

### Q: 支持哪些模型？

支持所有 Anthropic 模型：
- `claude-sonnet-4-20250514`（推荐）
- `claude-opus-4-20250514`
- `claude-3-5-sonnet-20241022`
- AWS Bedrock 模型：`us.anthropic.claude-sonnet-4-20250514-v1:0`

### Q: 必须使用模板吗？

不是必须的。模板是可选的，不提供 `templatesPath` 就是使用纯 Claude Agent SDK。

### Q: E2B 和 Daytona 有什么区别？

- **E2B**：快速启动（3-5秒），无状态，适合短任务
- **Daytona**：支持 Volume 持久化，适合长期运行、需要保存文件的场景

### Q: 首次运行为什么慢？

首次运行需要安装 `@anthropic-ai/claude-agent-sdk` 和 `@sandagent/runner-cli`（约 1-2 分钟）。如果需要更快启动，可以预部署模板到 Docker 镜像。

---

## 示例项目

完整的 Next.js 应用示例：

```bash
git clone https://github.com/vikadata/sandagent.git
cd sandagent
pnpm install && pnpm build

cd apps/sandagent-example
pnpm dev
```

打开 http://localhost:3000，在设置页面配置 API Keys，即可开始使用。

---

## 获取帮助

- **文档**：[完整文档](../README.md)
- **GitHub Issues**：[提交问题](https://github.com/vikadata/sandagent/issues)
- **示例代码**：[apps/sandagent-example](../apps/sandagent-example)
