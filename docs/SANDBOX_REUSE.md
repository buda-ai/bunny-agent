# Sandbox 重复使用指南

本文档说明如何在不同类型的 sandbox 中实现重复使用和持久化，以便在多个会话之间保持文件系统和状态。

---

## 概述

SandAgent 支持三种主要的 sandbox 类型，每种类型都有不同的重复使用机制：

| Sandbox 类型 | 重复使用机制 | 持久化方式 | 适用场景 |
|-------------|------------|-----------|---------|
| **E2B** | 基于名称查找 | Metadata + 自动恢复 | 生产环境，需要跨进程持久化 |
| **Sandock** | 内存缓存 | 进程内缓存 | 开发测试，单进程应用 |
| **Daytona** | 基于名称查找 + Volume | Volume 持久化 | 需要长期存储的项目 |

---

## E2B Sandbox

### 工作原理

E2B sandbox 通过 **名称（name）** 来查找和重用现有的 sandbox。当提供 `name` 参数时，系统会：

1. 首先尝试查找具有相同名称的现有 sandbox
2. 如果找到，直接连接（会自动恢复暂停的 sandbox）
3. 如果未找到，创建新的 sandbox 并设置 metadata

### 配置示例

```typescript
import { E2BSandbox } from "@sandagent/sandbox-e2b";

// 在 route.ts 中的配置
const sandboxName = `sandagent-${template}`; // 例如: "sandagent-default"

const sandbox = new E2BSandbox({
  apiKey: E2B_API_KEY,
  runnerBundlePath: RUNNER_BUNDLE_PATH,
  templatesPath: path.join(TEMPLATES_PATH, template),
  name: sandboxName, // 关键：使用名称来启用重复使用
  env,
  agentTemplate: template,
  workdir: "/sandagent",
});

// attach() 会自动查找或创建
const handle = await sandbox.attach();
```

### 重复使用流程

```typescript
// 第一次调用
const sandbox1 = new E2BSandbox({ name: "my-project" });
const handle1 = await sandbox1.attach();
// → 创建新的 sandbox，上传文件，初始化

// 第二次调用（可以是不同的进程）
const sandbox2 = new E2BSandbox({ name: "my-project" });
const handle2 = await sandbox2.attach();
// → 找到现有 sandbox，直接连接，跳过初始化
```

### 关键特性

- ✅ **跨进程持久化**：即使应用重启，也能找到相同的 sandbox
- ✅ **自动恢复**：暂停的 sandbox 会自动恢复
- ✅ **Metadata 查询**：使用 E2B 的 metadata API 来查找 sandbox
- ✅ **文件持久化**：所有文件保存在 sandbox 的文件系统中

### 注意事项

- 如果未提供 `name`，每次 `attach()` 都会创建新的 sandbox
- E2B 会自动暂停不活跃的 sandbox，连接时会自动恢复
- Sandbox 的生命周期由 E2B 平台管理，可能需要手动清理

---

## Sandock Sandbox

### 工作原理

Sandock sandbox 使用 **内存缓存机制** 在进程内重用 sandbox 实例。每次 `attach()` 会生成一个唯一的 ID，但通过缓存机制可以重用已创建的 sandbox。

### 配置示例

```typescript
import { SandockSandbox } from "@sandagent/sandbox-sandock";

const sandbox = new SandockSandbox({
  apiKey: SANDOCK_API_KEY,
  runnerBundlePath: RUNNER_BUNDLE_PATH,
  templatesPath: path.join(TEMPLATES_PATH, template),
  env,
  agentTemplate: template,
  workdir: "/workspace",
});

// attach() 会生成唯一 ID 并使用缓存
const handle = await sandbox.attach();
```

### 重复使用流程

```typescript
// 第一次调用
const sandbox1 = new SandockSandbox({ /* ... */ });
const handle1 = await sandbox1.attach();
// → 生成 ID: "sandock-1234567890-abc123"
// → 创建新 sandbox，缓存实例

// 同一进程内，如果缓存命中
const handle2 = await sandbox1.attach();
// → 如果缓存中有相同的 ID，直接返回缓存的 handle
// → 跳过初始化（如果已初始化）

// 不同进程或缓存未命中
const sandbox2 = new SandockSandbox({ /* ... */ });
const handle3 = await sandbox2.attach();
// → 生成新的 ID: "sandock-1234567891-def456"
// → 创建新的 sandbox
```

### 缓存机制

- **缓存大小**：最多缓存 50 个实例
- **过期时间**：30 分钟未访问后自动清理
- **初始化标记**：每个实例只初始化一次，后续调用跳过初始化

### 关键特性

- ✅ **进程内高效重用**：同一进程内多次调用可以重用
- ✅ **自动清理**：过期实例自动清理，避免内存泄漏
- ✅ **快速启动**：缓存的实例无需重新初始化

