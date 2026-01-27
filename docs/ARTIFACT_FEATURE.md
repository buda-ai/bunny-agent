# Artifact 功能完整文档

## 概述

Artifact 功能允许 Agent 在运行过程中生成文件（如研究报告、数据分析结果等），并通过流式传输实时显示在前端。系统会自动检测 artifact 文件的变化，并将内容发送到前端进行展示。

## 架构设计

### 核心组件

1. **TaskDrivenArtifactProcessor** - 后端处理器，负责读取和发送 artifact 数据
2. **StreamWriter** - 流式写入器，将 artifact 数据写入 AI SDK 的 UI stream
3. **前端组件** - 接收并展示 `data-artifact` 类型的消息

### 工作流程

```
Agent 执行 Write Tool
    ↓
写入 artifact.json (manifest 文件)
    ↓
TaskDrivenArtifactProcessor 检测到 Write tool 结果
    ↓
读取 artifact.json 获取文件列表
    ↓
读取每个 artifact 文件内容
    ↓
通过 StreamWriter 发送 data-artifact 到前端
    ↓
前端接收并展示 artifact 内容
```

## 后端实现

### TaskDrivenArtifactProcessor

`TaskDrivenArtifactProcessor` 是一个事件驱动的处理器，实现了 `ArtifactProcessor` 接口：

```typescript
export interface ArtifactProcessor {
  onChange(
    part: LanguageModelV3StreamPart,
    sessionId: string,
  ): Promise<void>;
}
```

#### 核心特性

1. **智能触发**：只在 `Write` tool 写入 `artifact.json` 时读取 manifest
2. **队列机制**：使用 Promise 链确保处理顺序，避免并发问题
3. **内容缓存**：缓存已发送的 artifact 内容，避免重复传输
4. **Manifest 缓存**：只在 manifest 内容变化时才重新解析

#### 实现细节

```typescript
export class TaskDrivenArtifactProcessor implements ArtifactProcessor {
  private artifactManifest: ArtifactManifest | null = null;
  private sentArtifacts = new Map<string, string>();
  private processingQueue: Promise<void> = Promise.resolve();

  onChange(part: LanguageModelV3StreamPart, sessionId: string): Promise<void> {
    // 1. 检测 Write tool 写入 artifact.json
    if (
      part.type === "tool-result" &&
      part.toolName === "Write" &&
      part.result?.filePath === `${workdir}/tasks/${sessionId}/artifact.json`
    ) {
      // 读取 manifest
      await this.loadManifest(sessionId);
    }

    // 2. 在 tool-input-delta 时处理 artifacts
    if (part.type === "tool-input-delta") {
      this.processingQueue = this.processingQueue
        .then(() => this.processArtifacts())
        .catch((e) => console.error("Queue error:", e));
    }
  }

  private async processArtifacts(): Promise<void> {
    // 读取所有 artifact 文件并发送
    for (const artifact of this.artifactManifest.artifacts) {
      const content = await handle.readFile(artifact.path);
      
      // 去重：只发送内容变化了的 artifact
      if (this.sentArtifacts.get(artifactId) !== content) {
        this.writer.write({
          type: "data-artifact",
          id: artifactId,
          data: { artifactId, content, mimeType },
        });
        this.sentArtifacts.set(artifactId, content);
      }
    }
  }
}
```

#### 性能优化

1. **Manifest 缓存**：使用 `JSON.stringify` 比较，只在内容变化时更新
2. **内容去重**：使用 `Map` 缓存已发送内容，避免重复传输
3. **队列机制**：Promise 链确保顺序执行，避免并发文件 I/O
4. **智能触发**：只在必要时读取 manifest（Write tool 写入时）

### 在 API Route 中使用

```typescript
// apps/sandagent-example/app/api/ai/route.ts
import { TaskDrivenArtifactProcessor } from "@/lib/artifact-processor";

export async function POST(request: Request) {
  const { sessionId, ... } = await request.json();
  
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // 创建 artifact processor
      const artifactProcessor = new TaskDrivenArtifactProcessor({
        sandbox,
        workdir: sandbox.getWorkdir?.() || "/sandagent",
        writer, // StreamWriter 用于写入 data-artifact
      });

      // 创建 SandAgent provider
      const sandagent = createSandAgent({
        sandbox,
        artifactProcessors: [artifactProcessor],
      });

      const result = streamText({
        model: sandagent(model),
        messages,
      });

      // 合并流
      writer.merge(result.toUIMessageStream());
      await result.response;
    },
  });

  return createUIMessageStreamResponse({ stream });
}
```

