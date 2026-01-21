# SandAgent 架构重构分析

## 架构对比图

### 📊 当前架构 (Current)

```
┌─────────────────────────────────────────────────────────────────┐
│                        应用层 (Apps)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────┐              ┌─────────────────┐           │
│  │  manager-cli    │              │   runner-cli    │           │
│  └────────┬────────┘              └────────┬────────┘           │
│           │                                │                     │
│           └──────────┬─────────────────────┘                     │
└──────────────────────┼───────────────────────────────────────────┘
                       │
┌──────────────────────┼───────────────────────────────────────────┐
│                      ↓         包层 (Packages)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│            ┌──────────────────────┐                              │
│            │    @sandagent/core   │  ← 职责混乱！                 │
│            │  - SandAgent 生命周期 │                              │
│            │  - SandboxAdapter    │                              │
│            │  - 接口定义           │                              │
│            └──────────┬───────────┘                              │
│                       │                                           │
│         ┌─────────────┼──────────────┐                           │
│         │             │              │                           │
│         ↓             ↓              ↓                           │
│  ┌────────────┐ ┌──────────┐ ┌──────────────┐                  │
│  │ sandbox-*  │ │   sdk    │ │ ai-provider  │                  │
│  │  - local   │ │ (功能少) │ │              │                  │
│  │  - e2b     │ └──────────┘ └──────────────┘                  │
│  │  - sandock │                                                  │
│  │  - daytona │                                                  │
│  └────────────┘                                                  │
│                                                                   │
│  ┌──────────────────┐  ← 孤立的！没有接口约束                    │
│  │  runner-claude   │                                            │
│  └──────────────────┘                                            │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘

❌ 问题：
1. core 职责不清晰（既有生命周期又有接口定义）
2. runner-claude 孤立，无法扩展
3. sdk 包功能单一
4. 缺少统一的 Manager 层
```

### ✨ 新架构 (Proposed)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          应用层 (Apps)                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────────────────┐                ┌─────────────────────┐         │
│  │   ai-provider       │                │    manager-cli      │         │
│  │  (packages/)        │                │     (apps/)         │         │
│  └──────────┬──────────┘                └──────────┬──────────┘         │
│             │                                      │                     │
│             │  new Manager({                       │  new Manager({     │
│             │    sandbox: LocalSandbox,            │    sandbox,        │
│             │    runner: ClaudeRunner              │    runner          │
│             │  })                                  │  })                │
│             │                                      │                     │
│             └─────────────────┬────────────────────┘                     │
└───────────────────────────────┼──────────────────────────────────────────┘
                                │
┌───────────────────────────────┼──────────────────────────────────────────┐
│                               ↓           包层 (Packages)                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│                    ┌────────────────────────────┐                        │
│                    │   @sandagent/manager       │  ← 原 core 改名！      │
│                    │  - 管理 sandbox + runner   │                        │
│                    │  - 定义接口：              │                        │
│                    │    * Runner               │                        │
│                    │    * SandboxAdapter       │                        │
│                    │  - SandAgent 生命周期      │                        │
│                    │  - Session 管理            │                        │
│                    └──────────┬─────────────────┘                        │
│                               │                                           │
│                               │ 接收实现                                  │
│                ┌──────────────┴──────────────┐                           │
│                │                             │                           │
│    ┌───────────↓────────┐        ┌──────────↓────────┐                  │
│    │   Sandbox 实现      │        │   Runner 实现      │                  │
│    ├────────────────────┤        ├───────────────────┤                  │
│    │ sandbox-local      │        │ runner-claude     │                  │
│    │ sandbox-e2b        │        │ runner-codex      │                  │
│    │ sandbox-sandock    │        │ runner-copilot    │                  │
│    │ sandbox-daytona    │        │                   │                  │
│    └────────────────────┘        └───────────────────┘                  │
│                                                                           │
│    各自独立实现接口，不相互依赖                                            │
│    只需要知道 manager 定义的接口                                           │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

✅ 优点：
1. manager 职责清晰：选择和管理 sandbox + runner 的组合
2. runner-* 和 sandbox-* 都是可插拔的实现
3. 删除 sdk 包（功能合并到 ai-provider）
4. 清晰的依赖：Apps → manager → 接口实现
```

### 🔄 依赖流程对比

**当前依赖流：**
```
manager-cli ──→ core ──→ sandbox-*
                       └→ runner-claude (独立)

