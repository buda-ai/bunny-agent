---
name: broll-generator
description: 规划和生成 B-Roll 补充镜头素材 (空镜头、产品特写、氛围镜头、数据图表等)，保持与主画面一致的视觉风格，丰富视频的视觉层次。
---

# B-Roll Generator — 补充镜头生成器

规划和生成视频中的 B-Roll 素材——那些在对白之间插入的补充镜头，用于丰富画面、解释概念、展示产品或营造氛围。确保 B-Roll 与剧照的视觉风格一致。

## When to Use This Skill

- 场景剧本中标记了 `[B-ROLL]` 需要制作
- 口播视频需要插入产品/概念画面避免"对口型疲劳"
- 需要氛围空镜头 (空镜) 丰富视觉
- 数据/图表需要可视化展示
- 转场时需要过渡画面

## What This Skill Does

1. **B-Roll 规划**: 从场景剧本中提取所有 B-Roll 标记并汇总
2. **类型分类**: 按用途分类 (产品/数据/氛围/演示/社交)
3. **提示词生成**: 生成与主画面风格一致的 AI 生图/生视频提示词
4. **风格匹配**: 确保 B-Roll 与角色剧照使用相同的视觉风格
5. **尺寸/格式**: 提供正确的输出尺寸和格式规范
6. **时间轴对齐**: 标注每个 B-Roll 在视频中的精确时间位置

## How to Use

### 从场景剧本自动提取

```
从场景剧本中提取所有 B-Roll 需求并生成提示词
```

### 指定类型的 B-Roll

```
生成产品展示类 B-Roll:
- 产品: [产品名]
- 风格: 科技感, 干净简洁
- 数量: 5 张
```

### 氛围空镜头

```
生成城市科技氛围空镜头，匹配视频整体风格
```

## Instructions

When user requests B-Roll generation:

1. **B-Roll 需求扫描**

   从场景剧本中提取所有 `[B-ROLL]` 标记：

   ```markdown
   ## B-Roll 需求清单

   **来源**: ./output/scripts/scenes/ (N 个场景)
   **总计**: [N] 个 B-Roll 片段

   | # | 场景 | 时间点 | 类型 | 描述 | 时长 | 优先级 |
   |---|------|--------|------|------|------|--------|
   | 1 | S01 | 0:03 | PRODUCT | 产品界面展示 | 3s | ⬆ 高 |
   | 2 | S02 | 0:12 | DATA | 用户增长数据图 | 2s | ⬆ 高 |
   | 3 | S03 | 0:25 | AMBIENCE | 现代办公室空镜 | 3s | ➡ 中 |
   | 4 | S03 | 0:30 | DEMO | 操作流程动画 | 4s | ⬆ 高 |
   | 5 | S05 | 0:50 | SOCIAL | 用户评价截图 | 2s | ➡ 中 |
   | ... | ... | ... | ... | ... | ... | ... |

   **按类型统计**:
   - PRODUCT: [N] 个
   - DATA: [N] 个
   - AMBIENCE: [N] 个
   - DEMO: [N] 个
   - SOCIAL: [N] 个
   ```

2. **风格参考加载**

   从项目上下文中获取统一的视觉风格：

   ```markdown
   ## 视觉风格参考

   **主画面风格**: [从 project-context.md 或剧照风格继承]
   **渲染风格**: [真实感 / 3D / 插画 / 动漫]
   **色调**: [暖色 / 冷色 / 中性]
   **品牌色**: [主色 #XXX, 辅色 #XXX]
   **光线**: [明亮 / 柔和 / 戏剧性]
   **画面比例**: [16:9 / 9:16 / 1:1]
   **分辨率**: [1920×1080 / 1080×1920 / 1080×1080]

   > ⚠ 所有 B-Roll 必须匹配以上风格参数
   ```

