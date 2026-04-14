# 网页小游戏专家模板

这是一个专为开发网页 3D 小游戏平台设计的 Claude Code Agent 模板。

## 概述

该模板将 Claude Code 转变为一个网页游戏开发专家，专注于使用现代 Web 技术创建交互式 3D 游戏体验。

## 核心能力

### 技术栈
- **3D 引擎**: Three.js, Babylon.js, PlayCanvas
- **WebGL**: 原生 WebGL 1.0/2.0, WebGPU
- **游戏框架**: Phaser 3, PixiJS
- **物理引擎**: Cannon.js, Ammo.js, Rapier
- **前端**: React Three Fiber, Vue, Vanilla JS
- **构建工具**: Vite, Webpack
- **语言**: TypeScript, JavaScript, GLSL

### 游戏开发
- 3D 场景构建和渲染
- 游戏物理和碰撞检测
- 玩家输入处理（键盘、鼠标、触摸）
- 音频系统集成
- UI/HUD 开发
- 性能优化
- 移动端适配

## 使用方法

### 使用 bunny-agent-manager CLI

```bash
# 创建新游戏项目
bunny-agent-manager run --template web-game-expert "创建一个太空射击游戏"

# 查看模板信息
bunny-agent-manager templates
```

### 使用 bunny-agent CLI（本地）

```bash
# 在当前目录运行
bunny-agent run --template web-game-expert -- "帮我开发一个 3D 赛车游戏"
```

### 在 Next.js 应用中使用

```typescript
import { createBunnyAgent } from '@bunny-agent/manager';
import { createClaudeRunner } from '@bunny-agent/runner-claude';
import { createLocalSandbox } from '@bunny-agent/sandbox-local';

const agent = await createBunnyAgent({
  runner: createClaudeRunner({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    template: 'web-game-expert'
  }),
  sandbox: createLocalSandbox()
});

const stream = await agent.stream({
  messages: [{ role: 'user', content: '创建一个简单的平台跳跃游戏' }]
});
```

## 内置技能 (Skills)

### 1. Artifact Management (`/artifact`)
管理游戏项目输出的 artifact.json 文件，跟踪所有创建的代码、资源和文档。

使用方式：
```bash
/artifact
```

### 2. Create Game Template (`/create-game-template`)
快速搭建完整的游戏项目结构，包括：
- Vite + TypeScript 配置
- Three.js 集成
- 基础游戏循环
- 项目目录结构

使用方式：
```bash
/create-game-template
```

## 常见游戏类型

该模板擅长创建以下类型的游戏：

1. **太空射击游戏**
   - 玩家飞船控制
   - 敌人生成和 AI
   - 射击和碰撞系统
   - 粒子效果

2. **3D 平台跳跃游戏**
   - 角色控制器
   - 物理和跳跃
   - 关卡设计
   - 收集物品

3. **赛车游戏**
   - 车辆物理
   - 赛道设计
   - 计时系统
   - 多视角

4. **塔防游戏**
   - 塔建造系统
   - 敌人寻路
   - 战斗系统
   - 资源管理

5. **第一人称探索**
   - FPS 相机控制
   - 环境交互
   - 碰撞检测
   - 氛围营造

## 项目结构

Agent 会创建以下标准结构：

```
game-project/
├── index.html              # 游戏入口
├── src/
│   ├── main.ts            # 主入口
│   ├── game/
│   │   ├── Game.ts        # 游戏主类
│   │   ├── Scene.ts       # 场景管理
│   │   └── entities/      # 游戏实体
│   ├── systems/
│   │   ├── Physics.ts     # 物理系统
│   │   ├── Input.ts       # 输入处理
│   │   └── Audio.ts       # 音频系统
│   ├── ui/
│   │   ├── HUD.ts         # 抬头显示
│   │   └── Menu.ts        # 菜单系统
│   └── utils/
│       ├── AssetLoader.ts # 资源加载
│       └── ObjectPool.ts  # 对象池
├── assets/
│   ├── models/            # 3D 模型
│   ├── textures/          # 纹理贴图
│   ├── audio/             # 音频文件
│   └── shaders/           # 着色器
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 任务记录

每个游戏开发任务会在 `tasks/${SESSION_ID}/` 创建记录：

- `artifact.json` - 跟踪所有输出文件
- `summary.md` - 任务总结和文档
- `screenshots/` - 游戏截图（可选）
- `design.md` - 游戏设计文档（可选）
- `performance.md` - 性能分析（可选）

## 配置

### 模型设置 (.claude/settings.json)
```json
{
  "max_tokens": 8096,
  "temperature": 0.6,
  "allowed_tools": ["bash", "read_file", "write_file"],
  "timeout_ms": 600000,
  "max_turns": 100,
  "streaming": true
}
```

### MCP 配置 (.claude/mcp.json)
提供文件系统访问，用于游戏资源管理。

## 性能优化

Agent 会自动考虑以下优化：

- LOD (Level of Detail) 系统
- 对象池减少 GC
- GPU 实例化
- 纹理压缩
- 视锥体剔除
- 移动端优化

## 示例提示

```
"创建一个太空射击游戏，玩家使用 WASD 控制飞船，空格键发射子弹，敌人从上方随机生成"

"开发一个 3D 平台跳跃游戏，包含角色移动、跳跃、收集金币和简单的关卡设计"

"制作一个赛车游戏原型，包含赛道、车辆物理、速度计和圈数计时"

"创建一个塔防游戏，玩家可以放置不同类型的塔，敌人沿着路径行进"

"开发一个第一人称迷宫探索游戏，包含基本的碰撞检测和环境光照"
```

## 限制

- 大型 3D 模型和资源文件受限制
- 某些外部 API 可能无法访问
- 构建时间和内存有限制
- 不支持需要专用服务器的多人游戏（可使用外部服务）

## 开发工作流

1. 描述游戏概念和玩法
2. Agent 选择合适的技术栈
3. 创建项目结构
4. 实现核心游戏机制
5. 添加视觉效果和音频
6. 优化性能
7. 测试和调试
8. 构建部署版本

## 贡献

如果你想改进这个模板，请：
1. Fork 项目
2. 创建特性分支
3. 提交你的改动
4. 发起 Pull Request

## 许可证

遵循 Bunny Agent 主项目的许可证。
