---
name: prompt-generator
description: 从分镜表的画面描述生成完整的 AI 生图提示词。核心功能：自动注入角色一致性 Token，确保同一角色跨镜头视觉一致。支持 Midjourney / DALL-E / Stable Diffusion 等平台。
---

# Prompt Generator — 剧照提示词生成器

从分镜表中的画面描述生成可直接使用的 AI 生图提示词。**核心机制**：自动从角色档案加载一致性 Token，注入到每个包含该角色的剧照提示词中，保证角色在所有镜头中外貌一致。

## When to Use This Skill

- 从分镜表生成剧照 (角色镜头) 的 AI 生图提示词
- 从 B-Roll 规划生成补充镜头提示词
- 批量生成一组风格一致的图片提示词
- 需要跨多张图保持角色外貌一致
- 为不同 AI 平台优化提示词格式
- 翻译中文描述为英文提示词

## What This Skill Does

1. **角色 Token 注入**: 从 `./output/characters/` 加载一致性 Token，自动嵌入提示词
2. **画面→提示词**: 将分镜的画面描述转化为结构化提示词
3. **风格一致**: 使用共享的风格基底 (Style Foundation) 确保系列一致
4. **平台适配**: 为 Midjourney / DALL-E / SD 分别优化
5. **反向提示词**: 生成精确的 Negative Prompt
6. **批量输出**: 批量生成可直接复制使用的提示词文件

## How to Use

### 从分镜表批量生成

```
从分镜表生成所有剧照提示词
```

### 指定镜头生成

```
为 S01-C01 和 S02-C03 生成生图提示词
```

### 风格参考生成

```
参考这张图的风格，为分镜表生成提示词: [图片描述/URL]
```

## Instructions

When user requests prompt generation:

