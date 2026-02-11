---
name: storyboard-generator
description: 从场景剧本生成分镜表 (Storyboard)。按「场景 → 镜头」结构组织，为每个镜头标注画面描述、出场角色 (含一致性 Token)、镜头类型、时长、转场，并输出可直接用于 AI 剧照生图的画面描述。
---

# Storyboard Generator — 分镜表生成器

将场景剧本转化为详细的分镜表：按场景-镜头编号组织，每个镜头标注画面描述、出场角色、情绪、镜头参数和对白节选。分镜表直接关联角色一致性 Token，输出可用于 AI 剧照生图的画面描述。

## When to Use This Skill

- 场景剧本写完后，进入分镜阶段
- 将文字剧本转化为可视化的画面规划
- 为后续 AI 剧照生图提供精确画面描述
- 规划镜头之间的衔接和节奏
- 确认每个镜头需要的角色、表情、姿态
- 标注 B-Roll 插入位置和类型

## What This Skill Does

1. **场景-镜头编号**: S01-C01 格式的系统化编号
2. **画面描述**: 每个镜头的详细视觉描述 (可直接喂给生图)
3. **角色注入**: 在画面描述中嵌入角色一致性 Token
4. **镜头参数**: 景别、角度、运镜、焦距
5. **时间线**: 精确到秒的时间标注
6. **情绪标注**: 对应场景剧本中的情绪变化
7. **B-Roll 位置**: 在分镜表中标注 B-Roll 插入点
8. **转场标注**: 相邻镜头之间的过渡方式
9. **剧照提示词预备**: 输出可直接用于 prompt-generator 的画面描述

## How to Use

### 从场景剧本生成

```
从场景剧本生成分镜表
```

### 指定详细度

```
为场景 3-5 生成详细分镜表:
- 详细度: 完整 (含技术参数)
- 输出: 含 AI 生图画面描述
```

### 从大纲直接生成

```
Create storyboard for:
- 大纲: [filename]
- 风格: [电影感/动态/简约]
- 角色: [角色名列表]
```

## Instructions

When user requests storyboard generation:

1. **加载上游数据**

   ```markdown
   ## 分镜输入检查

   **场景剧本**: 
   - [ ] 已加载 (from `./output/scripts/scenes/`)
   - 场景数: [N]
   - 总时长: [X:XX]

   **角色档案**:
   | 角色 | 一致性 Token | 三视图 | 状态 |
   |------|-------------|--------|------|
   | [Name 1] | ✅ | ✅ 已生成 | 可用 |
   | [Name 2] | ✅ | ⬜ 待生成 | 可用 (Token) |

   **视觉风格**: [从 project-context.md 继承]

   > ⚠ 如缺少场景剧本，先使用 `scene-scriptwriter`
   > ⚠ 如缺少角色档案，先使用 `character-designer`
   ```

2. **分镜编号体系**

   ```markdown
   ## 编号规则

   **格式**: S[场景号]-C[镜头号]
   
   - S01-C01: 场景 1, 镜头 1
   - S01-C02: 场景 1, 镜头 2
   - S02-C01: 场景 2, 镜头 1
   - S03-B01: 场景 3, B-Roll 1

   **特殊编号**:
   - S00-C01: 片头 (Title Card)
   - SXX-C01: 片尾 (End Card)
   - S[N]-B[N]: B-Roll 插入
   - S[N]-T[N]: 转场镜头
   ```

