---
name: thumbnail-creator
description: Generate eye-catching thumbnails for short videos with text overlays and effects.
---

# 缩略图/封面生成器

为短视频生成吸引眼球的封面图，支持文字叠加和特效。

## 功能

1. **自动提取**: 从视频中智能选取最佳帧
2. **文字叠加**: 添加标题文字
3. **模板应用**: 使用预设封面模板
4. **批量生成**: 为多个视频生成封面

## 使用方法

```
为这个视频生成封面: ./output/shorts/video.mp4
```

```
生成封面:
- 视频: ./output/shorts/video.mp4
- 标题: 3个改变人生的习惯
- 风格: 抖音风格
```

## Instructions

### Step 1: 从视频提取帧

```bash
VIDEO="[VIDEO_PATH]"
OUTPUT_DIR="./output/thumbnails"
mkdir -p "$OUTPUT_DIR"

# 获取视频信息
DURATION=$(ffprobe -v error -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 "$VIDEO")

# 提取多个候选帧
for i in 1 2 3 4 5; do
  TIMESTAMP=$(echo "$DURATION * $i / 6" | bc)
  ffmpeg -y -ss "$TIMESTAMP" -i "$VIDEO" \
    -vframes 1 -q:v 2 \
    "$OUTPUT_DIR/candidate_$i.jpg"
done

echo "已提取 5 个候选帧，请选择最佳的一张"
ls -la "$OUTPUT_DIR"/candidate_*.jpg
```

### Step 2: 智能选帧

```python
# 使用简单规则选择最佳帧
# 优先选择: 人脸清晰、光线好、构图佳

import subprocess
import os

output_dir = "./output/thumbnails"
candidates = [f for f in os.listdir(output_dir) if f.startswith("candidate_")]

# 简单规则: 选择文件大小最大的 (通常细节最丰富)
best = max(candidates, key=lambda x: os.path.getsize(os.path.join(output_dir, x)))
print(f"推荐使用: {best}")
```

### Step 3: 添加文字标题

```bash
THUMBNAIL="./output/thumbnails/candidate_1.jpg"
TITLE="3个改变人生的习惯"
OUTPUT="./output/thumbnails/cover_with_text.jpg"

# 使用 ImageMagick 添加文字
# 安装: brew install imagemagick

convert "$THUMBNAIL" \
  -gravity South \
  -fill white \
  -stroke black \
  -strokewidth 2 \
  -font "Noto-Sans-CJK-SC-Bold" \
  -pointsize 64 \
  -annotate +0+100 "$TITLE" \
  "$OUTPUT"

echo "✅ 封面生成完成: $OUTPUT"
```

### Step 4: 使用 FFmpeg 添加文字（无需 ImageMagick）

```bash
THUMBNAIL="./output/thumbnails/candidate_1.jpg"
TITLE="3个改变人生的习惯"
OUTPUT="./output/thumbnails/cover_ffmpeg.jpg"

ffmpeg -y -i "$THUMBNAIL" \
  -vf "
    drawtext=text='$TITLE':
    fontfile=/System/Library/Fonts/PingFang.ttc:
    fontsize=48:
    fontcolor=white:
    borderw=3:
    bordercolor=black:
    x=(w-text_w)/2:
    y=h-th-100
  " \
  "$OUTPUT"
```

### Step 5: 应用封面模板

```bash
# 模板1: 抖音/TikTok 风格 (渐变遮罩 + 大标题)
create_douyin_style() {
  local INPUT=$1
  local TITLE=$2
  local OUTPUT=$3
  
  ffmpeg -y -i "$INPUT" \
    -vf "
      scale=1080:1920:force_original_aspect_ratio=increase,
      crop=1080:1920,
      drawbox=y=ih*0.7:w=iw:h=ih*0.3:color=black@0.5:t=fill,
      drawtext=text='$TITLE':
        fontfile=/System/Library/Fonts/PingFang.ttc:
        fontsize=56:
        fontcolor=white:
        x=(w-text_w)/2:
        y=h*0.8
    " \
    "$OUTPUT"
}

# 模板2: B站风格 (信息框 + 头像占位)
create_bilibili_style() {
  local INPUT=$1
  local TITLE=$2
  local OUTPUT=$3
  
  ffmpeg -y -i "$INPUT" \
    -vf "
      scale=1920:1080:force_original_aspect_ratio=increase,
      crop=1920:1080,
      drawbox=x=50:y=ih-150:w=iw-100:h=100:color=black@0.7:t=fill,
      drawtext=text='$TITLE':
        fontfile=/System/Library/Fonts/PingFang.ttc:
        fontsize=40:
        fontcolor=white:
        x=70:
        y=ih-120
    " \
    "$OUTPUT"
}

# 模板3: 小红书风格 (圆角 + 软色调)
create_xiaohongshu_style() {
  local INPUT=$1
  local TITLE=$2
  local OUTPUT=$3
  
  ffmpeg -y -i "$INPUT" \
    -vf "
      scale=1080:1350,
      eq=brightness=0.05:saturation=1.2,
      drawtext=text='$TITLE':
        fontfile=/System/Library/Fonts/PingFang.ttc:
        fontsize=48:
        fontcolor=white:
        borderw=2:
        bordercolor=black:
        x=(w-text_w)/2:
        y=h*0.85
    " \
    "$OUTPUT"
}
```

### Step 6: 批量生成

```bash
for video in ./output/shorts/*.mp4; do
  basename=$(basename "$video" .mp4)
  
  # 提取帧
  ffmpeg -y -ss 1 -i "$video" -vframes 1 -q:v 2 \
    "./output/thumbnails/${basename}_thumb.jpg"
  
  echo "✅ 生成封面: ${basename}_thumb.jpg"
done
```

## 文字样式选项

### 字体推荐
```
macOS:
- /System/Library/Fonts/PingFang.ttc (苹方)
- /System/Library/Fonts/STHeiti Light.ttc (华文黑体)

Linux:
- /usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc
```

### 颜色方案
```
fontcolor=white:bordercolor=black   # 经典白字黑边
fontcolor=yellow:bordercolor=red    # 醒目警告
fontcolor=#FFE066:bordercolor=#000  # 金色标题
```

## 输出

- 候选帧: `./output/thumbnails/candidate_*.jpg`
- 最终封面: `./output/thumbnails/{video_name}_cover.jpg`
- 各平台版本:
  - 竖版 (9:16): 抖音、TikTok、快手
  - 横版 (16:9): B站、YouTube
  - 方形 (1:1): 小红书

## 尺寸参考

| 平台 | 推荐尺寸 | 比例 |
|------|----------|------|
| 抖音/TikTok | 1080×1920 | 9:16 |
| B站 | 1920×1080 | 16:9 |
| 小红书 | 1080×1350 | 4:5 |
| YouTube | 1280×720 | 16:9 |
| Instagram Reels | 1080×1920 | 9:16 |