1. **加载角色 Token 和风格基底**

   ```markdown
   ## 角色一致性 Token 加载

   **角色档案来源**: `./output/characters/`

   | 角色 | Token 状态 | 简短版 Token |
   |------|-----------|-------------|
   | A: [Name] | ✅ 已加载 | `30-year-old asian woman with shoulder-length black hair...` |
   | B: [Name] | ✅ 已加载 | `45-year-old man with short gray hair, square jaw...` |

   **风格基底** (Style Foundation):
   ```
   [art style], [quality: 4K, sharp focus, detailed],
   [lighting: soft three-point / cinematic / natural],
   [render: photorealistic / 3D / illustration],
   [color: warm palette / brand colors #XXX #XXX],
   [camera: professional photography / cinematic]
   ```

   > ⚠ 以下所有提示词将自动注入对应角色的 Token
   > ⚠ 风格基底统一应用于所有提示词
   ```

2. **角色 Token 注入机制**

   ```markdown
   ## Token 注入规则

   ### 提示词组装公式

   ```
   PROMPT = [SCENE/环境描述]
          + [CHARACTER TOKEN: 角色完整外貌]
          + [POSE/动作姿态]
          + [EXPRESSION/表情]
          + [CAMERA/镜头参数]
          + [STYLE FOUNDATION/风格基底]
   ```

   ### 规则

   1. **必须注入**: 任何包含角色的剧照，必须完整注入该角色的 Token
   2. **不可修改**: Token 中的面部和体型描述不可修改 (除非换装)
   3. **换装替换**: 如场景需要不同服装，仅替换 Token 中的服装部分
   4. **多角色**: 多个角色出现时，每个角色都注入各自的 Token
   5. **B-Roll**: 不含角色的画面不需要注入 Token
   6. **表情追加**: 在 Token 后追加当前镜头的表情描述

   ### 注入示例

   **输入** (从分镜表):
   - 分镜: S01-C01
   - 角色: A
   - 姿态: 站在中央偏右, 面对镜头
   - 表情: 自信微笑
   - 场景: 简洁演播室
   - 景别: 中景

   **输出** (注入后的提示词):
   ```
   Clean minimalist studio background, soft gray tones,
   [30-year-old asian woman with shoulder-length black hair 
   and side bangs, wearing navy blazer over white blouse, 
   wire-rimmed glasses, slim build],
   standing center-right of frame, facing camera directly,
   confident warm smile, hands clasped naturally in front,
   medium shot from waist up, eye-level angle,
   soft three-point lighting, key light from right,
   photorealistic, 4K, sharp focus, professional portrait
   ```

   > 注意: `[30-year-old asian woman...]` 就是从 
   > `./output/characters/[name]/consistency-tokens.md` 
   > 加载的角色 Token — 原封不动嵌入
   ```

3. **分镜→提示词批量转换**

   ```markdown
   ## 批量提示词生成

   **来源**: `./output/storyboard/photo-gen-tasks.md`
   **总计**: [N] 张剧照

   ---

   ### Prompt S01-C01: [场景标题] — [角色 A] 自信开场

   **Prompt**:
   ```
   [Complete prompt with character token injected,
    scene description, pose, expression, camera, style]
   ```

   **Negative Prompt**:
   ```
   blurry, low quality, distorted face, extra limbs,
   bad anatomy, deformed, watermark, text,
   multiple characters, wrong outfit, extra accessories,
   wrong hair color, wrong hair style
   ```

   **参数**:
   - 平台: [Midjourney / SD / DALL-E]
   - 比例: 16:9 (--ar 16:9)
   - 种子: [seed for consistency]
   - 风格: [--style raw / --s 250]

   **来源分镜**: S01-C01
   **角色**: [A]
   **用途**: 主镜头剧照

   ---

   ### Prompt S01-C02: [场景标题] — [角色 A] 好奇提问

   [Same structure...]

   ---

   ### Prompt S01-B01: B-Roll — 科技氛围

   **Prompt**:
   ```
   [No character token — B-Roll without characters]
   Abstract digital data flow, glowing particles...
   ```

   [No character token needed for B-Roll]

   ---

   [Continue for all shots...]
   ```

4. **平台适配优化**

   **For Midjourney**:
   ```markdown
   ### Midjourney Prompt Template
   
   [Subject], [style], [setting], [lighting], [camera angle], [mood] --ar [ratio] --v 6 --style raw --s [stylize value]
   
   **Parameter Guide**:
   - `--ar 16:9`: Aspect ratio for video
   - `--v 6`: Version 6 (latest)
   - `--style raw`: More photographic
   - `--s 250`: Stylize (0-1000, higher = more artistic)
   - `--c 20`: Chaos (0-100, higher = more variation)
   - `--q 2`: Quality (0.25, 0.5, 1, 2)
   
   **Example**:
   ```
   modern office workspace with natural light streaming through large windows,
   professional business setting, minimalist design with plants,
   soft morning light, eye-level view, bright and airy atmosphere,
   photorealistic, architectural photography style, sharp focus,
   --ar 16:9 --v 6 --style raw --s 250
   ```
   ```
   
   **For DALL-E 3**:
   ```markdown
   ### DALL-E 3 Prompt Template
   
   [Detailed natural language description, longer and more narrative]
   
   **Tips**:
   - Use natural, descriptive language
   - Be specific about style and mood
   - Describe colors, lighting, composition
   - Can be longer than other platforms
   - No need for parameters
   
   **Example**:
   ```
   A modern office workspace bathed in warm natural morning light streaming through 
   floor-to-ceiling windows. The space features a minimalist aesthetic with clean 
   lines, a sleek wooden desk, and carefully placed green plants adding life to the 
   scene. The lighting creates a soft, inviting atmosphere with gentle shadows. 
   Shot from eye level to capture the balanced composition and professional yet 
   welcoming environment. Photorealistic style with sharp focus and architectural 
   photography aesthetics.
   ```
   ```
   
   **For Stable Diffusion**:
   ```markdown
   ### Stable Diffusion Prompt Template
   
   [Subject], [detailed description], ([style keywords]), ([quality keywords]), [lighting], [camera]
   
   **Emphasis Syntax**:
   - (keyword): mild emphasis
   - ((keyword)): stronger emphasis
   - (keyword:1.3): weighted emphasis (1.0-2.0)
   
   **Example**:
   ```
   modern office workspace, ((natural light)), large windows, minimalist design,
   (professional environment:1.2), plants, wooden desk, clean aesthetic,
   soft morning light, eye-level view, (photorealistic:1.3), (sharp focus:1.2),
   (8k uhd:1.1), architectural photography, (high quality:1.2)
   
   Negative: blurry, low quality, distorted, messy, cluttered, dark, artificial light
   ```
   ```

6. **Style Consistency Guidelines**

   ```markdown
   ## Maintaining Visual Consistency
   
   **For Series of Images**:
   
   **Consistent Elements** (keep in all prompts):
   - Color palette: [Specify exact colors]
   - Lighting setup: [Keep lighting description same]
   - Style keywords: [Use same style descriptors]
   - Quality markers: [Same technical terms]
   - Aspect ratio: [Same ratio for all]
   
   **Variable Elements** (change per prompt):
   - Subject/action
   - Specific setting details
   - Camera angle (if varied shots needed)
   
   **Example Series**:
   
   **Base Style Template**:
   ```
   [Subject], cinematic lighting, warm color palette with dominant blues and oranges,
   professional photography, shallow depth of field, 35mm lens, golden hour lighting,
   photorealistic, 8k uhd, sharp focus --ar 16:9
   ```
   
   **Prompt 1**: "tech startup founder [BASE STYLE]"
   **Prompt 2**: "modern workspace [BASE STYLE]"
   **Prompt 3**: "digital dashboard closeup [BASE STYLE]"
   
   [Each uses same style foundation but different subject]
   ```

7. **Quality Enhancement Keywords**

   ```markdown
   ## Quality & Technical Keywords
   
   **Resolution/Detail**:
   - 8k uhd, 4k, ultra high definition
   - highly detailed, intricate details, sharp focus
   - professional quality, studio quality
   
   **Photorealism**:
   - photorealistic, photo-realistic, hyperrealistic
   - realistic lighting, natural lighting
   - professional photography, DSLR
   - shot on [camera model]
   
   **Cinematic**:
   - cinematic lighting, dramatic lighting
   - depth of field, bokeh, shallow focus
   - film grain, 35mm, anamorphic
   - movie still, film screenshot
   
   **Artistic Style**:
   - digital art, concept art, matte painting
   - illustrated, stylized, artistic
   - trending on artstation, award winning
   
   **Lighting Descriptors**:
   - golden hour, blue hour, magic hour
   - soft light, hard light, dramatic light
   - rim light, back light, volumetric light
   - natural light, studio lighting, professional lighting
   
   **Camera/Lens**:
   - wide angle, telephoto, macro
   - 35mm, 50mm, 85mm lens
   - shallow depth of field, f/1.8, bokeh
   - eye level, high angle, low angle, bird's eye view
   ```

8. **Negative Prompt Library**

   ```markdown
   ## Common Negative Prompts
   
   **Quality Issues**:
   ```
   low quality, blurry, out of focus, pixelated, jpeg artifacts,
   low resolution, grainy (unless intended), noisy, distorted
   ```
   
   **Unwanted Elements**:
   ```
   watermark, text, signature, logo (unless wanted),
   border, frame, username, watermark
   ```
   
   **Anatomical Issues** (if people):
   ```
   deformed, disfigured, bad anatomy, wrong anatomy,
   extra limbs, missing limbs, floating limbs, disconnected limbs,
   mutation, mutated, ugly, disgusting, amputation
   ```
   
   **Style Issues**:
   ```
   amateur, unprofessional, bad composition, bad framing,
   cluttered, messy, chaotic (unless intended)
   ```
   
   **Lighting Issues**:
   ```
   bad lighting, overexposed, underexposed, harsh shadows (unless intended),
   too dark, too bright, flat lighting (unless intended)
   ```
   
   **Artistic Issues**:
   ```
   cartoon (unless intended), anime (unless intended), sketch (unless intended),
   painting (unless photo wanted), drawing, illustration (unless intended)
   ```
   ```

9. **Batch Prompt Generation Template**

   ```markdown
   ## Batch Prompts: [Topic/Series Name]
   
   **Shared Style Foundation**:
   ```
   [Common elements across all prompts]
   ```
   
   **Negative Prompt** (all prompts):
   ```
   [Shared negative prompt]
   ```
   
   ---
   
   ### Image 001: [Description]
   **Full Prompt**: `[Complete prompt]`
   **Use**: [Where in video]
   **Duration**: [How long shown]
   
   ### Image 002: [Description]
   **Full Prompt**: `[Complete prompt]`
   **Use**: [Where in video]
   **Duration**: [How long shown]
   
   ### Image 003: [Description]
   **Full Prompt**: `[Complete prompt]`
   **Use**: [Where in video]
   **Duration**: [How long shown]
   
   [Continue for all needed]
   
   ---
   
   **Generation Order**: [Recommended sequence]
   **Estimated Total Generation Time**: [Estimate]
   **Platform Recommended**: [Best platform for this batch]
   ```

10. **Test and Iterate Template**

    ```markdown
    ## Prompt Testing Guide
    
    **Initial Generation**:
    - Generate from Prompt 001
    - Review results
    - Note what works and what doesn't
    
    **Refinement**:
    
    **If too generic**:
    - Add more specific details
    - Add style references
    - Increase stylize/creativity
    
    **If too chaotic**:
    - Simplify description
    - Be more specific
    - Lower chaos/variation parameters
    
    **If wrong style**:
    - Add style keywords
    - Reference specific artists/styles
    - Use style parameters
    
    **If wrong composition**:
    - Be explicit about framing
    - Specify camera angle clearly
    - Describe element placement
    
    **Iteration Versions**:
    
    **v1** (Original): `[Prompt]`
    **v2** (Refinement 1): `[Adjusted prompt]`
    **v3** (Refinement 2): `[Further adjusted]`
    **Final**: `[Best performing prompt]`
    ```

11. **Save Prompts**

    保存到 `./output/prompts/`:

    ```
    ./output/prompts/
    ├── prompt-index.md            # 提示词总索引
    ├── style-foundation.md        # 风格基底定义
    ├── character-shots/           # 角色剧照提示词
    │   ├── S01-C01.md
    │   ├── S01-C02.md
    │   └── ...
    ├── broll-shots/               # B-Roll 提示词
    │   ├── S01-B01.md
    │   └── ...
    └── all-prompts.txt            # 所有提示词 (纯文本，便于复制)
    ```

12. **Provide Summary**

    ```markdown
    ✅ 剧照提示词生成完成！

    **总计**: [N] 组提示词
    - 角色剧照: [N] 张 (已注入一致性 Token)
    - B-Roll: [N] 张
    - 三视图: [N] 张

    **保存位置**:
    - 详细版: `./output/prompts/character-shots/`
    - 纯文本: `./output/prompts/all-prompts.txt`
    - 风格基底: `./output/prompts/style-foundation.md`

    **角色 Token 状态**:
    - [Name A]: ✅ 已注入 [N] 张
    - [Name B]: ✅ 已注入 [N] 张

    **Next Steps**:
    1. 批量生图: `使用 batch-image-generator 生成所有剧照`
    2. 调整提示词: `修改 S01-C02 的表情为 [新表情]`
    3. 更换风格: `将风格改为 3D 卡通`
    4. 换装生成: `为角色 A 使用休闲装方案重新生成`
    ```

## Tips

- **Token 完整注入**: 不要省略角色 Token 的任何部分，完整性 = 一致性
- **风格基底统一**: 所有提示词共享相同的 Style Foundation
- **先测后批**: 先用 1-2 张测试效果，再批量生成
- **种子一致**: 使用相同种子提高同场景的一致性
- **表情单独控制**: 表情描述放在 Token 之后，不修改 Token 本身
- **中→英翻译**: 分镜表可以是中文，但提示词输出必须是英文

## Related Skills

- `character-designer` — 上游：提供角色一致性 Token
- `storyboard-generator` — 上游：提供剧照画面描述
- `broll-generator` — 并行：提供 B-Roll 画面描述
- `batch-image-generator` — 下游：使用提示词批量生图
- `keyframe-extractor` — 参考：从参考视频提取风格
