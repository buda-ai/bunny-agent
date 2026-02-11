---
name: character-designer
description: 设计视频角色的完整人设档案，编写人物介绍剧本，生成角色三视图 (正面/侧面/背面) 的 AI 生图提示词，并导出一致性 Token 供后续剧照生图引用。
---

# Character Designer — 角色设计师

为视频项目设计完整的角色形象：从人物背景、性格、外貌到三视图 (正面/侧面/背面) 提示词生成，确保角色在所有后续剧照中保持视觉一致性。

## When to Use This Skill

- 视频项目需要一个或多个固定角色形象
- 创建品牌代言人 / 数字人 IP
- 动画短片 / Story Video 需要多角色设计
- 确保同一角色在不同场景中视觉一致
- 从零开始设计角色 或 根据品牌需求定制角色

## What This Skill Does

1. **人物档案**: 创建角色的完整背景设定
2. **外貌描述**: 详细定义视觉特征 (面部、体型、服装、配饰)
3. **三视图提示词**: 生成正面/侧面/背面的 AI 生图提示词
4. **一致性 Token**: 导出可复用的「角色身份关键词」
5. **多套服装**: 支持同一角色的不同场景服装方案
6. **表情集**: 定义角色的关键表情变化

## How to Use

### 从描述开始

```
设计一个角色：30 岁左右的女性科技创业者，干练自信
```

### 从品牌上下文

```
根据项目上下文，设计一个匹配品牌调性的代言人形象
```

### 多角色设计

```
为这个视频设计 3 个角色：主持人、用户、技术专家
```

## Instructions

When user requests character design:

1. **理解需求**

   ```markdown
   我来帮你设计角色。需要了解：

   1. **角色定位**: 这个角色在视频中的角色是什么？
      [ ] 主持人 / 讲解员
      [ ] 品牌代言人
      [ ] 故事主角
      [ ] 配角 / 对话方
      [ ] 旁白角色 (只有声音)
      [ ] 其他: ___________

   2. **性别与年龄**: 
      - 性别: [男 / 女 / 中性]
      - 年龄段: [20s / 30s / 40s / 50+]

   3. **视觉风格**: 
      [ ] 真实感 (Photorealistic)
      [ ] 3D 卡通 (Pixar-style)
      [ ] 2D 插画 (Illustration)
      [ ] 动漫风 (Anime)
      [ ] 数字人 (Digital Human)
      [ ] 其他: ___________

   4. **品牌调性** (参考 project-context.md): [专业/友好/活力/权威/...]

   5. **参考图**: 有没有已有的角色形象或风格参考？
   ```

2. **创建人物档案**

   ```markdown
   # 角色档案: [角色名]

   ## 基本信息
   
   | 属性 | 描述 |
   |------|------|
   | **角色名** | [Name / 代号] |
   | **角色定位** | [主持人 / 主角 / 配角] |
   | **性别** | [男 / 女 / 中性] |
   | **年龄** | [具体年龄或范围] |
   | **身高** | [cm] |
   | **体型** | [纤细 / 匀称 / 健壮 / 微胖] |

   ## 性格特征

   - **核心性格**: [3-5 个关键词]
   - **说话风格**: [温和 / 干练 / 幽默 / 专业 / 热情]
   - **标志性动作/习惯**: [举例]
   - **情绪基调**: [乐观 / 沉稳 / 严肃 / 活跃]

   ## 外貌特征 (Visual Identity)

   ### 面部
   - **脸型**: [椭圆 / 方形 / 圆形 / 心形 / 长形]
   - **眼睛**: [颜色、大小、形状]
   - **眉形**: [浓眉 / 柳叶眉 / 自然]
   - **鼻子**: [挺拔 / 小巧 / 自然]
   - **嘴唇**: [薄 / 中厚 / 厚]
   - **肤色**: [白皙 / 小麦色 / 深色 / 棕色]
   - **面部特征**: [酒窝 / 痣 / 雀斑 / 无]

   ### 发型
   - **长度**: [短发 / 中长 / 长发]
   - **颜色**: [黑 / 棕 / 金 / 其他]
   - **造型**: [直发 / 卷发 / 扎起 / 披散]
   - **刘海**: [有 / 无 / 偏分]

   ### 服装 (默认造型)
   - **风格**: [商务 / 休闲 / 科技 / 时尚 / 制服]
   - **上装**: [详细描述]
   - **下装**: [详细描述]
   - **鞋子**: [类型]
   - **配饰**: [眼镜 / 耳环 / 手表 / 领带 / 胸针 / 无]

   ### 配色方案
   - **主色**: [服装/外貌主色] — hex: [#code]
   - **辅色**: [辅助色彩] — hex: [#code]
   - **点缀色**: [配饰颜色] — hex: [#code]

   ## 背景故事 (可选)

   [2-3 句话描述角色背景，用于理解角色动机和行为]
   ```