3. **分类生成提示词**

   ### PRODUCT 产品类

   ```markdown
   ### B-Roll #[N] — 产品展示

   **用途**: [场景 X, 时间 0:XX — 搭配对白 "..."]
   **内容**: [产品/功能的具体画面]
   **时长**: [Xs]
   **运镜**: [静态 / 缓慢旋转 / 推近 / 环绕]

   **Prompt**:
   ```
   [product name] interface screenshot on modern laptop screen,
   clean desk setup, [brand color] accent lighting,
   shallow depth of field, bokeh background,
   [art style], professional product photography,
   4K, sharp focus, studio lighting
   ```

   **Negative Prompt**:
   ```
   blurry, low quality, cluttered, messy desk,
   watermark, text overlay, fingers, hands
   ```

   **视频化** (如需动态):
   ```
   Camera slowly pushing in on [product],
   subtle [brand color] ambient glow,
   [4 seconds], smooth motion, professional
   ```
   ```

   ### DATA 数据类

   ```markdown
   ### B-Roll #[N] — 数据可视化

   **用途**: [场景 X, 搭配数据: "增长了 200%"]
   **数据类型**: [柱状图 / 折线图 / 饼图 / 数字增长]
   **数据内容**: [具体数据或趋势]

   **方案 A: AI 生图**
   ```
   modern data dashboard, [chart type] showing [trend],
   [brand color] color scheme, dark/light background,
   minimalist design, glassmorphism style,
   data visualization, infographic, clean layout
   ```

   **方案 B: 代码生成** (更精确)
   ```python
   # Python matplotlib / Plotly 代码
   # 生成准确的数据图表
   import matplotlib.pyplot as plt
   # ... 具体图表代码
   ```

   **方案 C: HTML/CSS 动画** (最灵活)
   ```
   使用 HTML/CSS/JS 创建带动画的数据可视化
   数字滚动、柱状图增长等效果
   ```
   ```

   ### AMBIENCE 氛围类

   ```markdown
   ### B-Roll #[N] — 氛围空镜

   **用途**: [转场 / 建立场景 / 情绪铺垫]
   **环境**: [城市 / 自然 / 室内 / 科技 / 抽象]
   **情绪**: [宁静 / 繁忙 / 科技感 / 温馨 / 紧张]

   **Prompt**:
   ```
   [environment description], establishing shot,
   [mood] atmosphere, [time of day],
   cinematic composition, [color grading],
   [art style matching main footage],
   wide angle, no people, ambient,
   4K, film grain, professional cinematography
   ```

   **视频化提示**:
   ```
   Slow pan across [environment],
   [natural movement: 风吹树叶 / 水面波纹 / 云层流动],
   [X seconds], cinematic, atmospheric
   ```
   ```

   ### DEMO 演示类

   ```markdown
   ### B-Roll #[N] — 操作演示

   **用途**: [展示操作流程 / 功能演示]
   **方式**: [屏幕录制 / AI 生成 / 动画 / 手绘说明]

   **方案 A: 屏幕录制** (最真实)
   - 录制分辨率: 1920×1080
   - 光标放大 + 高亮
   - 关键操作加 Zoom In
   - 录制工具: OBS / 系统自带

   **方案 B: AI 生图** (概念化)
   ```
   person's hands typing on laptop keyboard,
   [software interface] visible on screen,
   [brand color] accent, shallow depth of field,
   over-the-shoulder shot, modern workspace,
   photorealistic, 4K, natural lighting
   ```

   **方案 C: 动画** (最灵活)
   ```
   使用简单动画展示操作流程:
   Step 1 → Step 2 → Step 3 的流程图动画
   品牌色配色方案
   ```
   ```

   ### SOCIAL 社交证据类

   ```markdown
   ### B-Roll #[N] — 社交证据

   **用途**: [展示用户评价 / 推荐 / 数据]
   **类型**: [评价截图 / 用户头像墙 / 星级评分 / 推荐)

   **Prompt**:
   ```
   customer testimonial card design,
   5-star rating, positive review text,
   [brand color] accent, clean white background,
   modern UI design, glassmorphism,
   floating elements, subtle shadow,
   professional graphic design
   ```

   > 注意: 社交证据类素材通常更适合用设计工具制作
   > 而非 AI 生图，以确保文字清晰可读
   ```

