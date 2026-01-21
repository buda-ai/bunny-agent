# Artifact 功能设计文档

## 概述

Artifact 功能允许用户通过 **Artifact Processor** 来处理和获取 Agent 运行过程中产生的数据。Processor 会接收到 AI SDK 的 stream parts，可以基于这些 parts 来提取、处理和返回 artifact 数据。

## 核心概念

### Artifact Processor

`ArtifactProcessor` 是一个简单的接口，只需要实现一个 `onChange` 方法：

```typescript
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";

export interface ArtifactProcessor {
  /**
   * 当收到 stream part 时触发
   * @param part - AI SDK 的 stream part（text-delta, tool-result, finish 等）
   * @returns 如果返回 ArtifactResult，则会发送 data-artifact part
   */
  onChange(
    part: LanguageModelV3StreamPart,
  ): Promise<ArtifactResult | undefined>;
}

export interface ArtifactResult {
  artifactId: string;
  content: string;
  mimeType?: string;
}
```

### 工作原理

1. **Stream Processing**: 当 SandAgent 解析 SSE 数据时，会将每个事件转换为 `LanguageModelV3StreamPart`
2. **Processor Invocation**: 解析完成后，会遍历所有注册的 `artifactProcessors`，对每个 part 调用 `onChange(part)`
3. **Result Handling**: 如果 processor 返回 `ArtifactResult`，会自动生成 `data-artifact` part 并发送到前端

## 使用示例

### 基础示例：Task-Driven Artifact Processor

这是一个实际使用的例子，从 `tasks/{sessionId}/artifact.json` 读取 artifact 文件：

```typescript
import { createSandAgent } from "@sandagent/ai-provider";
import { E2BSandbox } from "@sandagent/sandbox-e2b";
import type { LanguageModelV3StreamPart, ArtifactProcessor, ArtifactResult } from "@sandagent/ai-provider";
import type { SandboxAdapter } from "@sandagent/core";

interface ArtifactManifest {
  artifacts: Array<{
    id?: string;
    path: string;
    mimeType?: string;
    description?: string;
  }>;
}

class TaskDrivenArtifactProcessor implements ArtifactProcessor {
  private sessionId: string;
  private sandbox: SandboxAdapter;
  private workdir: string;
  private artifactManifest: ArtifactManifest | null = null;

  constructor(options: { 
    sessionId: string; 
    sandbox: SandboxAdapter;
    workdir?: string;
  }) {
    this.sessionId = options.sessionId;
    this.sandbox = options.sandbox;
    this.workdir = options.workdir || "/workspace";
  }

  async onChange(part: LanguageModelV3StreamPart): Promise<ArtifactResult | undefined> {
    console.log("[ArtifactProcessor] onChange:", part.type);

    // 重新加载 manifest（因为可能有新的 artifact）
    this.artifactManifest = null;
    const manifest = await this.loadManifest();
    
    if (!manifest.artifacts?.length) {
      return;
    }

    const handle = await this.sandbox.attach();
    const taskDir = `${this.workdir}/tasks/${this.sessionId}`;

    // 读取并返回主要 artifact 文件
    for (const artifact of manifest.artifacts) {
      try {
        // 路径相对于 tasks/{sessionId}/ 目录
        const filePath = artifact.path.startsWith("/")
          ? artifact.path
          : `${taskDir}/${artifact.path}`;
        const content = await handle.readFile(filePath);

        // 优先返回 .md 文件
        if (artifact.path.endsWith(".md")) {
          return {
            artifactId: artifact.id || artifact.path,
            content,
            mimeType: artifact.mimeType || "text/markdown",
          };
        }
      } catch (e) {
        console.log(`[ArtifactProcessor] Failed to read ${artifact.path}:`, e);
      }
    }

    // 如果没有 md 文件，返回第一个
    const firstArtifact = manifest.artifacts[0];
    try {
      const filePath = firstArtifact.path.startsWith("/")
        ? firstArtifact.path
        : `${taskDir}/${firstArtifact.path}`;
      const content = await handle.readFile(filePath);
      return {
        artifactId: firstArtifact.id || firstArtifact.path,
        content,
        mimeType: firstArtifact.mimeType || this.getMimeType(firstArtifact.path),
      };
    } catch (e) {
      console.log(`[ArtifactProcessor] Failed to read ${firstArtifact.path}:`, e);
    }
  }

  private async loadManifest(): Promise<ArtifactManifest> {
    if (this.artifactManifest) {
      return this.artifactManifest;
    }

    try {
      const manifestPath = `${this.workdir}/tasks/${this.sessionId}/artifact.json`;
      const handle = await this.sandbox.attach();
      const content = await handle.readFile(manifestPath);
      this.artifactManifest = JSON.parse(content) as ArtifactManifest;
      return this.artifactManifest;
    } catch (e) {
      console.log(
        `[ArtifactProcessor] No manifest found at tasks/${this.sessionId}/artifact.json`
      );
      return { artifacts: [] };
    }
  }

  private getMimeType(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      md: "text/markdown",
      json: "application/json",
      txt: "text/plain",
      html: "text/html",
      csv: "text/csv",
      pdf: "application/pdf",
    };
    return mimeTypes[ext || ""] || "application/octet-stream";
  }
}

// 使用
const sandbox = new E2BSandbox({ apiKey: process.env.E2B_API_KEY! });

const artifactProcessor = new TaskDrivenArtifactProcessor({
  sessionId: "session-123",
  sandbox,
  workdir: "/workspace",
});

const sandagent = createSandAgent({
  sandbox,
  artifactProcessors: [artifactProcessor],
});

// 使用 AI SDK
import { streamText } from "ai";

const result = streamText({
  model: sandagent("sonnet"),
  prompt: "Generate a report",
});
```

