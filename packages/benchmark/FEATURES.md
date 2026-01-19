# Benchmark 新功能使用指南

## 🎯 新增功能

本次更新添加了四个高优先级功能：

1. ✅ **Wrong Answers 追踪系统** - 自动追踪失败任务并支持重跑
2. ✅ **Reflection Helper** - 反思提示工具，帮助提升 agent 性能
3. ✅ **Resume/Checkpoint** - 断点恢复功能（已有，已集成）
4. ✅ **README Matrix 自动更新** - 自动更新 README 中的基准测试结果矩阵

## 📊 README Matrix 自动更新

### 功能说明

运行完整的 benchmark 后，会自动更新 README.md 中的结果矩阵表格。矩阵展示：
- 横轴：不同的 agent runners
- 纵轴：不同的配置（dataset/level）
- 单元格：正确数/总数（正确率%）

### 何时更新

**会自动更新的场景：**
- 运行完整数据集：`pnpm benchmark:run --runner sandagent`
- 运行完整的某个 Level：`pnpm benchmark:run --runner sandagent --level 1`
- 运行完整的某个 category：`pnpm benchmark:run --runner sandagent --category code`

**不会更新的场景：**
- 限制任务数量：`--limit 10`
- 随机单个任务：`--random`
- 指定特定任务：`--task-id abc123`

### 查看结果