## 文件结构

### Manifest 文件格式

Agent 需要在 `tasks/{sessionId}/artifact.json` 创建 manifest 文件：

```json
{
  "artifacts": [
    {
      "id": "marathon-research-report",
      "path": "tasks/{sessionId}/reports/shenzhen-marathon-2025.md",
      "mimeType": "text/markdown",
      "description": "2025年深圳马拉松运动会研究报告"
    },
    {
      "id": "source-notes",
      "path": "tasks/{sessionId}/notes/sources.md",
      "mimeType": "text/markdown",
      "description": "研究资料来源和引用记录"
    },
    {
      "id": "task-summary",
      "path": "tasks/{sessionId}/summary.md",
      "mimeType": "text/markdown",
      "description": "任务总结和关键发现"
    }
  ]
}
```

### 目录结构

```
/workspace (或 /sandagent)
  tasks/
    {sessionId}/
      artifact.json          # Manifest 文件（必需）
      reports/
        report.md            # Artifact 文件
      notes/
        sources.md           # Artifact 文件
      summary.md             # Artifact 文件
```

### Manifest 字段说明

- `id` (可选): Artifact 的唯一标识符，用于前端去重
- `path` (必需): 文件路径，可以是绝对路径或相对于工作目录的路径
- `mimeType` (可选): MIME 类型，用于前端渲染（如 `text/markdown`, `application/json`）
- `description` (可选): 描述信息

## Agent 使用 Artifact Skill

### 为什么需要 Artifact Skill

为了让 Agent 能够正确创建和管理 artifact 文件，需要在 Agent 的 template 中添加 `artifact` skill。这个 skill 提供了：

1. **Session ID 使用说明**：`${CLAUDE_SESSION_ID}` 是 Claude Code 加载 skill 时自动提供的内置变量，无需任何代码处理
2. **标准化的创建流程**：提供创建 `artifact.json` 的标准步骤
3. **最佳实践指导**：说明如何正确组织 artifact 文件

> **注意**：只需将 skill 文件放在 `.claude/skills/` 目录下，遵循 Claude 的 skill 规范即可。`${CLAUDE_SESSION_ID}` 会在 skill 加载时被 Claude Code 自动替换为当前会话 ID。

### 如何添加 Artifact Skill

在 Agent template 的 `.claude/skills/` 目录下创建 `artifact/SKILL.md` 文件：

```
templates/
  {template-name}/
    .claude/
      skills/
        artifact/
          SKILL.md
```

### Artifact Skill 内容示例

参考 `templates/researcher/.claude/skills/artifact/SKILL.md`：

```markdown
---
name: artifact
description: Create and manage artifact.json for task outputs. Use when creating research reports, notes, or any files that should be tracked as artifacts.
---

# Artifact Management Skill

Use this skill to create and manage `artifact.json` for tracking task outputs.

## Session Information

- **Current Session ID**: `${CLAUDE_SESSION_ID}`
- **Artifact Path**: `tasks/${CLAUDE_SESSION_ID}/artifact.json`

## Create Task Directory and Artifact.json

```bash
# Create task directory
mkdir -p "tasks/${CLAUDE_SESSION_ID}"

# Initialize artifact.json
cat > "tasks/${CLAUDE_SESSION_ID}/artifact.json" << 'EOF'
{
  "artifacts": []
}
EOF
```

## Add Artifact Entry

When you create a file that should be tracked, update `artifact.json`:

```json
{
  "artifacts": [
    {
      "id": "unique-id",
      "path": "tasks/${CLAUDE_SESSION_ID}/reports/report.md",
      "mimeType": "text/markdown",
      "description": "Description of the file"
    }
  ]
}
```

## Important Notes

- Always use `${CLAUDE_SESSION_ID}` for the task directory
- File paths in `artifact.json` should be relative to the working directory (`/sandagent`)
- Update `artifact.json` whenever you create a new output file
```

