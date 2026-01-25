# 部署自定义模板到生产环境

## 面向对象

本文档面向已经完成 Agent 模板开发的开发者，指导如何将自定义模板部署到生产环境，并在自己的项目中通过 AI Provider 使用。

## 前置条件

1. 你已经在 `templates/` 目录下创建了自定义模板（参考 [templates/README.md](../templates/README.md)）
2. 你的模板结构如下：

```
templates/my-agent/
├── CLAUDE.md              # Agent 系统指令（必需）
├── .claude/
│   ├── settings.json      # Claude 配置（可选）
│   └── mcp.json           # MCP 服务器配置（可选）
└── skills/                # 技能文件（可选）
    └── skill1.md
```

3. 你已安装必要的工具：
   - Docker
   - E2B CLI（用于 E2B 部署）：`npm install -g @e2b/cli`
   - Daytona CLI（用于 Daytona 部署）：参考 [Daytona 文档](https://www.daytona.io/docs)

## 部署流程

### 选择部署平台（二选一）

SandAgent 支持两种 Sandbox 平台，**选择其中一个**即可：

| 平台 | 优势 | 适用场景 |
|------|------|---------|
| **E2B** | 快速启动、按需计费、无需管理基础设施 | 轻量级应用、快速原型、按需使用 |
| **Daytona** | 持久化存储（Volume）、支持长时间运行 | 需要保存状态、长期会话、复杂工作流 |

**建议**：大多数场景选择 E2B 即可。如果需要保存文件或长期运行的 Agent，选择 Daytona。

以下根据你的选择，按照对应的章节操作。

---

## 部署到 E2B

### 步骤 1：配置环境变量

在 `docker/sandagent-claude/` 目录下创建或编辑 `.env` 文件：

```bash
# E2B API Key（从 https://e2b.dev 获取）
E2B_API_KEY=e2b_xxx

# 可选：自定义镜像版本号（默认 0.1.0）
# IMAGE_TAG=1.0.0
```

### 步骤 2：构建并部署模板

```bash
cd docker/sandagent-claude

# 构建并部署（将 my-agent 替换为你的模板名称）
make e2b TEMPLATE=my-agent
```

这会：
1. 生成包含你模板文件的 Dockerfile
2. 构建 Docker 镜像
3. 使用 E2B CLI 将镜像发布为 E2B template
4. 创建别名：`sandagent-claude-my-agent`

### 步骤 3：强制更新已存在的模板（可选）

如果模板已存在需要更新：

```bash
make e2b TEMPLATE=my-agent FORCE=true
```

### 步骤 4：验证部署

```bash
# 查看已部署的模板
e2b template list
```

你应该能看到 `sandagent-claude-my-agent` 在列表中。

---

## 部署到 Daytona

### 步骤 1：配置环境变量

在 `docker/sandagent-claude/` 目录下的 `.env` 文件中添加：

```bash
# Daytona API Key（从 https://app.daytona.io 获取）
DAYTONA_API_KEY=dtn_xxx

# 可选：自定义镜像版本号（默认 0.1.0）
# IMAGE_TAG=1.0.0
```

### 步骤 2：构建并部署 Snapshot

```bash
cd docker/sandagent-claude

# 构建并部署（将 my-agent 替换为你的模板名称）
make daytona TEMPLATE=my-agent
```

这会：
1. 生成包含你模板文件的 Dockerfile
2. 构建 Docker 镜像（包含预装依赖和模板文件）
3. 使用 Daytona CLI 推送 snapshot
4. 创建 snapshot：`sandagent-claude-my-agent:0.1.2`（版本号来自 `package.json`）

### 步骤 3：强制更新已存在的 Snapshot（可选）

如果 snapshot 已存在需要更新：

```bash
make daytona TEMPLATE=my-agent FORCE=true
```

### 步骤 4：验证部署

```bash
# 查看已部署的 snapshots
daytona snapshot list
```

你应该能看到 `sandagent-claude-my-agent` 在列表中。

---

## 在你的项目中使用

部署完成后，你可以在**任何 Node.js 项目**中使用已部署的模板。

### 安装依赖

在**你的项目根目录**下：

```bash
# 安装核心包 + AI Provider
npm install @sandagent/ai-provider ai

# 根据你选择的 Sandbox 平台安装（二选一）
npm install @sandagent/sandbox-e2b      # 如果使用 E2B
npm install @sandagent/sandbox-daytona  # 如果使用 Daytona
```

或使用 pnpm：

```bash
pnpm add @sandagent/ai-provider ai

# 二选一
pnpm add @sandagent/sandbox-e2b      # E2B
pnpm add @sandagent/sandbox-daytona  # Daytona
```

### 使用 E2B 模板

创建 `agent.ts`：

```typescript
import "dotenv/config";
import { createSandAgent } from "@sandagent/ai-provider";
import { E2BSandbox } from "@sandagent/sandbox-e2b";
import { streamText } from "ai";

async function main() {
  // 创建 E2B sandbox（使用你部署的模板）
  const sandbox = new E2BSandbox({
    template: "sandagent-claude-my-agent", // 你的模板名称
    workdir: "/workspace",
    env: {
      // 传递 API Key 到 sandbox
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
      // 或使用 AWS Bedrock
      // AWS_BEARER_TOKEN_BEDROCK: process.env.AWS_BEARER_TOKEN_BEDROCK!,
      // CLAUDE_CODE_USE_BEDROCK: "1",
    },
  });

  // 创建 sandagent provider
  const sandagent = createSandAgent({
    sandbox,
    verbose: true, // 开启详细日志
  });

  // 使用 Vercel AI SDK 调用
  const result = streamText({
    model: sandagent("claude-sonnet-4-20250514"), // 任何 Anthropic 模型 ID
    prompt: "你的任务指令",
  });

  // 流式输出响应
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
}

main().catch(console.error);
```

### 使用 Daytona Snapshot

创建 `agent.ts`：

```typescript
import "dotenv/config";
import { createSandAgent } from "@sandagent/ai-provider";
import { DaytonaSandbox } from "@sandagent/sandbox-daytona";
import { streamText } from "ai";

async function main() {
  // 创建 Daytona sandbox（使用你部署的 snapshot）
  const sandbox = new DaytonaSandbox({
    snapshot: "sandagent-claude-my-agent:0.1.2", // 你的 snapshot 名称:版本
    workdir: "/workspace",
    volumeName: "my-agent-volume", // 可选：持久化存储
    env: {
      // 传递 API Key 到 sandbox
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
      // 或使用 AWS Bedrock
      // AWS_BEARER_TOKEN_BEDROCK: process.env.AWS_BEARER_TOKEN_BEDROCK!,
      // CLAUDE_CODE_USE_BEDROCK: "1",
    },
  });

  // 创建 sandagent provider
  const sandagent = createSandAgent({
    sandbox,
    verbose: true,
  });

  // 使用 Vercel AI SDK 调用
  const result = streamText({
    model: sandagent("claude-sonnet-4-20250514"),
    prompt: "你的任务指令",
  });

  // 流式输出响应
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
}

main().catch(console.error);
```

### 配置环境变量

在**你的项目根目录**下创建 `.env` 文件：

```bash
# ===== Sandbox 平台（二选一）=====
# 选项 1: 使用 E2B
E2B_API_KEY=e2b_xxx

# 选项 2: 使用 Daytona
# DAYTONA_API_KEY=dtn_xxx

# ===== AI 提供商（二选一）=====
# 选项 1: 直接使用 Anthropic API
ANTHROPIC_API_KEY=sk-ant-xxx

# 选项 2: 使用 AWS Bedrock
# AWS_BEARER_TOKEN_BEDROCK=xxx
# （会自动设置 CLAUDE_CODE_USE_BEDROCK=1）
```

> **注意**：
> - **Sandbox 平台**：E2B 和 Daytona 二选一，配置对应的 API Key
> - **AI 提供商**：Anthropic API 和 AWS Bedrock 二选一
> - 这个 `.env` 是在**你的应用项目**中，不是 `docker/sandagent-claude/` 目录下的 `.env`

### 运行你的 Agent

```bash
# 使用 ts-node 或 tsx
npx tsx agent.ts

# 或编译后运行
tsc agent.ts && node agent.js
```

---

## 高级用法

### 1. 使用本地模板覆盖（开发模式）

在部署前测试模板，可以使用本地模板路径：

```typescript
const sandbox = new E2BSandbox({
  template: "base", // 使用基础镜像
  templatesPath: "/path/to/templates/my-agent", // 本地模板路径
  workdir: "/workspace",
});
```

### 2. 自定义模板版本号

Daytona snapshot 版本号默认为 `0.1.0`，你可以：

**方式 1：在 `.env` 文件中指定**（推荐）

```bash
# docker/sandagent-claude/.env
IMAGE_TAG=1.0.0
```

然后直接运行：

```bash
make daytona TEMPLATE=my-agent
```

**方式 2：命令行参数指定**

```bash
make daytona TEMPLATE=my-agent IMAGE_TAG=1.0.0
```

### 3. 根据需要部署到其他平台

如果之后想切换或同时支持另一个平台：

```bash
# 已部署到 E2B，现在也想部署到 Daytona
make daytona TEMPLATE=my-agent

# 已部署到 Daytona，现在也想部署到 E2B
make e2b TEMPLATE=my-agent
```

### 4. 与 Next.js App Router 集成

创建 API Route (`app/api/ai/route.ts`)：

```typescript
import { createSandAgent } from "@sandagent/ai-provider";
import { E2BSandbox } from "@sandagent/sandbox-e2b";
import { streamText } from "ai";

export const runtime = "edge";

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const sandbox = new E2BSandbox({
    template: "sandagent-claude-my-agent",
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

---

## 常见问题

### Q: 模板更新后需要重新部署吗？

**是的**。修改模板文件后需要重新运行 `make e2b` 或 `make daytona` 来更新部署。

### Q: E2B 和 Daytona 有什么区别？

- **E2B**：无状态，每次运行都是全新环境。适合短任务、无需保存状态。
- **Daytona**：支持 Volume 持久化，可以保存文件和状态。适合长期运行的 Agent。

### Q: 如何选择模型？

`sandagent()` 函数接受任何 Anthropic 模型 ID，包括：

**Anthropic API 模型：**
- `claude-sonnet-4-20250514` - Claude Sonnet 4（推荐）
- `claude-opus-4-20250514` - Claude Opus 4（最强大）
- `claude-3-5-sonnet-20241022` - Claude 3.5 Sonnet
- 以及任何其他 Anthropic 支持的模型

**AWS Bedrock 模型：**
- `us.anthropic.claude-sonnet-4-20250514-v1:0`
- `us.anthropic.claude-opus-4-20250514-v1:0`
- 以及其他 Bedrock 区域的模型 ID

传入的模型 ID 会直接传递给底层的 Anthropic SDK，无需额外配置。

### Q: 可以在一个项目中使用多个模板吗？

**可以**。为每个任务创建不同的 sandbox 实例：

```typescript
const sandbox1 = new E2BSandbox({ template: "sandagent-claude-analyst" });
const sandbox2 = new E2BSandbox({ template: "sandagent-claude-coder" });

const analyst = createSandAgent({ sandbox: sandbox1 });
const coder = createSandAgent({ sandbox: sandbox2 });
```

### Q: 部署失败了怎么办？

1. 检查环境变量是否正确设置（`E2B_API_KEY` 或 `DAYTONA_API_KEY`）
2. 检查 Docker 是否正在运行
3. 使用 `FORCE=true` 强制覆盖已存在的模板
4. 查看构建日志排查错误

---

## 完整示例

参考 [apps/sandagent-provider-example](../apps/sandagent-provider-example) 目录查看完整的工作示例：

- `test-e2b.ts` - E2B 使用示例
- `test-daytona.ts` - Daytona 使用示例
- `.env.example` - 环境变量示例

---

## 相关文档

- [Agent Templates 介绍](../templates/README.md)
- [E2B 设计文档](../docker/sandagent-claude/E2B_DESIGN.md)
- [Daytona 设计文档](../docker/sandagent-claude/DAYTONA_DESIGN.md)
- [Vercel AI SDK 文档](https://sdk.vercel.ai/docs)

---

## 技术支持

如有问题，请在 [GitHub Issues](https://github.com/your-repo/sandagent/issues) 中提交。
