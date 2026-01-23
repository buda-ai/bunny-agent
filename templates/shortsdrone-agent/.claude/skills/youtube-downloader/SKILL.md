---
name: youtube-downloader
description: Download YouTube videos and extract audio using yt-dlp. Supports various quality options and formats.
---

# YouTube Downloader

This skill downloads YouTube videos and extracts audio for further processing.

## When to Use This Skill

- User provides a YouTube URL to process
- Need to download video or audio from YouTube
- Starting a new video-to-shorts project

## What This Skill Does

1. **Validate URL**: Checks if the YouTube URL is valid and accessible
2. **Get Metadata**: Retrieves video title, duration, description
3. **Download Content**: Downloads video and/or audio in specified quality
4. **Organize Files**: Saves files with proper naming structure

## How to Use

### Basic Download

```
Download video from: https://www.youtube.com/watch?v=VIDEO_ID
```

### Audio Only

```
Extract audio from: https://www.youtube.com/watch?v=VIDEO_ID
```

### With Quality Options

```
Download video in 1080p from: [URL]
```

## Instructions

When a user provides a YouTube URL:

### Step 1: Validate and Get Info

```bash
# Check if yt-dlp is available
which yt-dlp || echo "yt-dlp not installed"

# Get video info without downloading
yt-dlp --dump-json "[URL]" | head -c 2000
```

### Step 2: Create Output Structure

```bash
mkdir -p ./output/downloads
mkdir -p ./output/transcripts
mkdir -p ./temp
```

### Step 3: Download Content

**For Video + Audio:**
```bash
yt-dlp -f "bestvideo[height<=1080]+bestaudio/best[height<=1080]" \
  -o "./output/downloads/%(id)s.%(ext)s" \
  --merge-output-format mp4 \
  "[URL]"
```

**For Audio Only:**
```bash
yt-dlp -x --audio-format mp3 --audio-quality 0 \
  -o "./output/downloads/%(id)s.%(ext)s" \
  "[URL]"
```

### Step 4: Confirm Download

```bash
# List downloaded files
ls -la ./output/downloads/

# Get file info
ffprobe -v quiet -print_format json -show_format -show_streams "./output/downloads/VIDEO_ID.mp4"
```

### Step 5: Report to User

Present the download results:
```markdown
## ✅ Download Complete

**Video**: [Title]
**Duration**: X minutes X seconds
**File**: ./output/downloads/VIDEO_ID.mp4
**Size**: XX MB

Next steps:
1. Use `speech-transcriber` to transcribe the audio
2. Use `highlight-finder` to identify engaging segments
3. Or tell me which part of the video you want to extract
```

## Output

- Video file: `./output/downloads/{video_id}.mp4`
- Audio file: `./output/downloads/{video_id}.mp3`
- Metadata: `./output/downloads/{video_id}_info.json`

## Error Handling

- **Video unavailable**: Check if video is private or region-locked
- **Age-restricted**: May require authentication
- **Live stream**: Wait until stream ends or use different approach
- **yt-dlp not found**: Install with `brew install yt-dlp` (macOS) or `pip install yt-dlp`

### Bot Detection / 403 Errors

If you encounter "Sign in to confirm you're not a bot" or HTTP 403 errors, YouTube's anti-bot protection is blocking the download. Try these solutions in order:

**Solution 1: Use PO Token (Recommended)**
```bash
# Follow guide: https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
yt-dlp --extractor-args "youtube:po_token=web+XXX" "[URL]"
```

**Solution 2: Browser Cookies**
```bash
# Export cookies from a logged-in browser session
yt-dlp --cookies-from-browser firefox "[URL]"
# Or use exported cookies file
yt-dlp --cookies ./cookies.txt "[URL]"
```

**Solution 3: Offer Alternatives to User**
If automated download fails after multiple attempts, provide the user with options:

```markdown
## ⚠️ YouTube Access Restricted

The video cannot be downloaded automatically due to YouTube's bot protection.

**Your options**:
1. **Manual download**: Download the video from a browser and place it in `./output/downloads/`
2. **Different video**: Try a different YouTube URL
3. **Local file**: Provide a video file you already have
4. **Wait and retry**: YouTube's restrictions are sometimes temporary

Once you have the video file, I can proceed with transcription and short video creation.
```
