---
name: rapidapi-downloader
description: Download YouTube videos using RapidAPI services. Reliable cloud-based solution with multiple provider options.
---

# RapidAPI YouTube Downloader

This skill uses RapidAPI marketplace services to download YouTube videos. Multiple providers available with different pricing and features.

## When to Use This Skill

- For production business systems
- When you need guaranteed uptime and SLA
- When self-hosting is not an option
- For high-volume downloads with predictable costs

## Recommended RapidAPI Services

### 1. YouTube Video Download Info (Free Tier Available)
- **API**: `youtube-video-download-info.p.rapidapi.com`
- **Pricing**: Free 100 req/month, then $0.002/request
- **Features**: Video info, multiple quality options

### 2. YT-API (Reliable)
- **API**: `yt-api.p.rapidapi.com`
- **Pricing**: $0.001/request
- **Features**: Fast, good rate limits

### 3. YouTube Media Downloader
- **API**: `youtube-media-downloader.p.rapidapi.com`
- **Pricing**: Freemium
- **Features**: Direct download links

## Configuration

Set your RapidAPI key:
```bash
export RAPIDAPI_KEY="your-api-key-here"
```

Or place in config file:
```bash
echo "your-api-key" > ./config/rapidapi_key.txt
```

## Instructions

### Step 1: Setup

```bash
# Load API key
if [ -f "./config/rapidapi_key.txt" ]; then
  RAPIDAPI_KEY=$(cat ./config/rapidapi_key.txt)
elif [ -z "$RAPIDAPI_KEY" ]; then
  echo "❌ RAPIDAPI_KEY not set. Please configure your API key."
  exit 1
fi

mkdir -p ./output/downloads ./temp
```

### Step 2: Get Video Info (yt-api)

```bash
VIDEO_ID="[VIDEO_ID]"  # Extract from URL

curl -s -X GET \
  "https://yt-api.p.rapidapi.com/dl?id=$VIDEO_ID" \
  -H "X-RapidAPI-Key: $RAPIDAPI_KEY" \
  -H "X-RapidAPI-Host: yt-api.p.rapidapi.com" \
  > ./temp/video_info.json

# Parse response
python3 << 'EOF'
import json
with open('./temp/video_info.json') as f:
    data = json.load(f)
    
print(f"Title: {data.get('title', 'N/A')}")
print(f"Duration: {data.get('lengthSeconds', 0)}s")

# Find best quality format
formats = data.get('formats', [])
for fmt in formats:
    if fmt.get('qualityLabel') == '1080p':
        print(f"Download URL: {fmt.get('url', 'N/A')[:100]}...")
        break
EOF
```

### Step 3: Download Video

```bash
# Extract download URL from response
DOWNLOAD_URL=$(python3 -c "
import json
with open('./temp/video_info.json') as f:
    data = json.load(f)
formats = data.get('formats', [])
# Get highest quality with audio
for fmt in sorted(formats, key=lambda x: int(x.get('height', 0) or 0), reverse=True):
    if fmt.get('hasAudio'):
        print(fmt.get('url', ''))
        break
")

if [ -n "$DOWNLOAD_URL" ]; then
  curl -L -o "./output/downloads/${VIDEO_ID}.mp4" "$DOWNLOAD_URL"
  echo "✅ Downloaded successfully"
else
  echo "❌ No download URL found"
fi
```

### Step 4: Audio Only

```bash
# Get audio-only format
AUDIO_URL=$(python3 -c "
import json
with open('./temp/video_info.json') as f:
    data = json.load(f)
formats = data.get('adaptiveFormats', [])
for fmt in formats:
    if 'audio' in fmt.get('mimeType', ''):
        print(fmt.get('url', ''))
        break
")

curl -L -o "./output/downloads/${VIDEO_ID}.m4a" "$AUDIO_URL"

# Convert to MP3 if needed
ffmpeg -i "./output/downloads/${VIDEO_ID}.m4a" \
  -acodec libmp3lame -q:a 2 \
  "./output/downloads/${VIDEO_ID}.mp3"
```

## Alternative: YouTube Media Downloader API

```bash
VIDEO_URL="https://www.youtube.com/watch?v=$VIDEO_ID"

curl -s -X GET \
  "https://youtube-media-downloader.p.rapidapi.com/v2/video/details?videoId=$VIDEO_ID" \
  -H "X-RapidAPI-Key: $RAPIDAPI_KEY" \
  -H "X-RapidAPI-Host: youtube-media-downloader.p.rapidapi.com" \
  > ./temp/video_details.json
```

## Cost Estimation

| Monthly Volume | yt-api Cost | Notes |
|----------------|-------------|-------|
| 1,000 videos | ~$1 | Small projects |
| 10,000 videos | ~$10 | Medium business |
| 100,000 videos | ~$100 | Large scale |

## Error Handling

```bash
# Check response status
STATUS=$(python3 -c "
import json
with open('./temp/video_info.json') as f:
    data = json.load(f)
print(data.get('status', 'ok'))
")

case "$STATUS" in
  "ok"|"OK")
    echo "✅ Request successful"
    ;;
  "fail"|"error")
    echo "❌ API error - check video ID or API quota"
    ;;
  *)
    echo "⚠️ Unknown status: $STATUS"
    ;;
esac
```

## Best Practices

1. **Cache responses** - Don't re-fetch for same video
2. **Handle rate limits** - Implement exponential backoff
3. **Monitor usage** - Set up RapidAPI usage alerts
4. **Fallback strategy** - Use multiple providers
5. **Validate URLs** - Check video availability first

## Security

- Store API key securely (env var or encrypted config)
- Don't log API keys
- Use HTTPS only
- Monitor for unauthorized usage
