# 服务端沙箱部署架构指南

本文档帮助你理解服务端沙箱的架构设计，以及如何打包、部署自定义 Docker 镜像并在代码中集成使用。

---

## 为什么需要服务端沙箱？

### 本地沙箱 vs 服务端沙箱

| 特性 | LocalSandbox | 服务端沙箱（E2B/Daytona/Sandock） |
|------|--------------|----------------------------------|
| 运行环境 | 本地进程 | 云端隔离容器 |
| 代码扫描 | ⚠️ 扫描用户本地代码库 | ✅ 完全隔离，不接触用户代码 |
| 安全性 | 较低（共享本地环境） | 高（容器级隔离） |
| 资源管理 | 共享本地资源 | 独立分配 CPU/内存 |
| 持久化 | 本地文件系统 | Volume 挂载（可选） |
| 适用场景 | 开发调试 | 生产环境 |

**服务端沙箱的核心优势**：

1. **安全隔离**：Agent 在独立容器中运行，不会扫描或访问用户的本地代码库
2. **环境一致性**：预装依赖，避免本地环境差异导致的问题
3. **资源可控**：独立的 CPU、内存配额，不影响用户本地机器
4. **可扩展性**：云端动态扩缩容，支持并发任务

---

## 整体架构

### 数据流示意图

```mermaid
flowchart TB
  subgraph client [Client]
    WebUI[Web UI / CLI]
  end
  
  subgraph server [Server]
    NextJS[Next.js API]
    SDK[SandAgent SDK]
    Adapter[Sandbox Adapter]
  end
  
  subgraph sandbox [Cloud Sandbox]
    Runner[sandagent CLI]
    Claude[Claude Agent SDK]
    Workspace[/workspace]
  end
  
  WebUI -->|HTTP Stream| NextJS
  NextJS --> SDK
  SDK --> Adapter
  Adapter -->|exec command| Runner
  Runner --> Claude
  Claude -->|File I/O| Workspace
  
  style sandbox fill:#e1f5fe
  style server fill:#fff3e0
  style client fill:#f3e5f5
```

### 组件说明

| 组件 | 职责 | 位置 |
|------|------|------|
| **Web UI** | 用户交互界面，发起任务请求 | 客户端 |
| **Next.js API** | 接收请求，调用 SDK | 服务端 |
| **SandAgent SDK** | 创建 AI Provider，管理沙箱生命周期 | 服务端 |
| **Sandbox Adapter** | 适配不同沙箱平台（E2B/Daytona/Sandock） | 服务端 |
| **sandagent CLI** | 在沙箱内运行 Claude Agent | 沙箱内 |
| **Claude Agent SDK** | Anthropic 官方 SDK，执行 AI 任务 | 沙箱内 |
| **Workspace** | Agent 工作目录，存放代码和文件 | 沙箱内 |

---

## 支持的沙箱平台

SandAgent 支持三种云端沙箱平台，它们都实现了统一的 `SandboxAdapter` 接口：

| 平台 | 特点 | 启动速度 | 持久化 | 适用场景 |
|------|------|----------|--------|----------|
| **E2B** | 快速启动、Pause/Resume | ~3-5秒 | 无状态（可暂停30天） | 短任务、按需计费 |
| **Daytona** | Volume 持久化、自动停止 | ~5-10秒 | Volume 挂载 | 长期运行、需保存状态 |
| **Sandock** | 自定义 Docker 镜像 | ~5-10秒 | Volume 挂载 | 自托管、完全控制 |

### E2B

```typescript
import { E2BSandbox } from "@sandagent/sandbox-e2b";

const sandbox = new E2BSandbox({
  template: "sandagent-claude-researcher",  // 自定义模板别名
  timeout: 3600,                            // 超时时间（秒）
  name: "my-agent",                         // 沙箱名称（用于复用）
  workdir: "/workspace",
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  },
});
```

**配置项**：

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `apiKey` | `string` | `env.E2B_API_KEY` | E2B API Key |
| `template` | `string` | `"base"` | 模板别名或 ID |
| `timeout` | `number` | `3600` | 超时时间（秒） |
| `name` | `string` | - | 沙箱名称（用于复用） |
| `workdir` | `string` | `"/workspace"` | 工作目录 |
| `env` | `Record<string, string>` | - | 环境变量 |
| `templatesPath` | `string` | - | 本地模板路径（运行时上传） |

### Daytona

```typescript
import { DaytonaSandbox } from "@sandagent/sandbox-daytona";

const sandbox = new DaytonaSandbox({
  snapshot: "sandagent-claude-researcher:0.1.0",  // 预部署的 snapshot
  name: "my-agent",                               // 沙箱名称（用于复用）
  volumeName: "my-agent-volume",                  // Volume 名称
  autoStopInterval: 15,                           // 自动停止（分钟）
  workdir: "/workspace",
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  },
});
```

