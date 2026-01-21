# Artifact 功能设计方案

## 1. 概述

Artifact 是 Chat 结束后从 Sandbox 中提取的产物文件。用户需要自己定义哪些文件是 artifact，系统负责从 sandbox 中获取并展示到 UI。

## 2. 核心问题

```
Chat 结束
    │
    ▼
Sandbox 中有很多文件
    │
    ▼
❓ 哪些是用户想要的产物？
❓ 如何从 sandbox 中获取？
❓ 如何传递给 UI 展示？
```

## 3. 用户定义入口

### 3.1 方案 A：API 参数定义

用户在调用 `SandAgent.stream()` 时定义 artifact 规则：

```typescript
const result = await agent.stream({
  messages,
  // 用户自定义 artifact 规则
  artifacts: {
    // 方式1：指定目录
    paths: ["/workspace/output/*", "/workspace/reports/*.md"],
    
    // 方式2：指定文件类型
    extensions: [".md", ".csv", ".png", ".html"],
    
    // 方式3：指定具体文件
    files: ["/workspace/output/report.md"],
  },
});
```

### 3.2 方案 B：Sandbox 约定目录

约定一个固定目录作为 artifact 输出目录：

```
/sandagent/artifacts/    # 约定目录
├── report.md
├── data.csv
└── chart.png
```

Agent 把产物写入这个目录，Chat 结束后自动收集。

### 3.3 方案 C：artifact.json 清单文件

Agent 运行结束时生成 `artifact.json` 清单：

```json
// /sandagent/artifact.json
{
  "artifacts": [
    {
      "path": "/workspace/output/report.md",
      "type": "markdown",
      "title": "分析报告"
    },
    {
      "path": "/workspace/output/data.csv",
      "type": "csv",
      "title": "数据表格"
    }
  ]
}
```

系统读取清单，按清单获取文件。

## 4. 从 Sandbox 获取 Artifact

### 4.1 现有 SandboxHandle 接口

```typescript
interface SandboxHandle {
  exec(command: string[], opts?: ExecOptions): AsyncIterable<Uint8Array>;
  upload(files: Array<{ path: string; content: Uint8Array | string }>, targetDir: string): Promise<void>;
  destroy(): Promise<void>;
}
```

**缺失**：没有 `download` 方法从 sandbox 中获取文件。

### 4.2 需要新增的接口

```typescript
interface SandboxHandle {
  // ... 现有方法
  
  /**
   * 从 sandbox 下载文件
   */
  download(path: string): Promise<Uint8Array>;
  
  /**
   * 列出目录内容
   */
  listDir(path: string): Promise<FileInfo[]>;
  
  /**
   * 读取文件内容（文本）
   */
  readFile(path: string): Promise<string>;
}

interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
}
```

### 4.3 获取 Artifact 流程

```
1. Chat 结束
       │
       ▼
2. 根据用户定义的规则，确定要获取哪些文件
       │
       ├─ 方案A: 使用 artifacts.paths 匹配
       ├─ 方案B: 列出 /sandagent/artifacts/ 目录
       └─ 方案C: 读取 /sandagent/artifact.json
       │
       ▼
3. 调用 handle.download() 或 handle.readFile() 获取文件内容
       │
       ▼
4. 返回 artifact 列表给前端
```

## 5. 传递给 UI

### 5.1 方案 A：流式输出 artifact 事件

在 AI SDK 流结束后，追加 artifact 数据：

```typescript
// 流式输出格式 (AI SDK Data Stream Protocol)
// ... 正常的 text/tool 消息 ...

// 流结束前输出 artifact
d:{"type":"artifact","data":{"id":"art-1","path":"/output/report.md","content":"# Report..."}}
d:{"type":"artifact","data":{"id":"art-2","path":"/output/data.csv","content":"a,b,c\n1,2,3"}}
```

前端通过 `onFinish` 或自定义事件处理 artifact。

### 5.2 方案 B：独立 API 获取

Chat 结束后，前端调用独立 API 获取 artifact：

```typescript
// 前端
const artifacts = await fetch(`/api/artifacts?sessionId=${sessionId}`).then(r => r.json());

// 后端 API
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  
  // 1. attach 到 sandbox
  const handle = await sandbox.attach(sessionId);
  
  // 2. 获取 artifact 清单
  const manifest = await handle.readFile("/sandagent/artifact.json");
  const { artifacts } = JSON.parse(manifest);
  
  // 3. 获取每个 artifact 的内容
  const result = await Promise.all(
    artifacts.map(async (art) => ({
      ...art,
      content: await handle.readFile(art.path),
    }))
  );
  
  return Response.json({ artifacts: result });
}
```

### 5.3 方案 C：通过 metadata 返回

在 assistant 消息的 metadata 中包含 artifact 信息：

```typescript
// AI SDK 消息格式
{
  role: "assistant",
  content: "分析完成，请查看报告。",
  metadata: {
    sessionId: "xxx",
    artifacts: [
      { id: "art-1", path: "/output/report.md", type: "markdown", title: "分析报告" }
    ]
  }
}
```

前端根据 metadata 中的 artifact 信息，按需获取内容。

## 6. UI 展示

### 6.1 Artifact 列表

```
┌──────────────────────────────────────────────────────┐
│  📎 产物 (3)                                          │
├──────────────────────────────────────────────────────┤
│  📄 分析报告                        [预览] [下载]     │
│     /output/report.md · 5.2 KB                       │
├──────────────────────────────────────────────────────┤
│  📊 数据表格                        [预览] [下载]     │
│     /output/data.csv · 1.2 KB                        │
├──────────────────────────────────────────────────────┤
│  📈 趋势图表                        [预览] [下载]     │
│     /output/chart.png · 45 KB                        │
└──────────────────────────────────────────────────────┘
```

