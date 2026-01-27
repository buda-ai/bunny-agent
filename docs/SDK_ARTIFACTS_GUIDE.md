# Artifacts 功能使用指南

让 AI Agent 生成的文件、图表、报告等内容自动在你的应用中展示和管理。

## 什么是 Artifacts？

Artifacts（产物/工作成果）是 AI Agent 在执行任务时创建的**可视化内容**，比如：

- 📊 **数据分析报告** - Markdown 格式的分析结果
- 📈 **图表和可视化** - HTML/SVG 图表
- 📄 **生成的文档** - README、API 文档等
- 🎨 **网页预览** - HTML 页面
- 💻 **代码片段** - 可下载的代码文件
- 📋 **JSON 数据** - 结构化数据输出

Artifacts 功能让这些内容可以：
- ✅ **自动提取**并在 UI 中展示
- ✅ **实时更新**当 Agent 修改文件时
- ✅ **一键复制**到剪贴板
- ✅ **直接下载**为本地文件


## 快速开始

### 第一步：安装依赖

```bash
npm install @sandagent/sdk ai
```

### 第二步：在聊天页面中使用

最简单的方式是使用 `useSandAgentChat` hook，它已经内置了 artifacts 支持：

```tsx
"use client";

import { useSandAgentChat } from "@sandagent/sdk/react";
import { useState } from "react";

export default function ChatPage() {
  const [input, setInput] = useState("");
  
  // useSandAgentChat 自动处理 artifacts
  const {
    messages,
    isLoading,
    sendMessage,
    artifacts,              // 📦 所有的 artifacts
    selectedArtifact,       // 📄 当前选中的 artifact
    setSelectedArtifact,    // 🔄 切换选中的 artifact
  } = useSandAgentChat({
    apiEndpoint: "/api/ai",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input);
    setInput("");
  };

  return (
    <div className="flex h-screen">
      {/* 左侧：聊天区 */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={msg.role === "user" ? "text-right" : ""}>
              <div className={`inline-block p-3 rounded-lg ${
                msg.role === "user" ? "bg-blue-500 text-white" : "bg-gray-100"
              }`}>
                {msg.parts.map((part, i) => 
                  part.type === "text" && <span key={i}>{part.text}</span>
                )}
              </div>
            </div>
          ))}
          {isLoading && <div className="text-gray-500">思考中...</div>}
        </div>

        <form onSubmit={handleSubmit} className="p-4 border-t flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="试试：分析这个 CSV 文件并生成报告"
            className="flex-1 px-4 py-2 border rounded-lg"
          />
          <button 
            type="submit" 
            disabled={isLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg"
          >
            发送
          </button>
        </form>
      </div>

      {/* 右侧：Artifacts 面板 */}
      {artifacts.length > 0 && (
        <div className="w-96 border-l bg-white flex flex-col">
          {/* Artifacts 标签页 */}
          <div className="border-b p-2 flex gap-1 overflow-x-auto">
            {artifacts.map((artifact) => (
              <button
                key={artifact.artifactId}
                onClick={() => setSelectedArtifact(artifact)}
                className={`px-3 py-1 rounded text-sm whitespace-nowrap ${
                  selectedArtifact?.artifactId === artifact.artifactId
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 hover:bg-gray-200"
                }`}
              >
                {artifact.artifactId.split("/").pop()}
              </button>
            ))}
          </div>

          {/* Artifact 内容展示 */}
          {selectedArtifact && (
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-sm bg-gray-50 p-4 rounded">
                {selectedArtifact.content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

就这么简单！现在当你问 AI：

> "帮我分析这个数据并生成一份 Markdown 报告"

AI 生成的报告会自动出现在右侧面板！

---

## 高级用法

### 独立使用 `useArtifacts`

如果你已经有自己的聊天实现，可以单独使用 `useArtifacts` hook：

```tsx
import { useArtifacts } from "@sandagent/sdk/react";

