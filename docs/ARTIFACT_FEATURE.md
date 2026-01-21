# Artifact 功能设计方案

## 1. 概述

### 1.1 什么是 Artifact

Artifact（产物）是 AI Agent 在执行任务过程中生成的结构化输出内容。与普通的文本回复不同，Artifact 是可独立展示、预览、下载和分享的内容块。

### 1.2 设计背景

当前 SandAgent 的 AI Agent 可以生成各种类型的内容：
- 代码文件
- Markdown 文档
- 数据分析报告
- 图表和可视化
- 配置文件
- 脚本等

目前这些内容通过 Write 工具直接写入沙箱文件系统，用户需要手动下载或在侧边栏查看。Artifact 功能旨在提供更好的用户体验，让生成的内容更容易被预览、复制和下载。

### 1.3 设计目标

1. **统一展示**：为所有 Agent 产出物提供统一的展示界面
2. **即时预览**：支持多种格式的实时预览（Markdown、代码、HTML、图片等）
3. **便捷操作**：一键复制、下载、分享
4. **可追溯**：记录产物的生成过程和版本历史
5. **可扩展**：支持自定义 Artifact 类型和渲染器

## 2. 架构设计

### 2.1 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│  前端 (Next.js / React)                                          │
│  ┌───────────────────┐  ┌───────────────────┐                   │
│  │  ArtifactPanel    │  │  ArtifactGallery  │                   │
│  │  (侧边预览面板)    │  │  (产物列表/画廊)   │                   │
│  └───────────────────┘  └───────────────────┘                   │
│           │                       │                              │
│           ▼                       ▼                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  ArtifactRenderer (根据类型选择渲染器)                        ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       ││
│  │  │ Markdown │ │   Code   │ │   HTML   │ │  Image   │ ...   ││
│  │  │ Renderer │ │ Renderer │ │ Renderer │ │ Renderer │       ││
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘       ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  API Layer                                                       │
│  ┌───────────────────┐  ┌───────────────────┐                   │
│  │ POST /api/artifact│  │ GET /api/artifact │                   │
│  │ (创建/更新产物)    │  │ (获取产物内容)    │                   │
│  └───────────────────┘  └───────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Sandbox (E2B / Sandock)                                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ /sandagent/artifacts/                                        ││
│  │   ├── manifest.json        (产物清单)                        ││
│  │   ├── {artifactId}/                                          ││
│  │   │   ├── metadata.json    (产物元数据)                      ││
│  │   │   └── content.*        (产物内容文件)                    ││
│  │   └── ...                                                    ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
1. Agent 生成内容
        │
        ▼
2. CreateArtifact 工具被调用
        │
        ▼
3. 内容写入 /sandagent/artifacts/{id}/
        │
        ▼
4. 流式输出 Artifact 元数据到前端
        │
        ▼
5. 前端渲染 Artifact 卡片
        │
        ▼
6. 用户点击查看/下载/复制
```

## 3. 数据模型

### 3.1 Artifact 类型定义

```typescript
/**
 * Artifact 类型枚举
 */
export type ArtifactType =
  | "code"        // 代码文件
  | "markdown"    // Markdown 文档
  | "html"        // HTML 页面
  | "image"       // 图片 (base64 或 URL)
  | "svg"         // SVG 矢量图
  | "chart"       // 图表 (ECharts/Chart.js 配置)
  | "csv"         // CSV 数据
  | "json"        // JSON 数据
  | "pdf"         // PDF 文档
  | "audio"       // 音频文件
  | "video"       // 视频文件
  | "file";       // 通用文件

/**
 * Artifact 元数据
 */
export interface ArtifactMetadata {
  /** 唯一标识符 */
  id: string;
  /** 产物类型 */
  type: ArtifactType;
  /** 标题 */
  title: string;
  /** 描述 */
  description?: string;
  /** 文件名 */
  filename: string;
  /** MIME 类型 */
  mimeType: string;
  /** 内容大小 (字节) */
  size: number;
  /** 创建时间 (ISO 8601) */
  createdAt: string;
  /** 更新时间 (ISO 8601) */
  updatedAt: string;
  /** 版本号 */
  version: number;
  /** 代码语言 (仅 type="code" 时有效) */
  language?: string;
  /** 图表配置 (仅 type="chart" 时有效) */
  chartConfig?: Record<string, unknown>;
  /** 自定义元数据 */
  custom?: Record<string, unknown>;
}

