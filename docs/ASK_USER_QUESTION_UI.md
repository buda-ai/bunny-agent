# AskUserQuestion 工具 UI 文档

## 概述

`AskUserQuestion` 是一个特殊的动态工具，允许 AI 在执行过程中向用户提问并收集答案。这个工具通过审批流程实现，使用文件系统轮询方案。

## 工具输入输出

### Input 结构

```typescript
interface AskUserQuestionInput {
  questions: Array<{
    question: string;        // 问题文本（必需）
    header?: string;         // 问题标题（可选）
    options?: Array<{        // 选项列表（可选）
      label: string;         // 选项标签
      description?: string;  // 选项描述
    }>;
    multiSelect?: boolean;   // 是否允许多选（默认 false）
  }>;
}
```

### Output 结构

```typescript
interface AskUserQuestionOutput {
  questions: Array<{...}>;           // 原始问题数组
  answers: Record<string, string>;   // 答案映射
}
```

**答案格式说明**：
- 单选：`answers[question] = "选项标签"`
- 多选：`answers[question] = "选项1, 选项2, 选项3"`（逗号分隔）

## DynamicToolUIPart 结构

```typescript
interface DynamicToolUIPart {
  type: "dynamic-tool";
  toolName: "AskUserQuestion";
  toolCallId: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input: AskUserQuestionInput;
  output?: AskUserQuestionOutput;
  errorText?: string;
  approval?: {
    id: string;
    approved: boolean;
    reason?: string;
  };
}
```

### 状态说明

| 状态 | 说明 | UI 行为 |
|------|------|---------|
| `input-streaming` | AI 正在生成问题 | 不渲染（等待完成） |
| `input-available` | 问题已生成，等待用户回答 | 渲染交互式问题 UI |
| `output-available` | 用户已回答所有问题 | 渲染只读的答案展示 |
| `output-error` | 发生错误（如超时） | 显示错误信息 |

## UI 组件实现

### 组件签名

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
  // 组件实现
}
```

### 参数说明

- `part`: 工具调用的完整信息
- `addToolOutput`: 用于更新工具输出的回调函数
- `sessionId`: 当前会话 ID，用于提交答案到后端

### 核心逻辑

```typescript
const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
const questions = (part.input as AskUserQuestionOutput)?.questions || [];

// 处理用户选择
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

  // 2. 格式化答案（多选转为逗号分隔字符串）
  const answer = multiSelect
    ? (newAnswers[question] as string[]).join(", ")
    : newAnswers[question];

  // 3. 提交到后端
  fetch("/api/approval/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      toolCallId: part.toolCallId,
      question,
      answer,
    }),
  }).catch((error) => {
    console.error("Failed to submit answer:", error);
  });

  // 4. 更新工具输出（用于会话恢复）
  const answersMap: Record<string, string> = {};
  for (const q of questions) {
    const ans = newAnswers[q.question];
    if (q.multiSelect) {
      answersMap[q.question] = Array.isArray(ans) ? ans.join(", ") : "";
    } else {
      answersMap[q.question] = (ans as string) || "";
    }
  }
  
  addToolOutput({
    tool: part.toolName,
    toolCallId: part.toolCallId,
    output: {
      questions: questions,
      answers: answersMap,
    },
    approval: part.approval
      ? {
          id: part.approval.id,
          approved: true,
          reason: "User selected",
        }
      : undefined,
  });
};
```

## 会话恢复

当用户刷新页面或重新加载会话时，需要从 `part.output` 恢复已选择的答案：

```typescript
// 从 output 解析答案
const outputAnswers = (() => {
  if (part.output && typeof part.output === "object") {
    const output = part.output as { answers?: Record<string, string> };
    if (output.answers) {
      // 检查是否有真实答案（非空）
      const hasRealAnswers = Object.values(output.answers).some(
        (v) => v && v.trim() !== "",
      );
      if (hasRealAnswers) {
        // 将逗号分隔的字符串转回数组（多选）
        const parsed: Record<string, string | string[]> = {};
        for (const q of questions) {
          const val = output.answers[q.question];
          if (q.multiSelect && val) {
            parsed[q.question] = val.split(", ").filter(Boolean);
          } else {
            parsed[q.question] = val || "";
          }
        }
        return parsed;
      }
    }
  }
  return null;
})();

