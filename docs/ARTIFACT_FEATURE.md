# Artifact 功能设计方案

## 1. 概述

Artifact 是 Sandbox 中需要展示给用户的文件。分为三种类型：

| 类型 | 说明 | 示例 |
|------|------|------|
| **claude.md** | Agent 的配置/指令文件 | `/workspace/CLAUDE.md` |
| **workdir** | 工作目录中的文件 | `/workspace/*` |
| **chat 产物** | Chat 结束后的输出产物 | `/workspace/output/report.md` |

```
┌─────────────────────────────────────────────────────────────┐
│  Sandbox                                                     │
│                                                             │
│  📄 claude.md artifact                                       │
│     /workspace/CLAUDE.md                                    │
│                                                             │
│  📁 workdir artifact                                         │
│     /workspace/                                             │
│     ├── src/                                                │
│     ├── data/                                               │
│     └── ...                                                 │
│                                                             │
│  📦 chat 产物 artifact                                       │
│     /workspace/output/artifact.json  ← 清单                 │
│     /workspace/output/report.md      ← 产物                 │
│     /workspace/output/data.csv       ← 产物                 │
└─────────────────────────────────────────────────────────────┘
```

## 2. 三种 Artifact 类型

### 2.1 claude.md Artifact

Agent 的配置/指令文件，用户可以查看和编辑。

```typescript
interface ClaudeMdArtifact {
  type: "claude.md";
  path: string;           // 如 "/workspace/CLAUDE.md"
}
```

**用途**：
- 展示当前 Agent 的指令配置
- 允许用户编辑并保存到 sandbox
- 实时生效，影响后续对话

### 2.2 workdir Artifact

工作目录中的文件/文件夹，用户可以浏览。

```typescript
interface WorkdirArtifact {
  type: "workdir";
  path: string;           // 如 "/workspace"
}
```

**用途**：
- 浏览 sandbox 中的文件结构
- 查看/编辑文件内容
- 上传/下载文件

### 2.3 Chat 产物 Artifact

Chat 结束后的输出产物，通过 artifact.json 清单定义。

```typescript
interface ChatArtifact {
  type: "chat";
  manifestPath: string;   // 如 "/workspace/output/artifact.json"
}
```

**用途**：
- 展示 Agent 生成的最终交付物
- 预览（Markdown、代码、图片等）
- 下载

### 2.4 统一配置

用户在创建 SandAgent 时配置三种 artifact：

```typescript
const sandagent = createSandAgent({
  sandbox,
  artifacts: {
    claudeMd: "/workspace/CLAUDE.md",           // claude.md 路径
    workdir: "/workspace",                       // 工作目录路径
    chatManifest: "/workspace/output/artifact.json",  // chat 产物清单路径
  },
});
```

## 3. 当前数据流

```typescript
// apps/sandagent-example/app/api/ai/route.ts

const sandagent = createSandAgent({
  sandbox,
  cwd: "/sandagent",
  verbose: true,
});

const result = streamText({
  model: sandagent(model),
  messages: normalizedMessages,
  abortSignal: signal,
});

return result.toUIMessageStreamResponse();
```

```
streamText()
    │
    ▼
SandAgentLanguageModel.doStream()
    │
    ▼
SandAgent.stream()  ──────→  Sandbox 执行 Agent
    │                              │
    ▼                              ▼
SSE 数据流  ←─────────────  stdout 输出
    │
    ▼
toUIMessageStreamResponse()
    │
    ▼
前端 UI 渲染
```

## 3. 核心问题

```
streamText 结束
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

**所有路径都由用户自己定义：**

1. **清单文件路径**：用户指定 artifact.json 的位置
2. **产物文件路径**：用户在清单中指定任意路径

### 3.1 用户指定清单路径

用户在调用 API 时指定清单文件路径：

```typescript
// 前端调用
GET /api/artifacts?sessionId=xxx&manifest=/workspace/output/artifact.json