3. **分镜表格式**

   ```markdown
   # 分镜表: [视频标题]

   **项目**: [项目名]
   **总时长**: [X:XX]
   **总镜头数**: [N]
   **场景数**: [N]
   **日期**: [Date]
   **版本**: v1.0

   ---

   ## Scene 01: [场景标题]

   **场景信息**: [时间 0:00-0:08] | [地点: 演播室] | [情绪: 自信开场]
   **出场角色**: [角色 A]

   ---

   ### S01-C01 | 中景 | 0:00-0:03 (3s)

   **画面描述**:
   [角色 A] 站在画面中央偏右的位置，面对镜头，微笑。
   背景为简洁的浅灰色/白色演播室，柔和的三点布光。
   角色双手自然交叠于身前，表情自信友好。

   **AI 生图画面描述** (含角色 Token):
   ```
   [CHARACTER TOKEN: 30-year-old asian woman with shoulder-length 
   black hair and side bangs, wearing navy blazer over white blouse, 
   wire-rimmed glasses, slim build],
   standing in center-right of frame, facing camera, confident smile,
   hands naturally clasped in front,
   clean minimalist studio background, light gray,
   soft three-point lighting, medium shot from waist up,
   [art style], 4K, sharp focus, professional portrait
   ```

   **镜头参数**:
   | 景别 | 角度 | 运镜 | 焦距 |
   |------|------|------|------|
   | 中景 (MS) | 平视 | 静态 | 50mm |

   **对白**: "大家好，欢迎来到xxx。"
   **表情**: 自信微笑 → `confident smile, warm expression`
   **动作**: 轻微前倾，表达亲近
   **转场出**: 硬切

   ---

   ### S01-C02 | 近景 | 0:03-0:08 (5s)

   **画面描述**:
   镜头推近至 [角色 A] 的近景 (胸部以上)，表情变化为
   好奇/期待，略微挑眉，形成"你知不知道"的神态。

   **AI 生图画面描述** (含角色 Token):
   ```
   [CHARACTER TOKEN], close-up shot from chest up,
   curious expression with slightly raised eyebrow,
   leaning slightly forward, engaging eye contact,
   same studio background (blurred), shallow depth of field,
   warm key light from right, soft fill light from left,
   [art style], 4K, cinematic, bokeh background
   ```

   **镜头参数**:
   | 景别 | 角度 | 运镜 | 焦距 |
   |------|------|------|------|
   | 近景 (CU) | 平视 | 缓推 (推近) | 85mm |

   **对白**: "今天我要跟你聊一个99%的人都不知道的秘密。"
   **表情**: 好奇 → 揭秘 → `curious expression → knowing smile`
   **转场出**: 切到 B-Roll

   ---

   ### S01-B01 | B-Roll | 0:08-0:11 (3s)

   **类型**: AMBIENCE
   **画面描述**: [氛围空镜 — 数据流/科技感画面，暗示内容价值]

   **AI 生图画面描述**:
   ```
   abstract digital data flow, glowing blue particles,
   tech visualization, dark background with [brand color] accents,
   cinematic lighting, futuristic, no people,
   wide angle, [art style], 4K
   ```

   **对白**: [旁白继续，画外音]
   **音效**: `whoosh transition`
   **转场入**: 硬切 from S01-C02
   **转场出**: 硬切 to S02-C01

   ---

   ## Scene 02: [场景标题]

   [继续相同格式...]

   ---
   ```

4. **分镜总览表**

   生成紧凑的汇总视图：

   ```markdown
   ## 分镜总览

   | 编号 | 景别 | 角色 | 时长 | 对白摘要 | 类型 |
   |------|------|------|------|---------|------|
   | S01-C01 | 中景 | A | 3s | "大家好..." | 主镜头 |
   | S01-C02 | 近景 | A | 5s | "今天我要..." | 主镜头 |
   | S01-B01 | 全景 | — | 3s | [旁白] | B-Roll |
   | S02-C01 | 中景 | A,B | 8s | "让我介绍..." | 主镜头 |
   | ... | ... | ... | ... | ... | ... |

   **景别分布**:
   - 全景 (WS): [N] 个
   - 中景 (MS): [N] 个
   - 近景 (CU): [N] 个
   - 特写 (ECU): [N] 个
   - B-Roll: [N] 个

   **节奏分析**:
   - 平均镜头时长: [X.X] 秒
   - 最短: [X] 秒 (S[N]-C[N])
   - 最长: [X] 秒 (S[N]-C[N])
   - 总镜头数: [N]
   ```

5. **镜头构图示意**

   ```markdown
   ## 常用构图参考

   ### 中景 (MS) — 口播主力镜头
   ```
   ┌────────────────────────────────────────┐
   │    [Background - studio/scene]        │
   │                                       │
   │        ┌─────────────┐               │
   │        │   Person    │               │
   │        │ (waist up)  │               │
   │        │   🎤 话筒    │               │
   │        └─────────────┘               │
   │    [Lower Third: Name/Title]          │
   └────────────────────────────────────────┘
   ```

   ### 近景 (CU) — 强调/情感镜头
   ```
   ┌────────────────────────────────────────┐
   │                                       │
   │         ┌─────────────┐              │
   │         │    Face     │              │
   │         │  (head &    │              │
   │         │ shoulders)  │              │
   │         └─────────────┘              │
   │    [Subtitle area]                    │
   └────────────────────────────────────────┘
   ```

   ### 双人镜头 (TWO-SHOT) — 对话场景
   ```
   ┌────────────────────────────────────────┐
   │    [Background]                       │
   │                                       │
   │    ┌────────┐    ┌────────┐          │
   │    │ Person │    │ Person │          │
   │    │   A    │    │   B    │          │
   │    └────────┘    └────────┘          │
   │    [Subtitle]                         │
   └────────────────────────────────────────┘
   ```
   ```