3. **生成三视图提示词**

   为正面、侧面、背面各生成一组提示词：

   ```markdown
   ## 三视图 AI 生图提示词

   ### 通用风格标签 (所有视图共享)

   ```
   [art style], [quality keywords], [lighting],
   character reference sheet, white background, clean studio lighting,
   full body shot, [specific style tokens]
   ```

   ### 正面图 (Front View)

   **Prompt**:
   ```
   [character description], front view, facing camera,
   [detailed facial features], [hair description],
   [clothing top], [clothing bottom], [shoes],
   [accessories], [pose: standing naturally / confident pose],
   [art style], character design, reference sheet,
   neutral white background, studio lighting,
   [quality markers: 4K, sharp focus, detailed, etc.]
   ```

   **Negative Prompt**:
   ```
   blurry, low quality, distorted face, extra limbs,
   bad anatomy, deformed, watermark, text,
   multiple characters, cropped, partial body
   ```

   ---

   ### 侧面图 (Side View / Profile)

   **Prompt**:
   ```
   [character description], side view, profile view, facing right,
   [detailed facial profile], [hair from side],
   [clothing visible from side], [body proportions],
   [art style], character design, reference sheet,
   neutral white background, studio lighting,
   [quality markers]
   ```

   **Negative Prompt**:
   ```
   [same as front + ] facing camera, front facing,
   twisted pose, unnatural angle
   ```

   ---

   ### 背面图 (Back View)

   **Prompt**:
   ```
   [character description], back view, facing away from camera,
   [hair from back], [clothing back details],
   [any back accessories or details],
   [art style], character design, reference sheet,
   neutral white background, studio lighting,
   [quality markers]
   ```

   **Negative Prompt**:
   ```
   [same as front + ] face visible, front facing,
   side view, looking at camera
   ```
   ```

4. **导出一致性 Token**

   这是最关键的步骤——提取可在后续所有剧照提示词中复用的角色身份关键词：

   ```markdown
   ## 角色一致性 Token (Consistency Reference)

   ### 简短版 (嵌入其他提示词)
   ```
   [age] [gender] [ethnicity] with [hair description], [key facial feature],
   wearing [core outfit description], [body type], [defining accessory]
   ```

   ### 完整版 (需要高一致性时使用)
   ```
   [Full character prompt with ALL visual details, 
    excluding pose/angle/emotion — those由场景决定]
   ```

   ### 使用示例

   **在剧照提示词中引用角色**:
   ```
   [SCENE DESCRIPTION], 
   [CHARACTER TOKEN: 30-year-old asian woman with shoulder-length 
   black hair and side bangs, wearing navy blazer over white blouse, 
   wire-rimmed glasses, slim build],
   [POSE/ACTION for this shot],
   [SCENE LIGHTING and ENVIRONMENT]
   ```

   > **规则**: 
   > - 每次生成包含此角色的剧照时，必须注入此 Token
   > - 不要修改 Token 中的外貌描述 (除非剧情需要换装)
   > - 换装时只替换服装部分，保持面部和体型描述不变
   ```

5. **多套服装方案** (如需要)

   ```markdown
   ## 服装方案

   ### Look 1: 商务正装 (默认)
   - 上装: [描述]
   - 下装: [描述]
   - 适用场景: [办公室、会议、专业演讲]
   - Token 替换: `wearing [outfit 1 description]`

   ### Look 2: 休闲装
   - 上装: [描述]
   - 下装: [描述]  
   - 适用场景: [户外、生活化场景]
   - Token 替换: `wearing [outfit 2 description]`

   ### Look 3: [场景特定]
   - [描述]
   - 适用场景: [特定场景]
   - Token 替换: `wearing [outfit 3 description]`
   ```

6. **表情集定义**

   ```markdown
   ## 表情参考

   | 表情 | 提示词追加 | 适用情境 |
   |------|-----------|---------|
   | 自信微笑 | `confident smile, warm expression` | 开场、介绍 |
   | 认真思考 | `thoughtful expression, slight frown` | 分析、讲解 |
   | 兴奋 | `excited expression, bright eyes, wide smile` | 亮点展示 |
   | 关切 | `concerned expression, empathetic look` | 讲述痛点 |
   | 专注 | `focused expression, serious look` | 演示操作 |
   | 友好招手 | `waving hand, friendly smile` | 打招呼、结尾 |
   ```

7. **保存角色档案**

   保存到 `./output/characters/[character-name]/` 目录：
   - `profile.md` — 完整人物档案
   - `three-view-prompts.md` — 三视图提示词
   - `consistency-tokens.md` — 一致性 Token
   - `expressions.md` — 表情集 (如定义了)

   更新 `./output/characters/character-index.md`:
   ```markdown
   # Character Index

   | 角色名 | 定位 | 风格 | 目录 |
   |--------|------|------|------|
   | [Name 1] | 主持人 | 真实感 | `./[name-1]/` |
   | [Name 2] | 配角 | 3D 卡通 | `./[name-2]/` |
   ```

8. **输出总结**

   ```markdown
   ✅ 角色设计完成！

   **角色**: [Name]
   **风格**: [视觉风格]
   **档案**: `./output/characters/[name]/profile.md`
   **三视图提示词**: `./output/characters/[name]/three-view-prompts.md`
   **一致性 Token**: `./output/characters/[name]/consistency-tokens.md`

   **Quick Reference (一致性 Token)**:
   ```
   [简短版 Token — 可直接复制到其他提示词中]
   ```

   **Next Steps**:
   1. 生成三视图: `用三视图提示词生成角色图片`
   2. 设计更多角色: `设计另一个角色: [描述]`
   3. 编写场景剧本: `为 [角色名] 编写场景剧本`
   4. 换装: `为 [角色名] 设计休闲装方案`
   ```

## Tips

- **先定义风格再设计角色**: 确保风格一致 (如全部 Pixar 风或全部真实感)
- **Token 越精确，一致性越好**: 用具体描述代替模糊词
- **三视图白背景**: 这样后续更容易抠图和合成
- **命名要清晰**: 在场景剧本中会频繁引用角色名
- **保存 Token**: 后续每张剧照都需要注入此 Token

## Related Skills

- `prompt-generator` — 结合角色 Token 生成场景剧照提示词
- `batch-image-generator` — 批量生成角色三视图和剧照
- `scene-scriptwriter` — 在场景剧本中引用角色
- `digital-human-integrator` — 将角色设定应用到数字人