**配置项**：

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `apiKey` | `string` | `env.DAYTONA_API_KEY` | Daytona API Key |
| `apiUrl` | `string` | `env.DAYTONA_API_URL` | API 地址 |
| `snapshot` | `string` | - | 预部署的 snapshot 名称 |
| `name` | `string` | - | 沙箱名称（用于复用） |
| `volumeName` | `string` | - | Volume 名称（持久化） |
| `autoStopInterval` | `number` | `15` | 空闲自动停止（分钟） |
| `autoDeleteInterval` | `number` | `0` | 停止后自动删除（分钟） |
| `workdir` | `string` | `"/workspace"` | 工作目录 |
| `env` | `Record<string, string>` | - | 环境变量 |

### Sandock

```typescript
import { SandockSandbox } from "@sandagent/sandbox-sandock";

const sandbox = new SandockSandbox({
  image: "sandockai/sandock-code:latest",  // Docker 镜像
  memoryLimitMb: 2048,                     // 内存限制（MB）
  cpuShares: 2,                            // CPU 配额
  volumeName: "my-volume",                 // Volume 名称
  workdir: "/workspace",
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  },
});
```

---

## Docker 镜像打包流程

SandAgent 提供了完整的 Docker 镜像构建流程，位于 `docker/sandagent-claude/` 目录。

### 目录结构

```
docker/sandagent-claude/
├── Dockerfile           # 基础 Dockerfile
├── Dockerfile.template  # 带模板占位符的 Dockerfile
├── Makefile             # 构建部署脚本
├── generate-dockerfile.sh      # 生成带模板的 Dockerfile
├── build-e2b-template.ts       # E2B 部署脚本
├── build-daytona-snapshot.ts   # Daytona 部署脚本
├── .env.example         # 环境变量示例
└── README.md
```

### 基础镜像内容

基础镜像 (`Dockerfile`) 预装了：

1. **Node.js 20** - 运行时环境
2. **@anthropic-ai/claude-agent-sdk** - Claude Agent SDK
3. **@sandagent/runner-cli** - SandAgent CLI 工具
4. **常用工具** - git, curl 等

```dockerfile
FROM node:20-slim

# 预装依赖到 /opt/sandagent
RUN mkdir -p /opt/sandagent && \
    cd /opt/sandagent && \
    npm init -y && \
    npm install --no-audit --no-fund \
    @anthropic-ai/claude-agent-sdk \
    @sandagent/runner-cli@beta

# 创建 sandagent 系统命令
RUN echo '#!/usr/bin/env node' > /usr/local/bin/sandagent && \
    echo 'import("/opt/sandagent/node_modules/@sandagent/runner-cli/dist/bundle.mjs")' >> /usr/local/bin/sandagent && \
    chmod +x /usr/local/bin/sandagent

ENV NODE_PATH=/opt/sandagent/node_modules
```

### 添加自定义模板

使用 `generate-dockerfile.sh` 可以将模板文件打包到镜像中：

```bash
# 生成包含 researcher 模板的 Dockerfile
./generate-dockerfile.sh researcher ../../templates true
```

生成的镜像会将模板文件放在 `/opt/sandagent/templates/`，沙箱启动时自动复制到 `/workspace/`。

---

## 快速部署命令

### 配置环境变量

在 `docker/sandagent-claude/.env` 中配置：

```bash
# E2B 部署
E2B_API_KEY=e2b_xxx

# Daytona 部署
DAYTONA_API_KEY=dtn_xxx

# 可选：自定义版本号
IMAGE_TAG=0.1.0
```

### 部署到 E2B

```bash
cd docker/sandagent-claude

# 部署基础镜像（不含模板）
make e2b

# 部署包含模板的镜像
make e2b TEMPLATE=researcher

# 强制更新已存在的模板
make e2b TEMPLATE=researcher FORCE=true

# 自定义资源配置
make e2b TEMPLATE=researcher CPU=4 MEMORY=8
```

**生成的模板名称**：
- 无模板：`sandagent-claude`
- 有模板：`sandagent-claude-researcher`

### 部署到 Daytona

```bash
cd docker/sandagent-claude

# 部署基础 snapshot
make daytona

# 部署包含模板的 snapshot
make daytona TEMPLATE=researcher

# 强制更新已存在的 snapshot
make daytona TEMPLATE=researcher FORCE=true

# 自定义资源配置
make daytona TEMPLATE=researcher CPU=4 MEMORY=8 DISK=16
```

**生成的 snapshot 名称**：
- 无模板：`sandagent-claude:0.1.0`
- 有模板：`sandagent-claude-researcher:0.1.0`

### 查看已部署的资源

```bash
# 查看 Daytona snapshots
make list

# 查看 E2B 模板（需要 E2B CLI）
e2b template list
```

---

## SDK 集成代码示例

### 基础用法