function MyArtifactPanel({ messages }) {
  const {
    artifacts,
    selectedArtifact,
    setSelectedArtifact,
    hasArtifacts,
    copyContent,
    downloadArtifact,
  } = useArtifacts({ messages });

  if (!hasArtifacts) {
    return <div>暂无生成内容</div>;
  }

  return (
    <div>
      {/* Artifact 列表 */}
      <div className="flex gap-2 p-2 border-b">
        {artifacts.map((artifact) => (
          <button
            key={artifact.artifactId}
            onClick={() => setSelectedArtifact(artifact)}
          >
            {artifact.artifactId}
          </button>
        ))}
      </div>

      {/* Artifact 内容 */}
      {selectedArtifact && (
        <div>
          <div className="flex gap-2 p-2 border-b">
            <button onClick={() => copyContent(selectedArtifact)}>
              📋 复制
            </button>
            <button onClick={() => downloadArtifact(selectedArtifact)}>
              ⬇️ 下载
            </button>
          </div>

          <div className="p-4">
            <pre>{selectedArtifact.content}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
```

### 添加复制和下载功能

```tsx
import { useSandAgentChat } from "@sandagent/sdk/react";
import { useState } from "react";

export default function ChatWithArtifacts() {
  const {
    messages,
    sendMessage,
    artifacts,
    selectedArtifact,
    setSelectedArtifact,
  } = useSandAgentChat({ apiEndpoint: "/api/ai" });

  const [copied, setCopied] = useState(false);

  // 复制到剪贴板
  const handleCopy = async () => {
    if (!selectedArtifact) return;
    await navigator.clipboard.writeText(selectedArtifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 下载文件
  const handleDownload = () => {
    if (!selectedArtifact) return;
    
    const blob = new Blob([selectedArtifact.content], {
      type: selectedArtifact.mimeType,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = selectedArtifact.artifactId.split("/").pop() || "download.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* 聊天区域 */}
      {/* ... */}

      {/* Artifact 操作栏 */}
      {selectedArtifact && (
        <div className="flex gap-2 p-2 border-t">
          <button
            onClick={handleCopy}
            className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
          >
            {copied ? "✓ 已复制" : "📋 复制"}
          </button>
          <button
            onClick={handleDownload}
            className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
          >
            ⬇️ 下载
          </button>
        </div>
      )}
    </div>
  );
}
```

### Markdown 内容渲染

对于 Markdown 类型的 artifacts，可以使用渲染器美化显示：

```tsx
import { useSandAgentChat } from "@sandagent/sdk/react";
import ReactMarkdown from "react-markdown";

export default function ChatPage() {
  const { messages, sendMessage, artifacts, selectedArtifact } = 
    useSandAgentChat({ apiEndpoint: "/api/ai" });

  return (
    <div className="flex h-screen">
      {/* 聊天区 */}
      <div className="flex-1">
        {/* ... */}
      </div>

      {/* Artifacts 面板 */}
      {selectedArtifact && (
        <div className="w-1/2 border-l p-4 overflow-auto">
          {selectedArtifact.mimeType === "text/markdown" ? (
            // Markdown 渲染
            <div className="prose max-w-none">
              <ReactMarkdown>{selectedArtifact.content}</ReactMarkdown>
            </div>
          ) : (
            // 其他格式
            <pre className="bg-gray-50 p-4 rounded">
              {selectedArtifact.content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
```

### HTML 内容预览

对于 HTML 类型的 artifacts（如图表、网页），可以使用 iframe：

```tsx
import { useSandAgentChat } from "@sandagent/sdk/react";

export default function ChatPage() {
  const { messages, sendMessage, selectedArtifact } = 
    useSandAgentChat({ apiEndpoint: "/api/ai" });

  return (
    <div className="flex h-screen">
      <div className="flex-1">{/* 聊天区 */}</div>

      {selectedArtifact && (
        <div className="w-1/2 border-l">
          {selectedArtifact.mimeType === "text/html" ? (
            // HTML 预览
            <iframe
              srcDoc={selectedArtifact.content}
              className="w-full h-full border-0"
              sandbox="allow-scripts"
              title={selectedArtifact.artifactId}
            />
          ) : (
            // 其他格式
            <pre className="p-4">{selectedArtifact.content}</pre>
          )}
        </div>
      )}
    </div>
  );
}
```

### 根据文件类型自动选择渲染方式

```tsx
import { useSandAgentChat } from "@sandagent/sdk/react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";

function ArtifactViewer({ artifact }) {
  const { mimeType, content, artifactId } = artifact;

  // Markdown
  if (mimeType === "text/markdown") {
    return (
      <div className="prose max-w-none p-4">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    );
  }

  // HTML
  if (mimeType === "text/html") {
    return (
      <iframe
        srcDoc={content}
        className="w-full h-full border-0"
        sandbox="allow-scripts"
        title={artifactId}
      />
    );
  }

  // 代码文件
  if (
    mimeType.includes("javascript") ||
    mimeType.includes("typescript") ||
    mimeType.includes("python") ||
    mimeType.includes("json")
  ) {
    const language = mimeType.includes("javascript")
      ? "javascript"
      : mimeType.includes("typescript")
      ? "typescript"
      : mimeType.includes("python")
      ? "python"
      : "json";

    return (
      <SyntaxHighlighter language={language}>
        {content}
      </SyntaxHighlighter>
    );
  }

  // 默认：纯文本
  return (
    <pre className="p-4 bg-gray-50 rounded overflow-auto">
      {content}
    </pre>
  );
}

export default function ChatPage() {
  const { messages, sendMessage, selectedArtifact } = 
    useSandAgentChat({ apiEndpoint: "/api/ai" });

  return (
    <div className="flex h-screen">
      <div className="flex-1">{/* 聊天区 */}</div>

      {selectedArtifact && (
        <div className="w-1/2 border-l overflow-auto">
          <ArtifactViewer artifact={selectedArtifact} />
        </div>
      )}
    </div>
  );
}
```

---

## 后端配置：启用 Artifacts

要让 AI Agent 生成 artifacts，需要在后端 API 配置 artifact processor：

```typescript
// app/api/ai/route.ts
import { createSandAgent, LocalSandbox } from "@sandagent/sdk";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from "ai";

export async function POST(request: Request) {
  const { messages, sessionId } = await request.json();

  const sandbox = new LocalSandbox({
    baseDir: process.cwd(),
    isolate: true,
    runnerCommand: ["npx", "-y", "@sandagent/runner-cli@latest", "run"],
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    },
  });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const sandagent = createSandAgent({
        sandbox,
        cwd: sandbox.getWorkdir?.(),
        // ✨ 启用 artifacts
        artifactProcessor: {
          enabled: true,
          sessionId: sessionId || "default",
        },
      });

      const result = streamText({
        model: sandagent("claude-sonnet-4-20250514"),
        messages: await convertToModelMessages(messages),
        abortSignal: request.signal,
      });

      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}
```

### Artifact 工作原理

1. **Agent 创建清单文件**  
   AI Agent 在工作目录中创建 `tasks/{sessionId}/artifact.json`：
   
   ```json
   {
     "artifacts": [
       {
         "id": "analysis-report",
         "path": "tasks/session-123/report.md",
         "mimeType": "text/markdown",
         "description": "数据分析报告"
       }
     ]
   }
   ```

2. **自动监听和读取**  
   ArtifactProcessor 监听这个文件的变化，自动读取文件内容

3. **实时推送到前端**  
   文件内容通过 AI SDK 的 stream 协议推送到前端

4. **前端自动提取**  
   `useArtifacts` / `useSandAgentChat` 自动从消息流中提取 artifacts

---

## 为 Agent 添加 Artifact Skill

### 为什么需要 Artifact Skill？

Artifact Skill 让 AI Agent 知道如何正确创建和管理 artifacts。它提供了：

- ✅ **标准化流程** - 告诉 Agent 如何创建 `artifact.json` 和组织文件
- ✅ **Session ID 管理** - 自动处理会话隔离
- ✅ **最佳实践** - 文件路径、MIME 类型等规范

### 在你的 Template 中添加 Artifact Skill

如果你在使用自定义 template，需要添加 artifact skill：

#### 1. 创建 Skill 文件

在你的 template 目录下创建 `.claude/skills/artifact/SKILL.md`：

```
your-template/
├── CLAUDE.md
└── .claude/
    └── skills/
        └── artifact/
            └── SKILL.md
```

#### 2. Skill 文件内容

```markdown
---
name: artifact
description: Create and manage artifact.json for task outputs. Use when creating reports, charts, or any files that should be displayed in the UI.
---

# Artifact Management Skill

Use this skill to create and manage artifacts that will be displayed in the user interface.

## Session Information

- **Current Session ID**: `${CLAUDE_SESSION_ID}`
- **Artifact Path**: `tasks/${CLAUDE_SESSION_ID}/artifact.json`

> Note: `${CLAUDE_SESSION_ID}` is automatically provided by Claude Code as a built-in variable.

## Creating Artifacts

### Step 1: Create Task Directory

```bash
mkdir -p "tasks/${CLAUDE_SESSION_ID}"
```

### Step 2: Create Your Output File

```bash
# Example: Create a report file
cat > "tasks/${CLAUDE_SESSION_ID}/report.md" << 'EOF'
# Your Report Title

Your content here...
EOF
```

### Step 3: Register in artifact.json

```bash
cat > "tasks/${CLAUDE_SESSION_ID}/artifact.json" << 'EOF'
{
  "artifacts": [
    {
      "id": "report",
      "path": "tasks/${CLAUDE_SESSION_ID}/report.md",
      "mimeType": "text/markdown",
      "description": "Analysis report"
    }
  ]
}
EOF
```

## Adding More Artifacts

To add multiple artifacts, update the array in `artifact.json`:

```json
{
  "artifacts": [
    {
      "id": "report",
      "path": "tasks/${CLAUDE_SESSION_ID}/report.md",
      "mimeType": "text/markdown",
      "description": "Main report"
    },
    {
      "id": "data",
      "path": "tasks/${CLAUDE_SESSION_ID}/data.json",
      "mimeType": "application/json",
      "description": "Raw data"
    },
    {
      "id": "chart",
      "path": "tasks/${CLAUDE_SESSION_ID}/chart.html",
      "mimeType": "text/html",
      "description": "Visualization"
    }
  ]
}
```

## Supported MIME Types

| MIME Type | File Type | Example |
|-----------|-----------|---------|
| `text/markdown` | Markdown | `.md` files |
| `text/html` | HTML | `.html` files |
| `application/json` | JSON | `.json` files |
| `text/plain` | Plain Text | `.txt` files |
| `text/javascript` | JavaScript | `.js` files |
| `text/css` | CSS | `.css` files |
| `application/pdf` | PDF | `.pdf` files |

## Important Notes

- Always use `${CLAUDE_SESSION_ID}` for the task directory
- The `artifact.json` file MUST be at `tasks/${CLAUDE_SESSION_ID}/artifact.json`
- Artifact files can be anywhere, but recommended to keep them organized under `tasks/${CLAUDE_SESSION_ID}/`
- Update `artifact.json` whenever you create a new artifact file
- Use meaningful IDs like `sales-report` instead of `file-1`
```

#### 3. 在 CLAUDE.md 中引用

在你的 template 的 `CLAUDE.md` 中提及这个 skill：

```markdown
# Your Custom Agent

You are an AI assistant that helps users with [your use case].

## Creating Output Files

When you generate reports, charts, or any files that users should see:
1. Use the `artifact` skill to properly register your output files
2. Create files in the task directory with meaningful names
3. Update `artifact.json` to make them visible in the UI

## Available Skills

- `artifact` - For managing output files and making them visible in the UI
```

### 预置 Template 已包含 Artifact Skill

以下 template 已经包含了 artifact skill，可以直接使用：

- ✅ `researcher` - 研究助手 template
- ✅ `analyst` - 数据分析 template

使用这些 template 时，AI 会自动知道如何创建 artifacts：

```typescript
const sandagent = createSandAgent({
  sandbox,
  template: "researcher", // 已包含 artifact skill
  artifactProcessor: {
    enabled: true,
    sessionId,
  },
});
```

### Skill 中的关键点

#### `${CLAUDE_SESSION_ID}` 是内置变量

```bash
# 在 skill 文件中直接使用，Claude Code 会自动替换
mkdir -p "tasks/${CLAUDE_SESSION_ID}"

# Agent 执行时会变成：
mkdir -p "tasks/abc-123-xyz"
```

**重要**：
- ✅ `${CLAUDE_SESSION_ID}` 会被 Claude Code 自动替换，无需任何代码处理
- ✅ 只有 `artifact.json` 的路径必须是 `tasks/${CLAUDE_SESSION_ID}/artifact.json`
- ✅ Artifact 文件本身可以放在任何位置

#### 完整示例

假设 Session ID 是 `abc-123`，Agent 创建一个数据分析报告：

```bash
# 1. 创建目录
mkdir -p "tasks/abc-123/reports"

# 2. 创建报告文件
cat > "tasks/abc-123/reports/analysis.md" << 'EOF'
# 数据分析报告

## 概述
...

## 关键发现
...
EOF

# 3. 创建 artifact.json（必须在此路径）
cat > "tasks/abc-123/artifact.json" << 'EOF'
{
  "artifacts": [
    {
      "id": "data-analysis-report",
      "path": "tasks/abc-123/reports/analysis.md",
      "mimeType": "text/markdown",
      "description": "数据分析报告"
    }
  ]
}
EOF
```

### 在 Python/JavaScript 工具中使用

如果 Agent 通过脚本创建 artifacts，可以从环境变量获取 Session ID：

**Python 示例：**

```python
import os
import json

# Claude Code 执行工具时会自动设置 CLAUDE_SESSION_ID 环境变量
session_id = os.environ.get("CLAUDE_SESSION_ID", "default")

# 创建目录和文件
os.makedirs(f"tasks/{session_id}/reports", exist_ok=True)

with open(f"tasks/{session_id}/reports/analysis.md", "w") as f:
    f.write("# Analysis Report\n\nYour analysis here...")

# 创建 manifest
manifest = {
    "artifacts": [
        {
            "id": "analysis",
            "path": f"tasks/{session_id}/reports/analysis.md",
            "mimeType": "text/markdown",
            "description": "Analysis Report"
        }
    ]
}

with open(f"tasks/{session_id}/artifact.json", "w") as f:
    json.dump(manifest, f, indent=2)
```

**JavaScript/Node.js 示例：**

```javascript
const fs = require('fs');
const path = require('path');

// 获取 Session ID
const sessionId = process.env.CLAUDE_SESSION_ID || 'default';

// 创建目录
const taskDir = `tasks/${sessionId}/reports`;
fs.mkdirSync(taskDir, { recursive: true });

// 创建报告文件
fs.writeFileSync(
  path.join(taskDir, 'analysis.md'),
  '# Analysis Report\n\nYour analysis here...'
);

// 创建 manifest
const manifest = {
  artifacts: [
    {
      id: 'analysis',
      path: `tasks/${sessionId}/reports/analysis.md`,
      mimeType: 'text/markdown',
      description: 'Analysis Report'
    }
  ]
};

fs.writeFileSync(
  `tasks/${sessionId}/artifact.json`,
  JSON.stringify(manifest, null, 2)
);
```

---

## 实战示例

### 示例 1：数据分析仪表盘

```tsx
"use client";

import { useSandAgentChat } from "@sandagent/sdk/react";
import ReactMarkdown from "react-markdown";

export default function DataAnalysisDashboard() {
  const {
    messages,
    sendMessage,
    isLoading,
    artifacts,
    selectedArtifact,
    setSelectedArtifact,
  } = useSandAgentChat({ apiEndpoint: "/api/ai" });

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 左侧：操作区 */}
      <div className="w-96 bg-white border-r flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-xl font-bold">数据分析助手</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`p-3 rounded-lg ${
                msg.role === "user"
                  ? "bg-blue-500 text-white ml-8"
                  : "bg-gray-100 mr-8"
              }`}
            >
              {msg.parts.map((part, i) =>
                part.type === "text" ? <div key={i}>{part.text}</div> : null
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 text-gray-500">
              <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
              分析中...
            </div>
          )}
        </div>

        <div className="p-4 border-t">
          <button
            onClick={() => sendMessage("分析用户行为数据，生成报告")}
            disabled={isLoading}
            className="w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            开始分析
          </button>
        </div>
      </div>

      {/* 右侧：报告展示区 */}
      <div className="flex-1 flex flex-col">
        {artifacts.length > 0 ? (
          <>
            {/* 标签页 */}
            <div className="bg-white border-b p-2 flex gap-2">
              {artifacts.map((artifact) => (
                <button
                  key={artifact.artifactId}
                  onClick={() => setSelectedArtifact(artifact)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    selectedArtifact?.artifactId === artifact.artifactId
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 hover:bg-gray-200"
                  }`}
                >
                  📊 {artifact.artifactId.split("/").pop()}
                </button>
              ))}
            </div>

            {/* 内容区 */}
            <div className="flex-1 overflow-auto bg-white p-8">
              {selectedArtifact && (
                <div className="prose max-w-none">
                  <ReactMarkdown>{selectedArtifact.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-6xl mb-4">📊</div>
              <div>点击"开始分析"生成报告</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

### 示例 2：代码生成器

```tsx
"use client";

import { useSandAgentChat } from "@sandagent/sdk/react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

export default function CodeGenerator() {
  const {
    messages,
    sendMessage,
    isLoading,
    artifacts,
    selectedArtifact,
    setSelectedArtifact,
  } = useSandAgentChat({ apiEndpoint: "/api/ai" });

  const [copied, setCopied] = React.useState(false);

  const copyCode = async () => {
    if (!selectedArtifact) return;
    await navigator.clipboard.writeText(selectedArtifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadCode = () => {
    if (!selectedArtifact) return;
    const blob = new Blob([selectedArtifact.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = selectedArtifact.artifactId.split("/").pop() || "code.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-screen">
      {/* 左侧：聊天 */}
      <div className="w-96 border-r flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={msg.role === "user" ? "text-right" : ""}
            >
              <div
                className={`inline-block p-3 rounded-lg ${
                  msg.role === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100"
                }`}
              >
                {msg.parts.map((part, i) =>
                  part.type === "text" ? <span key={i}>{part.text}</span> : null
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t">
          <button
            onClick={() =>
              sendMessage("创建一个 React 组件，显示用户卡片")
            }
            disabled={isLoading}
            className="w-full py-2 bg-blue-500 text-white rounded"
          >
            生成组件
          </button>
        </div>
      </div>

      {/* 右侧：代码预览 */}
      <div className="flex-1 flex flex-col">
        {selectedArtifact ? (
          <>
            {/* 工具栏 */}
            <div className="flex items-center justify-between p-4 border-b bg-gray-800 text-white">
              <div className="flex gap-2">
                {artifacts.map((artifact) => (
                  <button
                    key={artifact.artifactId}
                    onClick={() => setSelectedArtifact(artifact)}
                    className={`px-3 py-1 rounded ${
                      selectedArtifact.artifactId === artifact.artifactId
                        ? "bg-blue-600"
                        : "bg-gray-700 hover:bg-gray-600"
                    }`}
                  >
                    {artifact.artifactId.split("/").pop()}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={copyCode}
                  className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600"
                >
                  {copied ? "✓ 已复制" : "📋 复制"}
                </button>
                <button
                  onClick={downloadCode}
                  className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600"
                >
                  ⬇️ 下载
                </button>
              </div>
            </div>

            {/* 代码展示 */}
            <div className="flex-1 overflow-auto">
              <SyntaxHighlighter
                language="typescript"
                style={vscDarkPlus}
                customStyle={{ margin: 0, height: "100%" }}
              >
                {selectedArtifact.content}
              </SyntaxHighlighter>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            生成代码后将在这里显示
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## API 参考

### `useArtifacts`

从消息中提取和管理 artifacts。

```typescript
interface UseArtifactsOptions {
  messages: UIMessage[];
}

interface UseArtifactsReturn {
  artifacts: ArtifactData[];
  selectedArtifact: ArtifactData | null;
  setSelectedArtifact: (artifact: ArtifactData | null) => void;
  selectArtifactById: (artifactId: string) => void;
  hasArtifacts: boolean;
  count: number;
  copyContent: (artifact: ArtifactData) => Promise<void>;
  downloadArtifact: (artifact: ArtifactData) => void;
  getFileExtension: (mimeType: string) => string;
}
```

### `ArtifactData`

Artifact 数据结构。

```typescript
interface ArtifactData {
  artifactId: string;    // 唯一标识符
  content: string;       // 文件内容
  mimeType: string;      // MIME 类型
}
```

### 支持的 MIME 类型

| MIME Type | 文件类型 | 推荐渲染方式 |
|-----------|---------|------------|
| `text/markdown` | Markdown | ReactMarkdown |
| `text/html` | HTML | iframe |
| `text/plain` | 纯文本 | `<pre>` |
| `text/javascript` | JavaScript | 代码高亮 |
| `text/typescript` | TypeScript | 代码高亮 |
| `application/json` | JSON | 代码高亮 |
| `text/css` | CSS | 代码高亮 |
| `image/png` | PNG 图片 | `<img>` |
| `image/svg+xml` | SVG | `<img>` 或内联 |

---

## 常见问题

### Q: Artifacts 不显示？

**检查清单：**

1. ✅ 后端 API 是否启用了 `artifactProcessor`？
   ```typescript
   const sandagent = createSandAgent({
     sandbox,
     artifactProcessor: {
       enabled: true,
       sessionId: "your-session-id",
     },
   });
   ```

2. ✅ 是否使用了正确的 hook？
   ```typescript
   // 方式 1：使用内置 artifacts 的 useSandAgentChat
   const { artifacts } = useSandAgentChat({ apiEndpoint: "/api/ai" });
   
   // 方式 2：单独使用 useArtifacts
   const { artifacts } = useArtifacts({ messages });
   ```

3. ✅ AI 是否被引导生成了 artifacts？
   - 检查 template 是否包含 artifact skill
   - 或在 CLAUDE.md 中说明如何创建 artifacts

4. ✅ 检查 `artifact.json` 文件是否正确创建？
   - 路径必须是 `tasks/{sessionId}/artifact.json`
   - JSON 格式是否正确
   - 文件路径是否正确

### Q: 如何让 AI 自动创建 artifacts？

**方式 1：使用包含 artifact skill 的 template**

```typescript
// 使用预置的 researcher 或 analyst template
const sandagent = createSandAgent({
  sandbox,
  template: "researcher", // 已包含 artifact skill
  artifactProcessor: {
    enabled: true,
    sessionId,
  },
});
```

**方式 2：在自定义 template 中添加 artifact skill**

在你的 template 中创建 `.claude/skills/artifact/SKILL.md`（参考上面的"为 Agent 添加 Artifact Skill"部分）

**方式 3：在提示词中明确说明**

```typescript
sendMessage(
  "分析这个数据并生成一份 Markdown 报告。" +
  "请将报告保存到 tasks/{sessionId}/ 目录，" +
  "并在 artifact.json 中注册，这样我就能在界面中看到它。"
);
```

### Q: 如何自定义 artifact 清单文件路径？

默认路径是 `tasks/{sessionId}/artifact.json`，这是 SandAgent 的约定。`artifact.json` 文件**必须**在这个位置，但 artifact 文件本身可以放在任何位置：

```json
{
  "artifacts": [
    {
      "id": "report",
      "path": "任意路径/report.md",  // 可以是任何路径
      "mimeType": "text/markdown"
    }
  ]
}
```

### Q: 可以同时显示多个 artifacts 吗？

可以！你可以使用分屏布局：

```tsx
<div className="grid grid-cols-2 gap-4">
  {artifacts.map((artifact) => (
    <div key={artifact.artifactId} className="border rounded p-4">
      <h3>{artifact.artifactId}</h3>
      <pre>{artifact.content}</pre>
    </div>
  ))}
</div>
```

或使用标签页切换（推荐）：

```tsx
const { artifacts, selectedArtifact, setSelectedArtifact } = useSandAgentChat({
  apiEndpoint: "/api/ai"
});

return (
  <div>
    {/* 标签页 */}
    <div className="flex gap-2">
      {artifacts.map((artifact) => (
        <button
          key={artifact.artifactId}
          onClick={() => setSelectedArtifact(artifact)}
        >
          {artifact.artifactId}
        </button>
      ))}
    </div>
    
    {/* 当前选中的内容 */}
    {selectedArtifact && (
      <div>{selectedArtifact.content}</div>
    )}
  </div>
);
```

### Q: 如何为不同类型的 artifacts 使用不同的图标？

```tsx
function getArtifactIcon(mimeType: string) {
  if (mimeType === "text/markdown") return "📄";
  if (mimeType === "text/html") return "🌐";
  if (mimeType.includes("image")) return "🖼️";
  if (mimeType.includes("json")) return "📊";
  if (mimeType.includes("javascript")) return "💻";
  if (mimeType.includes("python")) return "🐍";
  return "📁";
}

// 使用
{artifacts.map((artifact) => (
  <button key={artifact.artifactId}>
    {getArtifactIcon(artifact.mimeType)} {artifact.artifactId}
  </button>
))}
```

### Q: Session ID 是如何传递给 Agent 的？

**在 Skill 文件中（推荐）：**

```markdown
# 在 .claude/skills/artifact/SKILL.md 中
使用 `${CLAUDE_SESSION_ID}` 变量，Claude Code 会自动替换
```

**在工具（Bash/Python 脚本）中：**

```bash
# Bash
echo $CLAUDE_SESSION_ID

# Python
import os
session_id = os.environ.get("CLAUDE_SESSION_ID")

# Node.js
const sessionId = process.env.CLAUDE_SESSION_ID;
```

**在后端 API 中：**

```typescript
const { sessionId } = await request.json();

const sandagent = createSandAgent({
  sandbox,
  artifactProcessor: {
    enabled: true,
    sessionId, // 传递给 processor
  },
});
```

---

## 最佳实践

### 1. 使用 Artifact Skill（强烈推荐）

为你的 template 添加 artifact skill，让 AI 自动知道如何创建 artifacts：

```
your-template/
├── CLAUDE.md
└── .claude/
    └── skills/
        └── artifact/
            └── SKILL.md
```

这样做的好处：
- ✅ AI 自动知道如何组织文件
- ✅ 统一的文件路径和命名规范
- ✅ 减少用户提示词的复杂度
- ✅ 更稳定和可预测的行为

**或者使用预置的 template：**

```typescript
// 这些 template 已包含 artifact skill
const sandagent = createSandAgent({
  sandbox,
  template: "researcher", // 或 "analyst"
  artifactProcessor: { enabled: true, sessionId },
});
```

### 2. 提供清晰的提示词

即使有 skill，清晰的提示词也能帮助 AI 更好地理解需求：

```typescript
sendMessage(
  "分析这个 CSV 文件，生成包含以下内容的报告：\n" +
  "1. 数据概览\n" +
  "2. 关键趋势\n" +
  "3. 可视化图表\n" +
  "请将报告保存为 Markdown 格式的 artifact。"
);
```

### 3. 在 CLAUDE.md 中说明 artifacts

在你的 template 的 `CLAUDE.md` 中明确说明：

```markdown
# 数据分析师

你是一个专业的数据分析师。

## 生成报告

当用户要求分析数据时：
1. 执行数据分析
2. 创建 Markdown 格式的报告
3. 使用 `artifact` skill 将报告注册为 artifact
4. 报告应包含：
   - 数据概览
   - 关键发现
   - 可视化图表（如需要）
   - 结论和建议

## 可用技能

- `artifact` - 用于创建和管理输出文件
```

### 4. 使用语义化的 artifact ID

使用有意义的 ID，而不是通用的名称：

```json
// ✅ 好的命名
{
  "artifacts": [
    {
      "id": "sales-analysis-2024-q1",
      "path": "tasks/abc/sales-report.md"
    }
  ]
}

// ❌ 避免通用命名
{
  "artifacts": [
    {
      "id": "report-1",
      "path": "tasks/abc/file.md"
    }
  ]
}
```

### 5. 实时更新提示

给用户及时的反馈：

```tsx
const { artifacts, isLoading } = useSandAgentChat({ apiEndpoint: "/api/ai" });

return (
  <div>
    {isLoading && artifacts.length === 0 && (
      <div className="animate-pulse">
        <div className="flex items-center gap-2">
          <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
          <span>正在生成内容...</span>
        </div>
      </div>
    )}
    
    {artifacts.length > 0 && (
      <div className="text-green-600 flex items-center gap-2">
        <span>✓</span>
        <span>已生成 {artifacts.length} 个文件</span>
      </div>
    )}
  </div>
);
```

### 6. 正确设置 MIME 类型

帮助前端选择正确的渲染方式：

```json
{
  "artifacts": [
    {
      "id": "report",
      "path": "tasks/abc/report.md",
      "mimeType": "text/markdown"  // ← 明确指定
    },
    {
      "id": "chart",
      "path": "tasks/abc/chart.html",
      "mimeType": "text/html"  // ← 用于 HTML 预览
    }
  ]
}
```

### 7. 合理组织文件结构

推荐的目录结构：

```
tasks/{sessionId}/
├── artifact.json          # 清单文件（必需）
├── reports/              # 报告文件
│   └── analysis.md
├── charts/               # 图表文件
│   └── trend.html
└── data/                 # 数据文件
    └── results.json
```

### 8. 增量更新 artifact.json

当需要添加新文件时，读取现有的 `artifact.json` 并追加：

```bash
# 读取现有内容
CURRENT=$(cat "tasks/${CLAUDE_SESSION_ID}/artifact.json")

# 追加新条目（使用 jq 或手动编辑）
cat > "tasks/${CLAUDE_SESSION_ID}/artifact.json" << 'EOF'
{
  "artifacts": [
    ...existing entries...,
    {
      "id": "new-file",
      "path": "tasks/${CLAUDE_SESSION_ID}/new.md",
      "mimeType": "text/markdown"
    }
  ]
}
EOF
```

### 9. 错误处理和降级

如果 artifact 功能失败，确保不影响核心功能：

```typescript
try {
  const sandagent = createSandAgent({
    sandbox,
    artifactProcessor: {
      enabled: true,
      sessionId,
    },
  });
  // ... 正常流程
} catch (error) {
  console.error("Artifact processor failed:", error);
  // 降级：不使用 artifact processor
  const sandagent = createSandAgent({ sandbox });
}
```

### 10. 优化大文件处理

对于大型 artifacts，考虑分页或截断：

```tsx
function ArtifactViewer({ artifact }) {
  const [showFull, setShowFull] = useState(false);
  const isLarge = artifact.content.length > 10000;
  
  const displayContent = isLarge && !showFull
    ? artifact.content.slice(0, 10000) + "\n\n..."
    : artifact.content;

  return (
    <div>
      <pre>{displayContent}</pre>
      {isLarge && (
        <button onClick={() => setShowFull(!showFull)}>
          {showFull ? "收起" : "显示全部"}
        </button>
      )}
    </div>
  );
}
```

---

## 下一步

- **[SDK 快速开始](./SDK_QUICK_START.md)** - 完整的 SDK 集成指南
- **[SDK 开发指南](./SDK_DEVELOPMENT_GUIDE.md)** - 深入的开发文档
- **[示例项目](../apps/sandagent-example/)** - 查看完整的实现

---

<div align="center">
  <p>让 AI 的创造力可视化 🎨</p>
  <p><strong>SandAgent - 把 AI 生成的内容变成你的产品特色</strong></p>
</div>
