# 使用 SandAgent - 部署与集成指南

## 概述

SandAgent 支持两种使用方式：

1. **基础模式**：只需 runner + Claude Agent SDK，无需模板
2. **模板模式**：可选预部署模板到 Docker 镜像，实现更快的启动速度

本文档介绍这两种方式，并指导如何在你的项目中集成。

---

## 方式一：基础模式（无需部署）

**适用场景**：快速开始，动态切换模板，本地开发

### 特点

- ✅ 无需提前部署 Docker 镜像
- ✅ 模板文件在运行时上传（通过 `templatesPath` 参数）
- ✅ 灵活切换不同模板
- ✅ 也可以完全不使用模板
- ⏱️ 首次启动需要安装依赖（约 1-2 分钟）

### 使用场景

1. **无模板**：只使用 Claude Agent SDK，不需要自定义系统指令
2. **有模板**：使用 `templatesPath` 指定本地模板路径，运行时上传

### 在项目中使用

#### 安装依赖

```bash
# 核心包 + AI Provider
npm install @sandagent/ai-provider ai

# 选择 Sandbox 平台（二选一）
npm install @sandagent/sandbox-e2b      # E2B（推荐）
npm install @sandagent/sandbox-daytona  # Daytona（支持持久化）
```

#### 配置环境变量

在项目根目录创建 `.env`：

```bash
# ===== Sandbox 平台（二选一）=====
# 选项 1: E2B（推荐）
E2B_API_KEY=e2b_xxx

# 选项 2: Daytona（支持持久化）
# DAYTONA_API_KEY=dtn_xxx

# ===== AI 提供商（二选一）=====
# 选项 1: Anthropic API
ANTHROPIC_API_KEY=sk-ant-xxx

# 选项 2: AWS Bedrock
# AWS_BEARER_TOKEN_BEDROCK=xxx
```

#### 代码示例（E2B）

```typescript
import "dotenv/config";
import { createSandAgent } from "@sandagent/ai-provider";
import { E2BSandbox } from "@sandagent/sandbox-e2b";
import { streamText } from "ai";
import path from "path";

async function main() {
  // 创建 E2B sandbox（运行时自动安装依赖并上传模板）
  const sandbox = new E2BSandbox({
    template: "base", // 使用 E2B 基础镜像
    templatesPath: path.join(__dirname, "../templates/researcher"), // 本地模板路径
    workdir: "/workspace",
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
    },
  });

  // 创建 SandAgent provider
  const sandagent = createSandAgent({
    sandbox,
    verbose: true,
  });

  // 使用任意 Anthropic 模型
  const result = streamText({
    model: sandagent("claude-sonnet-4-20250514"),
    prompt: "Write a hello world in Python and run it",
  });

  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
}

main().catch(console.error);
```

> **说明**：`templatesPath` 指向本地模板目录，模板文件（`CLAUDE.md`, `.claude/` 等）会在运行时自动上传到 sandbox 的 `/workspace/` 目录。

#### 代码示例（Daytona）

```typescript
import "dotenv/config";
import { createSandAgent } from "@sandagent/ai-provider";
import { DaytonaSandbox } from "@sandagent/sandbox-daytona";
import { streamText } from "ai";
import path from "path";

async function main() {
  // 创建 Daytona sandbox（支持持久化）
  const sandbox = new DaytonaSandbox({
    name: "my-agent", // 可选：指定名称实现 sandbox 复用
    volumeName: "my-agent-volume", // 可选：持久化存储
    templatesPath: path.join(__dirname, "../templates/researcher"), // 本地模板路径
    workdir: "/workspace",
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
    },
  });

  const sandagent = createSandAgent({
    sandbox,
    verbose: true,
  });

  const result = streamText({
    model: sandagent("claude-sonnet-4-20250514"),
    prompt: "Write a hello world in Python and run it",
  });

  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
}

main().catch(console.error);
```

> **说明**：`templatesPath` 是可选的。如果不提供，则不使用模板，直接使用纯净的 Claude Agent SDK。

---

## 方式二：模板模式（预部署）

**适用场景**：生产环境，追求极致性能，固定模板

### 特点

- ⚡ 启动快速（跳过依赖安装）
- 📦 模板文件预装在镜像中
- 🎯 适合固定模板的生产环境
- 🔧 需要提前部署到 E2B 或 Daytona

### 前置条件

1. 在 `templates/` 目录下创建模板（可选，没有模板也可以部署）
2. 安装 Docker（用于构建镜像）
3. 配置 API Key：
   - E2B：在 `.env` 中设置 `E2B_API_KEY`
   - Daytona：在 `.env` 中设置 `DAYTONA_API_KEY`
