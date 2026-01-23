---
name: setup-youtube-auth
description: Configure YouTube authentication by setting up cookies for yt-dlp. Required for downloading videos that trigger bot detection.
---

# Setup YouTube Authentication

This skill helps configure YouTube authentication to bypass bot detection when downloading videos.

## When to Use This Skill

- First time setup before downloading videos
- When encountering "Sign in to confirm you're not a bot" errors
- When cookies have expired and need refresh
- Setting up the agent for a new environment

## What This Skill Does

1. **Check Current Status**: Verify if cookies are configured
2. **Guide Setup**: Walk user through cookie export process
3. **Validate Cookies**: Test if cookies work correctly
4. **Troubleshoot**: Help resolve authentication issues

## How to Use

```
Setup YouTube authentication
```

```
Configure cookies for YouTube downloads
```

```
My YouTube downloads are failing with bot detection
```

## Instructions

### Step 1: Check Current Configuration

```bash
# Create config directory if needed
mkdir -p ./config

# Check for existing cookies
if [ -f "./config/cookies.txt" ]; then
  echo "✓ Cookies file found: ./config/cookies.txt"
  echo "  Last modified: $(stat -f '%Sm' ./config/cookies.txt 2>/dev/null || stat -c '%y' ./config/cookies.txt 2>/dev/null)"
  head -5 ./config/cookies.txt
else
  echo "✗ No cookies file found at ./config/cookies.txt"
fi

# Check environment variable
if [ -n "$YOUTUBE_COOKIES_FILE" ]; then
  echo "✓ YOUTUBE_COOKIES_FILE is set to: $YOUTUBE_COOKIES_FILE"
else
  echo "✗ YOUTUBE_COOKIES_FILE environment variable not set"
fi
```

### Step 2: Guide User Through Setup

If no cookies are configured, provide these instructions:

```markdown
## 🔐 YouTube Authentication Setup

YouTube requires cookies to verify you're not a bot. Here's how to set it up:

### Option A: Export from Browser (Recommended)

1. **Install browser extension:**
   - Chrome: [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
   - Firefox: [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

2. **Export cookies:**
   - Go to [youtube.com](https://youtube.com) in your browser
   - Make sure you're logged in (recommended: use a dedicated account)
   - Click the extension icon
   - Export cookies for "youtube.com" domain
   - Save the file

3. **Upload the cookies file:**
   - Place the file at: `./config/cookies.txt`
   - Or set environment variable: `YOUTUBE_COOKIES_FILE=/path/to/cookies.txt`

### Option B: For Business Systems (API Integration)

Your business system should:
1. Provide a cookies.txt file during sandbox initialization
2. Mount it at `./config/cookies.txt`
3. Or set `YOUTUBE_COOKIES_FILE` environment variable

### Cookie File Format

The file must be in Netscape format, starting with:
```
# Netscape HTTP Cookie File
.youtube.com	TRUE	/	TRUE	1234567890	LOGIN_INFO	AFmmF...
```
```

### Step 3: Validate Cookies

After user provides cookies, test them:

```bash
# Test with a public video
TEST_URL="https://www.youtube.com/watch?v=jNQXAC9IVRw"  # First YouTube video ever

if [ -f "./config/cookies.txt" ]; then
  echo "Testing cookies with a sample video..."
  yt-dlp --cookies ./config/cookies.txt \
    --print "%(title)s" \
    --skip-download \
    "$TEST_URL" 2>&1
  
  if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Cookies are working! You can now download YouTube videos."
  else
    echo ""
    echo "❌ Cookies test failed. Please check:"
    echo "   1. Are you logged in on YouTube in the browser?"
    echo "   2. Did you export cookies for youtube.com domain?"
    echo "   3. Is the cookies file in Netscape format?"
  fi
else
  echo "No cookies file found. Please follow the setup instructions above."
fi
```

### Step 4: Report Status

```markdown
## Authentication Status

| Check | Status |
|-------|--------|
| Cookies file exists | ✅/❌ |
| Cookies format valid | ✅/❌ |
| Test download works | ✅/❌ |

### Next Steps

If all checks pass:
- You're ready to download YouTube videos!
- Use: `Create a short video from: [YouTube URL]`

If checks fail:
- Follow the setup guide above
- Make sure you're using a logged-in browser session
- Cookies expire - refresh them if they're old (>30 days)
```

## Troubleshooting

### "Sign in to confirm you're not a bot"
- Cookies are missing or expired
- Re-export cookies from a fresh browser session

### "HTTP Error 403: Forbidden"  
- Cookies may be from wrong domain
- Try exporting specifically for youtube.com

### "Could not find running browser"
- Use cookies file method instead of --cookies-from-browser
- Export cookies manually using browser extension

### Cookies expire quickly
- Use a dedicated Google account
- Avoid logging in from multiple locations
- Some accounts may be flagged by Google

## Security Best Practices

1. **Use a dedicated YouTube account** for the service (not personal)
2. **Store cookies securely** - treat as credentials
3. **Rotate cookies periodically** (every 2-4 weeks recommended)
4. **Don't commit cookies to git** - add to .gitignore
5. **Monitor for abuse** - excessive downloads may trigger blocks
