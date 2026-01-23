---
name: local-video-import
description: Import and process local video/audio files for short video creation.
---

# 本地视频导入

处理用户提供的本地视频或音频文件，用于短视频制作。

## 支持的格式

### 视频格式
- MP4, MOV, AVI, MKV, WebM, FLV

### 音频格式
- MP3, WAV, M4A, AAC, FLAC, OGG

## 使用方法

```
处理这个本地视频: ./input/my-video.mp4
```

```
从这个音频创建短视频: ./input/podcast.mp3
```

```
导入视频并提取精彩片段: ./input/long-video.mov
```

## Instructions

### Step 1: 检查文件

```bash
INPUT_FILE="[USER_INPUT_PATH]"

# 检查文件是否存在
if [ ! -f "$INPUT_FILE" ]; then
  echo "❌ 文件不存在: $INPUT_FILE"
  echo "请检查文件路径，或将文件放入 ./input/ 目录"
  exit 1
fi

# 获取文件信息
echo "📄 文件信息:"
ffprobe -v quiet -print_format json -show_format -show_streams "$INPUT_FILE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
fmt = data.get('format', {})
streams = data.get('streams', [])

print(f\"文件名: {fmt.get('filename', 'N/A').split('/')[-1]}\")
print(f\"时长: {float(fmt.get('duration', 0)):.1f} 秒\")
print(f\"大小: {int(fmt.get('size', 0)) / 1024 / 1024:.1f} MB\")

for stream in streams:
    if stream['codec_type'] == 'video':
        print(f\"视频: {stream.get('width')}x{stream.get('height')}, {stream.get('codec_name')}\")
    elif stream['codec_type'] == 'audio':
        print(f\"音频: {stream.get('sample_rate')} Hz, {stream.get('codec_name')}\")
"
```

### Step 2: 复制到工作目录

```bash
mkdir -p ./output/downloads

# 生成唯一文件名
BASENAME=$(basename "$INPUT_FILE")
EXTENSION="${BASENAME##*.}"
FILENAME="${BASENAME%.*}"
TIMESTAMP=$(date +%s)
OUTPUT_NAME="${FILENAME}_${TIMESTAMP}"

# 复制或转换文件
if [[ "$EXTENSION" =~ ^(mp4|mov|mkv|webm|avi)$ ]]; then
  # 视频文件 - 转换为标准 MP4
  echo "转换视频格式..."
  ffmpeg -i "$INPUT_FILE" \
    -c:v libx264 -preset fast -crf 23 \
    -c:a aac -b:a 128k \
    "./output/downloads/${OUTPUT_NAME}.mp4"
else
  # 音频文件 - 复制
  cp "$INPUT_FILE" "./output/downloads/${OUTPUT_NAME}.${EXTENSION}"
fi

echo "✅ 文件已导入: ./output/downloads/${OUTPUT_NAME}.*"
```

### Step 3: 提取音频（如果是视频）

```bash
IMPORTED_FILE=$(ls -t ./output/downloads/${OUTPUT_NAME}.* 2>/dev/null | head -1)

if [[ "$IMPORTED_FILE" =~ \.(mp4|mov|mkv|webm|avi)$ ]]; then
  echo "提取音频..."
  ffmpeg -i "$IMPORTED_FILE" \
    -vn -acodec libmp3lame -q:a 2 \
    "./output/downloads/${OUTPUT_NAME}.mp3"
  echo "✅ 音频提取完成"
fi
```

### Step 4: 生成缩略图预览

```bash
if [[ "$IMPORTED_FILE" =~ \.(mp4|mov|mkv|webm|avi)$ ]]; then
  mkdir -p ./output/thumbnails
  
  # 生成多个预览帧
  DURATION=$(ffprobe -v error -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "$IMPORTED_FILE")
  
  for i in 1 2 3 4 5; do
    TIMESTAMP=$(echo "$DURATION * $i / 6" | bc)
    ffmpeg -y -ss "$TIMESTAMP" -i "$IMPORTED_FILE" \
      -vframes 1 -q:v 2 \
      "./output/thumbnails/${OUTPUT_NAME}_preview_${i}.jpg"
  done
  
  echo "✅ 预览图生成完成"
fi
```

### Step 5: 报告导入结果

```markdown
## ✅ 文件导入成功

**原始文件**: [原路径]
**导入位置**: ./output/downloads/{filename}

### 文件信息
- 类型: 视频/音频
- 时长: XX 分 XX 秒
- 分辨率: 1920x1080 (如果是视频)

### 生成的文件
- 视频: ./output/downloads/{filename}.mp4
- 音频: ./output/downloads/{filename}.mp3
- 预览图: ./output/thumbnails/{filename}_preview_*.jpg

### 下一步
1. 使用 `speech-transcriber` 转录音频
2. 使用 `highlight-finder` 识别精彩片段
3. 使用 `shorts-generator` 生成短视频
```

## 批量导入

```bash
# 导入目录中的所有视频
for file in ./input/videos/*; do
  if [[ -f "$file" ]]; then
    echo "处理: $file"
    # 执行导入流程...
  fi
done
```

## 格式转换

### 转换为竖屏格式
```bash
ffmpeg -i "$INPUT_FILE" \
  -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:-1:-1:color=black" \
  -c:a copy \
  "./output/downloads/vertical.mp4"
```

### 提取指定片段
```bash
# 提取 10 秒到 40 秒
ffmpeg -i "$INPUT_FILE" \
  -ss 00:00:10 -to 00:00:40 \
  -c copy \
  "./output/clips/clip.mp4"
```