4. 可选工具（推荐但非必需）：
   - E2B CLI：`npm install -g @e2b/cli` - 用于管理和查看模板
   - Daytona CLI - 用于管理和查看 snapshots

> **说明**：部署脚本使用 E2B SDK 和 Daytona SDK 完成部署，CLI 工具仅用于查看和管理已部署的资源，非必需。

---

## 部署到 E2B

### 步骤 1：配置环境变量

在 `docker/sandagent-claude/` 目录下创建 `.env`：

```bash
# E2B API Key（从 https://e2b.dev 获取）
E2B_API_KEY=e2b_xxx

# 可选：自定义镜像版本号（默认 0.1.0）
# IMAGE_TAG=1.0.0
```

### 步骤 2：部署

```bash
cd docker/sandagent-claude

# 方案 A：只部署 runner + Claude SDK（无模板）
make e2b

# 方案 B：部署 + 包含自定义模板
make e2b TEMPLATE=researcher

# 强制更新已存在的模板
make e2b TEMPLATE=researcher FORCE=true
```

**工作原理**：
- Makefile 调用 `build-e2b-template.ts` 脚本
- 脚本使用 E2B SDK (`@e2b/sdk`) 创建模板
- CLI 工具是可选的，仅用于查看模板列表

**生成的 E2B 模板**：
- **别名**（推荐使用）：
  - 无模板：`sandagent-claude`
  - 有模板：`sandagent-claude-researcher`
- **模板 ID**：部署时输出，如 `0ztjw3uqpwmhryuwo8vh`

使用时可以用别名或模板 ID：
```typescript
template: "sandagent-claude-researcher"  // 使用别名（推荐）
// 或
template: "0ztjw3uqpwmhryuwo8vh"  // 使用模板 ID
```

### 步骤 3：在项目中使用

```typescript
import { E2BSandbox } from "@sandagent/sandbox-e2b";

const sandbox = new E2BSandbox({
  template: "sandagent-claude-researcher", // 使用别名
  // 或者使用模板 ID: template: "0ztjw3uqpwmhryuwo8vh"
  workdir: "/workspace",
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  },
});
```

> **说明**：`template` 参数可以是：
> - **别名**（推荐）：如 `sandagent-claude-researcher`
> - **模板 ID**：如 `0ztjw3uqpwmhryuwo8vh`（从 E2B Dashboard 或部署输出获取）

---

## 部署到 Daytona

### 步骤 1：配置环境变量

在 `docker/sandagent-claude/` 目录下的 `.env` 中添加：

```bash
# Daytona API Key（从 https://app.daytona.io 获取）
DAYTONA_API_KEY=dtn_xxx

# 可选：自定义镜像版本号
# IMAGE_TAG=1.0.0
```

### 步骤 2：部署

```bash
cd docker/sandagent-claude

# 方案 A：只部署 runner + Claude SDK（无模板）
make daytona

# 方案 B：部署 + 包含自定义模板
make daytona TEMPLATE=researcher

# 强制更新已存在的 snapshot
make daytona TEMPLATE=researcher FORCE=true
```

**工作原理**：
- Makefile 调用 `build-daytona-snapshot.ts` 脚本
- 脚本使用 Daytona SDK (`@daytonaio/sdk`) 创建 snapshot
- CLI 工具是可选的，仅用于查看 snapshot 列表

**生成的 Daytona snapshot 名称**：
- 无模板：`sandagent-claude:0.1.0`
- 有模板：`sandagent-claude-researcher:0.1.0`

### 步骤 3：在项目中使用

```typescript
import { DaytonaSandbox } from "@sandagent/sandbox-daytona";

const sandbox = new DaytonaSandbox({
  snapshot: "sandagent-claude-researcher:0.1.0", // 你部署的 snapshot 名称
  name: "my-agent", // 可选：sandbox 名称（用于复用）
  volumeName: "my-agent-volume", // 可选：持久化存储
  workdir: "/workspace",
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  },
});
```

---

## 模板文件说明

### 模板结构（可选）

```
templates/my-agent/
├── CLAUDE.md              # Agent 系统指令（必需）
├── .claude/
│   ├── settings.json      # Claude 配置（可选）
│   └── mcp.json           # MCP 服务器配置（可选）
└── skills/                # 技能文件（可选）
    └── skill1.md
```

### 模板文件处理