### 文件结构

`TaskDrivenArtifactProcessor` 期望的文件结构：

```
/workspace/
  tasks/
    {sessionId}/
      artifact.json          # 清单文件
      report.md               # artifact 文件
      data.json               # artifact 文件
      summary.md              # artifact 文件
```

`artifact.json` 格式：

```json
{
  "artifacts": [
    {
      "id": "report",
      "path": "report.md",
      "mimeType": "text/markdown",
      "description": "Main research report"
    },
    {
      "id": "data",
      "path": "data.json",
      "mimeType": "application/json",
      "description": "Research data"
    }
  ]
}
```

### 示例：基于 Tool Result 的 Processor

```typescript
class ToolResultProcessor implements ArtifactProcessor {
  async onChange(part: LanguageModelV3StreamPart): Promise<ArtifactResult | undefined> {
    // 只处理 tool-result
    if (part.type !== "tool-result") {
      return;
    }

    // 检查是否是特定的 tool
    if (part.toolName === "web_search") {
      const searchResults = part.result as { results: Array<{ title: string; url: string }> };
      
      // 提取并格式化结果
      const content = searchResults.results
        .map(r => `- [${r.title}](${r.url})`)
        .join("\n");

      return {
        artifactId: `search-${part.toolCallId}`,
        content,
        mimeType: "text/markdown",
      };
    }
  }
}
```

### 示例：基于 Text Delta 的 Processor

```typescript
class TextCollectorProcessor implements ArtifactProcessor {
  private textBuffer: Map<string, string> = new Map();

  async onChange(part: LanguageModelV3StreamPart): Promise<ArtifactResult | undefined> {
    // 收集 text-delta
    if (part.type === "text-delta") {
      const existing = this.textBuffer.get(part.id) || "";
      this.textBuffer.set(part.id, existing + part.delta);
      return; // 不立即返回，继续收集
    }

    // 当 text-end 时返回完整内容
    if (part.type === "text-end") {
      const content = this.textBuffer.get(part.id) || "";
      this.textBuffer.delete(part.id);
      
      return {
        artifactId: `text-${part.id}`,
        content,
        mimeType: "text/plain",
      };
    }
  }
}
```

## Stream Part 类型

Processor 会接收到所有类型的 `LanguageModelV3StreamPart`：

- `text-start` - 文本开始
- `text-delta` - 文本增量
- `text-end` - 文本结束
- `tool-call` - 工具调用
- `tool-result` - 工具结果
- `finish` - 完成
- `error` - 错误
- `response-metadata` - 响应元数据

Processor 可以根据需要选择处理哪些类型的 parts。`TaskDrivenArtifactProcessor` 会处理所有 parts，每次都会检查 `tasks/{sessionId}/artifact.json` 是否存在并读取最新的 artifact 文件。

## 实现细节

### 在 SandAgentLanguageModel 中的处理

