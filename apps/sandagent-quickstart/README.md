# SandAgent Quickstart - 5 分钟搭建你的 AI Agent 聊天界面

> **🎯 适合人群**：开发小白、想要快速看到效果的开发者  
> **⏱️ 预计时间**：5 分钟  
> **📦 前提条件**：你已经让 AI 写好了 skill，现在只想看到聊天界面！

这个项目帮你快速搭建一个**带界面的 AI Agent**，无需复杂配置，只需 4 步就能看到效果。

## 🎬 快速开始（4 步搞定）

### 第 1 步：安装依赖

打开终端，在项目目录下运行：

```bash
# 推荐使用 pnpm（更快）
pnpm install

# 如果没有 pnpm，用 npm 也可以
npm install
```

**💡 提示**：如果遇到网络问题，可以使用国内镜像源。

### 第 2 步：配置 API Key

1. 在项目根目录创建一个新文件：`.env.local`
2. 打开这个文件，填入你的 Anthropic API Key：

```bash
ANTHROPIC_API_KEY=sk-ant-你的API密钥
```

**📝 如何获取 API Key？**
- 访问 [Anthropic Console](https://console.anthropic.com/)
- 登录后，在设置中找到 API Keys
- 创建一个新的 API Key 并复制

**⚠️ 重要**：`.env.local` 文件已经在 `.gitignore` 中，不会被提交到 Git，可以安全存放密钥。

### 第 3 步：启动开发服务器

在终端运行：

```bash
pnpm dev
# 或
npm run dev
```

看到类似这样的输出就说明启动成功了：

```
  ▲ Next.js 16.0.10
  - Local:        http://localhost:3000
  - ready started server on 0.0.0.0:3000
```

### 第 4 步：打开浏览器查看界面 🎉

在浏览器中打开：**http://localhost:3000**

**🎊 恭喜！** 你现在应该能看到一个漂亮的聊天界面了！

---

## 🎨 界面是什么样的？

打开浏览器后，你会看到：

- **顶部标题栏**：显示 "SandAgent Quickstart"
- **聊天输入框**：在底部，可以输入消息
- **消息区域**：显示你和 AI 的对话历史
- **实时响应**：AI 的回复会实时流式显示（打字效果）

**试试输入一条消息**，比如："你好，帮我创建一个 GIF"，看看 AI 如何响应！

---

## 📁 你的 Skill 在哪里？

如果你已经让 AI 写好了 skill，它们应该在以下位置：

```
项目根目录/
├── CLAUDE.md                    # Agent 的系统提示词（角色定义）
└── .claude/
    ├── settings.json            # SDK 配置（超时、温度等）
    └── skills/                  # 你的 skill 文件
        └── slack-gif-creator/   # 示例 skill（你可以替换成自己的）
            └── SKILL.md
```

**✅ 系统会自动读取这些文件**，你不需要做任何额外配置！

---

## 🔍 常见问题

### Q1: 打开页面后显示错误？

**检查清单：**
1. ✅ 是否创建了 `.env.local` 文件？
2. ✅ API Key 是否正确填写（没有多余空格）？
3. ✅ 开发服务器是否正在运行（终端没有报错）？
4. ✅ 浏览器地址是否正确（http://localhost:3000）？

### Q2: 如何修改 Agent 的行为？

编辑 `CLAUDE.md` 文件，这是 Agent 的"性格"和"能力"定义。

### Q3: 如何添加自己的 Skill？

1. 在 `.claude/skills/` 目录下创建一个新文件夹（比如 `my-skill`）
2. 在文件夹里创建 `SKILL.md` 文件
3. 按照示例格式编写 skill 内容
4. 重启开发服务器（`pnpm dev`）

### Q4: 生成的文件保存在哪里？

文件会保存在项目目录下的 `sandbox-xxx` 文件夹中（每次对话会创建新的隔离目录，保证安全）。

### Q5: 想修改界面样式？

编辑 `app/page.tsx` 文件，可以自定义聊天界面的标题、样式等。

---

## 🎯 下一步做什么？

现在你已经看到了聊天界面，可以：

1. **测试你的 Skill**：在聊天框输入相关指令，看看 AI 如何使用你的 skill
2. **自定义 Agent**：修改 `CLAUDE.md`，让 Agent 更符合你的需求
3. **添加更多 Skill**：在 `.claude/skills/` 目录下添加更多技能
4. **部署上线**：使用 `pnpm build` 构建，然后部署到 Vercel 等平台

---

## 📚 技术细节（可选阅读）

如果你对技术实现感兴趣，可以继续阅读下面的内容。**如果只是想用，可以跳过这部分！**

---

## 📝 项目结构说明

如果你好奇项目是怎么组织的，这里是文件结构：

```
sandagent-quickstart/
├── app/                          # Next.js 应用目录
│   ├── page.tsx                  # 主页面（聊天界面）
│   ├── layout.tsx                # 页面布局
│   ├── globals.css               # 全局样式
│   └── api/
│       └── ai/
│           └── route.ts          # 后端 API（处理 AI 请求）
├── .claude/                      # Claude Agent SDK 配置目录
│   ├── settings.json             # SDK 设置（超时、温度等）
│   └── skills/                   # 你的 Skill 文件
│       └── slack-gif-creator/    # 示例 skill
│           └── SKILL.md
├── CLAUDE.md                     # Agent 系统提示词（定义 Agent 角色）
├── .env.local                    # 环境变量（你的 API Key，不会提交到 Git）
└── package.json                  # 项目依赖配置
```

**🔍 关键文件说明：**

| 文件 | 作用 | 是否需要修改 |
|------|------|------------|
| `app/page.tsx` | 聊天界面 | 可选（改样式） |
| `app/api/ai/route.ts` | 后端 API | 一般不需要 |
| `CLAUDE.md` | Agent 角色定义 | **建议修改** |
| `.claude/skills/*/SKILL.md` | 你的 Skill | **你的主要工作** |
| `.env.local` | API Key | **必须配置** |

## 🎯 核心特性

这个项目提供了：

- ✅ **开箱即用的聊天界面** - 使用 `@sandagent/sdk/react` + `kui`，无需自己写 UI
- ✅ **本地运行** - 使用 LocalSandbox，无需云端沙箱，完全免费
- ✅ **自动加载配置** - 系统自动读取 `.claude/` 目录，无需手动配置
- ✅ **实时流式响应** - AI 回复会实时显示，有打字效果
- ✅ **简单配置** - 只需设置 API Key，其他都自动处理

## 📦 使用的包

所有包都从 npm 安装：

- `@sandagent/sdk` - AI Provider + React hooks（useSandAgentChat），自动包含 LocalSandbox
- `ai` - Vercel AI SDK
- `next` - Next.js 框架

## 🔧 工作原理（技术细节）

### 整体流程

```
用户输入消息 
  ↓
前端 (app/page.tsx) 发送请求
  ↓
后端 API (app/api/ai/route.ts) 接收请求
  ↓
创建 LocalSandbox（本地沙箱环境）
  ↓
自动复制 CLAUDE.md 和 .claude/ 到隔离目录
  ↓
Claude Agent SDK 读取配置和 Skill
  ↓
AI 处理请求并返回流式响应
  ↓
前端实时显示 AI 回复
```

### LocalSandbox 是什么？

`LocalSandbox` 是一个**本地沙箱环境**，它：

- ✅ **无需云端** - 在你的电脑上运行，不需要 E2B 或 Daytona 等云端服务
- ✅ **自动隔离** - 每次对话创建独立目录，不会互相干扰
- ✅ **自动复制配置** - 自动将 `CLAUDE.md` 和 `.claude/` 复制到隔离目录

**代码位置**：`app/api/ai/route.ts` 第 68-74 行

```typescript
const sandbox = new LocalSandbox({
  baseDir: process.cwd(),  // 使用项目当前目录
  isolate: true,           // 隔离模式：每次运行创建独立目录
  env: {
    ANTHROPIC_API_KEY,     // 传递 API Key 给沙箱环境
  },
});
```

### 自动文件复制机制

当 `isolate: true` 时，系统会：

1. 创建隔离目录（如 `sandbox-abc123`）
2. **自动复制**以下文件到隔离目录：
   - `CLAUDE.md` → Agent 系统提示词
   - `.claude/` → 整个配置目录（包括 `settings.json` 和 `skills/`）

这样既保证了**隔离性**（每次对话独立），又能让 Claude Agent SDK **正确读取你的 Skill 配置**。

**💡 你不需要手动操作**，这一切都是自动的！

### Claude Agent SDK 自动加载

Claude Agent SDK 会自动从工作目录读取：

- ✅ `CLAUDE.md` - Agent 系统提示词（必需）
- ✅ `.claude/settings.json` - SDK 配置（超时、温度等）
- ✅ `.claude/skills/*/SKILL.md` - 所有 Skill 文件（可选）
- ⚙️ `.claude/mcp.json` - MCP 服务器配置（可选，高级功能）

## 🎨 自定义你的 Agent

### 1. 修改 Agent 角色（CLAUDE.md）

`CLAUDE.md` 文件定义了你的 Agent 是什么角色、有什么能力。

**示例**：如果你想创建一个"代码助手" Agent，可以这样写：

```markdown
# 代码助手 Agent

你是一个专业的代码助手，擅长：
- 编写清晰的代码
- 解释代码逻辑
- 修复 bug
- 优化性能

请用简洁明了的语言回答用户的问题。
```

**💡 提示**：用自然语言描述即可，就像在跟 AI 介绍一个新同事。

### 2. 添加或修改 Skill

Skill 是 Agent 的"技能包"，每个 Skill 是一个文件夹。

**项目已经包含了一个示例 Skill**：`slack-gif-creator`（创建 Slack GIF 的 skill）

**如何添加自己的 Skill？**

1. **创建 Skill 目录**：
   ```bash
   mkdir -p .claude/skills/my-skill-name
   ```

2. **创建 SKILL.md 文件**：
   在 `my-skill-name` 目录下创建 `SKILL.md`，格式如下：

   ```markdown
   ---
   name: my-skill-name
   description: 这个 skill 的功能描述
   ---
   
   # My Skill
   
   这里是 skill 的详细说明，包括：
   - 如何使用
   - 需要什么工具
   - 示例代码
   ...
   ```

3. **重启开发服务器**：
   ```bash
   # 按 Ctrl+C 停止，然后重新运行
   pnpm dev
   ```

**✅ 系统会自动加载** `.claude/skills/` 目录下的所有 Skill！

### 3. 调整 SDK 配置（可选）

编辑 `.claude/settings.json` 可以调整 AI 的行为：

```json
{
  "max_tokens": 8096,      // 最大回复长度
  "temperature": 0.7,      // 创造性（0-1，越高越有创意）
  "timeout_ms": 300000     // 超时时间（5分钟）
}
```

**💡 一般不需要修改**，除非你有特殊需求。

## 🆚 LocalSandbox vs 云端沙箱

这个项目使用的是 **LocalSandbox**（本地沙箱），适合开发和小规模使用。

| 特性 | LocalSandbox（本项目） | 云端沙箱（E2B/Daytona） |
|------|----------------------|----------------------|
| **设置难度** | ✅ 超简单，无需配置 | ❌ 需要注册账号和 API Key |
| **运行速度** | ✅ 很快（本地运行） | ⚠️ 需要网络请求 |
| **安全性** | ⚠️ 本地运行，有隔离 | ✅ 完全隔离 |
| **费用** | ✅ 完全免费 | ⚠️ 可能收费 |
| **适用场景** | 开发、测试、学习 | 生产环境、大规模使用 |

**💡 建议**：
- **现在**：用 LocalSandbox 快速开发和测试
- **以后**：如果需要部署到生产环境，再考虑切换到云端沙箱

---

## 📚 想了解更多？

- 📖 [SandAgent 完整文档](../../README.md) - 了解更多高级功能
- 🛠️ [Anthropic Skills 示例](https://github.com/anthropics/skills) - 更多 Skill 参考
- 📘 [Claude Agent SDK 文档](https://docs.anthropic.com/claude/docs/agent-sdk) - 深入了解 SDK

---

## 🆘 遇到问题？

### 问题 1：页面显示 "ANTHROPIC_API_KEY is required"

**原因**：没有配置 API Key 或配置错误

**解决**：
1. 检查是否创建了 `.env.local` 文件
2. 确认 API Key 格式正确：`ANTHROPIC_API_KEY=sk-ant-...`
3. 重启开发服务器（修改 `.env.local` 后需要重启）

### 问题 2：AI 回复很慢或超时

**原因**：可能是网络问题或 API Key 无效

**解决**：
1. 检查网络连接
2. 确认 API Key 是否有效（在 Anthropic Console 查看）
3. 检查 `.claude/settings.json` 中的 `timeout_ms` 设置

### 问题 3：Skill 没有被加载

**原因**：Skill 文件位置或格式不正确

**解决**：
1. 确认 Skill 在 `.claude/skills/你的skill名/SKILL.md`
2. 检查 `SKILL.md` 文件格式（必须有 frontmatter）
3. 重启开发服务器

### 问题 4：生成的文件找不到

**原因**：文件在隔离目录中

**解决**：
- 查看终端输出，会显示工作目录路径（如 `sandbox-abc123`）
- 文件在项目根目录下的 `sandbox-xxx` 文件夹中
- 每次对话会创建新的隔离目录，保证安全

### 问题 5：想禁用隔离模式

**原因**：希望所有对话使用同一个目录

**解决**：
1. 打开 `app/api/ai/route.ts`
2. 找到第 70 行，将 `isolate: true` 改为 `isolate: false`
3. ⚠️ **注意**：禁用隔离可能导致文件冲突，不推荐

---

## 🎉 开始使用

现在你已经了解了所有基础知识，**开始构建你的 AI Agent 吧！**

**下一步**：
1. ✅ 确保开发服务器正在运行
2. ✅ 打开 http://localhost:3000
3. ✅ 在聊天框输入消息，测试你的 Agent
4. ✅ 根据需求修改 `CLAUDE.md` 和 Skill

**祝你使用愉快！** 🚀
