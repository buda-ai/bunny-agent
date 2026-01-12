# Tool Approval Flow 文档

## 概述

SandAgent 支持工具审批流程，允许某些工具在执行前请求用户输入。目前主要用于 `AskUserQuestion` 工具，该工具可以向用户展示问题并收集答案。

## 架构设计

### 文件系统轮询方案

审批流程使用 **文件系统轮询** 方案，而不是 SSE 或内存状态管理。这种设计在 Serverless 环境（如 Vercel）中也能正常工作。

```
┌─────────────────────────────────────────────────────────────┐
│  Claude Runner (E2B Sandbox)                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 1. AskUserQuestion 工具被调用                         │   │
│  │ 2. 写入文件: /sandagent/approvals/{toolCallId}.json  │   │
│  │    { questions: [...], answers: {}, status: "pending" }│   │
│  │ 3. 每 500ms 轮询一次文件                              │   │
│  │ 4. 检测到 status: "completed" 后继续执行             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│  Vercel Next.js API (Serverless)                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ POST /api/approval/submit                             │   │
│  │ 1. 接收: { sessionId, toolCallId, question, answer } │   │
│  │ 2. 通过 sessionId attach 到 E2B 实例                 │   │
│  │ 3. 读取审批文件                                       │   │
│  │ 4. 更新 answers[question] = answer                   │   │
│  │ 5. 所有问题回答完毕时设置 status: "completed"        │   │
│  │ 6. 写回文件                                           │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│  用户浏览器                                                  │
│  - 展示问题 UI                                              │
│  - 用户选择答案                                              │
│  - 调用 /api/approval/submit                                │
└─────────────────────────────────────────────────────────────┘
```

### 为什么使用文件系统？

1. **E2B Sandbox 是有状态的**：E2B 实例按 `sessionId` 缓存，不同 API 路由可以访问同一实例
2. **Serverless 友好**：不需要内存状态管理或外部存储（Redis/KV）
3. **简单可靠**：文件系统操作简单，不需要复杂的 SSE 流处理

## 配置

### 1. Runner 配置

在创建 `SandAgent` 时配置 `approvalDir`：

```typescript
const agent = new SandAgent({
  id: sessionId,
  sandbox,
  runner: {
    kind: "claude-agent-sdk",
    model: "claude-sonnet-4-20250514",
    template: "default",
    approvalDir: "/sandagent/approvals",  // 审批文件目录
  },
  env: {
    ANTHROPIC_API_KEY: "...",
  },
});
```

### 2. CLI 配置

使用 CLI 时可以通过 `--approval-dir` 参数配置：

```bash
sandagent run \
  --approval-dir /sandagent/approvals \
  -- "Ask me some questions"
```

### 3. 类型定义

```typescript
interface ClaudeRunnerOptions {
  model: string;
  systemPrompt?: string;
  maxTurns?: number;
  allowedTools?: string[];
  cwd?: string;
  env?: Record<string, string>;
  resume?: string;
  approvalDir?: string;  // 审批文件目录
}

interface RunnerSpec {
  kind: "claude-agent-sdk";
  model: string;
  template?: string;
  systemPrompt?: string;
  maxTurns?: number;
  allowedTools?: string[];
  approvalDir?: string;  // 审批文件目录
}
```

## AskUserQuestion 工具

### 工具定义

`AskUserQuestion` 是一个特殊的工具，允许 AI 向用户提问并收集答案。

### 输入格式

```typescript
interface AskUserQuestionInput {
  questions: Array<{
    question: string;        // 问题文本
    header?: string;         // 问题标题（可选）
    options?: Array<{        // 选项列表（可选）
      label: string;         // 选项标签
      description?: string;  // 选项描述
    }>;
    multiSelect?: boolean;   // 是否允许多选
  }>;
}
```

### 输出格式

```typescript
interface AskUserQuestionOutput {
  questions: Array<{...}>;  // 原始问题
  answers: Record<string, string>;  // 答案映射（问题文本 -> 答案）
}
```

### 示例

**AI 调用工具：**

```json
{
  "tool": "AskUserQuestion",
  "input": {
    "questions": [
      {
        "question": "What is your preferred programming language?",
        "header": "Development Preferences",
        "options": [
          { "label": "TypeScript", "description": "Type-safe JavaScript" },
          { "label": "Python", "description": "General-purpose language" },
          { "label": "Go", "description": "Fast and efficient" }
        ],
        "multiSelect": false
      },
      {
        "question": "Which frameworks do you use?",
        "options": [
          { "label": "React" },
          { "label": "Vue" },
          { "label": "Angular" }
        ],
        "multiSelect": true
      }
    ]
  }
}
```

