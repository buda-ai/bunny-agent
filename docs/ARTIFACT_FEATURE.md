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

## 10. 关键设计决策

### 10.1 谁来生成 artifact.json？

**答案：用户在 CLAUDE.md 中指导 Agent 生成**

用户在模板的 CLAUDE.md 中添加指导：

```markdown
## 产物输出规范

任务完成后，你需要生成 `/sandagent/artifact.json` 文件，列出所有产出物：

\`\`\`json
{
  "artifacts": [
    {
      "path": "/workspace/output/report.md",
      "type": "markdown",
      "title": "分析报告",
      "description": "完整的分析报告"
    }
  ]
}
\`\`\`

支持的 type：markdown, csv, json, html, image, pdf, code, file
\`\`\`
```

### 10.2 大文件如何处理？

**答案：Stream 输出 + S3 挂载**

Sandbox 磁盘可以挂载到 S3，大文件处理方案：

```
┌─────────────────────────────────────────────────────────────┐
│  Sandbox                                                     │
│                                                             │
│  /workspace/output/  ←──── 挂载到 S3 bucket                  │
│    ├── report.md     (小文件，直接读取)                      │
│    ├── data.csv      (中等文件，stream 读取)                 │
│    └── video.mp4     (大文件，返回 S3 URL)                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  API 响应策略                                                │
│                                                             │
│  小文件 (<1MB)：直接返回 content                             │
│  中等文件 (1-10MB)：stream 输出                              │
│  大文件 (>10MB)：返回 S3 presigned URL                       │
└─────────────────────────────────────────────────────────────┘
```

#### Stream 输出实现

```typescript
// 扩展 SandboxHandle 接口
interface SandboxHandle {
  // 小文件：直接读取
  readFile(path: string): Promise<string>;
  
  // 大文件：stream 读取
  readFileStream(path: string): AsyncIterable<Uint8Array>;
  
  // 获取文件信息（包括 size）
  stat(path: string): Promise<FileStat>;
}

interface FileStat {
  size: number;
  isDirectory: boolean;
  modifiedAt: string;
}
```

#### API 实现

```typescript
// GET /api/artifacts/[artifactId]
export async function GET(request: Request, { params }) {
  const { artifactId } = params;
  const sessionId = request.headers.get("x-session-id");
  
  const handle = await sandbox.attach(sessionId);
  const manifest = JSON.parse(await handle.readFile("/sandagent/artifact.json"));
  const artifact = manifest.artifacts.find(a => a.id === artifactId);
  
  // 获取文件大小
  const stat = await handle.stat(artifact.path);
  
  // 小文件：直接返回
  if (stat.size < 1024 * 1024) {
    const content = await handle.readFile(artifact.path);
    return Response.json({ content });
  }
  
  // 大文件：stream 输出
  const stream = handle.readFileStream(artifact.path);
  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    }),
    {
      headers: {
        "Content-Type": getMimeType(artifact.type),
        "Content-Length": String(stat.size),
      },
    }
  );
}
```

#### S3 URL 方案（超大文件）

如果 sandbox 磁盘挂载到 S3，可以直接生成 presigned URL：

```typescript
// artifact.json 中可以包含 s3Key
{
  "artifacts": [
    {
      "path": "/workspace/output/video.mp4",
      "type": "video",
      "title": "生成的视频",
      "size": 104857600,
      "s3Key": "sessions/xxx/output/video.mp4"  // S3 key
    }
  ]
}

// API 生成 presigned URL
if (artifact.s3Key && stat.size > 10 * 1024 * 1024) {
  const url = await s3.getSignedUrl("getObject", {
    Bucket: process.env.S3_BUCKET,
    Key: artifact.s3Key,
    Expires: 3600,
  });
  return Response.json({ url, type: "redirect" });
}
```

### 10.3 Artifact 持久化

**方案：S3 挂载自动持久化**

由于 sandbox 磁盘挂载到 S3：
- 文件写入 `/workspace/output/` 时自动同步到 S3
- Sandbox 销毁后，S3 中的文件仍然存在
- 可以设置 S3 生命周期策略自动清理过期文件

```
Sandbox 生命周期          S3 生命周期
─────────────────        ─────────────────
创建 sandbox              
写入文件 ───────────────→ 同步到 S3
销毁 sandbox              文件保留
                         7天后自动删除（可配置）
```

## 11. 总结

```
┌─────────────────────────────────────────────────────────────┐
│  1. 用户指导（CLAUDE.md 中定义产物规范）                     │
│                                                             │
│  "任务完成后生成 /sandagent/artifact.json"                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Agent 生成 artifact.json                                 │
│                                                             │
│  {                                                          │
│    "artifacts": [                                           │
│      { "path": "/output/report.md", "title": "报告" },      │
│      { "path": "/output/video.mp4", "s3Key": "xxx" }        │
│    ]                                                        │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Sandbox + S3 存储                                        │
│                                                             │
│  /workspace/output/  ←──── 挂载到 S3                         │
│    ├── report.md     (小文件)                               │
│    └── video.mp4     (大文件，同步到 S3)                     │
│                                                             │
│  /sandagent/artifact.json  ← 清单文件                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  4. API（按大小选择策略）                                    │
│                                                             │
│  GET /api/artifacts?sessionId=xxx → 返回清单                 │
│                                                             │
│  GET /api/artifacts/[id]                                    │
│    ├─ <1MB   → 直接返回 content                             │
│    ├─ 1-10MB → stream 输出                                  │
│    └─ >10MB  → 返回 S3 presigned URL                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  5. UI 展示                                                  │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 📎 产物                                                 │ │
│  │ ├─ 📄 分析报告 (5KB)        [预览] [下载]              │ │
│  │ └─ 🎬 生成视频 (100MB)      [S3下载链接]               │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 12. 需要实现的接口

### SandboxHandle 扩展

```typescript
interface SandboxHandle {
  // 现有
  exec(command: string[], opts?: ExecOptions): AsyncIterable<Uint8Array>;
  upload(files: Array<{ path: string; content: Uint8Array | string }>, targetDir: string): Promise<void>;
  destroy(): Promise<void>;
  
  // 新增
  readFile(path: string): Promise<string>;
  readFileStream(path: string): AsyncIterable<Uint8Array>;
  stat(path: string): Promise<FileStat>;
  listDir(path: string): Promise<FileInfo[]>;
}

interface FileStat {
  size: number;
  isDirectory: boolean;
  modifiedAt: string;
}

interface FileInfo {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  modifiedAt: string;
}
```

### API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/artifacts` | GET | 获取 artifact 清单 |
| `/api/artifacts/[id]` | GET | 获取单个 artifact 内容（支持 stream） |
| `/api/artifacts/[id]/download` | GET | 下载文件（返回 S3 URL 或直接流） |