更新后的矩阵会显示在 [README.md](README.md#benchmark-results-overview) 的 "Benchmark Results Overview" 部分。

示例输出：

```
✅ Benchmark completed!
📝 Updating README matrix...
✅ README.md matrix updated
```

### 编程接口

```typescript
import { shouldUpdateReadme, updateReadmeMatrix } from "@sandagent/benchmark";

// 检查是否应该更新 README
const config = { dataset: "validation", level: 1, outputDir: "./results" };
if (shouldUpdateReadme(config)) {
  updateReadmeMatrix(config.outputDir);
}
```

## 🎯 答案提取器（Answer Extractor）

### 功能说明

参考 AI SDK 的 UIMessage 流解析方式，优化了答案提取逻辑：

1. **结构化 SSE 解析** - 将 SSE 流解析为结构化消息对象
2. **优先级模式匹配** - 按优先级尝试多种答案模式
3. **工具输出解析** - 智能提取工具执行结果中的答案

### 支持的答案模式

| 优先级 | 模式 | 示例 |
|--------|------|------|
| 1 | FINAL ANSWER 标记 | `FINAL ANSWER: 42` |
| 2 | Ball 数字模式 | `Ball #3 has the highest` → `3` |
| 3 | TaskOutput 工具 | `{ content: "Paris" }` → `Paris` |
| 4 | stdout ANSWER | `ANSWER: 100` → `100` |
| 5 | 加粗文本 | `**The answer is 42**` → `42` |
| 6 | 数字模式 | `equals 256` → `256` |
| 7 | 列表模式 | `comma-separated: a, b, c` → `a, b, c` |

### 编程接口

```typescript
import {
  parseSSEToMessage,
  extractAnswerFromMessage,
  extractAnswerFromSSE,
} from "@sandagent/benchmark";

// 方式 1: 直接从 SSE 提取
const answer = extractAnswerFromSSE(sseOutput);

// 方式 2: 分步解析
const message = parseSSEToMessage(sseOutput);
console.log(message.textContent);     // 文本内容
console.log(message.toolOutputs);     // 工具输出列表
const answer = extractAnswerFromMessage(message);
```

## 📚 Wrong Answers 功能

### 自动追踪

运行任何 benchmark 后，失败的任务会自动保存到 `wrong-answers.json`：

```bash
# 运行 benchmark
pnpm benchmark:run --runner sandagent --limit 10

# 失败任务自动记录到 benchmark-results/wrong-answers.json
```

### 重跑失败任务

```bash
# 重跑所有失败任务
pnpm benchmark:run --runner sandagent wrong

# 仅重跑 Level 1 的失败任务
pnpm benchmark:run --runner sandagent wrong --level 1

# 重跑前 5 个失败任务，显示详细日志
pnpm benchmark:run --runner sandagent wrong --limit 5 --verbose
```

### 查看失败统计

```bash
# CLI 会自动显示 wrong answers 摘要
# 包括：总数、按级别分组、尝试次数最多的任务等
```

### 工作流程

```
Run Benchmark
     ↓
  有失败? ─No→ 完成！
     ↓ Yes
保存到 wrong-answers.json
     ↓
分析失败原因
     ↓
改进 agent/prompt
     ↓
重跑失败任务 (wrong 命令)
     ↓
通过的任务自动移除
     ↓
重复直到全部通过
```

## 🤔 Reflection Helper 功能

### 什么是 Reflection？

在 agent 执行过程中，定期停下来"反思"：
- 我学到了什么？
- 我离答案更近了吗？
- 下一步该做什么？

这可以帮助 agent 避免：
- 重复相同的失败操作
- 陷入无限循环
- 用完步骤数还没找到答案

### 何时触发 Reflection？

```typescript
import { shouldTriggerReflection } from "@sandagent/benchmark";

// 在你的 agent 循环中
const shouldReflect = shouldTriggerReflection({
  stepCount: currentStep,
  maxSteps: 20,
  lastCommand: "search",
  commandHistory: recentCommands,
  hasError: hadError,
});

if (shouldReflect) {
  // 注入 reflection prompt
}
```

触发条件：
- ✅ 每 3 步（但不太早）
- ✅ 接近步数限制（80%）
- ✅ 发生错误
- ✅ 连续使用同一工具 3 次以上

### Reflection Prompt 样式

```typescript
import { buildReflectionPrompt, REFLECTION_PROMPTS } from "@sandagent/benchmark";

// 1. 基础版（推荐）- 3 个简单问题
const basicPrompt = buildReflectionPrompt({
  stepNumber: 5,
  totalSteps: 20,
  lastCommand: "search",
}, "basic");

// 2. 详细版 - 全面的进度审查
const detailedPrompt = buildReflectionPrompt({
  stepNumber: 5,
  totalSteps: 20,
}, "detailed");

// 3. 快速版 - 一行提示
const quickPrompt = buildReflectionPrompt({
  stepNumber: 5,
  totalSteps: 20,
}, "quick");

// 4. 特殊场景自动识别
const errorPrompt = buildReflectionPrompt({
  stepNumber: 5,
  totalSteps: 20,
  hasError: true,  // 自动使用错误恢复提示
});

const stuckPrompt = buildReflectionPrompt({
  stepNumber: 5,
  totalSteps: 20,
  isRepeating: true,  // 自动使用打破循环提示
});
```

### 新增辅助函数

#### 预执行提示（按任务级别）

```typescript
import { buildPreExecutionPrompt } from "@sandagent/benchmark";

// 为不同级别的任务生成引导提示
const prompt = buildPreExecutionPrompt(1); // Level 1 简单任务
const prompt = buildPreExecutionPrompt(2); // Level 2 中等任务  
const prompt = buildPreExecutionPrompt(3); // Level 3 困难任务
```

#### 验证提示（答案前自检）

```typescript
import { buildVerificationPrompt } from "@sandagent/benchmark";

// 在给出最终答案前，注入自检提示
if (containsFinalAnswer(output)) {
  const verifyPrompt = buildVerificationPrompt();
  // 让 agent 再次验证答案
}
```

### 集成到你的 Runner

如果你要在 sandagent 中使用（需要修改 agent 代码）：

```typescript
// 在 agent 的主循环中
let stepCount = 0;
const commandHistory: string[] = [];

while (stepCount < maxSteps && !hasAnswer) {
  // 执行步骤
  const result = await executeStep();
  stepCount++;
  commandHistory.push(result.command);
  
  // 检查是否需要 reflection
  const shouldReflect = shouldTriggerReflection({
    stepCount,
    maxSteps,
    lastCommand: result.command,
    commandHistory,
    hasError: result.error,
  });
  
  if (shouldReflect) {
    // 生成并注入 reflection prompt
    const prompt = buildReflectionPrompt({
      stepNumber: stepCount,
      totalSteps: maxSteps,
      lastCommand: result.command,
      hasError: result.error,
      isRepeating: commandHistory.slice(-3).every(c => c === result.command),
    });
    
    // 将 prompt 发送给 agent
    await sendToAgent(prompt);
  }
}
```

## 🔄 Resume/Checkpoint 功能

### 断点恢复

长时间运行的 benchmark 可能因为各种原因中断（网络、API 限制等）：

```bash
# 开始运行大量任务
pnpm benchmark:run --runner sandagent --limit 100

# 如果中断，使用 --resume 继续
pnpm benchmark:run --runner sandagent --limit 100 --resume
```

### 工作原理

1. 每完成一个任务，自动保存到 `{runner}-{dataset}-latest.json`
2. 使用 `--resume` 时，从上次断点继续
3. 已完成的任务会被跳过
4. 最终生成完整结果

### 增量保存

所有 benchmark 运行都会：
- ✅ 实时保存到 `latest.json`（增量）
- ✅ 完成后生成带时间戳的最终文件
- ✅ 自动更新 wrong-answers.json

## 🎬 实战示例

### 场景 1：首次运行

```bash
# 1. 下载数据集（如果还没有）
pnpm benchmark:download --dataset validation

# 2. 运行 10 个任务测试
pnpm benchmark:run --runner sandagent --limit 10 --verbose

# 3. 查看结果
# - benchmark-results/sandagent-validation-latest.json
# - benchmark-results/wrong-answers.json
```

### 场景 2：迭代优化

```bash
# 1. 运行 benchmark
pnpm benchmark:run --runner sandagent --limit 20

# 2. 假设有 5 个失败
# 查看 wrong-answers.json 分析失败原因

# 3. 改进 agent 或 prompt

# 4. 只重跑失败的任务
pnpm benchmark:wrong --runner sandagent

# 5. 重复直到全部通过
```

### 场景 3：长时间运行

```bash
# 1. 开始运行所有 validation 任务
pnpm benchmark:run --runner sandagent

# 2. 如果中途中断（比如 API 限制）
# 等待一段时间后继续

# 3. 使用 --resume 从断点继续
pnpm benchmark:run --runner sandagent --resume
```

### 场景 4：对比不同 runner

```bash
# 1. 运行多个 runner
pnpm benchmark:run --runner sandagent --limit 50
pnpm benchmark:run --runner claudecode --limit 50
pnpm benchmark:run --runner opencode --limit 50

# 2. 对比结果
pnpm benchmark:compare

# 3. 查看各自的 wrong answers
# - 分析哪些任务是共同的难点
# - 哪些任务某个 runner 表现更好
```

## 📊 输出文件说明

运行后会生成以下文件：

```
benchmark-results/
├── sandagent-validation-latest.json    # 最新结果（增量保存）
├── sandagent-validation-2024-...json   # 带时间戳的最终结果
└── wrong-answers.json                   # 失败任务集合
```

## 🔧 编程接口

如果你要在代码中使用这些功能：

```typescript
import {
  runBenchmark,
  loadWrongAnswers,
  getWrongAnswerTaskIds,
  displayWrongAnswersSummary,
  shouldTriggerReflection,
  buildReflectionPrompt,
} from "@sandagent/benchmark";

// 1. 加载 wrong answers
const wrongAnswers = await loadWrongAnswers("./benchmark-results");
console.log(`Total wrong: ${wrongAnswers.metadata.totalWrong}`);

// 2. 获取失败任务 IDs
const wrongIds = await getWrongAnswerTaskIds("./benchmark-results");

// 3. 在任务中使用 reflection
const shouldReflect = shouldTriggerReflection({
  stepCount: 5,
  maxSteps: 20,
  commandHistory: ["search", "search", "calculate"],
  lastCommand: "calculate",
});

if (shouldReflect) {
  const prompt = buildReflectionPrompt({
    stepNumber: 5,
    totalSteps: 20,
    lastCommand: "calculate",
  }, "basic");
  // 使用 prompt
}
```

## 💡 最佳实践

1. **迭代优化**
   - 先用小样本测试（`--limit 10`）
   - 查看 wrong answers 分析失败模式
   - 改进后用 `wrong` 命令验证
   - 再扩大到全集

2. **使用 Reflection**
   - 在长任务中特别有效
   - 基础版 prompt 最平衡
   - 错误后一定要 reflect

3. **Resume 策略**
   - 大批量任务建议分批
   - 遇到 API 限制时使用 resume
   - 定期检查 latest.json

4. **对比分析**
   - 用多个 runner 跑同一数据集
   - 用 compare 命令对比
   - 分析各自优劣势

## ❓ 常见问题

**Q: wrong-answers.json 会自动清理吗？**  
A: 是的，当任务通过时会自动移除。如果想手动重置，删除文件即可。

**Q: Reflection 会增加执行时间吗？**  
A: 会略微增加（每 3 步一次），但可以避免更多无效步骤，总体可能更快。

**Q: Resume 和 wrong 命令有什么区别？**  
A: Resume 继续未完成的任务；wrong 重跑已经失败的任务。

**Q: 可以同时使用 --resume 和 --wrong 吗？**  
A: 不推荐，wrong 命令默认不使用 resume。

## 🚀 下一步

1. 尝试运行一个小 benchmark
2. 查看生成的 wrong-answers.json
3. 使用 wrong 命令重跑
4. 在你的 agent 中集成 reflection（可选）

祝你使用愉快！如有问题请查看 README.md 或提 issue。
