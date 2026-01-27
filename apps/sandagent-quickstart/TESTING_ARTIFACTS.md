# 测试 Artifact 功能

## 功能说明

这个项目已经配置了完整的 artifact 功能，可以让 AI 生成的文档、报告等内容自动显示在右侧面板。

## 项目结构

```
apps/sandagent-quickstart/
├── .claude/
│   └── skills/
│       └── artifact/
│           └── SKILL.md          ← Artifact skill 定义
├── lib/
│   └── artifact-processor.ts    ← Artifact 处理器
├── app/
│   ├── api/ai/route.ts          ← 后端 API（启用 artifact processor）
│   └── page.tsx                 ← 前端 UI（artifacts 显示面板）
└── CLAUDE.md                     ← Agent 配置（提及 artifact skill）
```

## 测试步骤

### 1. 启动项目

```bash
cd apps/sandagent-quickstart
pnpm install
pnpm dev
```

### 2. 配置环境变量

创建 `.env.local` 文件：

```bash
ANTHROPIC_API_KEY=your_api_key_here
```

### 3. 测试提示词

打开 http://localhost:3000，尝试以下提示词：

#### 测试 1: 创建简单报告

```
Create a markdown report about data analysis best practices. 
Include sections on data cleaning, exploratory analysis, and visualization.
```

**预期结果：**
- AI 会创建一个 Markdown 文件
- 右侧面板自动显示报告内容
- 可以复制和下载报告

#### 测试 2: 创建多个文档

```
Create project documentation with these files:
1. README.md - project overview
2. ARCHITECTURE.md - system design
3. API.md - API documentation

Register all files as artifacts so I can view them.
```

**预期结果：**
- 创建 3 个文档
- 右侧面板显示 3 个标签页
- 可以切换查看不同文档

#### 测试 3: 数据分析报告

```
Analyze this sales data and create a comprehensive report:
- Q1: $100k
- Q2: $150k
- Q3: $200k
- Q4: $180k

Include trends, insights, and recommendations.
```

**预期结果：**
- AI 分析数据并生成报告
- 报告包含分析和建议
- 自动显示在 artifacts 面板

#### 测试 4: JSON 数据输出

```
Create a JSON file with sample user data (5 users with id, name, email, role).
Save it as an artifact.
```

**预期结果：**
- 创建 JSON 文件
- 在 artifacts 面板中显示为代码块
- 可以下载 JSON 文件

## Artifact 工作原理

### 1. AI 使用 Artifact Skill

AI 读取 `.claude/skills/artifact/SKILL.md`，学习如何创建 artifacts：

```bash
# 1. 创建任务目录
mkdir -p "tasks/${CLAUDE_SESSION_ID}"

# 2. 创建文件
cat > "tasks/${CLAUDE_SESSION_ID}/report.md" << 'EOF'
# My Report
...
EOF

# 3. 注册到 artifact.json
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

### 2. 后端自动处理

`TaskDrivenArtifactProcessor` 监听文件变化：

```typescript
// 当检测到 artifact.json 被写入
onChange(part: LanguageModelV3StreamPart, sessionId: string) {
  // 1. 读取 artifact.json
  // 2. 读取每个 artifact 文件内容
  // 3. 通过 writer 推送到前端
  writer.write({
    type: "data-artifact",
    id: artifactId,
    data: { artifactId, content, mimeType },
  });
}
```

### 3. 前端实时显示

前端使用 `useSandAgentChat` hook 自动处理 artifacts：

```typescript
const { artifacts, selectedArtifact, setSelectedArtifact } = useSandAgentChat({
  apiEndpoint: "/api/ai",
});
```

## UI 功能

### Artifacts 面板（右侧）

- **标签页** - 显示所有 artifacts，点击切换
- **工具栏** - 显示文件名、MIME 类型
- **复制按钮** - 一键复制内容到剪贴板
- **下载按钮** - 下载为本地文件
- **智能渲染**:
  - `text/markdown` - Markdown 渲染
  - `text/html` - iframe 预览
  - `application/json` - 代码格式化显示
  - 其他 - 纯文本显示

### 聊天区域（左侧）

- 显示对话历史
- Session ID 显示在 header
- 输入框和发送按钮
- 加载状态提示

## 调试技巧

### 1. 查看控制台日志

打开浏览器开发者工具，查看：

```
[API] Session ID: xxx
[ArtifactProcessor] Manifest loaded: {...}
[ArtifactProcessor] Artifact written: report
```

### 2. 检查文件系统

查看 `workspace/tasks/{sessionId}/` 目录：

```bash
ls -la workspace/tasks/*/
```

应该看到：
- `artifact.json` - manifest 文件
- 各种 artifact 文件（.md, .json, etc.）

### 3. 手动测试 Artifact Skill

在聊天中直接要求 AI：

```
Show me how to use the artifact skill by creating a simple example.
```

### 4. 验证 artifact.json

查看 `workspace/tasks/{sessionId}/artifact.json` 内容：

```json
{
  "artifacts": [
    {
      "id": "example-report",
      "path": "tasks/abc-123/report.md",
      "mimeType": "text/markdown",
      "description": "Example report"
    }
  ]
}
```

## 常见问题

### Q: Artifacts 不显示？

**检查：**
1. ✅ Session ID 是否正确传递
2. ✅ `artifact.json` 是否创建
3. ✅ 文件路径是否正确
4. ✅ 浏览器控制台是否有错误

### Q: 如何修改 artifact skill？

编辑 `.claude/skills/artifact/SKILL.md` 文件，重启服务即可。

### Q: 支持哪些文件类型？

- Markdown (`.md`)
- HTML (`.html`)
- JSON (`.json`)
- Plain Text (`.txt`)
- CSV (`.csv`)
- 其他文本格式

### Q: 如何自定义渲染方式？

修改 `app/page.tsx` 中的渲染逻辑：

```typescript
{selectedArtifact.mimeType === "text/markdown" ? (
  // 自定义 Markdown 渲染
  <ReactMarkdown>{selectedArtifact.content}</ReactMarkdown>
) : (
  // 默认渲染
  <pre>{selectedArtifact.content}</pre>
)}
```

## 进阶功能

### 添加图片支持

修改 skill 支持图片 artifacts：

```json
{
  "artifacts": [
    {
      "id": "chart",
      "path": "tasks/${CLAUDE_SESSION_ID}/chart.png",
      "mimeType": "image/png",
      "description": "Sales chart"
    }
  ]
}
```

### 实时更新

当 AI 修改文件时，artifacts 会自动更新（通过内容去重机制）。

### 多会话支持

每个 session 有独立的 artifacts 目录：

```
workspace/
└── tasks/
    ├── session-1/
    │   ├── artifact.json
    │   └── report.md
    └── session-2/
        ├── artifact.json
        └── analysis.md
```

## 总结

Artifact 功能为 SandAgent 提供了强大的内容展示能力：

✅ **自动化** - AI 自动创建和管理 artifacts  
✅ **实时性** - 内容变化时自动更新  
✅ **易用性** - 一键复制和下载  
✅ **扩展性** - 支持多种文件类型  
✅ **可视化** - 美观的 UI 展示  

现在你可以开始测试了！🎉