/**
 * Artifact 完整数据
 */
export interface Artifact extends ArtifactMetadata {
  /** 内容 (文本或 base64) */
  content: string;
  /** 是否为 base64 编码 */
  isBase64?: boolean;
}

/**
 * Artifact 清单 (manifest.json)
 */
export interface ArtifactManifest {
  /** 会话 ID */
  sessionId: string;
  /** 产物列表 */
  artifacts: ArtifactMetadata[];
  /** 最后更新时间 */
  lastUpdated: string;
}
```

### 3.2 工具输入/输出定义

```typescript
/**
 * CreateArtifact 工具输入
 */
export interface CreateArtifactInput {
  /** 产物类型 */
  type: ArtifactType;
  /** 标题 */
  title: string;
  /** 内容 */
  content: string;
  /** 文件名 (可选，自动生成) */
  filename?: string;
  /** 描述 (可选) */
  description?: string;
  /** 代码语言 (仅 type="code" 时) */
  language?: string;
}

/**
 * CreateArtifact 工具输出
 */
export interface CreateArtifactOutput {
  /** 创建成功 */
  success: boolean;
  /** 产物 ID */
  artifactId: string;
  /** 产物元数据 */
  metadata: ArtifactMetadata;
  /** 错误信息 (失败时) */
  error?: string;
}

/**
 * UpdateArtifact 工具输入
 */
export interface UpdateArtifactInput {
  /** 要更新的产物 ID */
  artifactId: string;
  /** 新内容 */
  content: string;
  /** 更新描述 (可选) */
  changeDescription?: string;
}
```

## 4. API 设计

### 4.1 获取 Artifact 内容

```
GET /api/artifact?sessionId={sessionId}&artifactId={artifactId}
```

**响应**:
```json
{
  "success": true,
  "artifact": {
    "id": "artifact-123",
    "type": "markdown",
    "title": "技术分析报告",
    "content": "# 报告标题\n\n...",
    "filename": "report.md",
    "mimeType": "text/markdown",
    "size": 2048,
    "createdAt": "2025-01-21T10:00:00Z",
    "version": 1
  }
}
```

### 4.2 列出所有 Artifacts

```
GET /api/artifact/list?sessionId={sessionId}
```

**响应**:
```json
{
  "success": true,
  "artifacts": [
    {
      "id": "artifact-123",
      "type": "markdown",
      "title": "技术分析报告",
      "filename": "report.md",
      "size": 2048,
      "createdAt": "2025-01-21T10:00:00Z"
    },
    {
      "id": "artifact-124",
      "type": "code",
      "title": "数据处理脚本",
      "filename": "process.py",
      "language": "python",
      "size": 1024,
      "createdAt": "2025-01-21T10:05:00Z"
    }
  ]
}
```

### 4.3 下载 Artifact

```
GET /api/artifact/download?sessionId={sessionId}&artifactId={artifactId}
```

**响应**: 文件流 (Content-Disposition: attachment)

## 5. UI 设计

### 5.1 组件结构

利用现有的 `packages/kui/src/components/ai-elements/artifact.tsx` 组件：

```
┌─────────────────────────────────────────────────────────────────┐
│  Artifact (容器)                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ArtifactHeader                                            │  │
│  │  ┌────────────┐  ┌────────────────────┐  ┌─────────────┐  │  │
│  │  │ Icon       │  │ ArtifactTitle      │  │ ArtifactActions│ │  │
│  │  │ (类型图标) │  │ ArtifactDescription│  │ (Copy/Download)│ │  │
│  │  └────────────┘  └────────────────────┘  └─────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ArtifactContent                                           │  │
│  │  (根据类型渲染预览内容)                                     │  │
│  │  - Markdown: 富文本预览                                    │  │
│  │  - Code: 语法高亮                                          │  │
│  │  - Image: 图片预览                                         │  │
│  │  - Chart: 交互式图表                                       │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 ArtifactCard 组件 (消息流中的卡片)

```tsx
interface ArtifactCardProps {
  artifact: ArtifactMetadata;
  sessionId: string;
  onOpen?: () => void;
}

function ArtifactCard({ artifact, sessionId, onOpen }: ArtifactCardProps) {
  return (
    <div className="artifact-card" onClick={onOpen}>
      <div className="artifact-card-icon">
        <ArtifactTypeIcon type={artifact.type} />
      </div>
      <div className="artifact-card-info">
        <div className="artifact-card-title">{artifact.title}</div>
        <div className="artifact-card-meta">
          {artifact.filename} · {formatSize(artifact.size)}
        </div>
      </div>
      <ChevronRight className="artifact-card-arrow" />
    </div>
  );
}
```