**用户回答后的输出：**

```json
{
  "questions": [...],
  "answers": {
    "What is your preferred programming language?": "TypeScript",
    "Which frameworks do you use?": "React, Vue"
  }
}
```

## 前端集成

### 1. UI 组件

前端需要实现 `AskUserQuestionUI` 组件来展示问题并收集答案：

```typescript
export function AskUserQuestionUI({
  part,
  addToolOutput,
  sessionId,
}: {
  part: DynamicToolUIPart;
  addToolOutput: ChatAddToolOutputFunction;
  sessionId: string;
}) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const questions = (part.input as AskUserQuestionOutput)?.questions || [];

  const handleSelect = (question: string, value: string, multiSelect: boolean) => {
    // 更新本地状态
    const newAnswers = { ...answers };
    if (multiSelect) {
      const current = (newAnswers[question] as string[]) || [];
      newAnswers[question] = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
    } else {
      newAnswers[question] = value;
    }
    setAnswers(newAnswers);

    // 提交到后端
    fetch("/api/approval/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        toolCallId: part.toolCallId,
        question,
        answer: multiSelect 
          ? (newAnswers[question] as string[]).join(", ")
          : newAnswers[question],
      }),
    });

    // 更新工具输出
    addToolOutput({
      tool: part.toolName,
      toolCallId: part.toolCallId,
      output: {
        questions,
        answers: formatAnswers(newAnswers),
      },
    });
  };

  // 渲染问题和选项...
}
```

### 2. API 路由

后端需要实现 `/api/approval/submit` 端点：

```typescript
export async function POST(request: Request) {
  const { sessionId, toolCallId, question, answer } = await request.json();

  // 1. 通过 sessionId attach 到 E2B 实例
  const sandbox = new E2BSandbox({ apiKey: E2B_API_KEY });
  const handle = await sandbox.attach(sessionId);

  // 2. 读取审批文件
  const approvalFile = `/sandagent/approvals/${toolCallId}.json`;
  const fileContent = await readFile(handle, approvalFile);
  const approval = JSON.parse(fileContent);

  // 3. 更新答案
  approval.answers[question] = answer;

  // 4. 检查是否所有问题都已回答
  const allAnswered = approval.questions.every(
    (q) => approval.answers[q.question] !== undefined
  );
  if (allAnswered) {
    approval.status = "completed";
  }

  // 5. 写回文件
  await writeFile(handle, approvalFile, JSON.stringify(approval));

  return Response.json({ success: true });
}
```

## 审批文件格式

### 文件路径

```
/sandagent/approvals/{toolCallId}.json
```

### 文件内容

```json
{
  "questions": [
    {
      "question": "What is your preferred programming language?",
      "header": "Development Preferences",
      "options": [
        { "label": "TypeScript", "description": "Type-safe JavaScript" },
        { "label": "Python", "description": "General-purpose language" }
      ],
      "multiSelect": false
    }
  ],
  "answers": {
    "What is your preferred programming language?": "TypeScript"
  },
  "status": "pending" | "completed"
}
```

### 状态说明

- `pending`: 等待用户回答
- `completed`: 所有问题已回答，Runner 可以继续执行

## 工作流程

### 1. 工具调用阶段

```typescript
// Claude Runner 中的 canUseTool 回调
async function canUseTool(toolName, input, options) {
  if (toolName !== "AskUserQuestion") {
    return { behavior: "allow", updatedInput: input };
  }

  const { toolUseID } = options;
  const approvalFile = `${approvalDir}/${toolUseID}.json`;

  // 写入初始审批请求
  await fs.writeFile(approvalFile, JSON.stringify({
    questions: input.questions,
    answers: {},
    status: "pending",
  }));

  // 轮询等待完成（60秒超时）
  const timeout = Date.now() + 60000;
  while (Date.now() < timeout) {
    const data = JSON.parse(await fs.readFile(approvalFile, "utf-8"));
    
    if (data.status === "completed") {
      await fs.unlink(approvalFile);  // 清理文件
      return {
        behavior: "allow",
        updatedInput: {
          questions: data.questions,
          answers: data.answers,
        },
      };
    }
    
    await sleep(500);  // 等待 500ms
  }

  // 超时
  await fs.unlink(approvalFile);
  return { behavior: "deny", message: "Timeout waiting for user input" };
}
```

