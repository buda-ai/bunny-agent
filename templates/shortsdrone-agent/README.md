# ShortsDrone Agent

Multi-platform short video generation agent — converts long videos and scripts into talking-head short videos.

## Features

### Multi-source Support
- 🌐 **Online video**: YouTube, Bilibili, Douyin, TikTok, Instagram, Twitter/X, Xiaohongshu, Kuaishou
- 📝 **Script input**: Enter text directly to auto-generate talking-head video
- 📁 **Local files**: Import local video/audio files for processing
- 📦 **Batch processing**: Supports batch URLs or file processing

### Core Capabilities
- Speech transcription (Whisper)
- Highlight detection
- Vertical format conversion (9:16)
- Subtitle generation and burn-in
- TTS voice synthesis
- Auto thumbnail generation
- Video clip merging

## Quick Start

### 1. Create Short Video from Online Video

```
Download this video and create a short video: https://www.youtube.com/watch?v=xxxxx
```

```
Extract highlights from this Bilibili video: https://www.bilibili.com/video/BVxxxxx
```

### 2. Create Talking-Head Video from Script

```
Generate a talking-head short video from this script:

Hello everyone, today I'm sharing three habits that changed my life...
```

### 3. Create from Local File

```
Process this local video: ./input/my-video.mp4
```

## Directory Structure

```
./
├── input/          # User input files
│   ├── videos/     # Local videos
│   ├── audios/     # Local audio
│   └── scripts/    # Script files
├── output/         # Output directory
│   ├── downloads/  # Downloaded videos
│   ├── shorts/     # Generated short videos
│   ├── transcripts/# Transcriptions
│   ├── thumbnails/ # Thumbnails
│   └── merged/     # Merged videos
├── temp/           # Temporary files
├── config/         # Configuration files
│   ├── cookies.txt # Platform auth
│   └── .env        # Environment variables
└── assets/         # Media assets
    ├── bgm/        # Background music
    ├── intro.mp4   # Intro clip
    └── outro.mp4   # Outro clip
```

## Configuration

### Platform Authentication (optional)

Some platforms require authentication for downloads:

```bash
# YouTube (strongly recommended)
# Export cookies to ./config/cookies.txt

# Or use Cobalt API (no auth needed)
echo "COBALT_API=https://api.cobalt.tools" > ./config/.env
```

### Install Dependencies

```bash
# macOS
brew install yt-dlp ffmpeg

# TTS support
pip install edge-tts

# Transcription (optional)
pip install openai-whisper
```

## Skills

### Video Acquisition
| Skill | Description |
|-------|-------------|
| video-downloader | Universal video downloader |
| cobalt-downloader | Cobalt API downloader |
| rapidapi-downloader | RapidAPI downloader |
| local-video-import | Local file import |
| setup-auth | Authentication setup |

### Content Analysis
| Skill | Description |
|-------|-------------|
| speech-transcriber | Speech transcription |
| highlight-finder | Highlight detection |
| content-analyzer | Content analysis |

### Video Generation
| Skill | Description |
|-------|-------------|
| shorts-generator | Short video generation |
| script-to-video | Script-to-video |
| tts-generator | TTS voice synthesis |
| thumbnail-creator | Thumbnail generation |
| video-merger | Video merging |

### Utilities
| Skill | Description |
|-------|-------------|
| audio-extractor | Audio extraction |
| video-info-extractor | Video info extraction |

## Use Cases

### Case 1: Knowledge Creator Repurposing
```
Extract the 3 most valuable insights from this YouTube tutorial and make them into short videos:
https://youtube.com/watch?v=xxx
```

### Case 2: Script Talking-Head
```
Generate a talking-head video from this product description:
...script content...

Requirements: female voice, slightly fast pace, minimal background
```

### Case 3: Batch Processing
```
Batch process these video links:
- https://youtube.com/xxx
- https://youtube.com/yyy
- https://bilibili.com/xxx

Extract 1 highlight clip from each video
```

## Notes

1. **Copyright compliance**: Ensure you have the right to use the source video content
2. **Platform rules**: Follow each platform's terms of service
3. **Cookie security**: Do not share your cookies file
4. **Storage space**: Video processing requires significant temporary storage

## License

MIT
