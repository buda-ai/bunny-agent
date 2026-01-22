---
name: video-info-extractor
description: Get detailed metadata and information from YouTube videos before downloading, including title, duration, description, and available formats.
---

# Video Info Extractor

This skill retrieves comprehensive information about YouTube videos without downloading them.

## When to Use This Skill

- Before downloading to check video details
- Want to see available quality options
- Need video duration, title, description
- Checking if subtitles are available

## What This Skill Does

1. **Get Metadata**: Title, description, duration, upload date
2. **List Formats**: Available video/audio quality options
3. **Check Subtitles**: Available captions and languages
4. **Channel Info**: Creator details, subscriber count

## How to Use

```
Get info about: https://www.youtube.com/watch?v=VIDEO_ID
```

```
What's the duration of this video: [URL]
```

```
Are there subtitles available for: [URL]
```

## Instructions

### Step 1: Get Basic Info

```bash
yt-dlp --dump-json "[URL]" 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f'''
## Video Information

**Title**: {data.get('title', 'N/A')}
**Channel**: {data.get('channel', 'N/A')}
**Duration**: {data.get('duration', 0) // 60}:{data.get('duration', 0) % 60:02d}
**Upload Date**: {data.get('upload_date', 'N/A')}
**Views**: {data.get('view_count', 0):,}
**Likes**: {data.get('like_count', 0):,}

### Description
{data.get('description', 'No description')[:500]}...
''')
"
```

### Step 2: Check Available Formats

```bash
yt-dlp -F "[URL]"
```

### Step 3: Check Subtitles

```bash
yt-dlp --list-subs "[URL]"
```

### Step 4: Present Info to User

```markdown
## 📹 Video Information

**Title**: How to Build a Startup in 2024
**Channel**: TechGuru
**Duration**: 15:32
**Uploaded**: January 15, 2024
**Views**: 1,234,567
**Likes**: 45,678

### Description
In this video, I share my experience building three startups and the lessons learned...

### Available Qualities
| Format | Resolution | Size (est.) |
|--------|------------|-------------|
| mp4 | 1080p | ~150 MB |
| mp4 | 720p | ~80 MB |
| mp4 | 480p | ~40 MB |
| mp3 | audio only | ~15 MB |

### Subtitles Available
- ✅ English (auto-generated)
- ✅ Chinese (auto-generated)
- ❌ Manual captions: None

### Recommendation
- **Best for shorts**: 1080p video with auto-subtitles
- **Estimated processing time**: ~5 minutes

Ready to proceed? Say:
- "Download this video" - Full video download
- "Extract audio only" - Just the audio
- "Download with subtitles" - Include caption files
```

## Output

Info is displayed directly. Optionally saves to:
`./output/downloads/{video_id}_info.json`

## Quick Checks

- **Is video available?** ✅/❌
- **Is video age-restricted?** Check for login requirement
- **Has subtitles?** Essential for caption accuracy
- **Video length?** Helps estimate processing time
