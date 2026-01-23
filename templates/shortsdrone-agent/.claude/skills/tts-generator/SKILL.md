---
name: tts-generator
description: Text-to-Speech generator supporting multiple languages and voices. Uses Edge TTS (free) or OpenAI TTS (paid).
---

# TTS 语音合成器

将文字转换为自然语音，支持多语言、多音色。

## 支持的 TTS 引擎

| 引擎 | 成本 | 质量 | 语言 |
|------|------|------|------|
| Edge TTS | 免费 | 高 | 多语言 |
| OpenAI TTS | $0.015/1K字符 | 极高 | 多语言 |
| Azure TTS | 付费 | 极高 | 多语言 |

## 使用方法

```
将以下文字转为语音:
大家好，欢迎来到我的频道...
```

```
TTS 生成:
- 文字: Hello, welcome to my channel
- 声音: 女声
- 语言: 英文
- 语速: 正常
```

## Instructions

### 安装依赖

```bash
# Edge TTS (推荐)
pip install edge-tts 2>/dev/null || python3 -m pip install edge-tts
```

### 列出可用声音

```bash
edge-tts --list-voices | grep -E "^(zh-|en-)" | head -20
```

### 生成语音

**基本用法:**
```bash
TEXT="大家好，今天分享一个实用技巧"
VOICE="zh-CN-XiaoxiaoNeural"
OUTPUT="./temp/output.mp3"

edge-tts --voice "$VOICE" --text "$TEXT" --write-media "$OUTPUT"
```

**从文件读取:**
```bash
edge-tts --voice "zh-CN-XiaoxiaoNeural" \
  --file ./temp/script.txt \
  --write-media ./temp/voice.mp3 \
  --write-subtitles ./temp/voice.vtt
```

**调整语速:**
```bash
# 加快 20%
edge-tts --voice "zh-CN-XiaoxiaoNeural" --rate "+20%" \
  --text "加快语速的示例" \
  --write-media ./temp/fast.mp3

# 减慢 20%
edge-tts --voice "zh-CN-XiaoxiaoNeural" --rate "-20%" \
  --text "减慢语速的示例" \
  --write-media ./temp/slow.mp3
```

**调整音量:**
```bash
edge-tts --voice "zh-CN-XiaoxiaoNeural" --volume "+50%" \
  --text "提高音量" \
  --write-media ./temp/loud.mp3
```

**调整音调:**
```bash
edge-tts --voice "zh-CN-XiaoxiaoNeural" --pitch "+10Hz" \
  --text "提高音调" \
  --write-media ./temp/high_pitch.mp3
```

## 可用声音

### 中文普通话
```
zh-CN-XiaoxiaoNeural     女声，温柔亲切（推荐）
zh-CN-XiaoyiNeural       女声，活泼年轻
zh-CN-YunxiNeural        男声，年轻阳光（推荐）
zh-CN-YunjianNeural      男声，成熟稳重
zh-CN-YunyangNeural      男声，专业新闻
zh-CN-XiaochenNeural     女声，专业
zh-CN-XiaohanNeural      女声，平和
zh-CN-XiaomengNeural     女声，童声
zh-CN-XiaomoNeural       女声，情感丰富
zh-CN-XiaoqiuNeural      女声，优雅
zh-CN-XiaoruiNeural      女声，童声
zh-CN-XiaoshuangNeural   女声，童声
zh-CN-XiaoxuanNeural     女声，活力
zh-CN-XiaoyanNeural      女声，专业
zh-CN-XiaoyouNeural      女声，童声
zh-CN-XiaozhenNeural     女声，新闻
zh-CN-YunfengNeural      男声，自然
zh-CN-YunhaoNeural       男声，自然
zh-CN-YunzeNeural        男声，多风格
```

### 中文（其他地区）
```
zh-TW-HsiaoChenNeural    女声，台湾口音
zh-TW-HsiaoYuNeural      女声，台湾口音
zh-TW-YunJheNeural       男声，台湾口音
zh-HK-HiuGaaiNeural      女声，粤语
zh-HK-HiuMaanNeural      女声，粤语
zh-HK-WanLungNeural      男声，粤语
```

### 英文
```
en-US-JennyNeural        女声，友好（推荐）
en-US-GuyNeural          男声，专业
en-US-AriaNeural         女声，自然（推荐）
en-US-DavisNeural        男声，自然
en-US-JaneNeural         女声，专业
en-US-JasonNeural        男声，自然
en-US-NancyNeural        女声，专业
en-US-SaraNeural         女声，年轻
en-US-TonyNeural         男声，友好
en-GB-LibbyNeural        女声，英式
en-GB-RyanNeural         男声，英式
en-AU-NatashaNeural      女声，澳式
en-AU-WilliamNeural      男声，澳式
```

### 日文
```
ja-JP-NanamiNeural       女声
ja-JP-KeitaNeural        男声
```

### 韩文
```
ko-KR-SunHiNeural        女声
ko-KR-InJoonNeural       男声
```

## OpenAI TTS (高质量)

```bash
# 需要设置 OPENAI_API_KEY
curl https://api.openai.com/v1/audio/speech \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "tts-1-hd",
    "input": "要转换的文字内容",
    "voice": "nova"
  }' \
  --output ./temp/openai_voice.mp3
```

**OpenAI 可用声音:**
- `alloy` - 中性
- `echo` - 男声
- `fable` - 男声（英式）
- `onyx` - 男声（深沉）
- `nova` - 女声（推荐）
- `shimmer` - 女声

## 输出

- 音频文件: `./temp/voice.mp3`
- 字幕文件: `./temp/voice.vtt` (Edge TTS 自动生成)

## 最佳实践

1. **断句处理**: 长文本添加适当标点，控制节奏
2. **语速调整**: 口播视频建议 +10% 语速
3. **音量平衡**: 确保与背景音乐的平衡
4. **格式转换**: MP3 适合大多数场景，WAV 用于后期处理
