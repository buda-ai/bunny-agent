# Daytona Snapshot 设计

## 概述

本文档说明 `sandagent-claude` Docker 镜像在 Daytona 平台上的设计原理，特别是如何处理 Volume 挂载和依赖管理。

## 核心问题：Volume 挂载覆盖

Daytona sandbox 使用 **Volume** 来持久化 `/workspace` 目录：

```
Sandbox 创建时:
├── /workspace/           ← Volume 挂载点（空目录）
│   └── (用户文件持久化在这里)
└── /opt/sandagent/       ← 镜像内容（不受 Volume 影响）
```

**关键点**：Volume 挂载会**完全覆盖** `/workspace` 目录，导致：
- 镜像中预装在 `/workspace/node_modules` 的依赖会"消失"
- 镜像中预装在 `/workspace/` 的模板文件也会"消失"

## 解决方案

### 1. 依赖安装位置

将依赖安装到 `/opt/sandagent/node_modules`（不会被 Volume 覆盖）：

```dockerfile
# 依赖安装到 /opt/sandagent（Volume-safe）
RUN mkdir -p /opt/sandagent && \
    cd /opt/sandagent && \
    npm install @anthropic-ai/claude-agent-sdk @sandagent/runner-cli@beta

# 设置 NODE_PATH 让 Node.js 找到依赖
ENV NODE_PATH=/opt/sandagent/node_modules
```

### 2. 模板文件位置

将模板文件复制到 `/opt/sandagent/templates`：

```dockerfile
# 模板文件复制到 /opt/sandagent/templates（Volume-safe）
COPY templates/researcher/CLAUDE.md /opt/sandagent/templates/CLAUDE.md
COPY templates/researcher/.claude /opt/sandagent/templates/.claude
```

### 3. sandagent 命令

创建系统级命令 `/usr/local/bin/sandagent`：

```dockerfile
RUN echo '#!/usr/bin/env node' > /usr/local/bin/sandagent && \
    echo 'import("/opt/sandagent/node_modules/@sandagent/runner-cli/dist/bundle.mjs")' >> /usr/local/bin/sandagent && \
    chmod +x /usr/local/bin/sandagent
```

### 4. 运行时初始化

代码在使用 snapshot 时，自动将模板文件从 `/opt/sandagent/templates` 复制到 `/workspace`：

```typescript
// packages/sandbox-daytona/src/daytona-sandbox.ts
if (this.snapshot) {
  // 从 /opt/sandagent/templates 复制模板到 /workspace
  await handle.runCommand(
    `cp -r /opt/sandagent/templates/* ${this.workdir}/`
  );
}
```

## 目录结构

### Snapshot 镜像内容

```
/
├── opt/
│   └── sandagent/
│       ├── node_modules/           # 预装依赖
│       │   ├── @anthropic-ai/
│       │   │   └── claude-agent-sdk/
│       │   └── @sandagent/
│       │       └── runner-cli/
│       └── templates/              # 模板文件（可选）
│           ├── CLAUDE.md
│           └── .claude/
├── usr/
│   └── local/
│       └── bin/
│           └── sandagent           # 系统命令
└── workspace/                      # 工作目录（被 Volume 挂载）
```

### 运行时（Volume 挂载后）

```
/
├── opt/sandagent/                  # 来自镜像（不变）
│   ├── node_modules/
│   └── templates/
├── usr/local/bin/sandagent         # 来自镜像（不变）
└── workspace/                      # 来自 Volume（持久化）
    ├── CLAUDE.md                   # 从 /opt/sandagent/templates 复制
    ├── .claude/                    # 从 /opt/sandagent/templates 复制
    └── (用户创建的文件...)
```

## 构建流程

### 基础镜像（无模板）

```bash
make build
make daytona
# → sandagent-claude:0.1.2
```

### 带模板的镜像

```bash
make daytona TEMPLATE=researcher
# → sandagent-claude-researcher:0.1.2
```

### 构建过程

1. `generate-dockerfile.sh` 生成 Dockerfile，包含模板 COPY 指令
2. Docker 构建镜像，依赖和模板安装到 `/opt/sandagent`
3. `daytona snapshot push` 推送镜像到 Daytona

## 使用方式

### 代码中使用

```typescript
import { DaytonaSandbox } from "@sandagent/sandbox-daytona";

const sandbox = new DaytonaSandbox({
  snapshot: "sandagent-claude-researcher:0.1.2",
  volumeName: "my-sandbox",
  volumeMountPath: "/workspace",
  workdir: "/workspace",
});
```

### 执行流程

1. Daytona 创建 sandbox，挂载 Volume 到 `/workspace`
2. 代码检测到使用 snapshot
3. 从 `/opt/sandagent/templates` 复制模板到 `/workspace`
4. 执行 `sandagent run` 命令

## 环境变量

| 变量 | 值 | 说明 |
|------|-----|------|
| `NODE_PATH` | `/opt/sandagent/node_modules` | Node.js 模块搜索路径 |
| `PATH` | `/usr/local/bin:$PATH` | 包含 sandagent 命令 |

## 常见问题

### Q: 为什么不把依赖安装到 /workspace？

A: 因为 `/workspace` 是 Volume 挂载点，Volume 挂载会覆盖镜像中的内容。

### Q: 模板文件每次都会被复制吗？

A: 是的，每次新建 sandbox 或重启时会从 `/opt/sandagent/templates` 复制到 `/workspace`。

### Q: 用户修改的文件会丢失吗？

A: 不会。用户在 `/workspace` 中创建/修改的文件都保存在 Volume 中，持久化保留。

### Q: 如何更新依赖版本？

A: 修改 Dockerfile 中的版本号，重新构建镜像和 snapshot：
```bash
make daytona TEMPLATE=researcher IMAGE_TAG=0.2.0 FORCE=true
```

## 相关文件

- `Dockerfile` - 基础 Dockerfile
- `Dockerfile.template` - 带占位符的模板
- `generate-dockerfile.sh` - 生成带模板的 Dockerfile
- `Makefile` - 构建和部署命令
- `build-daytona-snapshot.ts` - Daytona snapshot 构建脚本
