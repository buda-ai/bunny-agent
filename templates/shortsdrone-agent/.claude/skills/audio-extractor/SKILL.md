---
name: audio-extractor
description: Extract, enhance, and process audio from video files. Includes noise reduction, speech enhancement, and format conversion.
---

# Audio Extractor

This skill extracts and enhances audio from video files for processing or standalone use.

## When to Use This Skill

- Need just the audio from a video
- Want to enhance speech quality
- Preparing audio for transcription
- Creating audio-only content (podcasts, etc.)

## What This Skill Does

1. **Extract Audio**: Separates audio track from video
2. **Enhance Quality**: Noise reduction, normalization
3. **Convert Format**: Export as MP3, WAV, AAC, etc.
4. **Analyze Audio**: Check levels, detect issues

## How to Use

### Basic Extraction

```
Extract audio from: ./output/downloads/VIDEO_ID.mp4
```

### With Enhancement

```
Extract and enhance audio from VIDEO_ID
```

### Specific Format

```
Extract audio as WAV for transcription
```

## Instructions

### Step 1: Analyze Source Audio

```bash
ffprobe -v quiet -print_format json -show_streams \
  -select_streams a:0 \
  "./output/downloads/VIDEO_ID.mp4"
```

### Step 2: Extract Audio Track

**To MP3 (compressed, good for sharing):**
```bash
ffmpeg -i "./output/downloads/VIDEO_ID.mp4" \
  -vn -acodec libmp3lame -q:a 2 \
  "./output/downloads/VIDEO_ID.mp3"
```

**To WAV (uncompressed, best for processing):**
```bash
ffmpeg -i "./output/downloads/VIDEO_ID.mp4" \
  -vn -acodec pcm_s16le -ar 44100 \
  "./temp/VIDEO_ID.wav"
```

**To AAC (high quality, smaller):**
```bash
ffmpeg -i "./output/downloads/VIDEO_ID.mp4" \
  -vn -acodec aac -b:a 192k \
  "./output/downloads/VIDEO_ID.m4a"
```

### Step 3: Enhance Audio (Optional)

**Normalize Volume:**
```bash
ffmpeg -i "./temp/VIDEO_ID.wav" \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11" \
  "./output/downloads/VIDEO_ID_normalized.mp3"
```

**Reduce Noise + Normalize:**
```bash
ffmpeg -i "./temp/VIDEO_ID.wav" \
  -af "highpass=f=80,lowpass=f=12000,loudnorm=I=-16:TP=-1.5:LRA=11" \
  "./output/downloads/VIDEO_ID_enhanced.mp3"
```

**Speech Enhancement (for voice clarity):**
```bash
ffmpeg -i "./temp/VIDEO_ID.wav" \
  -af "highpass=f=100,lowpass=f=8000,loudnorm,compand=attacks=0:points=-80/-80|-45/-15|-27/-9|0/-7|20/-7:gain=5" \
  "./output/downloads/VIDEO_ID_speech.mp3"
```

### Step 4: Report Results

```markdown
## ✅ Audio Extracted

**Source**: VIDEO_ID.mp4
**Output**: VIDEO_ID.mp3

### Audio Info
- **Duration**: 10:32
- **Sample Rate**: 44.1 kHz
- **Channels**: Stereo
- **Bitrate**: 192 kbps
- **Size**: 12.5 MB

### Quality Assessment
- ✅ Speech clarity: Good
- ✅ Background noise: Minimal
- ✅ Volume levels: Normalized

**Next step**: Use `speech-transcriber` to convert to text
```

## Output

- MP3: `./output/downloads/{video_id}.mp3`
- Enhanced: `./output/downloads/{video_id}_enhanced.mp3`
- WAV (temp): `./temp/{video_id}.wav`

## Audio Quality Tips

- Use WAV for transcription (better accuracy)
- Use MP3 for sharing (smaller files)
- Always normalize volume before adding to shorts
- High-pass filter removes rumble, low-pass removes hiss