ai-provider ──→ core

runner-cli ──→ runner-claude (直接)
```

**新依赖流：**
```
┌──────────────┐     传入 runner + sandbox     ┌──────────────┐
│ ai-provider  │  ──────────────────────────→  │   manager    │
└──────────────┘                                └──────┬───────┘
                                                       │
┌──────────────┐     传入 runner + sandbox            │ 定义接口
│ manager-cli  │  ──────────────────────────→         │
└──────────────┘                                       │
                                    ┌──────────────────┼─────────────┐
                                    │                  │             │
                                    ↓                  ↓             ↓
                              ┌──────────┐      ┌──────────┐  ┌──────────┐
                              │sandbox-* │      │runner-*  │  │ 实现接口  │
                              └──────────┘      └──────────┘  └──────────┘
```

---

## 当前架构（Current Architecture）

```
packages/
├── core/                    # SandAgent 核心：lifecycle & sandbox binding
│   └── depends on: 无
├── sdk/                     # Next.js / server passthrough helpers
│   └── depends on: @sandagent/core
├── ai-provider/             # AI SDK provider
│   └── depends on: @sandagent/core, @ai-sdk/provider
├── runner-claude/           # Claude Agent SDK runtime
│   └── depends on: @anthropic-ai/claude-agent-sdk
├── sandbox-local/          # Local sandbox adapter
│   └── depends on: @sandagent/core
├── sandbox-e2b/            # E2B sandbox adapter
│   └── depends on: @sandagent/core
├── sandbox-sandock/        # Sandock sandbox adapter
│   └── depends on: @sandagent/core
├── sandbox-daytona/        # Daytona sandbox adapter
│   └── depends on: @sandagent/core
├── kui/                    # UI components
├── benchmark/              # Benchmarking tools

apps/
├── manager-cli/            # SandAgent Manager CLI
│   └── depends on: @sandagent/core, sandbox-e2b, sandbox-sandock, runner-claude
├── runner-cli/             # SandAgent Runner CLI
│   └── depends on: @sandagent/runner-claude
└── sandagent-example/      # Example apps
```

### 当前依赖关系流

```
manager-cli → core → sandbox-* 
                  ↓
              runner-claude

runner-cli → runner-claude (直接依赖)

ai-provider → core

sdk → core
```

### 当前问题分析

1. **core 包职责不清晰**
   - 既有 SandAgent 生命周期管理
   - 又有 SandboxAdapter 接口定义
   - 缺少对 runner 的抽象

2. **runner-claude 孤立**
   - 没有统一的 runner 接口
   - 只能直接使用，无法扩展
   - 与 core 没有直接关联

3. **sdk 包作用模糊**
   - 仅作为 Next.js passthrough
   - 功能单一，可以合并到其他包

4. **sandbox 和 runner 没有分层**
   - sandbox 直接依赖 core
   - runner 独立存在
   - 缺少 manager 层统一管理

---

## 新架构（Proposed Architecture）

```
packages/
├── manager/                    # ✅ 原 @sandagent/core 改名！
│   ├── 定义核心接口：
│   │   ├── Runner              # Runner 接口
│   │   ├── SandboxAdapter      # Sandbox 接口
│   │   └── SandAgent           # 生命周期管理
│   ├── 功能：
│   │   ├── 选择和绑定 sandbox + runner
│   │   ├── Session 管理
│   │   └── 生命周期管理
│   └── depends on: 无（只定义接口）
│
├── runner-claude/              # ✅ Claude Agent SDK runner 实现
│   ├── 实现 Runner 接口
│   └── depends on: @anthropic-ai/claude-agent-sdk
│
├── runner-codex/              # 🆕 Codex CLI runner 实现（未来）
│   ├── 实现 Runner 接口
│   └── depends on: codex-cli SDK
│
├── runner-copilot/            # 🆕 GitHub Copilot runner 实现（未来）
│   ├── 实现 Runner 接口
│   └── depends on: copilot SDK
│
├── sandbox-local/             # ✅ Local sandbox adapter
│   ├── 实现 SandboxAdapter 接口
│   └── depends on: 无（仅使用 node.js 标准库）
│
├── sandbox-e2b/               # ✅ E2B sandbox adapter
│   ├── 实现 SandboxAdapter 接口
│   └── depends on: e2b SDK
│
├── sandbox-sandock/           # ✅ Sandock sandbox adapter
│   ├── 实现 SandboxAdapter 接口
│   └── depends on: sandock SDK
│
├── sandbox-daytona/           # ✅ Daytona sandbox adapter
│   ├── 实现 SandboxAdapter 接口
│   └── depends on: @daytonaio/sdk
│
├── ai-provider/               # ✅ AI SDK provider
│   ├── 创建 manager 实例
│   ├── 传入 runner 和 sandbox
│   └── depends on: @sandagent/manager, @ai-sdk/provider
│
├── kui/                       # UI components
└── benchmark/                 # Benchmarking tools

