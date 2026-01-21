# Artifact 功能设计方案

## 1. 架构概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              用户配置                                        │
│                                                                             │
│  createSandAgent({                                                          │
│    artifacts: ["/workspace/CLAUDE.md", "/workspace", "${OUTPUT}/artifact.json"]│
│  })                                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                               API Layer                                      │
│                                                                             │
│  GET  /api/artifacts/read?sessionId=xxx&path=xxx                            │
│  GET  /api/artifacts/list?sessionId=xxx&path=xxx                            │
│  PUT  /api/artifacts/write                                                  │
│  GET  /api/artifacts/download?sessionId=xxx&path=xxx                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ArtifactStore（缓存层）                             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  get(sessionId, path)                                                │   │
│  │                                                                      │   │
│  │  1. 查 DB 缓存 ──────→ 命中 ──────→ 返回                             │   │
│  │         │                                                            │   │
│  │         ▼ 未命中                                                     │   │
│  │  2. SandboxHandle.readFile()                                         │   │
│  │         │                                                            │   │
│  │         ▼                                                            │   │
│  │  3. 写入 DB 缓存                                                     │   │
│  │         │                                                            │   │
│  │         ▼                                                            │   │
│  │  4. 返回                                                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ (缓存未命中时)
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SandboxHandle（底层读取）                             │
│                                                                             │
│  readFile(path)        →  小文件，直接返回 string                           │
│  readFileStream(path)  →  大文件，stream 返回                               │
│  listDir(path)         →  目录列表                                          │
│  stat(path)            →  文件元信息                                        │
│  writeFile(path, content) → 写入文件                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Sandbox + S3                                     │
│                                                                             │
│  /workspace/CLAUDE.md          ← 小文件                                     │
│  /workspace/output/report.md   ← 中等文件                                   │
│  /mnt/s3/video.mp4             ← 大文件（S3 挂载）                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                UI 展示                                       │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────────┐  │
│  │ CLAUDE.md    │  │ /workspace   │  │ 输出产物                          │  │
│  │ [编辑]       │  │ [文件浏览器] │  │ 📄 report.md  [预览] [下载]      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2. 核心概念

**Artifact = 文件路径 → 获取内容**

- 用户配置路径
- 系统从 Sandbox 获取
- 缓存到 DB
- 展示到 UI

## 3. 配置

```typescript
createSandAgent({
  sandbox,
  
  // 用户自定义 artifact 路径
  artifacts: [
    "/workspace/CLAUDE.md",           // 单个文件
    "/workspace",                      // 目录
    "${OUTPUT_DIR}/artifact.json",     // 产物清单（支持变量）
  ],
  
  env: {
    OUTPUT_DIR: "/workspace/output",
  },
});
```

## 4. 接口定义

### 4.1 SandboxHandle 扩展

```typescript
interface SandboxHandle {
  // 现有
  exec(command: string[], opts?: ExecOptions): AsyncIterable<Uint8Array>;
  upload(files: Array<{ path: string; content: string }>, targetDir: string): Promise<void>;
  destroy(): Promise<void>;
  
  // 新增
  readFile(path: string): Promise<string>;
  readFileStream(path: string): AsyncIterable<Uint8Array>;
  writeFile(path: string, content: string): Promise<void>;
  listDir(path: string): Promise<FileInfo[]>;
  stat(path: string): Promise<FileStat>;
}

interface FileInfo {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  modifiedAt: string;
}

interface FileStat {
  size: number;
  isDirectory: boolean;
  modifiedAt: string;
}
```

### 4.2 ArtifactStore 接口

```typescript
interface ArtifactStore {
  get(sessionId: string, path: string): Promise<ArtifactContent>;
  getStream(sessionId: string, path: string): AsyncIterable<Uint8Array>;
  list(sessionId: string, path: string): Promise<FileInfo[]>;
  put(sessionId: string, path: string, content: string): Promise<void>;
  invalidate(sessionId: string, path?: string): Promise<void>;
}

interface ArtifactContent {
  content: string;
  mimeType: string;
  size: number;
  cachedAt: string;
  s3Url?: string;  // 大文件
}
```

## 5. API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/artifacts` | GET | 获取配置的路径列表 |
| `/api/artifacts/read` | GET | 读取文件内容 |
| `/api/artifacts/list` | GET | 列出目录 |
| `/api/artifacts/write` | PUT | 写入文件 |
| `/api/artifacts/download` | GET | 下载（stream 或 S3 URL） |

