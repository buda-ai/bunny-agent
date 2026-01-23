---
name: shorts-generator
description: Create vertical short videos with captions from selected clips. Handles video formatting, subtitle styling, and export.
---

# Shorts Generator

This skill creates polished, vertical short videos with captions from your selected clips.

## When to Use This Skill

- After selecting clips from highlight-finder
- Ready to create final short videos
- Need to add captions/subtitles
- Want to format for specific platforms

## What This Skill Does

1. **Extract Clips**: Cuts selected segments from source video
2. **Format Video**: Converts to vertical 9:16 aspect ratio
3. **Add Captions**: Burns in styled subtitles
4. **Enhance Audio**: Normalizes and enhances speech
5. **Export**: Creates platform-ready files

## How to Use

### Create Single Short

```
Create a short video from 02:34 to 03:15 of VIDEO_ID
```

### Create with Captions

```
Create a short with Chinese captions from clip 1
```

### Batch Create

```
Create shorts from all recommended clips
```

## Instructions

### Step 1: Extract the Clip

```bash
# Extract video segment
ffmpeg -i "./output/downloads/VIDEO_ID.mp4" \
  -ss 00:02:34 -to 00:03:15 \
  -c:v libx264 -c:a aac \
  "./temp/clip_raw.mp4"
```

### Step 2: Convert to Vertical Format

**Option A: Crop Center (for horizontal video)**
```bash
ffmpeg -i "./temp/clip_raw.mp4" \
  -vf "crop=ih*9/16:ih,scale=1080:1920" \
  -c:a copy \
  "./temp/clip_vertical.mp4"
```

**Option B: Add Blur Background (preserves full frame)**
```bash
ffmpeg -i "./temp/clip_raw.mp4" \
  -vf "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20[bg];[0:v]scale=1080:-1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2" \
  -c:a copy \
  "./temp/clip_vertical.mp4"
```

### Step 3: Extract Segment Subtitles

From the full SRT, extract only the relevant portion and adjust timestamps:

```bash
# Use ffmpeg to extract subtitle segment
ffmpeg -i "./output/transcripts/VIDEO_ID.srt" \
  -ss 00:02:34 -to 00:03:15 \
  "./temp/clip_subtitles.srt"
```

### Step 4: Style and Burn Captions

```bash
ffmpeg -i "./temp/clip_vertical.mp4" \
  -vf "subtitles=./temp/clip_subtitles.srt:force_style='FontName=Arial Bold,FontSize=24,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,Alignment=2,MarginV=50'" \
  -c:a copy \
  "./temp/clip_captioned.mp4"
```

**Caption Style Options**:
- **Standard**: White text, black outline, bottom center
- **Trendy**: Yellow highlight box, word-by-word animation
- **Minimal**: Small text, top or bottom
- **Bold**: Large text, center screen

### Step 5: Enhance Audio

```bash
ffmpeg -i "./temp/clip_captioned.mp4" \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11" \
  -c:v copy \
  "./output/shorts/short_001.mp4"
```

### Step 6: Generate Thumbnail

```bash
# Extract frame at 1 second for thumbnail
ffmpeg -i "./output/shorts/short_001.mp4" \
  -ss 00:00:01 -vframes 1 \
  "./output/shorts/short_001_thumbnail.jpg"
```

### Step 7: Report to User

```markdown
## ✅ Short Video Created!

**File**: ./output/shorts/short_001.mp4
**Duration**: 41 seconds
**Format**: 1080x1920 (9:16 vertical)
**Captions**: Burned in (White + Black outline)

**Thumbnail**: ./output/shorts/short_001_thumbnail.jpg

### Preview Info
- **Resolution**: 1080x1920
- **Frame Rate**: 30 fps
- **Audio**: AAC, normalized
- **File Size**: XX MB

### Platform Compatibility
- ✅ TikTok (ready to upload)
- ✅ YouTube Shorts (ready to upload)
- ✅ Instagram Reels (ready to upload)
- ✅ 抖音 (ready to upload)

**Next steps**:
1. Review the video in ./output/shorts/
2. Create more shorts from other clips
3. Adjust caption style if needed
```

## Output

- Short video: `./output/shorts/short_XXX.mp4`
- Thumbnail: `./output/shorts/short_XXX_thumbnail.jpg`

## Caption Styles

### Style 1: Classic (Default)
```
FontName=Arial Bold
FontSize=24
PrimaryColour=&HFFFFFF (White)
OutlineColour=&H000000 (Black)
Outline=2
```

### Style 2: Modern
```
FontName=Montserrat Bold
FontSize=28
PrimaryColour=&H00FFFF (Yellow)
BackColour=&H80000000 (Semi-transparent black)
BorderStyle=4
```

### Style 3: Minimal
```
FontName=Helvetica
FontSize=18
PrimaryColour=&HFFFFFF
Outline=1
MarginV=30
```

## Quality Presets

- **High Quality**: 1080x1920, 8Mbps, best for YouTube
- **Standard**: 1080x1920, 4Mbps, balanced
- **Fast Upload**: 720x1280, 2Mbps, smaller file size
