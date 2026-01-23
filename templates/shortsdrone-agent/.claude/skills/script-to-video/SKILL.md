---
name: script-to-video
description: Convert text script to talking-head short video. Uses TTS for voice generation and combines with background video or avatar.
---

# 文案转视频 (Script to Video)

将文字脚本转换为口播短视频，支持 TTS 语音合成和多种背景素材。

## 功能

1. **文案解析**: 分析脚本结构，优化断句
2. **语音合成**: 使用 TTS 生成自然语音
3. **视频生成**: 合成语音 + 背景 + 字幕
4. **多平台输出**: 适配抖音、快手、视频号等

## 使用方法

### 基本用法
```
用这段文案生成口播短视频:

大家好，今天分享一个很实用的技巧...
```

### 带参数
```
文案转视频:

【内容】
大家好，今天分享3个提高效率的方法...

【要求】
- 声音: 年轻女声
- 语速: 中速
- 背景: 简约办公室
- 时长: 控制在45秒内
```

## Instructions

### Step 1: 解析文案

```bash
# 保存文案到文件
cat > ./temp/script.txt << 'SCRIPT'
[USER_INPUT_SCRIPT]
SCRIPT

# 分析文案
python3 << 'EOF'
import re

with open('./temp/script.txt', 'r') as f:
    script = f.read()

# 清理文案
script = re.sub(r'\n+', '\n', script.strip())

# 估算时长 (中文约 4 字/秒，英文约 2.5 词/秒)
chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', script))
english_words = len(re.findall(r'[a-zA-Z]+', script))
estimated_duration = chinese_chars / 4 + english_words / 2.5

print(f"文案字数: {len(script)}")
print(f"中文字符: {chinese_chars}")
print(f"预估时长: {estimated_duration:.1f} 秒")

# 检查时长
if estimated_duration > 60:
    print("⚠️ 文案较长，建议精简或分段")
elif estimated_duration < 15:
    print("⚠️ 文案较短，可适当扩充")
else:
    print("✓ 时长适中，适合短视频")

# 保存处理后的文案
with open('./temp/script_clean.txt', 'w') as f:
    f.write(script)
EOF
```

### Step 2: 生成语音 (TTS)

**方法 A: Edge TTS (免费，推荐)**

```bash
# 安装 edge-tts
pip install edge-tts 2>/dev/null || python3 -m pip install edge-tts

# 可用的中文声音
# zh-CN-XiaoxiaoNeural (女声，温柔)
# zh-CN-YunxiNeural (男声，年轻)
# zh-CN-XiaoyiNeural (女声，活泼)
# zh-CN-YunjianNeural (男声，成熟)

VOICE="zh-CN-XiaoxiaoNeural"
RATE="+0%"  # 语速调整: -50% 到 +100%

edge-tts --voice "$VOICE" --rate "$RATE" \
  --file ./temp/script_clean.txt \
  --write-media ./temp/voice.mp3 \
  --write-subtitles ./temp/voice.vtt

echo "✅ 语音生成完成"
```

**方法 B: OpenAI TTS (付费，高质量)**

```bash
# 需要配置 OPENAI_API_KEY
if [ -n "$OPENAI_API_KEY" ]; then
  curl -s https://api.openai.com/v1/audio/speech \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"model\": \"tts-1-hd\",
      \"input\": \"$(cat ./temp/script_clean.txt)\",
      \"voice\": \"nova\"
    }" \
    --output ./temp/voice.mp3
fi
```

### Step 3: 生成字幕