```
GET /api/artifacts?sessionId=xxx
GET /api/artifacts/read?sessionId=xxx&path=/workspace/CLAUDE.md
GET /api/artifacts/list?sessionId=xxx&path=/workspace
PUT /api/artifacts/write { sessionId, path, content }
GET /api/artifacts/download?sessionId=xxx&path=/workspace/output/video.mp4
```

## 6. 缓存策略

### 6.1 缓存流程

```
请求 get(sessionId, path)
         │
         ▼
    查 DB 缓存
         │
    ┌────┴────┐
    │         │
  命中      未命中
    │         │
    ▼         ▼
  返回    从 Sandbox 读取
              │
              ▼
         写入 DB 缓存
              │
              ▼
            返回
```

### 6.2 缓存规则

| 文件大小 | 缓存方式 |
|----------|----------|
| < 1MB | 内容缓存到 DB |
| 1-10MB | 元数据缓存，内容 stream |
| > 10MB | 元数据缓存，返回 S3 URL |

### 6.3 缓存失效

- **TTL**：可配置过期时间（如 5 分钟）
- **写入失效**：`put()` 时自动失效对应缓存
- **手动失效**：`invalidate(sessionId, path)`

## 7. 大文件处理

```
┌─────────────────────────────────────────────────────────────┐
│  Sandbox 磁盘可挂载 S3                                       │
│                                                             │
│  /workspace/         ← 普通目录                              │
│  /mnt/s3/            ← 挂载到 S3 Bucket                      │
└─────────────────────────────────────────────────────────────┘

大文件处理策略：
1. 文件在 S3 挂载目录 → 直接返回 presigned URL
2. 文件不在 S3 目录 → readFileStream() stream 返回
```

## 8. artifact.json 清单格式

用户通过 CLAUDE.md 指导 Agent 生成清单：

```json
{
  "version": "1.0",
  "generatedAt": "2025-01-21T10:00:00Z",
  "artifacts": [
    {
      "id": "art-001",
      "path": "/workspace/output/report.md",
      "type": "markdown",
      "title": "分析报告",
      "size": 5242
    },
    {
      "id": "art-002",
      "path": "/mnt/s3/video.mp4",
      "type": "video",
      "title": "生成的视频",
      "size": 104857600,
      "s3Key": "sessions/xxx/video.mp4"
    }
  ]
}
```

## 9. 实现步骤

### Step 1: 扩展 SandboxHandle

在 `@sandagent/core` 中添加接口定义，在各 sandbox adapter 中实现：

- `@sandagent/sandbox-e2b`
- `@sandagent/sandbox-sandock`
- `@sandagent/sandbox-daytona`

### Step 2: 实现 ArtifactStore

```typescript
// packages/core/src/artifact-store.ts

export class ArtifactStore {
  constructor(
    private db: Database,
    private sandboxFactory: SandboxFactory,
  ) {}
  
  async get(sessionId: string, path: string): Promise<ArtifactContent> {
    // 1. 查缓存
    const cached = await this.db.artifacts.findOne({ sessionId, path });
    if (cached && !this.isExpired(cached)) {
      return cached;
    }
    
    // 2. 从 sandbox 读取
    const handle = await this.sandboxFactory.attach(sessionId);
    const stat = await handle.stat(path);
    
    // 3. 大文件返回 S3 URL
    if (stat.size > 10 * 1024 * 1024) {
      return this.handleLargeFile(sessionId, path, stat);
    }
    
    // 4. 小文件缓存
    const content = await handle.readFile(path);
    const artifact = { content, mimeType: getMimeType(path), size: stat.size, cachedAt: new Date().toISOString() };
    await this.db.artifacts.upsert({ sessionId, path }, artifact);
    
    return artifact;
  }
}
```

### Step 3: 添加 API 路由

```typescript
// apps/sandagent-example/app/api/artifacts/read/route.ts

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  const path = searchParams.get("path");
  
  const store = getArtifactStore();
  const content = await store.get(sessionId, path);
  
  return Response.json(content);
}
```

### Step 4: 前端集成

使用现有 `packages/kui` 中的 artifact 组件展示。

## 10. 总结

| 组件 | 职责 |
|------|------|
| **用户配置** | 定义 artifact 路径 |
| **API** | 暴露 HTTP 接口 |
| **ArtifactStore** | 缓存层，避免重复读取 sandbox |
| **SandboxHandle** | 底层文件操作 |
| **Sandbox + S3** | 文件存储 |
| **UI** | 展示 artifact |