### 限制

- ❌ **不支持跨进程持久化**：不同进程无法共享缓存
- ❌ **无名称查找**：无法通过名称查找现有 sandbox
- ❌ **进程重启后丢失**：应用重启后缓存清空

### 使用建议

- 适合开发环境和单进程应用
- 不适合需要跨进程或跨会话持久化的场景
- 如果需要持久化，考虑使用 E2B 或 Daytona

---

## Daytona Sandbox

### 工作原理

Daytona sandbox 通过 **名称（name）** 和 **Volume** 来实现完整的持久化：

1. 使用 `name` 查找现有的 sandbox
2. 使用 `volumeName` 来持久化文件系统
3. 支持多种 sandbox 状态的处理（started, stopped, archived, error）

### 配置示例

```typescript
import { DaytonaSandbox } from "@sandagent/sandbox-daytona";

const sandboxName = `sandagent-${template}`;

const sandbox = new DaytonaSandbox({
  apiKey: DAYTONA_API_KEY,
  runnerBundlePath: RUNNER_BUNDLE_PATH,
  templatesPath: path.join(TEMPLATES_PATH, template),
  volumeName: sandboxName, // Volume 名称，用于持久化文件系统
  name: sandboxName,        // Sandbox 名称，用于查找现有 sandbox
  autoStopInterval: 15,     // 15 分钟后自动停止
  autoDeleteInterval: -1,   // 不自动删除
  env,
  agentTemplate: template,
  workdir: "/sandagent",
});

const handle = await sandbox.attach();
```

### 重复使用流程

```typescript
// 第一次调用
const sandbox1 = new DaytonaSandbox({
  name: "my-project",
  volumeName: "my-project-volume",
});
const handle1 = await sandbox1.attach();
// → 创建新的 sandbox 和 volume
// → 上传文件，初始化

// 第二次调用
const sandbox2 = new DaytonaSandbox({
  name: "my-project",
  volumeName: "my-project-volume",
});
const handle2 = await sandbox2.attach();
// → 找到现有 sandbox（可能处于 stopped 状态）
// → 启动 sandbox（如果需要）
// → 挂载现有的 volume（文件已存在）
// → 跳过初始化（因为文件在 volume 中）
```

### 状态处理

Daytona sandbox 支持多种状态，`attach()` 会自动处理：

| 状态 | 行为 |
|------|------|
| `started` | 直接使用，刷新 activity 防止自动停止 |
| `stopped` / `stopping` | 自动启动 sandbox |
| `archived` | 自动解档并启动 |
| `error` (可恢复) | 尝试恢复 |
| `error` (不可恢复) | 删除并创建新的 |
| `starting` | 等待启动完成 |

### Volume 持久化

- **Volume 名称**：通过 `volumeName` 参数指定
- **自动创建**：如果 volume 不存在，会自动创建
- **文件持久化**：所有文件保存在 volume 中，即使 sandbox 停止也会保留
- **挂载路径**：默认挂载到 `/sandagent`（可通过 `volumeMountPath` 配置）

### 关键特性

- ✅ **完整的持久化**：文件系统和 sandbox 状态都持久化
- ✅ **跨进程支持**：不同进程可以访问相同的 sandbox 和 volume
- ✅ **自动状态管理**：自动处理各种 sandbox 状态
- ✅ **长期存储**：适合需要长期保存的项目

### 配置选项

```typescript
const sandbox = new DaytonaSandbox({
  name: "my-project",              // Sandbox 名称（必需，用于查找）
  volumeName: "my-project-volume", // Volume 名称（可选，用于持久化）
  volumeMountPath: "/sandagent",   // Volume 挂载路径（默认: "/sandagent"）
  autoStopInterval: 15,            // 自动停止间隔（分钟，默认: 15）
  autoDeleteInterval: -1,          // 自动删除间隔（分钟，-1 表示禁用）
  // ... 其他配置
});
```

---

## 实际应用示例

### 示例 1：基于模板的重复使用

```typescript
// apps/sandagent-example/app/api/ai/route.ts

export async function POST(request: Request) {
  const { template = "default", /* ... */ } = await request.json();
  
  // 使用模板名称作为 sandbox 名称
  const sandboxName = `sandagent-${template}`;
  
  let sandbox;
  
  if (SANDBOX_PROVIDER === "daytona") {
    sandbox = new DaytonaSandbox({
      name: sandboxName,
      volumeName: sandboxName, // 使用相同的名称作为 volume
      // ... 其他配置
    });
  } else if (SANDBOX_PROVIDER === "e2b") {
    sandbox = new E2BSandbox({
      name: sandboxName, // E2B 使用 name 查找
      // ... 其他配置
    });
  } else {
    // Sandock 不支持名称查找，使用缓存机制
    sandbox = new SandockSandbox({
      // ... 配置
    });
  }
  
  // attach() 会自动处理重复使用
  // - E2B/Daytona: 查找现有 sandbox
  // - Sandock: 使用缓存机制
  const handle = await sandbox.attach();
}
```

