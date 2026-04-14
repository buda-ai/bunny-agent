# E2B Template 设计

## 概述

本文档说明 `bunny-agent-claude` Docker 镜像在 E2B 平台上的设计原理。

E2B **没有 Volume 概念**，但为了与 Daytona 保持一致性，使用相同的目录结构设计。

## 目录结构

```
/
├── opt/bunny-agent/
│   ├── node_modules/           # 预装依赖
│   └── templates/              # 模板文件
├── usr/local/bin/bunny-agent     # 系统命令
└── workspace/                  # 工作目录
```

### 为什么不直接安装到 /workspace？

虽然 E2B 没有 Volume 覆盖问题，但使用相同的设计有以下好处：
1. **一致性**：Daytona 和 E2B 使用相同的 Dockerfile
2. **可维护性**：一套代码处理两种平台
3. **灵活性**：未来如果 E2B 添加持久化功能，不需要修改

## 构建流程

### 基础模板（无自定义模板）

```bash
make e2b
# → bunny-agent-claude
```

### 带模板的镜像

```bash
make e2b TEMPLATE=researcher
# → bunny-agent-claude-researcher
```

## 使用方式

### 代码中使用

```typescript
import { E2BSandbox } from "@bunny-agent/sandbox-e2b";

const sandbox = new E2BSandbox({
  template: "bunny-agent-claude-researcher",  // 以 bunny-agent 开头的模板自动使用预装依赖
  workdir: "/workspace",
});
```

### 执行流程

1. E2B 创建 sandbox
2. 代码检测到 template 以 `bunny-agent` 开头
3. 从 `/opt/bunny-agent/templates` 复制模板到 `/workspace`
4. 执行 `bunny-agent run` 命令

## 自动检测机制

E2B sandbox 通过 `template` 参数自动判断是否使用自定义模板：

- `template` 以 `bunny-agent` 开头 → 使用预装依赖，从 `/opt/bunny-agent/templates` 复制模板
- 其他 template（如 `base`）→ 运行时安装依赖

## 常见问题

### Q: E2B 如何判断是否使用自定义模板？

A: 通过 `template` 参数判断，以 `bunny-agent` 开头的模板会自动跳过依赖安装，使用 `/opt/bunny-agent` 中预装的依赖。

### Q: E2B 模板更新后需要重新部署吗？

A: 是的，需要重新运行 `make e2b TEMPLATE=xxx` 来更新模板。

### Q: 可以使用本地 templatesPath 覆盖模板吗？

A: 可以。如果同时设置了 `template` 和 `templatesPath`，本地模板会上传并覆盖镜像中的模板。

## 相关文件

- `Dockerfile` - 基础 Dockerfile
- `Dockerfile.template` - 带占位符的模板
- `generate-dockerfile.sh` - 生成带模板的 Dockerfile
- `Makefile` - 构建和部署命令
- `build-e2b-template.ts` - E2B template 构建脚本
