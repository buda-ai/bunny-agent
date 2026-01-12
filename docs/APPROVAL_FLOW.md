# Tool Approval Flow 文档

## 概述

SandAgent 支持工具审批流程，允许某些工具在执行前请求用户输入。目前主要用于 `AskUserQuestion` 工具，该工具可以向用户展示问题并收集答案。

## 架构设计

### 文件系统轮询方案

审批流程使用 **文件系统轮询** 方案，而不是 SSE 或内存状态管理。这种设计在 Serverless 环境（如 Vercel）中也能正常工作。

```
┌─────────────────────────────────────────────────────────────┐
│  Claude Runner (Sandbox 内部)                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 1. AskUserQuestion 工具被调用                         │   │
│  │ 2. 开始轮询文件: /sandagent/approvals/{toolCallId}.json│  │
│  │    (不创建初始文件，等待前端创建)                      │   │
│  │ 3. 每 500ms 检查文件是否存在                          │   │
│  │ 4. 文件存在时读取内容                                 │   │
│  │ 5. 检测到 status: "completed" 后继续执行             │   │
│  │ 6. 超时(60s)后返回部分答案或 deny                    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│  Next.js API (Serverless)                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ POST /api/approval/submit                             │   │
│  │ 1. 接收: { sessionId, toolCallId, questions, answers }│  │
│  │ 2. 通过 sessionId attach 到 Sandbox 实例             │   │
│  │ 3. 确保 /sandagent/approvals 目录存在                │   │
│  │ 4. 检查所有问题是否都已回答                           │   │
│  │ 5. 创建/覆盖文件:                                     │   │
│  │    { questions, answers, status: "pending"|"completed" }│  │
│  │ 6. 使用 handle.upload() 上传文件                     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│  用户浏览器                                                  │
│  - 展示问题 UI                                              │
│  - 用户每次点击选项时:                                       │
│    1. 更新本地状态                                          │
│    2. 提交当前所有已收集的答案到 API                         │
│    3. 不调用 addToolOutput (保持 UI 交互状态)              │
└─────────────────────────────────────────────────────────────┘
```

### 关键设计决策

1. **Runner 只读取，不创建文件**
   - Runner 轮询等待文件出现
   - 文件由前端 API 创建和更新
   - 避免文件创建时序问题

2. **每次点击提交所有答案**
   - 用户每次选择选项时，提交当前所有已收集的答案
   - 直接覆盖文件，不需要读取旧内容
   - 支持部分答案超时返回