```typescript
private async parseSSEData(
  data: string,
): Promise<LanguageModelV3StreamPart[]> {
  const parts: LanguageModelV3StreamPart[] = [];
  const parsed = JSON.parse(data) as Record<string, unknown>;

  // 解析各种事件类型为 stream parts
  switch (parsed.type) {
    case "text-delta":
      parts.push({ type: "text-delta", id: parsed.id, delta: parsed.delta });
      break;
    case "tool-result":
      parts.push({ type: "tool-result", toolCallId: parsed.toolCallId, ... });
      break;
    // ... 其他类型
  }

  // 调用所有 artifact processors
  if (this.options.artifactProcessors?.length) {
    for (const processor of this.options.artifactProcessors) {
      for (const part of parts) {
        const artifactResult = await processor.onChange(part);
        if (artifactResult) {
          // 添加 data-artifact part 到 stream
          parts.push({
            type: "data-artifact",
            data: {
              artifactId: artifactResult.artifactId,
              content: artifactResult.content,
              mimeType: artifactResult.mimeType ?? "text/plain",
            },
          } as unknown as LanguageModelV3StreamPart);
        }
      }
    }
  }

  return parts;
}
```

### 配置方式

```typescript
const sandagent = createSandAgent({
  sandbox: new E2BSandbox({ apiKey: "..." }),
  artifactProcessors: [
    new TaskDrivenArtifactProcessor({ 
      sessionId: "session-123",
      sandbox,
      workdir: "/workspace",
    }),
    new ToolResultProcessor(),
    // ... 可以注册多个 processors
  ],
});
```

## 最佳实践

1. **选择性处理**: 在 `onChange` 中检查 part 类型，只处理相关的 parts（可选）
2. **异步操作**: Processor 可以执行异步操作（如读取文件、调用 API）
3. **错误处理**: 在 processor 内部处理错误，避免影响主流程
4. **状态管理**: 如果需要跨 part 收集数据，可以在 processor 内部维护状态
5. **Manifest 缓存**: `TaskDrivenArtifactProcessor` 会在每次 `onChange` 时重新加载 manifest，确保获取最新的 artifact 文件

## 前端显示 Artifact Data

当 processor 返回 `ArtifactResult` 时，会自动生成 `data-artifact` part 并发送到前端。

### 在前端接收和显示

```typescript
// 在 message.parts 中检查 data-artifact part
{message.parts.map((part, i) => {
  if (part.type === "data-artifact") {
    const data = part.data as {
      artifactId: string;
      content: string;
      mimeType: string;
    };
    return (
      <ArtifactView
        key={i}
        artifactId={data.artifactId}
        content={data.content}
        mimeType={data.mimeType}
      />
    );
  }
  // ... 其他 part 类型
})}
```

### ArtifactView 组件示例

```typescript
function ArtifactView({
  artifactId,
  content,
  mimeType,
}: {
  artifactId: string;
  content: string;
  mimeType: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${artifactId}.${mimeType.includes("markdown") ? "md" : "txt"}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const isMarkdown = mimeType.includes("markdown");
  const previewLength = 500;
  const needsTruncation = content.length > previewLength;

  return (
    <div className="artifact-container">
      <div className="artifact-header">
        <div>
          <span>{artifactId}</span>
          <span>({mimeType})</span>
        </div>
        <div>
          <button onClick={handleCopy}>
            {copied ? "Copied!" : "Copy"}
          </button>
          <button onClick={handleDownload}>Download</button>
          {needsTruncation && (
            <button onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? "Show Less" : "Show More"}
            </button>
          )}
        </div>
      </div>
      <div className="artifact-content">
        {isMarkdown ? (
          <MarkdownRenderer content={content} />
        ) : (
          <pre>{isExpanded || !needsTruncation ? content : `${content.slice(0, previewLength)}...`}</pre>
        )}
      </div>
    </div>
  );
}
```

### 功能特性

- **自动显示**: 当 processor 返回结果时，自动在消息流中显示
- **内容预览**: 支持 Markdown 渲染和代码高亮
- **下载/复制**: 提供下载和复制功能
- **类型识别**: 根据 mimeType 自动选择合适的显示方式
- **长内容处理**: 支持展开/收起长内容

## TaskDrivenArtifactProcessor 工作流程

1. **初始化**: 传入 `sessionId`、`sandbox` 和 `workdir`
2. **onChange 触发**: 当收到任何 stream part 时触发
3. **检查 Manifest**: 检查 `tasks/{sessionId}/artifact.json` 是否存在
4. **读取文件**: 如果存在，读取 artifact 文件列表
5. **读取内容**: 从 `tasks/{sessionId}/` 目录读取 artifact 文件内容
6. **返回结果**: 优先返回 `.md` 文件，否则返回第一个文件

## 未来扩展

- **批量处理**: 支持批量处理多个 parts
- **生命周期钩子**: 添加 `onStart`、`onFinish` 等生命周期方法
- **实时更新**: 支持流式更新 artifact 内容（打字机效果）
- **文件监听**: 支持文件系统监听，自动检测 artifact 文件变化
