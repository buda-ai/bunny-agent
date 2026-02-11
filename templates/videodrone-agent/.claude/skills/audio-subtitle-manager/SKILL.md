---
name: audio-subtitle-manager
description: 管理视频项目的音频层 (配音/TTS、BGM、音效) 和字幕层 (SRT/ASS 格式生成)。从场景剧本中提取对白，生成配音指导、字幕文件和音频混合方案。
---

# Audio & Subtitle Manager — 音频字幕管理器

管理视频的声音维度：将场景剧本中的对白转换为可用的配音指导和字幕文件，规划 BGM 和音效的时间轴，确保声画同步。

## When to Use This Skill

- 从场景剧本提取对白，生成字幕文件 (SRT/ASS)
- 规划 TTS/真人配音的方案和参数
- 设计 BGM 编排和音效时间轴
- 生成音频混合 (Audio Mix) 指导文件
- 为不同语言生成多语字幕

## What This Skill Does

1. **对白提取**: 自动从场景剧本中提取所有对白/旁白
2. **字幕生成**: 输出 SRT 或 ASS 格式的字幕文件
3. **配音规划**: 生成详细的配音指导 (语气、语速、情绪)
4. **TTS 参数**: 为 AI 语音合成准备参数和文本
5. **BGM 编排**: 规划背景音乐的时间轴和淡入淡出
6. **音效列表**: 汇总所有音效需求及其时间点
7. **音频时间轴**: 生成完整的声音层时间轴

## How to Use

### 从场景剧本导出

```
从场景剧本生成字幕和配音方案
```

### 指定配音方案

```
为这些场景规划 TTS 配音:
- 角色 A: 男声，成熟专业
- 角色 B: 女声，活力年轻
```

### 仅生成字幕

```
提取场景剧本的对白，生成 SRT 字幕文件
```

## Instructions

When user requests audio/subtitle management:

1. **提取对白**

   从 `./output/scripts/scenes/` 中扫描所有场景文件，提取对白：

   ```markdown
   ## 对白提取报告

   **来源**: ./output/scripts/scenes/ (N 个场景文件)
   **总字数**: [XXX] 字
   **预估配音时长**: [X:XX]
   **角色**: [列表]

   | 场景 | 时间段 | 说话人 | 对白内容 | 语气 | 预估时长 |
   |------|--------|--------|---------|------|---------|
   | S01 | 0:00 | 角色 A | "大家好..." | 自信 | 0:03 |
   | S01 | 0:03 | [旁白] | "今天我们..." | 沉稳 | 0:05 |
   | S02 | 0:08 | 角色 A | "你有没有..." | 好奇 | 0:04 |
   | ... | ... | ... | ... | ... | ... |

   **各角色对白量**:
   - 角色 A: [XXX] 字 / [X:XX] 时长
   - 角色 B: [XXX] 字 / [X:XX] 时长
   - 旁白: [XXX] 字 / [X:XX] 时长
   ```

2. **生成 SRT 字幕文件**

   ```srt
   1
   00:00:00,500 --> 00:00:03,200
   大家好，欢迎来到xxx。

   2
   00:00:03,500 --> 00:00:07,800
   今天我要跟你聊一个
   99%的人都不知道的秘密。

   3
   00:00:08,200 --> 00:00:12,000
   你有没有想过为什么
   有些人做视频就是能火？

   4
   00:00:12,500 --> 00:00:15,800
   答案其实很简单——
   ```

   **SRT 规范**:
   - 每条字幕不超过 2 行
   - 每行不超过 18 个中文字 / 42 个英文字符
   - 最短显示时间: 1 秒
   - 最长显示时间: 7 秒
   - 字幕间间隔: 至少 200ms
   - 阅读速度: ~15 字/秒 (中文) / ~21 字符/秒 (英文)