3. **不改变 Tool State**
   - 用户选择时不调用 `addToolOutput`
   - 保持 UI 交互状态
   - Runner 从文件读取答案，不依赖前端状态

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
  const { sessionId, toolCallId, questions, answers } = await request.json();

  // 验证必需参数
  if (!sessionId || !toolCallId || !questions || !answers) {
    return Response.json(
      { success: false, error: "Missing required parameters" },
      { status: 400 }
    );
  }

  try {
    // 1. Attach 到 Sandbox 实例（不需要 templatesPath）
    const sandbox = new E2BSandbox({
      apiKey: E2B_API_KEY,
      runnerBundlePath: RUNNER_BUNDLE_PATH,
    });
    const handle = await sandbox.attach(sessionId);

    // 2. 确保目录存在
    for await (const _chunk of handle.exec(["mkdir", "-p", "/sandagent/approvals"])) {
      // consume chunks
    }

    // 3. 检查是否所有问题都已回答
    const allAnswered = questions.every(
      (q) => answers[q.question] !== undefined && answers[q.question] !== "",
    );

    // 4. 创建审批文件
    const approval = {
      questions,
      answers,
      status: allAnswered ? "completed" : "pending",
    };

    // 5. 直接上传文件（覆盖旧文件）
    await handle.upload(
      [{ path: `${toolCallId}.json`, content: JSON.stringify(approval) }],
      "/sandagent/approvals",
    );

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to submit answer:", error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
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

### 1. 工具调用阶段（Runner 内部）

```typescript
// Claude Runner 中的 canUseTool 回调
async function canUseTool(toolName, input, options) {
  if (toolName !== "AskUserQuestion") {
    return { behavior: "allow", updatedInput: input };
  }

  const { toolUseID } = options;
  const approvalFile = `${approvalDir}/${toolUseID}.json`;

  // 轮询等待文件出现（60秒超时）
  const timeout = Date.now() + 60000;
  let lastApproval = null;

  while (Date.now() < timeout) {
    try {
      // 检查文件是否存在
      await fs.access(approvalFile);
      
      // 文件存在，读取内容
      const data = JSON.parse(await fs.readFile(approvalFile, "utf-8"));
      lastApproval = data;
      
      // 如果完成，立即返回
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
    } catch (error) {
      // 文件不存在，继续等待
    }
    
    await sleep(500);  // 等待 500ms
  }

  // 超时 - 返回部分答案（如果有）
  await fs.unlink(approvalFile).catch(() => {});
  
  if (lastApproval && Object.keys(lastApproval.answers).length > 0) {
    return {
      behavior: "allow",
      updatedInput: {
        questions: lastApproval.questions,
        answers: lastApproval.answers,
      },
    };
  }

  return { behavior: "deny", message: "Timeout waiting for user input" };
}
```

### 2. 用户回答阶段（前端）

```typescript
const handleSelect = (question: string, value: string, multiSelect: boolean) => {
  // 1. 更新本地状态
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

  // 2. 准备所有答案
  const answersMap: Record<string, string> = {};
  for (const q of questions) {
    const answer = newAnswers[q.question];
    if (q.multiSelect) {
      answersMap[q.question] = Array.isArray(answer) ? answer.join(", ") : "";
    } else {
      answersMap[q.question] = (answer as string) || "";
    }
  }

  // 3. 提交所有已收集的答案到 API
  fetch("/api/approval/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      toolCallId: part.toolCallId,
      questions,
      answers: answersMap,  // 提交所有答案，不是单个
      E2B_API_KEY: config.E2B_API_KEY,
      SANDOCK_API_KEY: config.SANDOCK_API_KEY,
      SANDBOX_PROVIDER: config.SANDBOX_PROVIDER || "e2b",
    }),
  }).catch((error) => {
    console.error("Failed to submit answer:", error);
  });

  // 注意：不调用 addToolOutput，保持 UI 交互状态
};
```

### 3. API 处理阶段（后端）

```typescript
export async function POST(request: Request) {
  const { sessionId, toolCallId, questions, answers } = await request.json();

  // 1. Attach 到 Sandbox 实例
  const sandbox = new E2BSandbox({ apiKey: E2B_API_KEY });
  const handle = await sandbox.attach(sessionId);

  // 2. 确保目录存在
  for await (const _chunk of handle.exec(["mkdir", "-p", "/sandagent/approvals"])) {
    // consume chunks
  }

  // 3. 检查是否所有问题都已回答
  const allAnswered = questions.every(
    (q) => answers[q.question] !== undefined && answers[q.question] !== "",
  );

  // 4. 创建审批文件
  const approval = {
    questions,
    answers,
    status: allAnswered ? "completed" : "pending",
  };

  // 5. 直接上传文件（覆盖旧文件）
  const content = JSON.stringify(approval);
  await handle.upload(
    [{ path: `${toolCallId}.json`, content }],
    "/sandagent/approvals",
  );

  return Response.json({ success: true });
}
```

## 超时处理

- **默认超时**：60 秒
- **超时行为**：
  - 如果有部分答案，返回 `behavior: "allow"` 并传递部分答案
  - 如果没有任何答案，返回 `behavior: "deny"`
- **清理**：超时后自动删除审批文件

### 部分答案示例

```typescript
// 用户只回答了第一个问题就超时了
{
  "questions": [
    { "question": "Question 1", ... },
    { "question": "Question 2", ... }
  ],
  "answers": {
    "Question 1": "Answer 1"
    // Question 2 没有答案
  },
  "status": "pending"
}

// Runner 会返回部分答案给 Agent
return {
  behavior: "allow",
  updatedInput: {
    questions: [...],
    answers: { "Question 1": "Answer 1" }
  }
};
```

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
- **容错设计**：考虑用户可能不回答所有问题的情况

### 2. 性能优化

- **轮询间隔**：500ms 是一个合理的平衡点
- **超时设置**：60 秒足够用户思考和回答
- **文件清理**：完成或超时后立即删除文件
- **避免重复上传**：使用 `handle.upload()` 直接覆盖文件

### 3. 用户体验

- **即时反馈**：用户选择后立即显示选中状态
- **进度提示**：显示已回答/总问题数
- **错误提示**：网络错误时给出友好提示
- **保持交互**：不要在用户选择时改变 UI 状态

### 4. 错误处理

- **类型检查**：验证 `questions` 是数组
- **网络重试**：API 调用失败时可以重试
- **优雅降级**：格式错误时显示友好错误消息

## 与旧版本的区别

### 旧版本（Runner 创建文件 + 单个答案提交）

```typescript
// ❌ 旧版本：Runner 创建初始文件
await fs.writeFile(approvalFile, JSON.stringify({
  questions: input.questions,
  answers: {},
  status: "pending",
}));

// ❌ 旧版本：前端提交单个答案
fetch("/api/approval/submit", {
  body: JSON.stringify({
    sessionId,
    toolCallId,
    question,  // 单个问题
    answer,    // 单个答案
  }),
});

// ❌ 旧版本：后端需要读取、更新、写回
const approval = JSON.parse(await readFile(approvalFile));
approval.answers[question] = answer;
await writeFile(approvalFile, JSON.stringify(approval));
```

**问题**：
- 文件创建时序问题（Runner 和前端可能同时创建）
- 需要读取-修改-写入，可能有并发问题
- 每次只提交一个答案，效率低

### 新版本（前端创建文件 + 所有答案提交）

```typescript
// ✅ 新版本：Runner 只读取，不创建
try {
  await fs.access(approvalFile);  // 检查文件是否存在
  const data = JSON.parse(await fs.readFile(approvalFile));
  // ...
} catch (error) {
  // 文件不存在，继续等待
}

// ✅ 新版本：前端提交所有答案
fetch("/api/approval/submit", {
  body: JSON.stringify({
    sessionId,
    toolCallId,
    questions,  // 所有问题
    answers,    // 所有答案
  }),
});

// ✅ 新版本：后端直接覆盖文件
await handle.upload(
  [{ path: `${toolCallId}.json`, content: JSON.stringify(approval) }],
  "/sandagent/approvals",
);
```

**优势**：
- 避免文件创建时序问题
- 不需要读取旧文件，直接覆盖
- 支持部分答案超时返回
- 代码更简单，更可靠

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