// 或者在 streamText 配置中
const sandagent = createSandAgent({
  sandbox,
  artifactManifest: "/workspace/output/artifact.json",  // 用户指定
});
```

### 3.2 清单文件内容

```json
// 路径由用户指定，比如 /workspace/output/artifact.json
{
  "artifacts": [
    {
      "path": "/workspace/output/report.md",      // 任意路径
      "type": "markdown",
      "title": "分析报告"
    },
    {
      "path": "/home/user/data/result.csv",       // 任意路径
      "type": "csv",
      "title": "数据表格"
    },
    {
      "path": "/tmp/generated/chart.png",         // 任意路径
      "type": "image",
      "title": "图表"
    }
  ]
}
```

### 3.3 用户指导 Agent 生成

用户在 CLAUDE.md 中告诉 Agent：
- 清单文件写到哪里
- 产物文件写到哪里

```markdown
## 产物输出规范

任务完成后：
1. 将产物文件写入 /workspace/output/ 目录
2. 生成清单文件 /workspace/output/artifact.json
```

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
1. streamText 结束（onFinish 回调）
       │
       ▼
2. 从 sandbox 读取 /sandagent/artifact.json
       │
       ▼
3. 解析清单，获取 artifact 列表
       │
       ▼
4. 返回给前端（通过流追加 或 独立 API）
```

## 5. streamText 集成方案

### 5.1 方案 A：onFinish 回调 + 流追加

利用 AI SDK `streamText` 的 `onFinish` 回调，在流结束后追加 artifact 数据：

```typescript
// apps/sandagent-example/app/api/ai/route.ts

const result = streamText({
  model: sandagent(model),
  messages: normalizedMessages,
  abortSignal: signal,
  
  // 流结束后获取 artifact
  onFinish: async ({ response }) => {
    try {
      // 从 sandbox 读取 artifact 清单
      const handle = await sandbox.attach(sessionId);
      const manifest = await handle.readFile("/sandagent/artifact.json");
      const { artifacts } = JSON.parse(manifest);
      
      // 将 artifact 信息附加到 response metadata
      response.metadata = {
        ...response.metadata,
        artifacts,
      };
    } catch (e) {
      // artifact.json 不存在，忽略
    }
  },
});
```

### 5.2 方案 B：独立 API（推荐）

streamText 只负责对话流，artifact 通过独立 API 获取：

```typescript
// 1. streamText 保持不变
const result = streamText({
  model: sandagent(model),
  messages,
});
return result.toUIMessageStreamResponse();

// 2. 前端在流结束后调用 artifact API
// GET /api/artifacts?sessionId=xxx
```

```typescript
// apps/sandagent-example/app/api/artifacts/route.ts

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  const manifestPath = searchParams.get("manifest");  // 用户指定清单路径
  
  if (!manifestPath) {
    return Response.json({ error: "manifest path required" }, { status: 400 });
  }
  
  // 根据 provider 创建 sandbox
  const sandbox = createSandbox(/* 从 session 获取配置 */);
  const handle = await sandbox.attach(sessionId);
  
  try {
    // 读取用户指定路径的 artifact 清单
    const manifest = await handle.readFile(manifestPath);
    const { artifacts } = JSON.parse(manifest);
    
    return Response.json({ artifacts });
  } catch (e) {
    // artifact.json 不存在
    return Response.json({ artifacts: [] });
  }
}
```

### 5.3 方案 C：流结束事件携带 artifact

在 AI SDK 流协议中定义新的事件类型：

```typescript
// 流结束时发送 artifact 事件
// data: {"type":"artifacts","data":[{"path":"/output/report.md","title":"报告"}]}
```

需要修改 `SandAgentLanguageModel` 在流结束时追加 artifact 数据。

## 6. 推荐方案：独立 API

**理由**：
1. **解耦**：不修改现有 streamText 流程
2. **灵活**：前端可以选择何时获取 artifact
3. **大文件友好**：可以 stream 输出或返回 S3 URL
4. **错误隔离**：artifact 获取失败不影响对话

## 7. UI 展示

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