3. **生成 ASS 字幕文件** (带样式)

   ```ass
   [Script Info]
   Title: [视频标题]
   ScriptType: v4.00+
   WrapStyle: 0
   PlayResX: 1920
   PlayResY: 1080
   ScaledBorderAndShadow: yes

   [V4+ Styles]
   Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
   Style: Default,Noto Sans SC,60,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,1,2,30,30,50,1
   Style: Speaker_A,Noto Sans SC,60,&H00FFFFFF,&H000000FF,&H00FF6600,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,30,30,50,1
   Style: Speaker_B,Noto Sans SC,58,&H00F0F0F0,&H000000FF,&H003366CC,&H80000000,0,0,0,0,100,100,0,0,1,3,1,2,30,30,50,1
   Style: Emphasis,Noto Sans SC,72,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,30,30,50,1

   [Events]
   Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
   Dialogue: 0,0:00:00.50,0:00:03.20,Speaker_A,,0,0,0,,大家好，欢迎来到xxx。
   Dialogue: 0,0:00:03.50,0:00:07.80,Default,,0,0,0,,今天我要跟你聊一个\N99%的人都不知道的秘密。
   Dialogue: 0,0:00:08.20,0:00:12.00,Speaker_A,,0,0,0,,你有没有想过为什么\N有些人做视频就是能火？
   ```

   **ASS 样式说明**:
   - 为不同角色定义不同样式 (字色、描边色)
   - 强调文字用特殊样式
   - 可添加 `{\fad(300,200)}` 淡入淡出效果
   - 支持 `\N` 手动换行
   - 支持动画效果: `{\move}`, `{\t}`, `{\clip}`

4. **配音指导文档**

   ```markdown
   ## 配音指导 (Voiceover Guide)

   ### 全局设定

   | 参数 | 值 |
   |------|-----|
   | 语言 | 中文普通话 |
   | 采样率 | 48 kHz |
   | 位深 | 24-bit |
   | 格式 | WAV (原始) / MP3 (成品) |
   | 码率 | 320 kbps (MP3) |

   ---

   ### 角色 A: [角色名]

   **声音特征**:
   - 性别:音色: [男声 / 女声 / 中性]
   - 音高: [低沉 / 中等 / 清亮]
   - 语速: [正常 ~200 字/分 / 偏快 ~250 / 偏慢 ~160]
   - 风格: [专业播报 / 亲切聊天 / 活力年轻 / 权威严肃]
   - 参考: [知名配音员 / 播客主持人 / 相似风格]

   **TTS 推荐** (AI 语音):
   - 平台: [Azure TTS / ElevenLabs / 讯飞 / MiniMax]
   - Voice ID: [推荐的声音 ID]
   - 参数: speed=1.0, pitch=0, emotion=friendly

   **逐段配音指导**:

   | SegID | 时间 | 对白 | 语气 | 语速 | 特殊指示 |
   |-------|------|------|------|------|---------|
   | A-01 | 0:00 | "大家好..." | 自信,微笑 | 正常 | 开场感，稍微提高音量 |
   | A-02 | 0:08 | "你有没有..." | 好奇,期待 | 稍慢 | 设问句，尾音上扬 |
   | A-03 | 0:15 | "答案其实..." | 揭秘,得意 | 先停顿再说 | [停顿 0.5s] 后开始 |

   ---

   ### 旁白 (Narrator)

   **声音特征**:
   - [与角色声音保持一致 / 用不同声音]
   - 距离感: [贴近耳边 / 中等距离 / 有回声感]
   - 语速: [偏慢 — 留给画面]
   ```

5. **BGM 编排**

   ```markdown
   ## BGM 编排方案

   ### 音乐风格定义

   **全局风格**: [电子/钢琴/吉他/管弦乐/Lo-Fi/...]
   **情绪关键词**: [轻快, 温暖, 科技感, 励志, 神秘]
   **参考曲目**: [列出类似风格的参考曲]
   **音量基准**: -20dB (对白时) / -12dB (纯音乐段)

   ### 时间轴

   | 时间段 | BGM 描述 | 音量 | 过渡 | 对应场景 |
   |--------|---------|------|------|---------|
   | 0:00-0:05 | 开场 Intro — 短促有力的节拍 | -15dB → -20dB | Fade In 1s | S1: Hook |
   | 0:05-0:25 | 轻快节奏 — 持续铺底 | -20dB | — | S2: 介绍 |
   | 0:25-0:55 | 推进感加强 — 节奏略快 | -20dB | Crossfade 2s | S3: 要点 |
   | 0:55-1:00 | 小高潮 — 鼓点加强 | -15dB | — | S4: 案例 |
   | 1:00-1:30 | 沉稳深入 — 钢琴为主 | -22dB | Crossfade 2s | S5: 分析 |
   | 1:30-1:45 | 结尾升华 — 略带感动 | -18dB → Fade Out | — | S6: 总结 |
   ```

