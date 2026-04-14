# VideoDrone Agent 🎬

AI 视频制作 Agent 模板 — 从角色设计到成片输出的全流程自动化视频生产管线。

## 概述

VideoDrone Agent 采用 **角色驱动、场景化** 的视频制作方法论：先设计角色形象（含三视图），再编写场景剧本，然后通过分镜表生成 AI 剧照，最终合成视频并配上音频字幕。

## 六阶段工作流

```
Phase 0       Phase 1         Phase 2          Phase 3        Phase 4         Phase 5
初始化    →   角色设计    →    场景剧本    →    剧照生图   →   视频合成    →   音频后期
  │              │               │               │              │              │
品牌分析     人物档案        场景划分        分镜→提示词     图片→视频      配音/TTS
官网抓取     三视图提示词    对白编写        角色Token注入   首尾帧控制     SRT/ASS字幕
项目上下文   一致性Token     分镜/B-Roll     批量生图       片段拼接       BGM/音效
                换装方案        音频标注                       转场效果       B-Roll混剪
```

## 15 个专业 Skills

| Phase | Skill | 用途 |
|-------|-------|------|
| 0 | `generate-project-context` | 交互式品牌/项目上下文收集 |
| 0 | `analyze-website-content` | 官网内容抓取与分析 |
| 1 | `character-designer` | 角色设计：人设、三视图、一致性 Token |
| 2 | `script-planner` | 视频大纲规划 |
| 2 | `scene-scriptwriter` | 场景剧本：人物、对白、分镜标记 |
| 2 | `storyboard-generator` | 分镜表：S01-C01 编号、画面描述 |
| 3 | `prompt-generator` | AI 生图提示词 + 角色 Token 注入 |
| 3 | `batch-image-generator` | 批量生成剧照/三视图 |
| 3 | `broll-generator` | B-Roll 补充镜头规划与生成 |
| 4 | `digital-human-integrator` | 数字人口播视频生成 |
| 4 | `keyframe-extractor` | 参考视频关键帧提取 |
| 5 | `audio-subtitle-manager` | 配音、字幕、BGM、音效管理 |
| 5 | `video-analyzer` | 参考视频风格分析 |
| — | `script-writer` | 通用脚本编写 (辅助) |

## 快速开始

### 1. 品牌口播视频

```
帮我制作一个 2 分钟的品牌介绍口播视频：
- 官网: https://example.com
- 风格: 专业但亲切
- 角色: 30 岁女性科技创业者
```

### 2. 数字人解说

```
用数字人制作产品介绍视频：
- 产品资料: [资料内容]
- 时长: 90 秒
- 平台: 抖音 (9:16 竖版)
```

### 3. 多角色故事短片

```
制作一个 3 分钟的品牌故事动画：
- 角色: 产品经理 + 用户 + 技术专家
- 风格: 3D 卡通 (Pixar-style)
- 场景: 5 个
```

## 输出目录结构

```
./output/
├── context/                    # 项目上下文
│   └── project-context.md
├── characters/                 # 角色档案
│   ├── character-index.md
│   └── [character-name]/
│       ├── profile.md          # 人物档案
│       ├── three-view-prompts.md # 三视图提示词
│       ├── consistency-tokens.md # 一致性 Token
│       └── expressions.md      # 表情集
├── scripts/                    # 剧本
│   ├── outline.md              # 大纲
│   └── scenes/                 # 场景剧本
│       ├── scene-overview.md
│       └── scene-001.md ...
├── storyboard/                 # 分镜表
│   ├── storyboard-full.md
│   └── photo-gen-tasks.md      # 生图任务清单
├── prompts/                    # AI 生图提示词
│   ├── style-foundation.md
│   ├── character-shots/
│   └── broll-shots/
├── assets/                     # 生成的图片素材
│   ├── characters/             # 角色三视图
│   ├── stills/                 # 剧照
│   └── broll/                  # B-Roll 素材
├── broll/                      # B-Roll 规划
├── subtitles/                  # 字幕文件
│   ├── [name].srt
│   └── [name].ass
├── audio/                      # 音频方案
│   ├── voiceover-guide.md
│   ├── bgm-timeline.md
│   └── sfx-list.md
└── video/                      # 最终视频
```

## 核心概念

### 角色一致性 Token

从角色三视图中提取的「身份关键词」，在所有包含该角色的剧照提示词中原封不动注入，确保跨镜头视觉一致。

```
Token 示例:
30-year-old asian woman with shoulder-length black hair 
and side bangs, wearing navy blazer over white blouse, 
wire-rimmed glasses, slim build
```

### 分镜编号系统

```
S01-C01  →  场景 1, 镜头 1
S01-C02  →  场景 1, 镜头 2
S01-B01  →  场景 1, B-Roll 1
S02-C01  →  场景 2, 镜头 1
```

## 基于 Bunny Agent Default 模板

此模板基于 Bunny Agent 的 `default` 模板初始化，参考 `seo-agent` 的 skill 组织结构。