## 9. artifact.json 格式定义

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
│  文件可以在任意位置，部分目录可挂载 S3：                      │
│                                                             │
│  /workspace/report.md   (小文件，直接读取)                   │
│  /tmp/data.csv          (中等文件，stream 读取)              │
│  /mnt/s3/video.mp4      (大文件，返回 S3 URL)  ← 挂载到 S3   │
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

**方案：S3 挂载自动持久化（用户配置挂载目录）**

用户可以配置 sandbox 的某些目录挂载到 S3：
- 挂载目录中的文件自动同步到 S3
- Sandbox 销毁后，S3 中的文件仍然存在
- 可以设置 S3 生命周期策略自动清理过期文件

```
用户配置挂载：/mnt/s3 → S3 Bucket

Sandbox 生命周期          S3 生命周期
─────────────────        ─────────────────
创建 sandbox              
写入 /mnt/s3/file ──────→ 同步到 S3
销毁 sandbox              文件保留
                         7天后自动删除（可配置）
```

**注意**：artifact 文件不要求必须在 S3 挂载目录，只是大文件建议放在挂载目录以便直接返回 S3 URL。

## 11. 总结

### 三种 Artifact 类型

```
┌─────────────────────────────────────────────────────────────┐
│  1. 用户配置三种 Artifact                                    │
│                                                             │
│  createSandAgent({                                          │
│    artifacts: {                                             │
│      claudeMd: "/workspace/CLAUDE.md",                      │
│      workdir: "/workspace",                                 │
│      chatManifest: "/workspace/output/artifact.json",       │
│    }                                                        │
│  })                                                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Sandbox 中的三种 Artifact                                │
│                                                             │
│  📄 claude.md: /workspace/CLAUDE.md                         │
│     - 查看/编辑 Agent 指令                                  │
│                                                             │
│  📁 workdir: /workspace/                                    │
│     - 浏览/编辑工作目录文件                                 │
│                                                             │
│  📦 chat 产物: /workspace/output/artifact.json              │
│     - 展示 Agent 生成的交付物                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  3. API 获取                                                 │
│                                                             │
│  GET /api/artifacts/claude-md    → CLAUDE.md 内容           │
│  GET /api/artifacts/workdir      → 目录列表                 │
│  GET /api/artifacts/chat         → chat 产物清单            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  4. UI 展示                                                  │
│                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐│
│  │ CLAUDE.md   │ │  文件浏览器  │ │  Chat 产物              ││
│  │ [编辑]      │ │  /workspace │ │  📄 报告 [预览][下载]   ││
│  │             │ │  ├─ src/    │ │  📊 数据 [预览][下载]   ││
│  │             │ │  └─ data/   │ │                         ││
│  └─────────────┘ └─────────────┘ └─────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```
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

#### claude.md Artifact API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/artifacts/claude-md` | GET | 获取 CLAUDE.md 内容 |
| `/api/artifacts/claude-md` | PUT | 更新 CLAUDE.md 内容 |

```typescript
// GET /api/artifacts/claude-md?sessionId=xxx&path=/workspace/CLAUDE.md
// PUT /api/artifacts/claude-md { sessionId, path, content }
```

#### workdir Artifact API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/artifacts/workdir` | GET | 列出目录内容 |
| `/api/artifacts/workdir/file` | GET | 读取文件内容 |
| `/api/artifacts/workdir/file` | PUT | 写入文件内容 |
| `/api/artifacts/workdir/file` | DELETE | 删除文件 |

```typescript
// GET /api/artifacts/workdir?sessionId=xxx&path=/workspace
// GET /api/artifacts/workdir/file?sessionId=xxx&path=/workspace/src/index.ts
```

#### Chat 产物 Artifact API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/artifacts/chat` | GET | 获取 chat 产物清单 |
| `/api/artifacts/chat/[id]` | GET | 获取单个产物内容（支持 stream） |
| `/api/artifacts/chat/[id]/download` | GET | 下载文件 |

```typescript
// GET /api/artifacts/chat?sessionId=xxx&manifest=/workspace/output/artifact.json
// GET /api/artifacts/chat/art-001?sessionId=xxx
```