部署时（`make e2b/daytona TEMPLATE=xxx`）：
1. 模板文件被打包进 Docker 镜像（位于 `/opt/sandagent/templates/`）
2. Sandbox 启动时自动复制到 `/workspace/`
3. 你也可以在代码中通过 `templatesPath` 动态覆盖

运行时覆盖（可选）：

```typescript
const sandbox = new E2BSandbox({
  template: "sandagent-claude-researcher",
  templatesPath: "/path/to/local/templates/my-agent", // 本地模板路径
  workdir: "/workspace",
});
```

---

## 高级用法

### 1. 本地开发模式

使用本地模板测试，无需部署：

```typescript
const sandbox = new E2BSandbox({
  template: "base", // 使用基础镜像
  templatesPath: "./templates/my-agent", // 本地模板路径
  workdir: "/workspace",
});
```

### 2. 自定义版本号

在 `.env` 文件中：

```bash
IMAGE_TAG=1.0.0
```

或命令行：

```bash
make daytona TEMPLATE=researcher IMAGE_TAG=1.0.0
```

### 3. 切换到其他平台

如已部署到 E2B，想同时支持 Daytona：

```bash
make daytona TEMPLATE=researcher
```

### 4. Next.js App Router 集成

```typescript
// app/api/ai/route.ts
import { createSandAgent } from "@sandagent/ai-provider";
import { E2BSandbox } from "@sandagent/sandbox-e2b";
import { streamText } from "ai";

export const runtime = "edge";

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const sandbox = new E2BSandbox({
    template: "sandagent-claude-researcher",
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

### Q: 必须部署 Docker 镜像吗？

**不是**。基础模式（方式一）无需部署，运行时自动安装依赖。部署镜像只是为了更快的启动速度。

### Q: 可以不使用模板吗？

**可以**。模板是完全可选的：

**情况 1：不使用模板**
```typescript
const sandbox = new E2BSandbox({
  template: "base",
  // 不提供 templatesPath，直接使用 Claude Agent SDK
  workdir: "/workspace",
});
```

**情况 2：使用本地模板（基础模式）**
```typescript
const sandbox = new E2BSandbox({
  template: "base",
  templatesPath: path.join(__dirname, "../templates/researcher"), // 运行时上传
  workdir: "/workspace",
});
```

**情况 3：使用预部署的模板（模板模式）**
```typescript
const sandbox = new E2BSandbox({
  template: "sandagent-claude-researcher", // 预部署的模板别名
  // 或使用模板 ID: template: "0ztjw3uqpwmhryuwo8vh"
  workdir: "/workspace",
});
```

### Q: 模板更新后需要重新部署吗？

视情况而定：
- **如果使用 `templatesPath` 动态上传**：不需要，直接修改本地模板文件即可
- **如果使用预部署的镜像**：需要重新运行 `make e2b/daytona TEMPLATE=xxx FORCE=true`

### Q: E2B 和 Daytona 有什么区别？

| 特性 | E2B | Daytona |
|------|-----|---------|
| 启动速度 | 快（3-5秒） | 中等（5-10秒） |
| 持久化 | 无状态（pause/resume） | Volume 持久化 |
| 计费 | 按使用时长 | 按资源配置 |
| 适用场景 | 短任务、无状态 | 长期运行、需保存文件 |

### Q: 支持哪些 Claude 模型？

`sandagent()` 接受任何 Anthropic 模型 ID：

**Anthropic API**：
- `claude-sonnet-4-20250514`（推荐）
- `claude-opus-4-20250514`
- `claude-3-5-sonnet-20241022`
- 以及任何新发布的模型

**AWS Bedrock**：
- `us.anthropic.claude-sonnet-4-20250514-v1:0`
- `us.anthropic.claude-opus-4-20250514-v1:0`

### Q: 部署失败怎么办？

1. 检查环境变量（`E2B_API_KEY` 或 `DAYTONA_API_KEY`）
2. 检查 Docker 是否运行
3. 使用 `FORCE=true` 强制覆盖
4. 查看详细日志

---

## 完整示例

参考 [apps/sandagent-example](../apps/sandagent-example) 查看完整的工作示例。

---

## 相关文档

- [Agent Templates 介绍](../templates/README.md)
- [E2B 设计文档](../docker/sandagent-claude/E2B_DESIGN.md)
- [Daytona 设计文档](../docker/sandagent-claude/DAYTONA_DESIGN.md)
- [Docker 镜像说明](../docker/sandagent-claude/README.md)
- [Vercel AI SDK 文档](https://sdk.vercel.ai/docs)
