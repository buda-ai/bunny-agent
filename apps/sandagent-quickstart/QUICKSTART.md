# 🚀 SandAgent 快速开始指南

本指南将帮助你使用 SandAgent 快速搭建一个 AI Agent，基于 [slack-gif-creator](https://github.com/anthropics/skills/tree/main/skills/slack-gif-creator) skill。

## 📋 前置要求

- Node.js 18+ 
- pnpm (推荐) 或 npm
- Anthropic API Key ([获取地址](https://console.anthropic.com/))

## ⚡ 5 分钟快速开始

### 步骤 1: 创建新项目（可选）

你可以直接使用这个项目，或者创建一个新项目：

```bash
mkdir my-sandagent-app
cd my-sandagent-app
npm init -y
```

### 步骤 2: 安装依赖

```bash
# 使用 pnpm
pnpm add @sandagent/sdk ai dotenv
pnpm add -D tsx @types/node typescript

# 或使用 npm
npm install @sandagent/sdk ai dotenv
npm install -D tsx @types/node typescript
```

### 步骤 3: 复制示例文件

```bash
# 如果在这个项目中
cp .env.example .env

# 或创建新文件
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
```

编辑 `.env` 文件，填入你的 Anthropic API Key：

```env
ANTHROPIC_API_KEY=sk-ant-...
```

### 步骤 4: 创建 quickstart.ts

复制 `quickstart.ts` 文件到你的项目，或创建新文件。

### 步骤 5: 运行示例

```bash
# 使用 pnpm
pnpm start

# 或使用 npm
npm start

# 或直接运行
npx tsx quickstart.ts
```

🎉 完成！Agent 会开始工作，创建一个弹跳球动画 GIF。

## 🎯 示例说明

这个 quickstart 示例做了什么：

1. **创建 LocalSandbox** - 在本地运行代码，无需云端沙箱
2. **使用 SandAgent** - 让 Claude 在沙箱中执行 Python 代码
3. **生成 GIF** - 创建一个 128x128 的弹跳球动画，适合 Slack 使用

## 🔧 自定义你的 Agent

### 修改任务

编辑 `quickstart.ts`，修改 prompt：

```typescript
const result = streamText({
  model: sandagent(model),
  prompt: `你的新任务描述...`,
});
```

### 示例 1: 数据分析 Agent

```typescript
prompt: `分析 data.csv 文件，找出销售趋势并生成可视化图表。
使用 pandas 读取数据，matplotlib 创建图表。`
```

### 示例 2: 代码生成 Agent

```typescript
prompt: `创建一个 React 组件，实现一个待办事项列表。
组件应该支持添加、删除和标记完成功能。`
```

### 示例 3: 图像处理 Agent

```typescript
prompt: `处理用户上传的图片，调整大小为 800x600，
应用滤镜效果，并保存为 output.jpg`
```

## 📦 核心概念

### LocalSandbox

```typescript
const sandbox = new LocalSandbox({
  baseDir: "/tmp/my-agent",  // 工作目录
  isolate: true,              // 每次运行隔离
  env: {                      // 环境变量
    ANTHROPIC_API_KEY: "...",
  },
});
```

**特点：**
- ✅ 无需配置云端服务
- ✅ 运行速度快
- ✅ 适合开发和测试
- ⚠️ 代码在本地运行，注意安全

### SandAgent Provider

```typescript
const sandagent = createSandAgent({
  sandbox,
  verbose: true,  // 显示详细日志
});
```

### 使用 AI SDK

```typescript
const result = streamText({
  model: sandagent("claude-sonnet-4-20250514"),
  prompt: "你的任务...",
});

// 流式输出
for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

## 🆚 LocalSandbox vs 云端沙箱

| 特性 | LocalSandbox | E2B | Daytona |
|------|-------------|-----|---------|
| **设置难度** | ⭐ 非常简单 | ⭐⭐ 需要 API Key | ⭐⭐ 需要 API Key |
| **运行速度** | ⭐⭐⭐ 很快 | ⭐⭐ 需要网络 | ⭐⭐ 需要网络 |
| **隔离性** | ⭐ 本地运行 | ⭐⭐⭐ 完全隔离 | ⭐⭐⭐ 完全隔离 |
| **成本** | ⭐⭐⭐ 免费 | ⭐⭐ 可能收费 | ⭐⭐ 可能收费 |
| **适用场景** | 开发/测试 | 生产环境 | 生产环境 |

**推荐策略：**
- 🏠 **开发阶段**：使用 LocalSandbox
- 🚀 **生产环境**：使用 E2B 或 Daytona

## 📚 下一步

### 1. 查看完整示例

```bash
cd ../sandagent-example
```

查看使用 E2B/Daytona 的完整 Next.js 应用示例。

### 2. 了解 SandAgent 架构

阅读 [SandAgent 文档](../../README.md) 了解更多：

- 如何配置不同的沙箱
- 如何处理 artifacts
- 如何集成到你的应用

### 3. 探索更多 Skills

查看 [Anthropic Skills](https://github.com/anthropics/skills) 获取更多灵感：

- `slack-gif-creator` - 创建 Slack GIF
- `data-analyst` - 数据分析
- `web-scraper` - 网页抓取
- 更多...

## 🐛 常见问题

### Q: 运行时报错 "ANTHROPIC_API_KEY not set"

**A:** 确保：
1. 已创建 `.env` 文件
2. `.env` 文件中有正确的 API Key
3. 使用 `dotenv/config` 导入环境变量

### Q: LocalSandbox 在哪里执行代码？

**A:** 代码在你的本地机器上执行，工作目录在 `os.tmpdir()` 下的临时目录。运行时会打印具体路径。

### Q: 如何查看生成的文件？

**A:** 运行时会打印工作目录路径，例如：
```
Workdir: /var/folders/.../sandagent-quickstart-xxx
```

### Q: 如何切换到云端沙箱？

**A:** 查看 `sandagent-example` 项目，里面有完整的 E2B 和 Daytona 配置示例。

### Q: 可以同时运行多个 Agent 吗？

**A:** 可以！每个 `LocalSandbox` 实例是独立的，设置 `isolate: true` 会为每个实例创建独立目录。

## 💡 提示

1. **开发时使用 `pnpm dev`** - 支持热重载
2. **查看详细日志** - 设置 `verbose: true` 查看所有操作
3. **测试不同模型** - 尝试 `claude-sonnet-4`、`claude-opus-3` 等
4. **保存工作目录** - 设置 `isolate: false` 可以保留生成的文件

## 🎓 学习资源

- [SandAgent GitHub](https://github.com/vikadata/sandagent)
- [Claude Agent SDK 文档](https://docs.anthropic.com/claude/docs/agent-sdk)
- [Anthropic Skills](https://github.com/anthropics/skills)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)

---

**开始构建你的第一个 AI Agent 吧！** 🚀