```typescript
import { createSandAgent } from "@sandagent/sdk";
import { E2BSandbox } from "@sandagent/sandbox-e2b";
import { streamText } from "ai";

async function main() {
  // 1. 创建沙箱适配器
  const sandbox = new E2BSandbox({
    template: "sandagent-claude-researcher",
    workdir: "/workspace",
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
    },
  });

  // 2. 创建 SandAgent Provider
  const sandagent = createSandAgent({
    sandbox,
    verbose: true,
  });

  // 3. 使用 Vercel AI SDK 调用
  const result = streamText({
    model: sandagent("claude-sonnet-4-20250514"),
    prompt: "帮我写一个 Python 爬虫并运行",
  });

  // 4. 流式输出
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
}

main().catch(console.error);
```

### Next.js App Router 集成

```typescript
// app/api/ai/route.ts
import { createSandAgent } from "@sandagent/sdk";
import { E2BSandbox } from "@sandagent/sandbox-e2b";
import { streamText } from "ai";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { prompt, sandboxName } = await req.json();

  // 创建可复用的沙箱
  const sandbox = new E2BSandbox({
    template: "sandagent-claude-researcher",
    name: sandboxName,  // 同名沙箱会被复用
    timeout: 3600,
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

### 环境切换（开发 vs 生产）

```typescript
import { createSandAgent } from "@sandagent/sdk";
import { E2BSandbox } from "@sandagent/sandbox-e2b";
import { DaytonaSandbox } from "@sandagent/sandbox-daytona";
import { LocalSandbox } from "@sandagent/sdk";

function createSandbox() {
  const env = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  };

  switch (process.env.SANDBOX_PROVIDER) {
    case "e2b":
      return new E2BSandbox({
        template: "sandagent-claude-researcher",
        workdir: "/workspace",
        env,
      });
    
    case "daytona":
      return new DaytonaSandbox({
        snapshot: "sandagent-claude-researcher:0.1.0",
        name: "my-agent",
        volumeName: "my-agent-volume",
        workdir: "/workspace",
        env,
      });
    
    default:
      // 本地开发
      return new LocalSandbox({
        workdir: process.cwd(),
      });
  }
}

const sandbox = createSandbox();
const sandagent = createSandAgent({ sandbox });
```

### 沙箱复用与持久化

```typescript
import { DaytonaSandbox } from "@sandagent/sandbox-daytona";

// 场景：用户有多个项目，每个项目独立的沙箱
async function getProjectSandbox(userId: string, projectId: string) {
  const sandboxName = `${userId}-${projectId}`;
  const volumeName = `vol-${userId}-${projectId}`;

  const sandbox = new DaytonaSandbox({
    snapshot: "sandagent-claude:0.1.0",
    name: sandboxName,           // 同名沙箱会被复用
    volumeName: volumeName,      // Volume 持久化文件
    autoStopInterval: 30,        // 30分钟无活动自动停止
    workdir: "/workspace",
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
    },
  });

  return sandbox;
}
```

---

## 沙箱生命周期

### E2B 沙箱生命周期

```
创建 → 运行中 → (暂停) → 恢复 → 运行中 → 超时自动销毁
              ↑__________|
              (可暂停最多30天)
```

- **Timeout**：Hobby 最长 1 小时，Pro 最长 24 小时
- **Pause/Resume**：可暂停最多 30 天
- **复用**：通过 `name` 参数查找并复用已有沙箱

### Daytona 沙箱生命周期

```
创建 → 运行中 → (自动停止) → 已停止 → (自动启动) → 运行中
              ↓               ↓
         autoStopInterval   autoDeleteInterval 后删除
```

- **Auto-stop**：空闲指定分钟后自动停止（默认 15 分钟）
- **Auto-delete**：停止后指定分钟后自动删除（可选）
- **Volume**：数据持久化存储

---

## 故障排查

### E2B 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `Invalid API key` | API Key 无效 | 检查 `E2B_API_KEY` |
| `Sandbox timeout` | 任务超时 | 增加 `timeout` 参数 |
| `Template not found` | 模板未部署 | 运行 `make e2b TEMPLATE=xxx` |

### Daytona 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `API key not found` | API Key 无效 | 检查 `DAYTONA_API_KEY` |
| `Snapshot not found` | Snapshot 未部署 | 运行 `make daytona TEMPLATE=xxx` |
| `Volume failed to become ready` | Volume 创建超时 | 检查网络或重试 |

### 部署失败排查

```bash
# 1. 检查 Docker 是否运行
docker info

# 2. 检查环境变量
cat docker/sandagent-claude/.env

# 3. 手动构建镜像测试
cd docker/sandagent-claude
make build TEMPLATE=researcher

# 4. 查看详细日志
DEBUG=* make e2b TEMPLATE=researcher
```

---

## 相关文档

- [Sandbox Adapters Guide](../spec/SANDBOX_ADAPTERS.md) - 适配器详细文档
- [部署与集成指南](./DEPLOY_CUSTOM_TEMPLATE.md) - 完整部署教程
- [SDK 快速开始](./SDK_QUICK_START.md) - SDK 使用入门
- [沙箱复用指南](./SANDBOX_REUSE.md) - 沙箱复用策略