### 关键要点

1. **使用 `${CLAUDE_SESSION_ID}` 内置变量**：
   - `${CLAUDE_SESSION_ID}` 是 Claude Code 加载 skill 时自动提供的内置变量
   - **无需任何代码处理**，只需在 skill 文件中使用 `${CLAUDE_SESSION_ID}` 即可
   - **只有 `artifact.json` 必须放在 `tasks/${CLAUDE_SESSION_ID}/artifact.json`**
   - Artifact 文件本身可以放在任何位置，只要在 `artifact.json` 中正确引用路径即可

2. **创建流程**：
   ```bash
   # 1. 创建任务目录
   mkdir -p "tasks/${CLAUDE_SESSION_ID}"
   
   # 2. 初始化 artifact.json（如果不存在）
   # 3. 创建 artifact 文件
   # 4. 更新 artifact.json，添加新文件的条目
   ```

3. **路径规范**：
   - 在 `artifact.json` 中的 `path` 字段可以使用相对路径（相对于工作目录）或绝对路径
   - Artifact 文件可以放在任何位置，不需要包含 `${CLAUDE_SESSION_ID}`
   - 推荐将 artifact 文件放在 `tasks/${CLAUDE_SESSION_ID}/` 目录下以便管理，但这不是必须的

4. **更新时机**：
   - 每次创建新的 artifact 文件后，立即更新 `artifact.json`
   - 使用 Write tool 写入 `artifact.json` 时，processor 会自动检测并处理

### 完整示例

假设 `CLAUDE_SESSION_ID=abc123`，Agent 需要创建研究报告：

```bash
# 1. 创建目录结构
mkdir -p "tasks/abc123/reports"

# 2. 创建报告文件
cat > "tasks/abc123/reports/marathon-research.md" << 'EOF'
# 2025年深圳马拉松研究报告
...
EOF

# 3. 创建或更新 artifact.json
cat > "tasks/abc123/artifact.json" << 'EOF'
{
  "artifacts": [
    {
      "id": "marathon-research-report",
      "path": "tasks/abc123/reports/marathon-research.md",
      "mimeType": "text/markdown",
      "description": "2025年深圳马拉松运动会研究报告"
    }
  ]
}
EOF
```

### 在 Template 中引用

确保在 template 的 `CLAUDE.md` 中引用 artifact skill：

```markdown
# Researcher Agent

You are a research assistant. When creating research outputs, use the `artifact` skill to properly track your files.

## Skills

- `artifact` - For managing artifact.json and tracking output files
```

## 前端实现

### 接收 data-artifact

前端通过 AI SDK 的 `useChat` hook 接收消息，`data-artifact` 类型的 part 会自动包含在 `message.parts` 中：

```typescript
import { useChat } from "@ai-sdk/react";

const { messages } = useChat({
  transport: new DefaultChatTransport({
    api: "/api/ai",
  }),
});

// messages 中的每个 message 包含 parts 数组
// parts 中可能包含 type === "data-artifact" 的 part
```

### 提取 Artifacts

使用 `useMemo` 从 messages 中提取所有 artifacts，并稳定引用避免无限循环：

```typescript
const prevArtifactsRef = useRef<ArtifactData[]>([]);
const extractedArtifacts = useMemo(() => {
  const results: ArtifactData[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "data-artifact") {
        const data = part.data as ArtifactData;
        // 去重：同一个 artifactId 只保留一个
        if (!results.some((a) => a.artifactId === data.artifactId)) {
          results.push(data);
        }
      }
    }
  }

  // 稳定引用：如果内容相同，返回之前的引用
  const prev = prevArtifactsRef.current;
  if (
    prev.length === results.length &&
    prev.every((prevArt, idx) => {
      const currArt = results[idx];
      return (
        prevArt.artifactId === currArt.artifactId &&
        prevArt.content === currArt.content &&
        prevArt.mimeType === currArt.mimeType
      );
    })
  ) {
    return prev; // 返回旧引用，避免触发 useEffect
  }

  prevArtifactsRef.current = results;
  return results;
}, [messages]);
```

