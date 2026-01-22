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

### Agent 端（Python/Shell）

Agent 需要创建 manifest 文件和 artifact 文件：

```python
# 1. 创建 artifact 文件
with open("tasks/{session_id}/reports/report.md", "w") as f:
    f.write("# Research Report\n\n...")

# 2. 创建 manifest 文件
manifest = {
    "artifacts": [
        {
            "id": "report",
            "path": "tasks/{session_id}/reports/report.md",
            "mimeType": "text/markdown",
            "description": "Main research report"
        }
    ]
}

with open("tasks/{session_id}/artifact.json", "w") as f:
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

1. **Manifest 更新**：只在 artifact 文件变化时更新 manifest
2. **文件路径**：使用相对路径或一致的绝对路径格式
3. **MIME 类型**：正确设置 mimeType，便于前端渲染
4. **ID 唯一性**：确保 artifact id 唯一，避免前端去重问题
5. **错误处理**：在 processor 中处理文件读取错误，避免影响主流程

## 未来扩展

- [ ] 支持流式更新 artifact 内容（打字机效果）
- [ ] 支持文件系统监听，自动检测 artifact 文件变化
- [ ] 支持批量处理多个 parts
- [ ] 添加生命周期钩子（onStart、onFinish）
- [ ] 支持 artifact 版本管理

## 相关文档

- [架构设计文档](../docs/ARCHITECTURE_REFACTORING.md) - 了解 SandAgent 整体架构
- [API 参考](../spec/API_REFERENCE.md) - API 接口文档
- [快速开始](../spec/QUICK_START.md) - 快速上手指南
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