```bash
# 如果 TTS 没有生成字幕，使用 Whisper 转录
if [ ! -f "./temp/voice.vtt" ]; then
  # 方法1: 使用 Whisper API
  # 方法2: 基于文案自动生成
  python3 << 'EOF'
import re

with open('./temp/script_clean.txt', 'r') as f:
    text = f.read()

# 简单分句
sentences = re.split(r'[。！？\n]', text)
sentences = [s.strip() for s in sentences if s.strip()]

# 估算每句时间
total_chars = sum(len(s) for s in sentences)
time_per_char = 0.25  # 秒

# 生成 SRT
with open('./temp/voice.srt', 'w') as f:
    current_time = 0
    for i, sentence in enumerate(sentences, 1):
        duration = len(sentence) * time_per_char
        start = current_time
        end = current_time + duration
        
        start_str = f"{int(start//3600):02d}:{int((start%3600)//60):02d}:{int(start%60):02d},{int((start%1)*1000):03d}"
        end_str = f"{int(end//3600):02d}:{int((end%3600)//60):02d}:{int(end%60):02d},{int((end%1)*1000):03d}"
        
        f.write(f"{i}\n{start_str} --> {end_str}\n{sentence}\n\n")
        current_time = end

print("✅ 字幕生成完成: ./temp/voice.srt")
EOF
fi
```

### Step 4: 准备背景视频

```bash
# 获取音频时长
AUDIO_DURATION=$(ffprobe -v error -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 ./temp/voice.mp3)

echo "音频时长: $AUDIO_DURATION 秒"

# 背景选项:
# 1. 纯色背景
# 2. 渐变背景  
# 3. 用户提供的背景视频
# 4. 库存素材

# 生成简约渐变背景
ffmpeg -y -f lavfi \
  -i "gradients=size=1080x1920:c0=1a1a2e:c1=16213e:duration=$AUDIO_DURATION" \
  -c:v libx264 -pix_fmt yuv420p \
  ./temp/background.mp4

echo "✅ 背景视频生成完成"
```

### Step 5: 合成最终视频

```bash
mkdir -p ./output/shorts

# 合并音频 + 背景 + 字幕
ffmpeg -y \
  -i ./temp/background.mp4 \
  -i ./temp/voice.mp3 \
  -vf "subtitles=./temp/voice.srt:force_style='FontName=Noto Sans CJK SC,FontSize=28,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,Alignment=2,MarginV=100'" \
  -c:v libx264 -preset fast -crf 23 \
  -c:a aac -b:a 128k \
  -shortest \
  ./output/shorts/script_video_001.mp4

echo "✅ 视频生成完成: ./output/shorts/script_video_001.mp4"

# 获取视频信息
ffprobe -v error -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 ./output/shorts/script_video_001.mp4
```

### Step 6: 生成封面

```bash
# 从视频中提取封面帧
ffmpeg -y -i ./output/shorts/script_video_001.mp4 \
  -ss 00:00:01 -vframes 1 \
  ./output/thumbnails/script_video_001_thumb.jpg

echo "✅ 封面生成完成"
```

## TTS 声音选项

### Edge TTS 中文声音
| 声音ID | 性别 | 风格 |
|--------|------|------|
| zh-CN-XiaoxiaoNeural | 女 | 温柔、亲切 |
| zh-CN-XiaoyiNeural | 女 | 活泼、年轻 |
| zh-CN-YunxiNeural | 男 | 年轻、阳光 |
| zh-CN-YunjianNeural | 男 | 成熟、稳重 |
| zh-CN-YunyangNeural | 男 | 专业、新闻 |

### 英文声音
| 声音ID | 性别 | 风格 |
|--------|------|------|
| en-US-JennyNeural | 女 | 友好 |
| en-US-GuyNeural | 男 | 专业 |
| en-US-AriaNeural | 女 | 自然 |

## 输出

- 语音文件: `./temp/voice.mp3`
- 字幕文件: `./temp/voice.srt`
- 最终视频: `./output/shorts/script_video_XXX.mp4`
- 封面图: `./output/thumbnails/script_video_XXX_thumb.jpg`

## 进阶选项

### 添加背景音乐
```bash
# 混合语音和背景音乐
ffmpeg -i ./temp/voice.mp3 -i ./assets/bgm.mp3 \
  -filter_complex "[1:a]volume=0.2[bgm];[0:a][bgm]amix=inputs=2:duration=first" \
  ./temp/voice_with_bgm.mp3
```

### 自定义背景视频
```bash
# 使用用户提供的背景
ffmpeg -stream_loop -1 -i ./input/background.mp4 \
  -i ./temp/voice.mp3 \
  -t $AUDIO_DURATION \
  -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" \
  ./output/shorts/custom_bg.mp4
```
