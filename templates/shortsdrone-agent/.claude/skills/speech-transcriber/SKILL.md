---
name: speech-transcriber
description: Transcribe audio to text with timestamps using Whisper or similar tools. Generates SRT subtitles and JSON with word-level timing.
---

# Speech Transcriber

This skill transcribes audio from videos into text with accurate timestamps, essential for finding highlights and generating captions.

## When to Use This Skill

- After downloading a YouTube video
- Need to search for specific content in a video
- Preparing to select clips for shorts
- Generating captions/subtitles

## What This Skill Does

1. **Extract Audio**: Separates audio track from video if needed
2. **Transcribe Speech**: Converts speech to text with timestamps
3. **Generate Formats**: Creates TXT, SRT, and JSON outputs
4. **Detect Language**: Auto-detects spoken language

## How to Use

### Basic Transcription

```
Transcribe the audio from: ./output/downloads/VIDEO_ID.mp4
```

### With Language Specification

```
Transcribe in Chinese: ./output/downloads/VIDEO_ID.mp4
```

## Instructions

When transcribing audio:

### Step 1: Extract Audio (if from video)

```bash
ffmpeg -i "./output/downloads/VIDEO_ID.mp4" \
  -vn -acodec libmp3lame -q:a 2 \
  "./temp/VIDEO_ID_audio.mp3"
```

### Step 2: Transcribe Using Whisper

**Option A: Using OpenAI Whisper API (if available)**
```bash
# This would use API - implementation depends on available tools
```

**Option B: Using Local Whisper**
```bash
whisper "./temp/VIDEO_ID_audio.mp3" \
  --model small \
  --output_format all \
  --output_dir "./output/transcripts/"
```

**Option C: Using yt-dlp Auto-Subtitles (fallback)**
```bash
# Download existing subtitles if available
yt-dlp --write-auto-sub --sub-lang en,zh \
  --skip-download \
  -o "./output/transcripts/%(id)s" \
  "[ORIGINAL_URL]"
```

### Step 3: Convert to Standard Formats

If needed, convert VTT to SRT:
```bash
ffmpeg -i "./output/transcripts/VIDEO_ID.vtt" \
  "./output/transcripts/VIDEO_ID.srt"
```

### Step 4: Create JSON with Timestamps

Parse the SRT and create a structured JSON:
```json
{
  "video_id": "VIDEO_ID",
  "duration": 600,
  "language": "en",
  "segments": [
    {
      "id": 1,
      "start": 0.0,
      "end": 4.5,
      "text": "Hello everyone, welcome to today's video"
    },
    {
      "id": 2,
      "start": 4.5,
      "end": 8.2,
      "text": "Today we're going to talk about..."
    }
  ]
}
```

### Step 5: Report to User

```markdown
## ✅ Transcription Complete

**Language Detected**: English
**Total Duration**: 10:32
**Segments**: 156 segments transcribed

**Files Generated**:
- Text: ./output/transcripts/VIDEO_ID.txt
- Subtitles: ./output/transcripts/VIDEO_ID.srt
- Structured: ./output/transcripts/VIDEO_ID.json

**Preview** (first 500 characters):
[Show beginning of transcript]

Next steps:
1. Use `highlight-finder` to identify the best clips
2. Search for specific topics in the transcript
3. Tell me which segments interest you
```

## Output

- Plain text: `./output/transcripts/{video_id}.txt`
- SRT subtitles: `./output/transcripts/{video_id}.srt`
- JSON with timestamps: `./output/transcripts/{video_id}.json`

## Tips

- For Chinese content, specify language for better accuracy
- Longer videos take more time to process
- Check transcript for errors before generating captions