### 6.2 现有组件

`packages/kui/src/components/ai-elements/artifact.tsx` 已有基础组件：

- `Artifact` - 容器
- `ArtifactHeader` - 头部
- `ArtifactTitle` - 标题
- `ArtifactContent` - 内容区
- `ArtifactActions` - 操作按钮
- `ArtifactAction` - 单个操作（下载、复制等）
- `ArtifactClose` - 关闭按钮

## 7. 推荐方案

### 用户定义：方案 C（artifact.json 清单）

**理由**：
- 灵活：Agent 可以动态决定产出什么
- 明确：有清晰的清单，不需要模式匹配
- 可扩展：清单中可以包含 title、type 等元数据

### 获取方式：新增 SandboxHandle.readFile()

**理由**：
- 简单直接
- 与现有接口风格一致

### UI 传递：方案 B（独立 API）

**理由**：
- 解耦：不影响现有流式输出
- 按需：用户点击时才加载内容
- 大文件友好：可以分别获取

## 8. 实现步骤

### Step 1: 扩展 SandboxHandle 接口

```typescript
// packages/core/src/types.ts
interface SandboxHandle {
  // 新增
  readFile(path: string): Promise<string>;
  listDir(path: string): Promise<FileInfo[]>;
}
```

### Step 2: 实现 E2B/Sandock 适配器

```typescript
// packages/sandbox-e2b/src/e2b-sandbox.ts
class E2BSandboxHandle implements SandboxHandle {
  async readFile(path: string): Promise<string> {
    return await this.sandbox.files.read(path);
  }
  
  async listDir(path: string): Promise<FileInfo[]> {
    const files = await this.sandbox.files.list(path);
    return files.map(f => ({
      name: f.name,
      path: `${path}/${f.name}`,
      isDirectory: f.isDir,
      size: f.size,
      modifiedAt: f.modifiedAt,
    }));
  }
}
```

### Step 3: 添加 artifact API

```typescript
// apps/sandagent-example/app/api/artifacts/route.ts
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  
  const handle = await sandbox.attach(sessionId);
  
  // 读取清单
  const manifest = await handle.readFile("/sandagent/artifact.json");
  const { artifacts } = JSON.parse(manifest);
  
  return Response.json({ artifacts });
}

// 获取单个 artifact 内容
export async function POST(request: Request) {
  const { sessionId, path } = await request.json();
  
  const handle = await sandbox.attach(sessionId);
  const content = await handle.readFile(path);
  
  return Response.json({ content });
}
```

### Step 4: 前端集成

```typescript
// 在 Chat 组件中
function ArtifactPanel({ sessionId, artifacts }) {
  const [selectedArtifact, setSelectedArtifact] = useState(null);
  const [content, setContent] = useState(null);
  
  const loadContent = async (artifact) => {
    const res = await fetch("/api/artifacts", {
      method: "POST",
      body: JSON.stringify({ sessionId, path: artifact.path }),
    });
    const { content } = await res.json();
    setContent(content);
  };
  
  return (
    <Artifact>
      <ArtifactHeader>
        <ArtifactTitle>{selectedArtifact?.title}</ArtifactTitle>
        <ArtifactActions>
          <ArtifactAction icon={Download} onClick={handleDownload} />
          <ArtifactAction icon={Copy} onClick={handleCopy} />
        </ArtifactActions>
      </ArtifactHeader>
      <ArtifactContent>
        <ArtifactRenderer type={selectedArtifact?.type} content={content} />
      </ArtifactContent>
    </Artifact>
  );
}
```

## 9. artifact.json 格式

```json
{
  "version": "1.0",
  "generatedAt": "2025-01-21T10:00:00Z",
  "artifacts": [
    {
      "id": "art-001",
      "path": "/workspace/output/report.md",
      "type": "markdown",
      "title": "SEO 分析报告",
      "description": "完整的网站 SEO 审计报告",
      "size": 5242,
      "createdAt": "2025-01-21T09:55:00Z"
    },
    {
      "id": "art-002", 
      "path": "/workspace/output/keywords.csv",
      "type": "csv",
      "title": "关键词列表",
      "size": 1024
    }
  ]
}
```

## 10. 开放问题

1. **谁来生成 artifact.json？**
   - 选项 A：Agent 在任务结束时主动生成
   - 选项 B：用户在 CLAUDE.md 中指导 Agent 生成
   - 选项 C：提供一个专门的工具让 Agent 调用

2. **大文件如何处理？**
   - 图片、PDF 等二进制文件需要 base64 或直接下载链接

3. **artifact 何时过期？**
   - sandbox 销毁后 artifact 也会丢失
   - 是否需要持久化存储？

## 11. 总结

```
┌─────────────────────────────────────────────────────────────┐
│  用户定义（Agent 生成 artifact.json）                        │
│                                                             │
│  {                                                          │
│    "artifacts": [                                           │
│      { "path": "/output/report.md", "title": "报告" }       │
│    ]                                                        │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Sandbox（存储实际文件）                                     │
│                                                             │
│  /sandagent/artifact.json    ← 清单                         │
│  /workspace/output/report.md ← 实际文件                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  API（从 sandbox 获取）                                      │
│                                                             │
│  GET /api/artifacts?sessionId=xxx                           │
│  → 返回 artifact 清单                                       │
│                                                             │
│  POST /api/artifacts { sessionId, path }                    │
│  → 返回文件内容                                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  UI（展示 artifact）                                         │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 📎 产物                                                 │ │
│  │ ├─ 📄 SEO 分析报告          [预览] [下载]              │ │
│  │ └─ 📊 关键词列表            [预览] [下载]              │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```