6. **音效列表**

   ```markdown
   ## 音效清单 (SFX List)

   | # | 时间点 | 音效描述 | 类型 | 时长 | 音量 | 来源 |
   |---|--------|---------|------|------|------|------|
   | 1 | 0:02 | 文字飞入 Whoosh | 转场 | 0.5s | -10dB | 素材库 |
   | 2 | 0:08 | 设问"叮"提示音 | 强调 | 0.3s | -15dB | 素材库 |
   | 3 | 0:15 | 翻页音效 | 转场 | 0.4s | -18dB | 素材库 |
   | 4 | 0:30 | 数据弹出 Pop | UI | 0.2s | -12dB | 合成 |
   | ... | ... | ... | ... | ... | ... | ... |

   **音效分类**:
   - 🔊 **转场** (Transition): whoosh, swipe, snap
   - 🔔 **强调** (Emphasis): ding, chime, impact
   - 🖱️ **UI** (Interface): click, pop, slide
   - 🌍 **环境** (Ambience): 办公室白噪, 城市, 自然
   - 🎉 **情绪** (Emotion): 成功音, 惊喜, 紧张感
   ```

7. **音频时间轴汇总**

   ```markdown
   ## 音频时间轴 (Audio Timeline)

   ```
   0:00     0:10     0:20     0:30     0:40     0:50     1:00
   |--------|--------|--------|--------|--------|--------|
   
   配音 (VO):
   |==A-01==|  |==A-02==|   |====A-03====|   |==A-04..
   
   BGM:
   |▓▓▓ Intro ▓▓|░░░░ Light ░░░░░░░░░░|▓▓ Build ▓▓▓▓|
   
   音效 (SFX):
       ↑         ↑              ↑    ↑        ↑
      whoosh    ding            pop  pop     whoosh
   
   字幕:
   |Sub1|  |Sub2|   |--Sub3---|   |Sub4|  |--Sub5---|
   ```
   ```

8. **保存文件**

   保存到 `./output/` 的以下位置：

   ```
   ./output/
   ├── subtitles/
   │   ├── [video-name].srt          # SRT 字幕
   │   ├── [video-name].ass          # ASS 样式字幕
   │   └── subtitle-style-guide.md   # 字幕样式说明
   ├── audio/
   │   ├── voiceover-guide.md        # 配音指导文档
   │   ├── bgm-timeline.md           # BGM 编排方案
   │   ├── sfx-list.md               # 音效清单
   │   └── audio-timeline.md         # 音频时间轴汇总
   └── scripts/
       └── dialogue-extract.md       # 对白提取表
   ```

9. **输出总结**

   ```markdown
   ✅ 音频字幕方案完成！

   **字幕**:
   - SRT: `./output/subtitles/[name].srt` ([N] 条字幕)
   - ASS: `./output/subtitles/[name].ass` (含样式)

   **配音**:
   - 指导文档: `./output/audio/voiceover-guide.md`
   - 角色数: [N] 个
   - 总配音时长: [X:XX]

   **BGM**: `./output/audio/bgm-timeline.md`
   **音效**: `./output/audio/sfx-list.md` ([N] 个音效)

   **Next Steps**:
   1. 生成 TTS: `用 TTS 合成角色 A 的配音`
   2. 修改字幕: `修改第 [N] 条字幕的时间`
   3. 多语字幕: `生成英文版字幕`
   4. 查看时间轴: `显示完整音频时间轴`
   ```

## Tips

- **字幕跟着声音走**: 先确定配音时长，再调整字幕时间
- **BGM 不要盖住人声**: 对白时 BGM 音量 -20dB 以下
- **SRT vs ASS**: 简单字幕用 SRT，需要样式效果用 ASS
- **字幕断行**: 在语义自然停顿处断行，不要把一个词拆开
- **配音前先通读**: 全文通读一遍，确保语气连贯

## Related Skills

- `scene-scriptwriter` — 上游：提供对白内容
- `prompt-generator` — 在剧照中嵌入字幕参考位置
- `digital-human-integrator` — 数字人口型同步需配合配音
- `broll-generator` — B-Roll 段落通常没有对白，只有旁白/BGM