// 优先使用本地状态，否则使用恢复的答案
const displayAnswers = Object.keys(answers).length > 0 
  ? answers 
  : outputAnswers || {};

// 判断是否已完成（用于只读展示）
const isCompleted = Object.keys(answers).length === 0 && outputAnswers !== null;
```

## UI 渲染

### 交互式 UI（等待用户回答）

```tsx
<div className="my-2 space-y-4">
  {questions.map((q, idx) => {
    const selectedValue = answers[q.question];
    const isMulti = q.multiSelect ?? false;

    return (
      <div key={idx} className="rounded-lg border border-border p-4">
        {/* 标题 */}
        {q.header && (
          <h4 className="mb-2 font-medium text-foreground">{q.header}</h4>
        )}
        
        {/* 问题文本 */}
        <p className="mb-3 text-sm text-muted-foreground">{q.question}</p>
        
        {/* 选项列表 */}
        {q.options && (
          <div className="space-y-2">
            {q.options.map((opt, optIdx) => {
              const isSelected = isMulti
                ? (selectedValue as string[] | undefined)?.includes(opt.label)
                : selectedValue === opt.label;

              return (
                <div
                  key={optIdx}
                  onClick={() => handleSelect(q.question, opt.label, isMulti)}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {/* 复选框/单选框 */}
                  <div className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-${isMulti ? "sm" : "full"} border ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground"
                  }`}>
                    {isSelected && (
                      <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  
                  {/* 选项内容 */}
                  <div>
                    <div className="font-medium text-foreground">{opt.label}</div>
                    {opt.description && (
                      <div className="text-sm text-muted-foreground">{opt.description}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  })}
</div>
```

### 只读 UI（已完成）

```tsx
<div className="my-2 space-y-4">
  {questions.map((q, idx) => {
    const selectedValue = displayAnswers[q.question];
    const isMulti = q.multiSelect ?? false;

    return (
      <div key={idx} className="rounded-lg border border-border p-4">
        {q.header && (
          <h4 className="mb-2 font-medium text-foreground">{q.header}</h4>
        )}
        <p className="mb-3 text-sm text-muted-foreground">{q.question}</p>
        {q.options && (
          <div className="space-y-2">
            {q.options.map((opt, optIdx) => {
              const isSelected = isMulti
                ? (selectedValue as string[] | undefined)?.includes(opt.label)
                : selectedValue === opt.label;

              return (
                <div
                  key={optIdx}
                  className={`flex items-start gap-3 rounded-md border p-3 ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border opacity-50"
                  }`}
                >
                  {/* 只读的选中状态 */}
                  <div className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-${isMulti ? "sm" : "full"} border ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground"
                  }`}>
                    {isSelected && (
                      <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-foreground">{opt.label}</div>
                    {opt.description && (
                      <div className="text-sm text-muted-foreground">{opt.description}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  })}
</div>
```

### 等待动画

当 `part.state !== "output-available"` 时，添加抖动动画提示用户需要回答：

```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
  20%, 40%, 60%, 80% { transform: translateX(2px); }
}

.shake-animation {
  animation: shake 0.5s ease-in-out;
}
```

```tsx
<div className={`my-2 space-y-4 ${isWaiting ? "shake-animation" : ""}`}>
  {/* 问题列表 */}
</div>
```

## 样式指南

### 颜色变量

使用 CSS 变量以支持深色模式：

```css
--foreground: /* 主文本颜色 */
--muted-foreground: /* 次要文本颜色 */
--border: /* 边框颜色 */
--primary: /* 主题色 */
--primary-foreground: /* 主题色上的文本 */
--muted: /* 背景色 */
```

### 响应式设计

```tsx
<div className="my-2 space-y-4">
  {/* 在移动设备上堆叠，桌面上并排 */}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {/* 问题卡片 */}
  </div>
</div>
```

## 无障碍支持

### ARIA 属性

```tsx
<div
  role={isMulti ? "checkbox" : "radio"}
  aria-checked={isSelected}
  tabIndex={0}
  onKeyDown={(e) => e.key === "Enter" && handleSelect(q.question, opt.label, isMulti)}
  className="..."
>
  {/* 选项内容 */}
</div>
```

### 键盘导航

- `Tab`: 在选项间导航
- `Enter` / `Space`: 选择当前选项
- `Escape`: 取消选择（可选）

## 错误处理

### 网络错误

```typescript
fetch("/api/approval/submit", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({...}),
})
.catch((error) => {
  console.error("Failed to submit answer:", error);
  // 可选：显示错误提示
  toast.error("Failed to submit answer. Please try again.");
});
```

### 超时处理

如果 60 秒内用户没有回答所有问题，Runner 会超时并拒绝工具调用。前端应该：

1. 显示倒计时（可选）
2. 超时后显示友好的错误信息
3. 允许用户重试

## 示例

### 单选问题

```json
{
  "question": "What is your preferred programming language?",
  "header": "Development Preferences",
  "options": [
    { "label": "TypeScript", "description": "Type-safe JavaScript" },
    { "label": "Python", "description": "General-purpose language" },
    { "label": "Go", "description": "Fast and efficient" }
  ],
  "multiSelect": false
}
```

### 多选问题

```json
{
  "question": "Which frameworks do you use?",
  "options": [
    { "label": "React", "description": "UI library by Facebook" },
    { "label": "Vue", "description": "Progressive framework" },
    { "label": "Angular", "description": "Full-featured framework" }
  ],
  "multiSelect": true
}
```

### 无选项问题（自由文本）

```json
{
  "question": "What is your project name?",
  "header": "Project Information"
}
```

**注意**：当前实现主要支持选项式问题。自由文本输入需要额外的 UI 组件。

## 最佳实践

### 1. 问题设计

- **清晰简洁**：问题应该一目了然
- **提供上下文**：使用 `header` 分组相关问题
- **合理选项**：选项数量不宜过多（建议 2-7 个）
- **描述性标签**：选项标签应该自解释

### 2. 用户体验

- **即时反馈**：选择后立即显示选中状态
- **视觉层次**：使用颜色和间距区分问题和选项
- **进度提示**：显示"已回答 X / 总共 Y 个问题"
- **允许修改**：用户应该能够修改已选择的答案

### 3. 性能优化

- **防抖提交**：避免频繁的网络请求
- **乐观更新**：先更新 UI，再提交到后端
- **错误重试**：网络失败时自动重试

### 4. 会话恢复

- **保存状态**：使用 `addToolOutput` 保存答案
- **恢复答案**：从 `part.output` 恢复已选择的答案
- **区分状态**：区分"正在回答"和"已完成"状态

## 调试技巧

### 1. 查看工具调用

```typescript
console.log("AskUserQuestion part:", part);
console.log("Questions:", questions);
console.log("Current answers:", answers);
console.log("Output answers:", outputAnswers);
```

### 2. 监控网络请求

在浏览器开发者工具中查看 `/api/approval/submit` 请求：

```
POST /api/approval/submit
{
  "sessionId": "session-1234567890",
  "toolCallId": "toolu_abc123",
  "question": "What is your preferred programming language?",
  "answer": "TypeScript"
}

Response:
{
  "success": true
}
```

### 3. 检查审批文件

在 E2B Sandbox 中查看审批文件：

```bash
cat /sandagent/approvals/toolu_abc123.json
```

## 参考

- [APPROVAL_FLOW.md](./APPROVAL_FLOW.md) - 审批流程完整文档
- [AI SDK UI 协议](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)
- [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview)