### 5.3 ArtifactPanel 组件 (侧边预览面板)

```tsx
interface ArtifactPanelProps {
  artifact: Artifact;
  isOpen: boolean;
  onClose: () => void;
}

function ArtifactPanel({ artifact, isOpen, onClose }: ArtifactPanelProps) {
  return (
    <Artifact className="artifact-panel">
      <ArtifactHeader>
        <div className="flex items-center gap-3">
          <ArtifactTypeIcon type={artifact.type} />
          <div>
            <ArtifactTitle>{artifact.title}</ArtifactTitle>
            <ArtifactDescription>{artifact.filename}</ArtifactDescription>
          </div>
        </div>
        <ArtifactActions>
          <ArtifactAction icon={Copy} tooltip="复制" onClick={handleCopy} />
          <ArtifactAction icon={Download} tooltip="下载" onClick={handleDownload} />
          <ArtifactClose onClick={onClose} />
        </ArtifactActions>
      </ArtifactHeader>
      <ArtifactContent>
        <ArtifactRenderer artifact={artifact} />
      </ArtifactContent>
    </Artifact>
  );
}
```

### 5.4 渲染器设计

```tsx
interface ArtifactRendererProps {
  artifact: Artifact;
}

function ArtifactRenderer({ artifact }: ArtifactRendererProps) {
  switch (artifact.type) {
    case "markdown":
      return <MarkdownRenderer content={artifact.content} />;
    case "code":
      return <CodeRenderer content={artifact.content} language={artifact.language} />;
    case "html":
      return <HtmlRenderer content={artifact.content} />;
    case "image":
      return <ImageRenderer content={artifact.content} isBase64={artifact.isBase64} />;
    case "svg":
      return <SvgRenderer content={artifact.content} />;
    case "chart":
      return <ChartRenderer config={artifact.chartConfig} />;
    case "csv":
      return <CsvRenderer content={artifact.content} />;
    default:
      return <FileRenderer artifact={artifact} />;
  }
}
```

### 5.5 UI 状态流

```
┌──────────────────┐
│  input-streaming │  (Agent 正在生成内容)
│  显示: 骨架屏     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  input-available │  (内容生成完成，准备创建)
│  显示: 预览卡片   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ output-available │  (Artifact 创建成功)
│  显示: 完整预览   │
│  可下载/复制      │
└──────────────────┘
```

## 6. Runner 集成

### 6.1 CreateArtifact 工具实现

在 `@sandagent/runner-claude` 中添加 CreateArtifact 工具：

```typescript
// packages/runner-claude/src/tools/create-artifact.ts

import { ClaudeToolDefinition } from "../types";

export const createArtifactTool: ClaudeToolDefinition = {
  name: "CreateArtifact",
  description: `创建一个可预览、下载的产物（Artifact）。
适用于生成需要独立展示的内容，如：报告、代码文件、图表等。

使用场景：
- 生成分析报告或文档
- 创建代码文件
- 生成数据可视化
- 输出结构化数据

注意：简短的回复应直接使用文本，不需要创建 Artifact。`,
  input_schema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["code", "markdown", "html", "image", "svg", "chart", "csv", "json", "file"],
        description: "产物类型",
      },
      title: {
        type: "string",
        description: "产物标题（简短描述）",
      },
      content: {
        type: "string",
        description: "产物内容（代码、文本或 base64）",
      },
      filename: {
        type: "string",
        description: "文件名（可选，自动根据类型生成）",
      },
      description: {
        type: "string",
        description: "详细描述（可选）",
      },
      language: {
        type: "string",
        description: "编程语言（仅 type=code 时需要）",
      },
    },
    required: ["type", "title", "content"],
  },
};
```

### 6.2 工具执行逻辑