### 显示 Artifacts

#### 单个 Artifact

如果只有一个 artifact，直接显示：

```typescript
{artifacts.length === 1 && (
  <ArtifactItem
    artifact={artifacts[0]}
    isExpanded={isExpanded}
    onToggleExpand={() => toggleExpand(artifacts[0].artifactId)}
  />
)}
```

#### 多个 Artifacts（Tab 视图）

如果有多个 artifacts，使用 Tab 切换：

```typescript
function ArtifactsTabsView({ artifacts }: { artifacts: ArtifactData[] }) {
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [expandedArtifactIds, setExpandedArtifactIds] = useState<Set<string>>(new Set());

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {artifacts.map((artifact) => (
          <button
            key={artifact.artifactId}
            onClick={() => setSelectedArtifactId(artifact.artifactId)}
            className={selectedArtifactId === artifact.artifactId ? "active" : ""}
          >
            {artifact.artifactId.split("/").pop()}
          </button>
        ))}
      </div>

      {/* Selected artifact content */}
      {selectedArtifactId && (
        <ArtifactItem
          artifact={artifacts.find(a => a.artifactId === selectedArtifactId)!}
          isExpanded={expandedArtifactIds.has(selectedArtifactId)}
          onToggleExpand={() => toggleExpand(selectedArtifactId)}
        />
      )}
    </div>
  );
}
```

### ArtifactItem 组件

`ArtifactItem` 组件负责显示单个 artifact 的内容：

```typescript
function ArtifactItem({
  artifact,
  isExpanded,
  onToggleExpand,
}: {
  artifact: ArtifactData;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const isMarkdown = artifact.mimeType.includes("markdown");

  return (
    <div>
      {/* Header with expand/collapse */}
      <div onClick={onToggleExpand}>
        <FileCode />
        <span>{artifact.artifactId.split("/").pop()}</span>
        <ChevronRight className={isExpanded ? "rotate-90" : ""} />
      </div>

      {/* Expandable content */}
      {isExpanded && (
        <div>
          {isMarkdown ? (
            <div className="prose">
              <pre>{artifact.content}</pre>
            </div>
          ) : (
            <div className="bg-[#0d0d0d] overflow-auto" style={{ height: "400px" }}>
              <pre className="text-[#e6e6e6] font-mono text-xs">
                {artifact.content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### 在 ChatMessage 中使用

在 `ChatMessage` 组件中，收集所有 `data-artifact` parts 并传递给 `ArtifactsTabsView`：

```typescript
function ChatMessage({ message }: { message: UIMessage }) {
  // 收集 artifacts
  const artifacts: ArtifactData[] = [];
  const otherParts = [];

  message.parts.forEach((part) => {
    if (part.type === "data-artifact") {
      artifacts.push(part.data as ArtifactData);
    } else {
      otherParts.push(part);
    }
  });

  return (
    <Message>
      {/* 显示其他 parts（文本、工具等） */}
      {otherParts.map((part, i) => (
        <div key={i}>
          {part.type === "text" && <MessageResponse>{part.text}</MessageResponse>}
          {part.type === "dynamic-tool" && <DynamicToolUI part={part} />}
        </div>
      ))}

      {/* 显示 artifacts */}
      {artifacts.length > 0 && <ArtifactsTabsView artifacts={artifacts} />}
    </Message>
  );
}
```

## 性能优化

### 后端优化

1. **Manifest 缓存**：只在内容变化时重新解析
2. **内容去重**：使用 `Map` 缓存已发送内容
3. **队列机制**：Promise 链确保顺序执行
4. **智能触发**：只在 Write tool 写入 artifact.json 时读取

### 前端优化

1. **引用稳定**：使用 `useMemo` 和 `useRef` 稳定 `extractedArtifacts` 引用
2. **深度比较**：比较内容而非引用，避免不必要的更新
3. **组件记忆化**：使用 `React.memo` 包装 `WriteToolCard` 等组件
4. **按需渲染**：使用展开/收起控制内容显示

## 使用示例

### Agent 端（使用 Artifact Skill）

**推荐方式**：使用 artifact skill 来管理 artifact 文件。

Agent 应该首先查看 artifact skill 的文档，然后按照标准流程操作。

> **注意**：`${CLAUDE_SESSION_ID}` 是 Claude Code 加载 skill 时自动提供的内置变量，会被自动替换为当前会话 ID，无需任何代码处理。

```bash
# 1. 创建任务目录（${CLAUDE_SESSION_ID} 会被 Claude Code 自动替换）
mkdir -p "tasks/${CLAUDE_SESSION_ID}/reports"