apps/
├── manager-cli/               # ✅ SandAgent Manager CLI
│   ├── 创建 manager 实例
│   ├── 传入用户选择的 sandbox 和 runner
│   └── depends on: @sandagent/manager, sandbox-*, runner-*
│
├── runner-cli/                # ✅ SandAgent Runner CLI (sandagent 命令)
│   ├── 创建 manager 实例
│   ├── 传入指定的 runner
│   └── depends on: @sandagent/manager, runner-*
│
└── sandagent-example/         # Example apps

删除：
├── ❌ packages/core/         # 改名为 packages/manager/
└── ❌ packages/sdk/          # 功能合并到 ai-provider
```

### Manager 的核心职责

```typescript
// packages/manager/src/types.ts
export interface Runner {
  run(input: string, options?: RunOptions): AsyncIterable<RunnerOutput>;
}

export interface SandboxAdapter {
  attach(id: string): Promise<SandboxHandle>;
}

// packages/manager/src/manager.ts
export class SandAgentManager {
  constructor(options: {
    runner: Runner;           // ← 传入具体的 runner 实现
    sandbox: SandboxAdapter;  // ← 传入具体的 sandbox 实现
  }) {
    this.runner = options.runner;
    this.sandbox = options.sandbox;
  }
  
  // 管理 sandbox 和 runner 的绑定和生命周期
  async createSession(): Promise<Session> {
    // 创建 sandbox 实例
    const sandboxHandle = await this.sandbox.attach(sessionId);
    
    // 将 runner 和 sandbox 绑定
    // ...
  }
}
```

### 使用示例

```typescript
// apps/manager-cli 或 ai-provider
import { SandAgentManager } from '@sandagent/manager';
import { ClaudeRunner } from '@sandagent/runner-claude';
import { LocalSandbox } from '@sandagent/sandbox-local';

const manager = new SandAgentManager({
  runner: new ClaudeRunner({
    model: 'claude-sonnet-4-20250514'
  }),
  sandbox: new LocalSandbox({
    baseDir: '/tmp/sandboxes'
  })
});

// 或者用户选择不同的组合
const manager2 = new SandAgentManager({
  runner: new CodexRunner(),       // ← 可插拔的 runner
  sandbox: new E2BSandbox()        // ← 可插拔的 sandbox
});
```

### 新架构依赖关系流

```
┌─────────────────────────────────────────────────────────────────┐
│                    应用层实例化                                   │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐                          ┌──────────────┐
│ ai-provider  │                          │ manager-cli  │
└──────┬───────┘                          └──────┬───────┘
       │                                         │
       │ new Manager({                           │ new Manager({
       │   runner: ClaudeRunner,                 │   runner: CodexRunner,
       │   sandbox: LocalSandbox                 │   sandbox: E2BSandbox
       │ })                                      │ })
       │                                         │
       └─────────────────┬───────────────────────┘
                         │
                         ↓
              ┌──────────────────────┐
              │   @sandagent/manager │  ← 原 core
              ├──────────────────────┤
              │ • 定义接口            │
              │   - Runner           │
              │   - SandboxAdapter   │
              │ • 绑定和管理          │
              │ • 生命周期管理        │
              └──────────┬───────────┘
                         │
                         │ 接收实现（传入）
          ┌──────────────┴───────────────┐
          │                              │
          ↓                              ↓
┌─────────────────┐            ┌─────────────────┐
│  Sandbox 实现    │            │  Runner 实现     │
├─────────────────┤            ├─────────────────┤
│ sandbox-local   │            │ runner-claude   │
│ sandbox-e2b     │            │ runner-codex    │
│ sandbox-sandock │            │ runner-copilot  │
│ sandbox-daytona │            │                 │
└─────────────────┘            └─────────────────┘
         ↑                              ↑
         │                              │
         └──── 实现 manager 定义的接口 ──┘
         
