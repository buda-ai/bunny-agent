# SEO Agent - SEO营销智能体

基于 [Claude Agent SDK](https://github.com/anthropics/anthropic-sdk-typescript) 构建的 AI Agent 示例代码，专注于 SEO 营销自动化任务。

## 📋 项目简介

SEO Agent 是一个智能化的 SEO 营销助手，通过 Claude AI 模型驱动，能够自动执行各种 SEO 相关任务。Agent 内置了 **4 个工作阶段** 和 **16 个专业技能**，可以帮助你完成从关键词研究到性能监控的完整 SEO 工作流。

### 工作阶段

- **Research Phase（研究阶段）**: 关键词研究、竞品分析、SERP 分析等
- **Build Phase（构建阶段）**: 内容创作、Schema 标记生成、元标签优化等
- **Optimize Phase（优化阶段）**: 页面 SEO 审计、内链优化、内容刷新等
- **Monitor Phase（监控阶段）**: 排名追踪、性能报告、告警管理等

### 16 个内置技能

所有技能位于 `./.claude/skills` 目录下：

1. **keyword-research** - 关键词研究
2. **competitor-analysis** - 竞品分析
3. **serp-analysis** - 搜索结果页分析
4. **content-gap-analysis** - 内容缺口分析
5. **seo-content-writer** - SEO 内容撰写
6. **schema-markup-generator** - Schema 标记生成器
7. **meta-tags-optimizer** - 元标签优化器
8. **on-page-seo-auditor** - 页面 SEO 审计
9. **internal-linking-optimizer** - 内链优化器
10. **content-refresher** - 内容刷新工具
11. **technical-seo-checker** - 技术 SEO 检查
12. **backlink-analyzer** - 外链分析器
13. **geo-content-optimizer** - 地理内容优化器
14. **rank-tracker** - 排名追踪器
15. **performance-reporter** - 性能报告器
16. **alert-manager** - 告警管理器

## 🚀 快速开始

### 前置要求

- Node.js 18+ 
- npm 或 pnpm
- Anthropic API Key

### 安装步骤

#### 1. 进入项目目录

```bash
cd templates/seo-agent
```

#### 2. 安装依赖

```bash
npm install
```

#### 3. 配置环境变量

复制环境变量示例文件并填写你的 API Key：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填写必需的配置：

```env
# 必填：你的 Anthropic API Key
ANTHROPIC_API_KEY=your_api_key_here

# 可选：自定义 API 基础 URL
ANTHROPIC_BASE_URL=your_base_url
```

#### 4. 运行 Agent

```bash
npm run start
```

## 📂 输出文件

Agent 执行完毕后，所有工作交付物会保存在 `./output` 目录下：

- `YYMMDD-HHMM-full.log` - 完整的 JSON 格式日志（包含所有消息详情）
- `YYMMDD-HHMM-readable.log` - 人类可读的简化日志

日志文件名使用时间戳命名，格式为：年月日-时分（例如：`250125-1430`）

## 🔧 工作原理

详细的工作原理请查看 `agent.ts` 源代码文件。核心流程如下：

1. **初始化**: 加载环境变量，创建输出目录
2. **Agent 循环**: 使用 `query()` 函数启动 Claude Agent
3. **工具调用**: Agent 根据 prompt 自动选择并调用相应的 Skills
4. **流式输出**: 实时接收 Agent 的推理过程和工具调用结果
5. **日志记录**: 同时记录完整日志和可读日志到 output 目录

### 可用工具

Agent 可以使用以下工具类型（在 `agent.ts` 中配置）：

- `Skill` - 调用自定义技能
- `Read` - 读取文件
- `Write` - 写入文件
- `Bash` - 执行命令
- `Glob` - 文件匹配
- `Grep` - 文本搜索
- `WebSearch` - 网络搜索
- `WebFetch` - 网页抓取

## 🎯 自定义使用

### 修改 Agent Prompt

编辑 `agent.ts` 第 35 行，修改 `prompt` 参数来改变 Agent 的任务：

```typescript
prompt: "Analyze keywords for 'automate twitter posts' and identify high-value opportunities"
```

### 调整模型配置

在 `agent.ts` 的 `options` 中可以配置：

- `model` - 使用的 Claude 模型版本
- `allowedTools` - 允许 Agent 使用的工具列表
- `permissionMode` - 权限模式（`acceptEdits` 表示自动批准文件编辑）

### 添加自定义 Skills

在 `./.claude/skills` 目录下创建新的技能文件夹，参考现有技能的结构编写 `SKILL.md` 文件。

## 📚 相关资源

- [Claude Agent SDK 文档](https://github.com/anthropics/anthropic-sdk-typescript)
- [Anthropic API 文档](https://docs.anthropic.com/)

## ⚠️ 注意事项

- 确保 `.env` 文件中的 API Key 有效且有足够的配额
- Agent 执行时间取决于任务复杂度，请耐心等待
- 所有输出文件会自动保存，无需手动干预
- 建议定期清理 `./output` 目录下的旧日志文件

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进这个项目！

---

**Happy SEO Automation! 🚀**