4. **B-Roll 生成清单**

   ```markdown
   ## B-Roll 生成执行计划

   ### 批次 1: AI 图片生成 (当前可执行)
   | # | 内容 | Prompt 文件 | 生成参数 | 状态 |
   |---|------|-----------|---------|------|
   | 1 | 产品展示 | broll-prompt-01.md | 1024×576, seed:XX | ⬜ 待生成 |
   | 2 | 氛围空镜 | broll-prompt-02.md | 1024×576, seed:XX | ⬜ 待生成 |
   | ... | ... | ... | ... | ... |

   ### 批次 2: 需要额外制作
   | # | 内容 | 制作方式 | 备注 |
   |---|------|---------|------|
   | 3 | 数据图表 | Python 脚本 | 需确认数据 |
   | 4 | 屏幕录制 | OBS 录制 | 需人工操作 |
   | ... | ... | ... | ... |

   ### 批次 3: 设计素材
   | # | 内容 | 制作工具 | 备注 |
   |---|------|---------|------|
   | 5 | 用户评价卡 | Figma/Canva | 需真实数据 |
   | ... | ... | ... | ... |
   ```

5. **保存 B-Roll 素材**

   保存到 `./output/broll/` 目录：

   ```
   ./output/broll/
   ├── broll-plan.md               # B-Roll 规划总表
   ├── prompts/
   │   ├── broll-prompt-01.md      # 各个 B-Roll 的提示词
   │   ├── broll-prompt-02.md
   │   └── ...
   ├── product/                    # 产品类素材
   │   ├── product-hero-01.png
   │   └── ...
   ├── data/                       # 数据类素材
   │   ├── chart-growth.py         # 图表生成脚本
   │   └── chart-growth.png
   ├── ambience/                   # 氛围空镜
   │   ├── city-tech-01.png
   │   └── ...
   ├── demo/                       # 演示类素材
   │   └── ...
   └── social/                     # 社交证据类
       └── ...
   ```

6. **输出总结**

   ```markdown
   ✅ B-Roll 方案完成！

   **总计**: [N] 个 B-Roll 片段
   - AI 生图: [N] 个 (可立即生成)
   - 代码图表: [N] 个 (需运行脚本)
   - 手工制作: [N] 个 (需人工操作)

   **提示词文件**: `./output/broll/prompts/`
   **规划总表**: `./output/broll/broll-plan.md`

   **Next Steps**:
   1. 批量生图: `使用 batch-image-generator 生成所有 AI B-Roll`
   2. 运行图表脚本: `生成数据图表`
   3. 查看规划: `显示 B-Roll 时间轴`
   4. 风格调整: `将 B-Roll 风格改为 [新风格]`
   ```

## Tips

- **B-Roll 不宜过长**: 每段 2-5 秒为佳，太长会打断节奏
- **风格一致是关键**: 所有 B-Roll 必须匹配主画面的视觉风格
- **内容服务对白**: B-Roll 要配合说到的内容，不是随便插入
- **品牌色要贯穿**: 在数据图表、UI 截图中使用品牌色
- **简洁优先**: B-Roll 画面不要太复杂，信息量要低于主画面
- **预留安全区**: 画面边缘留空间，避免被字幕遮挡

## Related Skills

- `scene-scriptwriter` — 上游：标记 B-Roll 插入点
- `prompt-generator` — 生成高质量的 AI 生图提示词
- `batch-image-generator` — 批量生成 B-Roll 图片
- `storyboard-generator` — 在分镜表中规划 B-Roll 位置