# 2. 创建 artifact 文件
cat > "tasks/${CLAUDE_SESSION_ID}/reports/marathon-research.md" << 'EOF'
# 2025年深圳马拉松研究报告
...
EOF

# 3. 创建或更新 artifact.json（使用 Write tool）
cat > "tasks/${CLAUDE_SESSION_ID}/artifact.json" << 'EOF'
{
  "artifacts": [
    {
      "id": "marathon-research-report",
      "path": "tasks/${CLAUDE_SESSION_ID}/reports/marathon-research.md",
      "mimeType": "text/markdown",
      "description": "2025年深圳马拉松运动会研究报告"
    }
  ]
}
EOF
```

**关键点**：
- `${CLAUDE_SESSION_ID}` 是 Claude Code 的内置变量，会在 skill 加载时自动替换，无需代码处理
- `artifact.json` 的路径必须是 `tasks/${CLAUDE_SESSION_ID}/artifact.json`
- 每次创建新文件后，立即更新 `artifact.json`

### Agent 端（Python 脚本 - 作为 Tool 执行时）

如果 Agent 通过执行 Python 脚本来创建 artifact，可以从环境变量获取 session ID：

> **注意**：当 Claude Code 执行 Tool（如 Bash、Python 脚本）时，会自动将 `CLAUDE_SESSION_ID` 设置为环境变量。

```python
import os
import json

# 从环境变量获取会话 ID（Claude Code 执行 Tool 时会自动设置）
session_id = os.environ.get("CLAUDE_SESSION_ID", "default")

# 创建 artifact 文件
os.makedirs(f"tasks/{session_id}/reports", exist_ok=True)
with open(f"tasks/{session_id}/reports/report.md", "w") as f:
    f.write("# Research Report\n\n...")

# 创建 manifest 文件
manifest = {
    "artifacts": [
        {
            "id": "report",
            "path": f"tasks/{session_id}/reports/report.md",
            "mimeType": "text/markdown",
            "description": "Main research report"
        }
    ]
}

with open(f"tasks/{session_id}/artifact.json", "w") as f:
    json.dump(manifest, f, indent=2)
```

### 前端端（React）

前端会自动接收并显示 artifacts：

```typescript
// 无需额外配置，useChat 会自动处理 data-artifact parts
const { messages } = useChat({
  transport: new DefaultChatTransport({
    api: "/api/ai",
  }),
});

// 在组件中提取并显示
const artifacts = useMemo(() => {
  const results = [];
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "data-artifact") {
        results.push(part.data);
      }
    }
  }
  return results;
}, [messages]);