6. **剧照生图任务清单**

   从分镜表中自动生成需要 AI 生图的任务清单：

   ```markdown
   ## 剧照生图任务 (Photo Generation Tasks)

   ### 角色主镜头 (需注入角色 Token)

   | # | 分镜编号 | 角色 | 姿态/表情 | 场景 | 优先级 |
   |---|---------|------|----------|------|--------|
   | 1 | S01-C01 | A | 自信微笑,站立 | 演播室 | ⬆ 高 |
   | 2 | S01-C02 | A | 好奇,前倾 | 演播室 | ⬆ 高 |
   | 3 | S02-C01 | A,B | 对话,互动 | 演播室 | ⬆ 高 |
   | ... | ... | ... | ... | ... | ... |

   ### B-Roll 镜头 (不含角色)

   | # | 分镜编号 | 类型 | 内容描述 | 优先级 |
   |---|---------|------|---------|--------|
   | 1 | S01-B01 | AMBIENCE | 科技数据流 | ➡ 中 |
   | 2 | S03-B01 | PRODUCT | 产品界面 | ⬆ 高 |
   | ... | ... | ... | ... | ... |

   **使用方式**:
   → 将此清单传递给 `prompt-generator` 生成详细提示词
   → 然后使用 `batch-image-generator` 批量生成
   ```

7. **时间线可视化**

   ```markdown
   ## 时间线

   ```
   0:00            0:10            0:20            0:30
   |─────────────────|─────────────────|─────────────────|
   
   S01: 开场
   |C01|C02|B01|
    MS  CU  BR
   
   S02: 介绍
            |C01   |C02|B01|C03     |
             MS     CU  BR  MS
   
   S03: 第一要点
                         |C01  |B01  |C02  |C03|
                          MS    BR    CU    MS
   ```

   **节奏标注**:
   - ⚡ 快节奏区 (镜头 < 3 秒)
   - 🎯 正常节奏 (镜头 3-8 秒)
   - 🐌 慢节奏区 (镜头 > 8 秒)
   ```

8. **保存分镜表**

   保存到 `./output/storyboard/`:

   ```
   ./output/storyboard/
   ├── storyboard-overview.md      # 分镜总览 + 任务清单
   ├── storyboard-full.md          # 完整分镜表 (所有场景)
   ├── photo-gen-tasks.md          # 剧照生图任务清单
   └── scenes/
       ├── storyboard-S01.md       # 场景 1 分镜
       ├── storyboard-S02.md       # 场景 2 分镜
       └── ...
   ```

9. **输出总结**

   ```markdown
   ✅ 分镜表生成完成！

   **视频**: [标题]
   **场景**: [N] 个
   **总镜头**: [N] 个 (角色镜头 [N] + B-Roll [N])
   **总时长**: [X:XX]

   **分镜表**: `./output/storyboard/storyboard-full.md`
   **生图任务**: `./output/storyboard/photo-gen-tasks.md`

   **资产需求**:
   - 角色剧照: [N] 张
   - B-Roll 图片: [N] 张
   - 文字叠加: [N] 处

   **Next Steps**:
   1. 生成剧照提示词: `用 prompt-generator 生成所有剧照提示词`
   2. 修改分镜: `调整 S[N]-C[N] 的景别为特写`
   3. 添加镜头: `在 S[N]-C[N] 后面插入一个 B-Roll`
   4. 批量生图: `生成所有剧照`
   ```

## Output Format

Storyboards should be:
- **Comprehensive**: Every shot documented
- **Visual**: Clear descriptions or sketches
- **Actionable**: Production-ready information
- **Organized**: Logical flow and grouping
- **Flexible**: Easy to modify and update

## Tips

- **先有剧本再分镜**: 确保场景剧本已完成
- **角色 Token 必注入**: 每个包含角色的镜头必须携带一致性 Token
- **景别要有变化**: 不要连续使用相同景别
- **B-Roll 呼吸**: 每 2-3 个主镜头之间插入 B-Roll
- **编号一致**: S01-C01 格式贯穿全程，方便追踪
- **先粗后细**: 先完成总览表，再逐镜头填充细节

## Related Skills

- `scene-scriptwriter` — 上游：提供场景剧本
- `character-designer` — 上游：提供角色一致性 Token
- `prompt-generator` — 下游：从分镜画面描述生成 AI 生图提示词
- `batch-image-generator` — 下游：批量生成剧照
- `broll-generator` — 并行：专门处理 B-Roll 素材