### 2. 用户回答阶段

1. 前端展示问题 UI
2. 用户选择答案
3. 每次选择都调用 `/api/approval/submit`
4. 后端更新审批文件
5. 所有问题回答完毕时设置 `status: "completed"`

### 3. 继续执行阶段

1. Runner 检测到 `status: "completed"`
2. 读取 `answers`
3. 清理审批文件
4. 继续执行工具调用

## 超时处理

- **默认超时**：60 秒
- **超时行为**：拒绝工具调用，返回 `behavior: "deny"`
- **清理**：超时后自动删除审批文件

## 错误处理

### 文件读取失败

```typescript
try {
  const data = await fs.readFile(approvalFile, "utf-8");
  const approval = JSON.parse(data);
} catch (error) {
  console.error("Error reading approval file:", error);
  // 继续轮询，文件可能正在写入
}
```

### 文件写入失败

```typescript
try {
  await writeFile(handle, approvalFile, JSON.stringify(approval));
} catch (error) {
  console.error("Failed to write approval file:", error);
  return Response.json({ success: false, error: error.message }, { status: 500 });
}
```

### E2B 实例不存在

```typescript
try {
  const handle = await sandbox.attach(sessionId);
} catch (error) {
  console.error("Failed to attach to sandbox:", error);
  return Response.json({ success: false, error: "Session not found" }, { status: 404 });
}
```

## 最佳实践

### 1. 问题设计

- **清晰简洁**：问题文本应该清晰明了
- **提供选项**：尽可能提供选项而不是自由文本输入
- **合理分组**：相关问题可以使用 `header` 分组

### 2. 性能优化

- **轮询间隔**：500ms 是一个合理的平衡点
- **超时设置**：60 秒足够用户思考和回答
- **文件清理**：完成或超时后立即删除文件

### 3. 用户体验

- **即时反馈**：用户选择后立即显示选中状态
- **进度提示**：显示已回答/总问题数
- **错误提示**：网络错误时给出友好提示

## 与旧版本的区别

### 旧版本（SSE + 内存状态）

```typescript
// ❌ 旧版本使用 SSE 和内存状态管理
runner: {
  toolSseUrl: "http://localhost:3000/api/approval/sse"
}

// ApprovalManager 在内存中管理状态
class ApprovalManager {
  private requests = new Map<string, ApprovalRequest>();
  // ...
}
```

**问题**：
- 在 Serverless 环境中，不同请求可能在不同 Lambda 实例中执行
- 内存状态无法共享
- SSE 连接管理复杂

### 新版本（文件系统轮询）

```typescript
// ✅ 新版本使用文件系统
runner: {
  approvalDir: "/sandagent/approvals"
}

// 状态存储在 E2B 文件系统中
// 不需要 ApprovalManager
```

**优势**：
- Serverless 友好
- 不需要外部存储
- 代码更简单
- 更可靠

## 调试

### 查看审批文件

在 E2B Sandbox 中查看审批文件：

```bash
# 列出所有审批文件
ls -la /sandagent/approvals/

# 查看特定文件
cat /sandagent/approvals/{toolCallId}.json
```

### 日志输出

Runner 会输出相关日志：

```
[Claude Runner] Writing approval request: /sandagent/approvals/abc123.json
[Claude Runner] Polling for completion...
[Claude Runner] Approval completed, continuing execution
```

### 常见问题

**Q: 为什么 Runner 一直在等待？**

A: 检查：
1. 前端是否正确调用 `/api/approval/submit`
2. `sessionId` 是否正确传递
3. 审批文件是否被正确更新

**Q: 为什么提交答案后没有反应？**

A: 检查：
1. `/api/approval/submit` 是否返回成功
2. E2B 实例是否存在（通过 `sessionId` 查找）
3. 文件写入是否成功

**Q: 如何测试审批流程？**

A: 
1. 创建一个使用 `AskUserQuestion` 的 prompt
2. 在浏览器中打开开发者工具查看网络请求
3. 检查 `/api/approval/submit` 的请求和响应
4. 在 E2B Sandbox 中查看审批文件

## 参考

- [Claude Agent SDK 文档](https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview)
- [E2B Sandbox 文档](https://e2b.dev/docs)
- [AI SDK UI 协议](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)