### 示例 2：基于用户会话的重复使用

```typescript
export async function POST(request: Request) {
  const { sessionId, userId, /* ... */ } = await request.json();
  
  // 使用用户 ID 和会话 ID 组合
  const sandboxName = `user-${userId}-session-${sessionId}`;
  
  const sandbox = new E2BSandbox({
    name: sandboxName,
    // ... 配置
  });
  
  // 同一用户在同一会话中的多次请求会重用同一个 sandbox
  const handle = await sandbox.attach();
}
```

### 示例 3：基于项目的长期持久化

```typescript
export async function POST(request: Request) {
  const { projectId, /* ... */ } = await request.json();
  
  // 使用项目 ID，支持长期持久化
  const sandboxName = `project-${projectId}`;
  
  const sandbox = new DaytonaSandbox({
    name: sandboxName,
    volumeName: `project-${projectId}-volume`,
    autoStopInterval: 30,  // 30 分钟不活跃后停止
    autoDeleteInterval: -1, // 永不自动删除
    // ... 配置
  });
  
  // 项目文件会长期保存在 volume 中
  const handle = await sandbox.attach();
}
```

---

## 最佳实践

### 1. 命名策略

- **模板名称**：`sandagent-${template}` - 适合按模板分类
- **用户会话**：`user-${userId}-session-${sessionId}` - 适合用户会话
- **项目**：`project-${projectId}` - 适合长期项目
- **组合策略**：`${userId}-${projectId}-${template}` - 多维度组合

### 2. 选择 Sandbox 类型

| 场景 | 推荐类型 | 原因 |
|------|---------|------|
| 生产环境，需要持久化 | E2B 或 Daytona | 支持跨进程持久化 |
| 开发测试 | Sandock | 快速启动，进程内缓存 |
| 长期项目，需要文件持久化 | Daytona | Volume 持久化，长期存储 |
| 临时任务 | 任意类型，不提供 name | 每次创建新的 |

### 3. 生命周期管理

```typescript
// E2B: 自动管理，但可能需要手动清理
// 定期清理不活跃的 sandbox

// Sandock: 自动清理（30 分钟过期）
// 无需手动管理

// Daytona: 需要配置 autoStopInterval 和 autoDeleteInterval
const sandbox = new DaytonaSandbox({
  autoStopInterval: 15,   // 15 分钟不活跃后停止（节省资源）
  autoDeleteInterval: -1,  // 不自动删除（保留数据）
});
```

### 4. 初始化优化

- **E2B/Daytona**：如果找到现有 sandbox，会跳过初始化（文件已存在）
- **Sandock**：使用 `initializedInstances` 标记，每个实例只初始化一次
- **建议**：将初始化文件（runner bundle、templates）放在 volume 或持久化存储中

---

## 常见问题

### Q: 如何确保每次使用相同的 sandbox？

**A**: 对于 E2B 和 Daytona，使用相同的 `name` 参数即可。对于 Sandock，在同一进程内会自动缓存。

### Q: 如何清理旧的 sandbox？

**A**: 
- **E2B**: 使用 E2B 控制台或 API 手动删除
- **Sandock**: 自动清理（30 分钟过期）
- **Daytona**: 配置 `autoDeleteInterval` 或手动删除

### Q: 文件会持久化吗？

**A**: 
- **E2B**: ✅ 是，文件保存在 sandbox 文件系统中
- **Sandock**: ❌ 否，sandbox 销毁后文件丢失
- **Daytona**: ✅ 是，文件保存在 volume 中，即使 sandbox 停止也会保留

### Q: 不同进程可以共享同一个 sandbox 吗？

**A**: 
- **E2B**: ✅ 可以，通过 `name` 查找
- **Sandock**: ❌ 不可以，缓存是进程内的
- **Daytona**: ✅ 可以，通过 `name` 查找

### Q: 如何避免初始化延迟？

**A**: 
- 使用相同的 `name` 来重用现有 sandbox
- 对于 Daytona，确保 volume 已创建并包含初始化文件
- 对于 E2B，重用现有 sandbox 会跳过初始化

---

## 总结

选择合适的 sandbox 类型和配置策略对于应用的性能和成本至关重要：

- **需要跨进程持久化** → 使用 E2B 或 Daytona，提供 `name` 参数
- **单进程应用** → 可以使用 Sandock，利用缓存机制
- **需要长期文件存储** → 使用 Daytona，配置 `volumeName`
- **临时任务** → 不提供 `name`，每次创建新的

通过合理配置，可以在保持数据持久化的同时，优化启动时间和资源使用。