```typescript
// packages/runner-claude/src/tools/create-artifact-handler.ts

import { v4 as uuidv4 } from "uuid";
import * as fs from "fs/promises";
import * as path from "path";

const ARTIFACTS_DIR = "/sandagent/artifacts";

export async function handleCreateArtifact(
  input: CreateArtifactInput
): Promise<CreateArtifactOutput> {
  const artifactId = `artifact-${uuidv4().slice(0, 8)}`;
  const artifactDir = path.join(ARTIFACTS_DIR, artifactId);

  // 确保目录存在
  await fs.mkdir(artifactDir, { recursive: true });

  // 生成文件名
  const filename = input.filename || generateFilename(input.type, input.title);
  const mimeType = getMimeType(input.type, filename);

  // 创建元数据
  const metadata: ArtifactMetadata = {
    id: artifactId,
    type: input.type,
    title: input.title,
    description: input.description,
    filename,
    mimeType,
    size: Buffer.byteLength(input.content, "utf-8"),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    language: input.language,
  };

  // 写入元数据
  await fs.writeFile(
    path.join(artifactDir, "metadata.json"),
    JSON.stringify(metadata, null, 2)
  );

  // 写入内容
  await fs.writeFile(path.join(artifactDir, filename), input.content);

  // 更新清单
  await updateManifest(artifactId, metadata);

  return {
    success: true,
    artifactId,
    metadata,
  };
}

function generateFilename(type: ArtifactType, title: string): string {
  const slug = title.toLowerCase().replace(/\s+/g, "-").slice(0, 30);
  const ext = getExtension(type);
  return `${slug}${ext}`;
}

function getExtension(type: ArtifactType): string {
  const extensions: Record<ArtifactType, string> = {
    code: ".txt",
    markdown: ".md",
    html: ".html",
    image: ".png",
    svg: ".svg",
    chart: ".json",
    csv: ".csv",
    json: ".json",
    pdf: ".pdf",
    audio: ".mp3",
    video: ".mp4",
    file: ".bin",
  };
  return extensions[type] || ".txt";
}
```

## 7. 实现计划

### Phase 1: 基础功能 (MVP)

| 任务 | 描述 | 优先级 |
|------|------|--------|
| 数据模型定义 | 在 `@sandagent/core` 中定义 Artifact 类型 | P0 |
| CreateArtifact 工具 | 在 `@sandagent/runner-claude` 中实现工具 | P0 |
| ArtifactCard 组件 | 消息流中的产物卡片 | P0 |
| ArtifactPanel 组件 | 侧边预览面板 | P0 |
| Markdown 渲染器 | 支持 Markdown 预览 | P0 |
| Code 渲染器 | 支持代码高亮预览 | P0 |
| 下载/复制功能 | 基础操作 | P0 |

### Phase 2: 增强功能

| 任务 | 描述 | 优先级 |
|------|------|--------|
| HTML 渲染器 | 支持 HTML 预览（iframe 沙箱） | P1 |
| Image 渲染器 | 支持图片预览 | P1 |
| Chart 渲染器 | 支持 ECharts/Chart.js | P1 |
| CSV 渲染器 | 支持表格预览 | P1 |
| UpdateArtifact 工具 | 支持产物更新 | P1 |
| 版本历史 | 记录产物修改历史 | P1 |

### Phase 3: 高级功能

| 任务 | 描述 | 优先级 |
|------|------|--------|
| ArtifactGallery | 产物画廊/列表视图 | P2 |
| 分享功能 | 生成分享链接 | P2 |
| PDF 渲染器 | 支持 PDF 预览 | P2 |
| 自定义渲染器 | 支持用户扩展 | P2 |
| 批量下载 | 打包下载所有产物 | P2 |

## 8. 使用场景

### 8.1 数据分析报告

```
用户: 分析这份销售数据并生成报告

Agent:
1. 读取数据文件
2. 执行数据分析
3. 调用 CreateArtifact:
   - type: "markdown"
   - title: "销售数据分析报告"
   - content: "# 销售分析报告\n\n## 概述\n..."
4. 调用 CreateArtifact:
   - type: "chart"
   - title: "月度销售趋势"
   - chartConfig: { ... ECharts 配置 }

前端显示:
┌──────────────────────────────────────┐
│ 📊 销售数据分析报告                    │
│ report.md · 5.2 KB          [>]     │
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│ 📈 月度销售趋势                        │
│ chart.json · 1.2 KB         [>]     │
└──────────────────────────────────────┘
```

### 8.2 代码生成