注意：runner-* 和 sandbox-* 不需要依赖 manager
它们只需要实现 manager 定义的接口即可
```

---

## 重构步骤建议

### Phase 1: 核心重构（关键）

1. **重命名 packages/core → packages/manager**
   ```bash
   mv packages/core packages/manager
   # 更新 package.json name: @sandagent/core → @sandagent/manager
   ```

2. **删除 packages/sdk**
   ```bash
   rm -rf packages/sdk
   # 将 Next.js handler 相关功能移到 ai-provider（如果需要）
   ```

3. **在 manager 中定义清晰的接口**
   ```typescript
   // packages/manager/src/types.ts
   export interface Runner {
     run(input: string, options?: RunOptions): AsyncIterable<RunnerOutput>;
   }
   
   export interface SandboxAdapter {
     attach(id: string): Promise<SandboxHandle>;
   }
   
   // packages/manager/src/manager.ts
   export class SandAgentManager {
     constructor(options: {
       runner: Runner;
       sandbox: SandboxAdapter;
     }) {}
   }
   ```

### Phase 2: 更新实现包

4. **更新 runner-claude 不依赖 manager**
   ```typescript
   // packages/runner-claude/src/claude-runner.ts
   // 实现 Runner 接口（通过 duck typing，不需要 import）
   export class ClaudeRunner {
     async *run(input: string, options?: RunOptions) {
       // 实现...
     }
   }
   ```
   
   ```json
   // packages/runner-claude/package.json
   {
     "dependencies": {
       "@anthropic-ai/claude-agent-sdk": ">=0.1.70"
       // 注意：不依赖 @sandagent/manager
     }
   }
   ```

5. **更新 sandbox-* 包不依赖 manager**
   ```json
   // packages/sandbox-local/package.json
   {
     "dependencies": {
       // 无外部依赖，只用 node.js 标准库
       // 注意：不依赖 @sandagent/manager
     }
   }
   ```

6. **创建 runner-codex 和 runner-copilot 占位包**
   ```bash
   mkdir -p packages/runner-codex/src
   mkdir -p packages/runner-copilot/src
   ```

### Phase 3: 更新使用方

7. **更新 ai-provider 使用 manager**
   ```typescript
   // packages/ai-provider/src/provider.ts
   import { SandAgentManager } from '@sandagent/manager';
   import { ClaudeRunner } from '@sandagent/runner-claude';
   import { LocalSandbox } from '@sandagent/sandbox-local';
   
   export function createSandagentProvider(options: {
     sandbox?: SandboxAdapter;
     runner?: Runner;
   }) {
     const manager = new SandAgentManager({
       runner: options.runner || new ClaudeRunner(),
       sandbox: options.sandbox || new LocalSandbox()
     });
     
     return {
       // AI SDK provider 实现...
     };
   }
   ```
   
   ```json
   // packages/ai-provider/package.json
   {
     "dependencies": {
       "@sandagent/manager": "workspace:*",
       "@ai-sdk/provider": "^3.0.0"
     },
     "peerDependencies": {
       "@sandagent/runner-claude": "workspace:*",
       "@sandagent/sandbox-local": "workspace:*"
     }
   }
   ```

8. **更新 apps/manager-cli**
   ```typescript
   // apps/manager-cli/src/cli.ts
   import { SandAgentManager } from '@sandagent/manager';
   import { ClaudeRunner } from '@sandagent/runner-claude';
   import { E2BSandbox } from '@sandagent/sandbox-e2b';
   
   // 根据用户选择创建不同的组合
   const manager = new SandAgentManager({
     runner: userSelectedRunner,  // 用户选择
     sandbox: userSelectedSandbox // 用户选择
   });
   ```

9. **更新 apps/runner-cli**
   ```typescript
   // apps/runner-cli/src/cli.ts
   import { SandAgentManager } from '@sandagent/manager';
   import { ClaudeRunner } from '@sandagent/runner-claude';
   import { LocalSandbox } from '@sandagent/sandbox-local';
   
   const manager = new SandAgentManager({
     runner: new ClaudeRunner({
       model: 'claude-sonnet-4-20250514'
     }),
     sandbox: new LocalSandbox()
   });
   ```

### Phase 4: 全局更新

10. **全局替换 @sandagent/core → @sandagent/manager**
    ```bash
    # 在所有文件中替换
    find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" \) \
      -not -path "*/node_modules/*" \
      -not -path "*/dist/*" \
      -exec sed -i 's/@sandagent\/core/@sandagent\/manager/g' {} +
    ```

11. **更新所有 import 语句**
    ```bash
    # 检查所有导入
    grep -r "@sandagent/core" --include="*.ts" --include="*.tsx"
    
    # 确认没有遗漏
    ```

12. **重新安装依赖并测试**
    ```bash
    pnpm install
    pnpm build
    pnpm test
    ```

---

## 架构优势

### 新架构的优点

1. **清晰的职责分离**
   - **manager**: 定义接口、管理生命周期、绑定 sandbox 和 runner
   - **runner-***: 专注于实现具体的 runner 逻辑
   - **sandbox-***: 专注于实现具体的 sandbox 逻辑
   - **ai-provider**: 专注于 AI SDK 集成

2. **更好的可插拔性**
   ```typescript
   // 随意组合不同的 runner 和 sandbox
   new SandAgentManager({
     runner: new ClaudeRunner(),
     sandbox: new LocalSandbox()
   })
   
   new SandAgentManager({
     runner: new CodexRunner(),
     sandbox: new E2BSandbox()
   })
   
   new SandAgentManager({
     runner: new CopilotRunner(),
     sandbox: new SandockSandbox()
   })
   ```

3. **零循环依赖**
   ```
   manager (定义接口) ← 不依赖任何实现
       ↑
       │ 使用接口
       │
   runner-* 和 sandbox-* (实现接口) ← 不依赖 manager
   ```

4. **更容易扩展**
   - 新增 runner: 实现 Runner 接口即可
   - 新增 sandbox: 实现 SandboxAdapter 接口即可
   - 不需要修改 manager 代码

5. **更好的测试性**
   - manager 可以用 mock runner 和 sandbox 测试
   - runner-* 可以独立测试
   - sandbox-* 可以独立测试

### 与当前架构的对比

| 方面 | 当前架构 | 新架构 |
|------|---------|--------|
| **职责** | core 职责混乱 | manager 职责清晰 |
| **扩展性** | runner-claude 孤立 | runner-* 可插拔 |
| **依赖** | 有循环依赖 | 零循环依赖 |
| **包数量** | 10 个包 | 9 个包（删除 sdk） |
| **理解难度** | 中等 | 简单清晰 |

---

## 潜在问题与解决方案

### 1. ~~循环依赖风险~~ ✅ 已解决

**当前问题**: core ↔ sandbox-local 循环依赖

**解决方案**: 
- manager 只定义接口，不依赖具体实现
- runner-* 和 sandbox-* 通过 duck typing 实现接口
- 不需要 import manager

```typescript
// ✅ 好的方式：duck typing
// packages/runner-claude/src/claude-runner.ts
export class ClaudeRunner {
  // 自动符合 Runner 接口，不需要 import
  async *run(input: string) { ... }
}

// ❌ 不需要这样做：
// import { Runner } from '@sandagent/manager';
// export class ClaudeRunner implements Runner { ... }
```

### 2. ~~Manager 职责过重~~ ✅ 已明确

**澄清**: Manager 的职责很清晰
- ✅ 定义接口（Runner, SandboxAdapter）
- ✅ 管理 sandbox 和 runner 的绑定
- ✅ 生命周期管理（Session, 资源清理）
- ❌ 不实现具体的 runner 或 sandbox 逻辑

### 3. Type Safety 如何保证？

**方案**: TypeScript 结构化类型系统

```typescript
// packages/manager/src/types.ts
export interface Runner {
  run(input: string, options?: RunOptions): AsyncIterable<RunnerOutput>;
}

// packages/runner-claude/src/claude-runner.ts
// 不需要显式 implements，TypeScript 会自动检查
export class ClaudeRunner {
  async *run(input: string, options?: RunOptions) {
    // 如果签名不匹配，TypeScript 会报错
  }
}

// 使用时会自动类型检查
const manager = new SandAgentManager({
  runner: new ClaudeRunner(), // ✅ TypeScript 会验证类型兼容性
  sandbox: new LocalSandbox()
});
```

---

## 推荐的重构顺序

### ✅ Phase 1 (必须) - 重命名和删除

**优先级**: 🔥🔥🔥 最高

1. ✅ 重命名 `packages/core` → `packages/manager`
2. ✅ 删除 `packages/sdk`（合并功能到 ai-provider）
3. ✅ 更新所有 `@sandagent/core` → `@sandagent/manager`

**预计时间**: 1-2 小时

### ✅ Phase 2 (重要) - 清理接口和依赖

**优先级**: 🔥🔥 高

4. ✅ 在 manager 中明确定义 `Runner` 和 `SandboxAdapter` 接口
5. ✅ 移除 runner-claude 对 manager 的依赖（如果有）
6. ✅ 移除 sandbox-* 对 manager 的依赖（改为 duck typing）
7. ✅ 更新 ai-provider 使用 manager 并传入 runner + sandbox

**预计时间**: 2-3 小时

### ⏳ Phase 3 (可选) - 扩展生态

**优先级**: 🔥 中

8. ⏳ 创建 `packages/runner-codex` 骨架
9. ⏳ 创建 `packages/runner-copilot` 骨架
10. ⏳ 完善文档和使用示例

**预计时间**: 4-6 小时

### 📋 详细检查清单

#### Phase 1 检查清单

- [ ] 重命名目录: `mv packages/core packages/manager`
- [ ] 更新 `packages/manager/package.json` 中的 name
- [ ] 删除 `packages/sdk` 目录
- [ ] 全局搜索替换 `@sandagent/core` → `@sandagent/manager`
  - [ ] 所有 `.ts` 文件
  - [ ] 所有 `.tsx` 文件  
  - [ ] 所有 `package.json` 文件
- [ ] 运行 `pnpm install`
- [ ] 运行 `pnpm build`
- [ ] 运行 `pnpm test`

#### Phase 2 检查清单

- [ ] 在 `packages/manager/src/types.ts` 中定义清晰的接口
- [ ] 检查 `packages/runner-claude` 不依赖 manager
- [ ] 检查 `packages/sandbox-*` 不依赖 manager
- [ ] 更新 `packages/ai-provider` 导入 manager
- [ ] 更新 `apps/manager-cli` 使用 manager
- [ ] 更新 `apps/runner-cli` 使用 manager
- [ ] 验证所有测试通过
- [ ] 验证没有循环依赖警告

#### Phase 3 检查清单

- [ ] 创建 `packages/runner-codex/package.json`
- [ ] 创建 `packages/runner-codex/src/index.ts`
- [ ] 创建 `packages/runner-copilot/package.json`
- [ ] 创建 `packages/runner-copilot/src/index.ts`
- [ ] 更新主 README.md
- [ ] 创建使用示例文档
- [ ] 更新 API 文档

---

## 总结

### ✅ 新架构核心要点

1. **manager 是原 core 改名**
   - 定义接口：Runner, SandboxAdapter
   - 管理生命周期：Session, 资源清理
   - 绑定 sandbox 和 runner

2. **runner-* 和 sandbox-* 独立实现**
   - 不依赖 manager
   - 通过 duck typing 符合接口
   - 可插拔设计

3. **ai-provider 和 manager-cli 使用 manager**
   - 创建 manager 实例
   - 传入选择的 runner 和 sandbox
   - 调用 manager 的方法

4. **删除 sdk 包**
   - 功能少，可以合并
   - 减少包数量
   - 简化架构

### 🎯 架构优势

✅ **职责清晰**: manager 管理，runner-* 运行，sandbox-* 隔离  
✅ **零循环依赖**: 接口定义和实现完全分离  
✅ **可插拔**: 任意组合 runner 和 sandbox  
✅ **易扩展**: 新增实现无需修改 manager  
✅ **易测试**: 各层独立，接口清晰  

### ⚠️ 注意事项

⚠️ **重命名影响**: 需要更新所有引用  
⚠️ **文档更新**: README、API 文档、示例代码  
⚠️ **向后兼容**: 如果有外部用户，需要提供迁移指南  

### 💡 下一步

建议按照 Phase 1 → Phase 2 → Phase 3 的顺序执行，确认每个阶段完成后再进行下一阶段。

**是否开始执行重构？** 🚀