return (
  <div>
    {artifacts.map(artifact => (
      <ArtifactView key={artifact.artifactId} artifact={artifact} />
    ))}
  </div>
);
```

## 故障排查

### 问题：Artifact 没有显示

1. **检查 manifest 文件**：确认 `tasks/{sessionId}/artifact.json` 存在且格式正确
2. **检查文件路径**：确认 artifact 文件路径正确且文件存在
3. **检查 Write tool**：确认 Write tool 成功写入 artifact.json
4. **检查控制台**：查看后端日志，确认 processor 是否被触发

### 问题：无限循环（Maximum update depth exceeded）

1. **检查引用稳定性**：确保 `extractedArtifacts` 使用 `useMemo` 和深度比较
2. **检查 useEffect 依赖**：确保依赖项稳定，避免循环更新
3. **使用 React.memo**：包装可能频繁更新的组件

### 问题：Artifact 内容重复发送

1. **检查去重逻辑**：确认 `sentArtifacts` Map 正常工作
2. **检查内容比较**：确认内容比较逻辑正确

## 最佳实践

### Agent 端

1. **使用 Artifact Skill**：
   - 在 template 中添加 `artifact` skill（参考 `templates/researcher/.claude/skills/artifact/SKILL.md`）
   - 只需将 skill 文件放在 `.claude/skills/` 目录下，遵循 Claude 的 skill 规范即可
   - `${CLAUDE_SESSION_ID}` 会在 skill 加载时被 Claude Code 自动替换，无需任何代码处理

2. **Session ID 使用**：
   - `${CLAUDE_SESSION_ID}` 是 Claude Code 的内置变量，在 skill 文件中直接使用即可
   - **只有 `artifact.json` 路径必须是 `tasks/${CLAUDE_SESSION_ID}/artifact.json`**
   - Artifact 文件本身可以放在任何位置，只要在 `artifact.json` 中正确引用路径即可

3. **Manifest 更新**：
   - 每次创建新的 artifact 文件后，立即更新 `artifact.json`
   - 只在 artifact 文件变化时更新 manifest，避免不必要的文件 I/O

4. **文件路径**：
   - 使用相对路径（相对于工作目录）或一致的绝对路径格式
   - Artifact 文件路径不需要包含 `${CLAUDE_SESSION_ID}`，可以放在任何位置
   - 推荐将 artifact 文件放在 `tasks/${CLAUDE_SESSION_ID}/` 目录下以便管理

5. **MIME 类型**：
   - 正确设置 mimeType，便于前端渲染
   - 常用类型：`text/markdown`, `application/json`, `text/plain`, `text/html`

6. **ID 唯一性**：
   - 确保 artifact id 唯一，避免前端去重问题
   - 推荐使用有意义的 ID，如 `marathon-research-report` 而不是 `report-1`

### 后端端

1. **错误处理**：在 processor 中处理文件读取错误，避免影响主流程
2. **性能优化**：使用缓存和队列机制，避免重复读取和并发问题

## 未来扩展

- [ ] 支持流式更新 artifact 内容（打字机效果）
- [ ] 支持文件系统监听，自动检测 artifact 文件变化
- [ ] 支持批量处理多个 parts
- [ ] 添加生命周期钩子（onStart、onFinish）
- [ ] 支持 artifact 版本管理

## 相关文档

- [架构设计文档](../docs/ARCHITECTURE_REFACTORING.md) - 了解 SandAgent 整体架构
- [API 参考](../spec/API_REFERENCE.md) - API 接口文档
- [SDK 快速开始](../docs/SDK_QUICK_START.md) - 快速上手指南
- [SDK 开发指南](../docs/SDK_DEVELOPMENT_GUIDE.md) - 详细开发指南
- [Write Tool UI](../docs/WRITE_TOOL_UI.md) - Write Tool 前端 UI 实现

## 代码位置

- **后端 Processor**: `apps/sandagent-example/lib/artifact-processor.ts`
- **前端组件**: `apps/sandagent-example/app/page.tsx` (ArtifactsTabsView, ArtifactItem)
- **API Route**: `apps/sandagent-example/app/api/ai/route.ts`
- **类型定义**: `packages/ai-provider/src/types.ts`

## 技术细节

### StreamWriter 接口

`StreamWriter` 是 AI SDK 提供的接口，用于写入自定义的 stream parts：

```typescript
interface StreamWriter {
  write(part: UIMessageChunk): void;
  merge(stream: ReadableStream<UIMessageChunk>): void;
}
```

### data-artifact Part 结构

```typescript
{
  type: "data-artifact",
  id: string,  // 唯一标识符
  data: {
    artifactId: string,
    content: string,
    mimeType: string,
  }
}
```

### ArtifactData 类型

```typescript
interface ArtifactData {
  artifactId: string;
  content: string;
  mimeType: string;
}
```

## 总结

Artifact 功能提供了一个完整的机制，让 Agent 可以生成文件并通过流式传输实时显示在前端。核心设计包括：

1. **事件驱动**：基于 stream parts 触发处理
2. **性能优化**：缓存、去重、队列机制
3. **前端集成**：无缝集成到 AI SDK 的消息流中
4. **易于使用**：Agent 只需创建 manifest 文件即可

通过这个功能，用户可以实时查看 Agent 生成的研究报告、数据分析结果等文件，大大提升了交互体验。
