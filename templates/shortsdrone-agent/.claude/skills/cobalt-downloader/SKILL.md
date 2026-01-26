---
name: cobalt-downloader
description: Download YouTube videos using Cobalt API (self-hosted or public). No cookies required, more reliable than direct yt-dlp.
---

# Cobalt Downloader

This skill uses [Cobalt](https://github.com/imputnet/cobalt) API to download YouTube videos. Cobalt is an open-source media downloader that handles YouTube's anti-bot measures.

## When to Use This Skill

- When yt-dlp fails with bot detection errors
- For business systems that can't manage cookies
- When you need a more reliable download method
- For self-hosted download infrastructure

## What This Skill Does

1. **Send Request**: Submit YouTube URL to Cobalt API
2. **Get Download Link**: Receive direct download URL
3. **Download Content**: Fetch video/audio using curl
4. **Organize Files**: Save with proper naming

## Configuration

### Option 1: Public Instance (Quick Start)

Use the public Cobalt instance (rate limited):
```bash
COBALT_API="https://api.cobalt.tools"
```

### Option 2: Self-Hosted (Recommended for Production)

Deploy your own Cobalt instance:
```bash
# Docker deployment
docker run -d -p 9000:9000 ghcr.io/imputnet/cobalt:latest

# Set API endpoint
COBALT_API="http://localhost:9000"
```

## Instructions

### Step 1: Check Configuration

```bash
# Set Cobalt API endpoint
COBALT_API="${COBALT_API:-https://api.cobalt.tools}"
echo "Using Cobalt API: $COBALT_API"

# Create output directories
mkdir -p ./output/downloads ./temp
```

### Step 2: Download Video

```bash
VIDEO_URL="[YOUTUBE_URL]"

# Request download link from Cobalt
RESPONSE=$(curl -s -X POST "$COBALT_API/api/json" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "{
    \"url\": \"$VIDEO_URL\",
    \"vCodec\": \"h264\",
    \"vQuality\": \"1080\",
    \"aFormat\": \"mp3\",
    \"filenamePattern\": \"basic\"
  }")

echo "$RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data.get('status') == 'stream' or data.get('status') == 'redirect':
    print('DOWNLOAD_URL=' + data.get('url', ''))
elif data.get('status') == 'picker':
    # Multiple streams available
    print('DOWNLOAD_URL=' + data['picker'][0]['url'])
else:
    print('ERROR=' + data.get('text', 'Unknown error'))
"
```

### Step 3: Fetch the File

```bash
# Extract video ID from URL
VIDEO_ID=$(echo "$VIDEO_URL" | grep -oP 'v=\K[^&]+' || echo "$VIDEO_URL" | grep -oP 'youtu\.be/\K[^?]+')

# Download using the obtained URL
if [ -n "$DOWNLOAD_URL" ]; then
  curl -L -o "./output/downloads/${VIDEO_ID}.mp4" "$DOWNLOAD_URL"
  echo "✅ Downloaded to ./output/downloads/${VIDEO_ID}.mp4"
else
  echo "❌ Failed to get download URL: $ERROR"
fi
```

### Step 4: Audio Only Option

```bash
# Request audio only
RESPONSE=$(curl -s -X POST "$COBALT_API/api/json" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"$VIDEO_URL\",
    \"isAudioOnly\": true,
    \"aFormat\": \"mp3\"
  }")

# Download audio
AUDIO_URL=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('url',''))")
curl -L -o "./output/downloads/${VIDEO_ID}.mp3" "$AUDIO_URL"
```

## API Reference

### Request Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | string | YouTube video URL |
| `vCodec` | string | Video codec: `h264`, `av1`, `vp9` |
| `vQuality` | string | Quality: `144`-`2160`, `max` |
| `aFormat` | string | Audio format: `mp3`, `ogg`, `wav`, `opus` |
| `isAudioOnly` | boolean | Download audio only |
| `filenamePattern` | string | `basic`, `pretty`, `nerdy` |

### Response Status

| Status | Description |
|--------|-------------|
| `stream` | Direct download URL |
| `redirect` | Redirect to download |
| `picker` | Multiple options available |
| `error` | Error occurred |

## Self-Hosting Cobalt

For production use, self-host Cobalt:

### Docker Compose

```yaml
version: '3.8'
services:
  cobalt-api:
    image: ghcr.io/imputnet/cobalt:latest
    container_name: cobalt
    restart: unless-stopped
    ports:
      - "9000:9000"
    environment:
      - API_URL=http://your-domain:9000
      - API_NAME=cobalt
```

### Benefits of Self-Hosting

- No rate limits
- No dependency on external services
- Better privacy
- Customizable configuration
- Guaranteed availability

## Error Handling

### Common Errors

| Error | Solution |
|-------|----------|
| `rate-limit` | Self-host or wait |
| `content.video.unavailable` | Video is private/deleted |
| `content.video.live` | Cannot download live streams |
| `fetch.fail` | Network issue, retry |

### Fallback to yt-dlp

If Cobalt fails, fall back to yt-dlp:

```bash
if [ -n "$ERROR" ]; then
  echo "Cobalt failed, trying yt-dlp..."
  yt-dlp --cookies ./config/cookies.txt -o "./output/downloads/%(id)s.%(ext)s" "$VIDEO_URL"
fi
```

## Comparison with yt-dlp

| Feature | Cobalt API | yt-dlp |
|---------|------------|--------|
| Cookies required | ❌ No | ✅ Yes (usually) |
| Rate limits | Per instance | Per IP |
| Self-hostable | ✅ Yes | N/A |
| Reliability | High | Variable |
| Speed | Fast | Medium |
| Customization | Limited | Extensive |
