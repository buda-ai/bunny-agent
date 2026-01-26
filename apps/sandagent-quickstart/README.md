# SandAgent Quickstart

5 分钟搭建 AI Agent 聊天界面。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 API Key

创建 `.env.local` 文件：

```bash
ANTHROPIC_API_KEY=sk-ant-你的密钥
```

### 3. 启动

```bash
npm run dev
```

打开 http://localhost:3000

## 自定义 Agent

修改 `CLAUDE.md` 定义 Agent 角色：

```markdown
# 我的 AI 助手

你是一个友好的助手...
```

添加技能到 `.claude/skills/` 目录。

## 项目结构

```
├── app/
│   ├── page.tsx           # 聊天界面
│   └── api/ai/route.ts    # 后端 API
├── CLAUDE.md              # Agent 角色定义
└── .claude/skills/        # 技能文件
```

## 使用的包

```json
{
  "@sandagent/sdk": "^0.2.0-beta.5",
  "ai": "^6.0.19"
}
```

## 下一步

- [完整文档](../../docs/QUICK_START.md)
- [云端部署](../../packages/sandbox-e2b/README.md)