```
用户: 帮我写一个 Python 爬虫脚本

Agent:
1. 生成代码
2. 调用 CreateArtifact:
   - type: "code"
   - title: "网页爬虫脚本"
   - content: "import requests..."
   - language: "python"
   - filename: "crawler.py"

前端显示:
┌──────────────────────────────────────┐
│ 🐍 网页爬虫脚本                        │
│ crawler.py · 2.1 KB         [>]     │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ import requests                  │ │
│ │ from bs4 import BeautifulSoup    │ │
│ │ ...                              │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

### 8.3 HTML 页面生成

```
用户: 生成一个产品介绍页面

Agent:
1. 生成 HTML
2. 调用 CreateArtifact:
   - type: "html"
   - title: "产品介绍页面"
   - content: "<!DOCTYPE html>..."

前端显示:
┌──────────────────────────────────────┐
│ 🌐 产品介绍页面                        │
│ product-intro.html · 8.5 KB [>]     │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │      [HTML 实时预览]              │ │
│ │  ┌─────────────────────────────┐ │ │
│ │  │  产品名称                    │ │ │
│ │  │  ────────────────────────   │ │ │
│ │  │  产品描述文字...             │ │ │
│ │  └─────────────────────────────┘ │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

## 9. 安全考虑

### 9.1 HTML 渲染安全

- 使用 `sandbox` 属性的 iframe 渲染 HTML
- 禁用脚本执行（除非明确允许）
- 限制 iframe 功能：`sandbox="allow-same-origin"`

### 9.2 文件大小限制

- 单个 Artifact 最大：10 MB
- 会话总 Artifact：100 MB
- 超限时返回错误或截断

### 9.3 敏感信息处理

- 不在 Artifact 中存储 API 密钥
- 自动检测并警告敏感信息
- 支持下载时脱敏选项

## 10. 与现有功能的关系

### 10.1 与 Write 工具的区别

| 特性 | Write 工具 | CreateArtifact |
|------|-----------|----------------|
| 目的 | 写入文件系统 | 创建可预览产物 |
| 预览 | 需手动打开 | 即时预览 |
| 下载 | 需要 API 调用 | 一键下载 |
| 版本 | 不支持 | 支持版本历史 |
| UI | 简单卡片 | 丰富预览 |

### 10.2 何时使用哪个工具

- **Write**: 创建配置文件、脚本、需要在沙箱中使用的文件
- **CreateArtifact**: 创建需要展示给用户的报告、代码、图表等

### 10.3 工具协作

Agent 可以先用 Write 创建工作文件，最后用 CreateArtifact 输出最终产物：

```
1. Write: 创建 data.csv (中间数据)
2. Write: 创建 analysis.py (分析脚本)
3. Bash: 运行 python analysis.py
4. CreateArtifact: 输出 report.md (最终报告)
```

## 11. 未来扩展

### 11.1 实时协作

- 多用户同时查看同一 Artifact
- 实时更新通知

### 11.2 Artifact 链接

- Artifact 之间的引用关系
- 依赖图可视化

### 11.3 模板系统

- 预定义 Artifact 模板
- 支持自定义模板

### 11.4 导出集成

- 导出到 Google Docs
- 导出到 Notion
- 导出到 GitHub Gist

---

## 附录 A: 类型图标映射

| 类型 | 图标 | 颜色 |
|------|------|------|
| code | `<Code />` | 蓝色 |
| markdown | `<FileText />` | 绿色 |
| html | `<Globe />` | 橙色 |
| image | `<Image />` | 紫色 |
| svg | `<Shapes />` | 青色 |
| chart | `<BarChart />` | 红色 |
| csv | `<Table />` | 灰色 |
| json | `<Braces />` | 黄色 |
| pdf | `<FileType />` | 红色 |
| file | `<File />` | 灰色 |

## 附录 B: MIME 类型映射

```typescript
const MIME_TYPES: Record<ArtifactType, string> = {
  code: "text/plain",
  markdown: "text/markdown",
  html: "text/html",
  image: "image/png",
  svg: "image/svg+xml",
  chart: "application/json",
  csv: "text/csv",
  json: "application/json",
  pdf: "application/pdf",
  audio: "audio/mpeg",
  video: "video/mp4",
  file: "application/octet-stream",
};
```

## 附录 C: 相关文档

- [Write 工具 UI 文档](./WRITE_TOOL_UI.md)
- [审批流程文档](./APPROVAL_FLOW.md)
- [技术规格](../spec/TECHNICAL_SPEC.md)
- [API 参考](../spec/API_REFERENCE.md)
