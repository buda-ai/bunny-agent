---
name: video-merger
description: Merge multiple video clips or shorts into one video, with transitions and effects.
---

# 视频合并工具

将多个短视频片段合并成一个完整视频，支持转场效果和统一处理。

## 功能

1. **顺序合并**: 按顺序拼接多个视频
2. **转场效果**: 添加淡入淡出等过渡
3. **统一格式**: 确保输出格式一致
4. **背景音乐**: 添加统一背景音乐

## 使用方法

```
合并这些视频: clip1.mp4, clip2.mp4, clip3.mp4
```

```
把 ./output/shorts/ 目录下的所有短视频合并成一个
```

## Instructions

### Step 1: 准备文件列表

```bash
# 创建视频列表文件
mkdir -p ./temp

# 方式1: 指定文件
cat > ./temp/merge_list.txt << 'EOF'
file './output/shorts/clip1.mp4'
file './output/shorts/clip2.mp4'
file './output/shorts/clip3.mp4'
EOF

# 方式2: 自动扫描目录
for f in ./output/shorts/*.mp4; do
  echo "file '$f'"
done > ./temp/merge_list.txt

cat ./temp/merge_list.txt
```

### Step 2: 统一视频格式

```bash
# 确保所有视频格式一致（分辨率、帧率、编码）
mkdir -p ./temp/normalized

while read -r line; do
  file=$(echo "$line" | sed "s/file '//;s/'//")
  if [ -f "$file" ]; then
    basename=$(basename "$file")
    
    ffmpeg -i "$file" \
      -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:-1:-1:color=black" \
      -r 30 \
      -c:v libx264 -preset fast -crf 23 \
      -c:a aac -b:a 128k -ar 44100 \
      "./temp/normalized/$basename"
  fi
done < ./temp/merge_list.txt

# 更新列表
for f in ./temp/normalized/*.mp4; do
  echo "file '$f'"
done > ./temp/normalized_list.txt
```

### Step 3: 简单合并（无转场）

```bash
# 使用 concat demuxer 直接合并
ffmpeg -f concat -safe 0 -i ./temp/normalized_list.txt \
  -c copy \
  ./output/merged/merged_simple.mp4

echo "✅ 简单合并完成"
```

### Step 4: 带转场效果合并

```bash
# 淡入淡出转场
# 获取视频数量和时长信息
VIDEO_COUNT=$(wc -l < ./temp/normalized_list.txt)
TRANSITION_DURATION=0.5

# 使用 xfade 滤镜添加转场
# 注意: 需要 FFmpeg 4.3+

# 对于2个视频的简单示例:
VIDEO1="./temp/normalized/clip1.mp4"
VIDEO2="./temp/normalized/clip2.mp4"
VIDEO1_DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$VIDEO1")

OFFSET=$(echo "$VIDEO1_DURATION - $TRANSITION_DURATION" | bc)

ffmpeg -i "$VIDEO1" -i "$VIDEO2" \
  -filter_complex "
    [0:v][1:v]xfade=transition=fade:duration=${TRANSITION_DURATION}:offset=${OFFSET}[v];
    [0:a][1:a]acrossfade=d=${TRANSITION_DURATION}[a]
  " \
  -map "[v]" -map "[a]" \
  -c:v libx264 -preset fast -crf 23 \
  -c:a aac -b:a 128k \
  ./output/merged/merged_fade.mp4

echo "✅ 淡入淡出转场合并完成"
```

### Step 5: 添加背景音乐

```bash
MERGED_VIDEO="./output/merged/merged_simple.mp4"
BGM_FILE="./assets/bgm.mp3"
OUTPUT="./output/merged/merged_with_bgm.mp4"

if [ -f "$BGM_FILE" ]; then
  # 获取视频时长
  VIDEO_DURATION=$(ffprobe -v error -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "$MERGED_VIDEO")
  
  # 混合音频 (原声 + BGM)
  ffmpeg -i "$MERGED_VIDEO" -i "$BGM_FILE" \
    -filter_complex "
      [1:a]volume=0.15,aloop=loop=-1:size=2e+09[bgm];
      [bgm]atrim=0:$VIDEO_DURATION[bgm_trimmed];
      [0:a][bgm_trimmed]amix=inputs=2:duration=first:dropout_transition=2[a]
    " \
    -map 0:v -map "[a]" \
    -c:v copy \
    -c:a aac -b:a 128k \
    "$OUTPUT"
  
  echo "✅ 背景音乐已添加"
else
  echo "⚠️ 未找到背景音乐文件: $BGM_FILE"
  cp "$MERGED_VIDEO" "$OUTPUT"
fi
```

### Step 6: 添加片头片尾

```bash
INTRO="./assets/intro.mp4"
OUTRO="./assets/outro.mp4"
MAIN="./output/merged/merged_simple.mp4"
FINAL="./output/merged/final.mp4"

# 创建包含片头、主体、片尾的列表
cat > ./temp/final_list.txt << EOF
file '$INTRO'
file '$MAIN'
file '$OUTRO'
EOF

# 先标准化格式
for f in "$INTRO" "$MAIN" "$OUTRO"; do
  if [ -f "$f" ]; then
    basename=$(basename "$f")
    ffmpeg -i "$f" \
      -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:-1:-1" \
      -r 30 -c:v libx264 -preset fast -crf 23 \
      -c:a aac -b:a 128k -ar 44100 \
      "./temp/final_$basename"
  fi
done

# 合并
ffmpeg -f concat -safe 0 -i ./temp/final_list.txt \
  -c copy \
  "$FINAL"
```

## 可用转场效果

使用 `xfade` 滤镜的转场类型:

| 效果 | 说明 |
|------|------|
| fade | 淡入淡出 |
| wipeleft | 左擦除 |
| wiperight | 右擦除 |
| wipeup | 上擦除 |
| wipedown | 下擦除 |
| slideleft | 左滑动 |
| slideright | 右滑动 |
| slideup | 上滑动 |
| slidedown | 下滑动 |
| circlecrop | 圆形裁切 |
| rectcrop | 方形裁切 |
| distance | 距离变换 |
| fadeblack | 黑场过渡 |
| fadewhite | 白场过渡 |
| radial | 径向过渡 |
| smoothleft | 平滑左移 |
| smoothright | 平滑右移 |

## 输出

- 简单合并: `./output/merged/merged_simple.mp4`
- 带转场: `./output/merged/merged_fade.mp4`
- 带背景音乐: `./output/merged/merged_with_bgm.mp4`
- 最终版本: `./output/merged/final.mp4`

## 目录结构

```
./output/
├── shorts/      # 原始短视频片段
├── merged/      # 合并后的视频
└── thumbnails/  # 封面图

./assets/
├── intro.mp4    # 片头
├── outro.mp4    # 片尾
└── bgm.mp3      # 背景音乐
```
