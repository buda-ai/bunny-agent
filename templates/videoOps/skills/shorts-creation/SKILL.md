---
name: shorts-creation
description: Transforms long YouTube/Google Drive videos into multiple captioned vertical shorts through a multi-step workflow
---

# Shorts Creation (Multi-Task Workflow)

## When to Use This Skill

- Have a long-form YouTube or Google Drive video to repurpose
- Need vertical short clips with subtitles for social platforms
- Want to extract viral-worthy segments from existing content
- Need 9:16 format videos for YouTube Shorts, Instagram Reels, TikTok
- Want to maximize content reach by creating multiple shorts from one video

## What This Skill Does

This skill executes a **multi-task sequential workflow**:

1. **Download Video**: Retrieves video from YouTube or Google Drive
2. **Transcribe Audio**: Converts speech to text using OpenAI Whisper
3. **AI Segment Recommendation**: Uses Gemini to identify viral-worthy segments
4. **Subtitle Configuration**: Confirms font, size, color, position with user
5. **Generate Shorts**: Creates vertical 9:16 videos with burned-in subtitles
6. **Export & Upload**: Saves as MP4 and uploads to Google Drive

## Multi-Task Workflow Overview

```
┌─────────────────────┐
│  1. Download Video  │ ← Input: YouTube URL or Drive URL
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ 2. Transcribe Audio │ ← Tool: OpenAI Whisper
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ 3. Recommend Clips  │ ← Tool: Gemini AI
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ 4. Configure Subs   │ ← User confirms settings
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ 5. Generate Shorts  │ ← FFmpeg + subtitle burn-in
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ 6. Upload to Drive  │ ← Tool: Google Drive MCP
└─────────────────────┘
```

## How to Use

**From YouTube URL:**
```
Create shorts from this YouTube video: https://youtube.com/watch?v=abc123
Target: 3-5 shorts, 30-45 seconds each
```

**From Google Drive:**
```
Make shorts from this Drive video: https://drive.google.com/file/d/FILE_ID
Focus on tutorial segments
Add yellow subtitles
```

**With Specific Preferences:**
```
Create shorts from: https://youtube.com/watch?v=xyz789
Number of shorts: 5
Duration: 15-30 seconds
Subtitle style: Bold white text with black outline
Position: Bottom center
```

## Instructions

### Task 1: Download Video

**Objective:** Retrieve source video for processing

**From YouTube:**
1. Validate YouTube URL format
2. Use yt-dlp to download video:
   ```bash
   yt-dlp -f "bestvideo[height<=1080]+bestaudio/best[height<=1080]" \
     -o "source_video.%(ext)s" \
     "https://youtube.com/watch?v=VIDEO_ID"
   ```
3. Extract video metadata:
   - Title
   - Duration
   - Resolution
   - Channel name
4. Verify download completed successfully
5. Check file integrity

**From Google Drive:**
1. Validate Google Drive share URL
2. Use Google Drive MCP to download:
   ```
   Tool: google-drive
   Method: download_file
   Parameters: {
     "file_id": "extracted_from_url",
     "destination": "source_video.mp4"
   }
   ```
3. Extract video metadata (same as YouTube)

**Output:** Downloaded source video file

---

### Task 2: Transcribe Audio to Text

**Objective:** Generate accurate transcript with timestamps

**Using OpenAI Whisper:**

1. Extract audio from video:
   ```bash
   ffmpeg -i source_video.mp4 -vn -acodec pcm_s16le -ar 16000 \
     -ac 1 audio.wav
   ```

2. Transcribe with Whisper (if available via MCP or local):
   ```python
   # Example using OpenAI Whisper API
   import openai

   with open("audio.wav", "rb") as audio_file:
       transcript = openai.Audio.transcribe(
           model="whisper-1",
           file=audio_file,
           response_format="verbose_json",
           timestamp_granularity="word"
       )
   ```

3. Parse transcript into timestamped segments:
   ```json
   {
     "segments": [
       {
         "start": 0.0,
         "end": 3.5,
         "text": "Welcome to this tutorial on React hooks"
       },
       {
         "start": 3.5,
         "end": 8.2,
         "text": "Today we're going to learn about useState"
       }
     ]
   }
   ```

4. Generate SRT subtitle file:
   ```srt
   1
   00:00:00,000 --> 00:00:03,500
   Welcome to this tutorial on React hooks

   2
   00:00:03,500 --> 00:00:08,200
   Today we're going to learn about useState
   ```

**Fallback (if Whisper unavailable):**
- Use YouTube auto-generated captions (if YouTube source)
- Provide manual transcription instructions
- Suggest alternative transcription services (Rev, Descript)

**Output:** Full transcript with timestamps (SRT format)

---

### Task 3: AI Segment Recommendation (Gemini)

**Objective:** Identify most viral-worthy segments using AI analysis

**Using Gemini AI:**

1. Prepare analysis prompt for Gemini:
   ```
   You are a viral content expert analyzing video transcripts to identify
   the most engaging segments for social media shorts.

   Video Title: [title]
   Duration: [duration]
   Platform: YouTube Shorts, Instagram Reels, TikTok

   Full Transcript:
   [Insert timestamped transcript]

   Task: Identify the 5-7 best segments for short-form content. For each segment:
   1. Start and end timestamps
   2. Duration (15-60 seconds)
   3. Hook quality (why it's engaging)
   4. Viral potential (high/medium)
   5. Recommended title
   6. Target platform focus

   Prioritize segments with:
   - Strong opening hooks
   - Self-contained complete thoughts
   - Actionable tips or surprising facts
   - Emotional or funny moments
   - Clear value proposition
   ```

2. Send to Gemini via Google AI MCP:
   ```
   Tool: google-ai (Gemini)
   Method: generate_content
   Parameters: {
     "model": "gemini-pro",
     "prompt": [analysis_prompt],
     "temperature": 0.7
   }
   ```

3. Parse Gemini's recommendations:
   ```json
   {
     "recommendations": [
       {
         "segment_id": 1,
         "start": "00:00:45",
         "end": "00:01:15",
         "duration": 30,
         "hook": "Starts with common mistake everyone makes",
         "viral_potential": "high",
         "title": "Stop Making This React Mistake",
         "platform": "TikTok (problem-solution format)",
         "transcript": "Here's a mistake I see beginners make..."
       },
       // ... more segments
     ]
   }
   ```

4. Present recommendations to user:
   ```
   **AI-Recommended Segments:**

   🔥 Segment 1: "Stop Making This React Mistake" (30s)
      Time: 0:45 - 1:15
      Hook: Opens with common mistake
      Viral Potential: HIGH
      Best for: TikTok, YouTube Shorts

   ⭐ Segment 2: "useState in 30 Seconds" (28s)
      Time: 3:10 - 3:38
      Hook: Quick, actionable tutorial
      Viral Potential: HIGH
      Best for: All platforms

   [... more segments ...]

   **Which segments would you like to create?**
   Select: [All] [1,2,4] [Custom]
   ```

5. Allow user to:
   - Accept all recommendations
   - Select specific segments
   - Provide custom timestamp ranges
   - Adjust segment boundaries

**Output:** Approved list of segments with timestamps and metadata

---

### Task 4: Confirm Subtitle Settings

**Objective:** Configure subtitle appearance with user preferences

**Present Configuration Options:**

```
**Subtitle Configuration**

Please confirm or customize subtitle settings:

1. Font Family:
   [ ] Arial (Default)
   [ ] Helvetica
   [ ] Impact (Bold, attention-grabbing)
   [ ] Montserrat (Modern, clean)
   [Custom font name]

2. Font Size:
   [ ] Small (32px) - Subtle
   [ ] Medium (48px) - Default
   [ ] Large (64px) - High visibility
   [ ] Extra Large (80px) - Maximum impact

3. Font Color:
   [ ] White (Default)
   [ ] Yellow (High visibility)
   [ ] Cyan/Light Blue
   [Custom hex color: #FFFFFF]

4. Text Outline/Stroke:
   [ ] Black outline (3px) - Default
   [ ] No outline
   [ ] Custom color/thickness

5. Background:
   [ ] None (transparent) - Default
   [ ] Semi-transparent black box
   [ ] Subtle shadow

6. Position:
   [ ] Bottom Center (Default)
   [ ] Top Center
   [ ] Middle Center
   [ ] Custom (y-offset)

7. Animation:
   [ ] None - Static
   [ ] Fade in per word (TikTok style)
   [ ] Karaoke style (word highlight)
```

**Default Settings:**
```
Font: Arial Bold
Size: 48px
Color: White (#FFFFFF)
Outline: Black 3px
Background: None
Position: Bottom center (y=100px from bottom)
Animation: None (static)
```

**Save Configuration:**
```json
{
  "subtitle_config": {
    "font": "Arial-Bold",
    "size": 48,
    "color": "#FFFFFF",
    "outline_color": "#000000",
    "outline_width": 3,
    "background": "none",
    "position": "bottom_center",
    "y_offset": 100,
    "animation": "none"
  }
}
```

**Output:** Finalized subtitle configuration for video generation

---

### Task 5: Generate Vertical Shorts with Subtitles

**Objective:** Create 9:16 vertical videos with burned-in subtitles

**For Each Approved Segment:**

1. **Extract segment from source video:**
   ```bash
   ffmpeg -ss 00:00:45 -i source_video.mp4 -t 30 -c copy segment_raw.mp4
   ```

2. **Convert to vertical 9:16 format:**
   ```bash
   # Smart crop to vertical (center-focused)
   ffmpeg -i segment_raw.mp4 \
     -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" \
     -c:a copy segment_vertical.mp4
   ```

3. **Extract segment subtitle from full transcript:**
   ```srt
   1
   00:00:00,000 --> 00:00:03,500
   Here's a mistake I see beginners make

   2
   00:00:03,500 --> 00:00:07,200
   They forget to include the dependency array
   ```

4. **Burn in subtitles with configured style:**
   ```bash
   ffmpeg -i segment_vertical.mp4 -vf "subtitles=segment.srt:force_style='\
     FontName=Arial-Bold,\
     FontSize=48,\
     PrimaryColour=&HFFFFFF&,\
     OutlineColour=&H000000&,\
     Outline=3,\
     Alignment=2,\
     MarginV=100'" \
     -c:a copy segment_with_subs.mp4
   ```

   **Alternative (drawtext for word-by-word):**
   ```bash
   # For animated karaoke-style subtitles
   ffmpeg -i segment_vertical.mp4 -vf "drawtext=textfile=words.txt:\
     fontfile=/path/to/Arial-Bold.ttf:fontsize=48:fontcolor=white:\
     borderw=3:bordercolor=black:x=(w-text_w)/2:y=h-100:\
     enable='between(t,START_TIME,END_TIME)'" \
     segment_with_subs.mp4
   ```

5. **Add fade in/out:**
   ```bash
   ffmpeg -i segment_with_subs.mp4 \
     -vf "fade=t=in:st=0:d=0.5,fade=t=out:st=29.5:d=0.5" \
     -c:a copy segment_final.mp4
   ```

6. **Optimize for mobile:**
   ```bash
   ffmpeg -i segment_final.mp4 \
     -c:v libx264 -preset medium -crf 23 \
     -vf "scale=1080:1920" \
     -c:a aac -b:a 128k \
     -movflags +faststart \
     short_01_final.mp4
   ```

7. **Apply naming convention:**
   ```
   [source_title]_short_[01-99]_9x16.mp4

   Example: react_tutorial_short_01_9x16.mp4
   ```

**Repeat for all approved segments**

**Output:** Multiple vertical short videos with burned-in subtitles

---

### Task 6: Export and Upload to Google Drive

**Objective:** Save files locally and upload to cloud storage

**Local Export:**
1. Create output directory structure:
   ```
   output/
   ├── shorts/
   │   ├── react_tutorial_short_01_9x16.mp4
   │   ├── react_tutorial_short_02_9x16.mp4
   │   └── ...
   ├── metadata/
   │   └── shorts_metadata.json
   └── subtitles/
       ├── short_01.srt
       └── ...
   ```

2. Generate metadata file:
   ```json
   {
     "source_video": "Complete React Tutorial",
     "source_url": "https://youtube.com/watch?v=abc123",
     "created_date": "2026-01-07",
     "shorts_generated": 5,
     "shorts": [
       {
         "filename": "react_tutorial_short_01_9x16.mp4",
         "duration": 30,
         "original_timestamp": "00:00:45 - 00:01:15",
         "title": "Stop Making This React Mistake",
         "description": "Common useState mistake and how to fix it",
         "hashtags": ["#react", "#coding", "#programming", "#webdev"],
         "platform_recommendations": ["TikTok", "YouTube Shorts"]
       }
     ]
   }
   ```

**Upload to Google Drive:**

1. Use upload-to-drive skill to batch upload:
   ```
   Tool: google-drive (via upload-to-drive skill)

   Upload all shorts to:
   Video Projects/Shorts/React Tutorial/

   Files:
   - All MP4 files → Finals/
   - Metadata JSON → Finals/
   - SRT files → Subtitles/
   ```

2. Generate shareable links for each short

3. Create summary document in Drive:
   ```
   **Shorts Creation Summary**

   Source: Complete React Tutorial
   Created: 2026-01-07
   Total Shorts: 5

   **Files:**
   1. react_tutorial_short_01_9x16.mp4
      Link: https://drive.google.com/file/d/...
      Title: Stop Making This React Mistake
      Duration: 30s

   [... continue for all shorts ...]

   **Recommended Hashtags:**
   #react #coding #webdev #programming #tutorial

   **Platform-Specific Notes:**
   - YouTube Shorts: Upload as-is, max 60s
   - TikTok: Shorts 1, 4, 5 have strong hooks
   - Instagram Reels: All shorts suitable
   ```

**Output:** All shorts saved locally and uploaded to Google Drive with shareable links

---

## Complete Workflow Example

**User Request:**
> Create shorts from https://youtube.com/watch?v=xyz789
> Focus on beginner-friendly segments
> Use yellow subtitles with black background

**Agent Execution:**

**✓ Task 1: Downloading Video**
```
Source: "React Hooks Complete Guide" (22:15)
Resolution: 1920x1080
Downloaded: react_hooks_guide.mp4 (145 MB)
```

**✓ Task 2: Transcribing Audio**
```
Using: OpenAI Whisper
Processing audio... [Progress: 100%]
Generated: full_transcript.srt (485 lines)
Duration: 22:15
```

**✓ Task 3: AI Segment Analysis (Gemini)**
```
Analyzing transcript for viral segments...

Gemini Recommendations:

🔥 Segment 1: "useState Explained in 30 Seconds" (28s)
   Time: 02:15 - 02:43
   Hook: "Here's what most tutorials don't tell you about useState"
   Viral Score: 9/10
   Reason: Quick, actionable, addresses common confusion

⭐ Segment 2: "Fix This Common Hook Mistake" (32s)
   Time: 07:45 - 08:17
   Hook: "This mistake crashes your app"
   Viral Score: 10/10
   Reason: Problem-solution format, relatable error

⭐ Segment 3: "useEffect Dependency Array Trick" (25s)
   Time: 12:30 - 12:55
   Hook: "One simple trick saves hours of debugging"
   Viral Score: 8/10
   Reason: Specific tip, time-saving

✓ Segment 4: "Custom Hooks in 40 Seconds" (38s)
   Time: 16:20 - 16:58
   Hook: "Custom hooks are easier than you think"
   Viral Score: 7/10
   Reason: Beginner-friendly, empowering

✓ Segment 5: "React Hook Rules Explained" (35s)
   Time: 19:10 - 19:45
   Hook: "Break these rules and React breaks"
   Viral Score: 8/10
   Reason: Clear rules, consequences shown

Recommended: Create Segments 1, 2, 3, 5 (4 shorts total)
```

**User confirms: "Create all 5"**

**✓ Task 4: Subtitle Configuration**
```
Applying custom settings:
- Font: Arial Bold
- Size: 52px (larger for readability)
- Color: Yellow (#FFFF00)
- Background: Semi-transparent black box
- Outline: None (background provides contrast)
- Position: Bottom center, 120px from bottom
```

**✓ Task 5: Generating Shorts**
```
Creating 5 vertical shorts with subtitles...

[1/5] "useState Explained in 30 Seconds"
  ✓ Extracted segment (02:15 - 02:43)
  ✓ Converted to 9:16 (1080x1920)
  ✓ Burned in yellow subtitles
  ✓ Added fade transitions
  ✓ Optimized: react_hooks_short_01_9x16.mp4 (12.3 MB)

[2/5] "Fix This Common Hook Mistake"
  ✓ Extracted segment (07:45 - 08:17)
  ✓ Converted to 9:16 (1080x1920)
  ✓ Burned in yellow subtitles
  ✓ Added fade transitions
  ✓ Optimized: react_hooks_short_02_9x16.mp4 (13.8 MB)

[3/5] "useEffect Dependency Array Trick"
  ✓ Extracted segment (12:30 - 12:55)
  ✓ Converted to 9:16 (1080x1920)
  ✓ Burned in yellow subtitles
  ✓ Added fade transitions
  ✓ Optimized: react_hooks_short_03_9x16.mp4 (10.5 MB)

[4/5] "Custom Hooks in 40 Seconds"
  ✓ Extracted segment (16:20 - 16:58)
  ✓ Converted to 9:16 (1080x1920)
  ✓ Burned in yellow subtitles
  ✓ Added fade transitions
  ✓ Optimized: react_hooks_short_04_9x16.mp4 (16.2 MB)

[5/5] "React Hook Rules Explained"
  ✓ Extracted segment (19:10 - 19:45)
  ✓ Converted to 9:16 (1080x1920)
  ✓ Burned in yellow subtitles
  ✓ Added fade transitions
  ✓ Optimized: react_hooks_short_05_9x16.mp4 (14.7 MB)

All shorts generated successfully!
Total: 5 videos, 67.5 MB
```

**✓ Task 6: Uploading to Google Drive**
```
Uploading to: Video Projects/Shorts/React Hooks Guide/

[Upload Progress]
✓ react_hooks_short_01_9x16.mp4
✓ react_hooks_short_02_9x16.mp4
✓ react_hooks_short_03_9x16.mp4
✓ react_hooks_short_04_9x16.mp4
✓ react_hooks_short_05_9x16.mp4
✓ shorts_metadata.json

All files uploaded successfully!
```

**🎉 Shorts Creation Complete!**

📁 **Google Drive Links:**
1. [useState Explained](https://drive.google.com/file/d/...) (28s)
2. [Fix Common Mistake](https://drive.google.com/file/d/...) (32s)
3. [useEffect Trick](https://drive.google.com/file/d/...) (25s)
4. [Custom Hooks](https://drive.google.com/file/d/...) (38s)
5. [Hook Rules](https://drive.google.com/file/d/...) (35s)

**📊 Summary:**
- Source: 22-minute tutorial → 5 shorts (2.7 minutes total)
- Format: 1080x1920 (9:16 vertical)
- Subtitles: Yellow text, black background
- Total size: 67.5 MB
- Upload location: Video Projects/Shorts/

**🎯 Publishing Recommendations:**
- **High Priority** (Post first): Shorts #2, #1, #3
- **TikTok Focus**: Shorts #2, #5 (strong problem hooks)
- **YouTube Shorts**: All suitable
- **Instagram Reels**: All suitable

**#️⃣ Suggested Hashtags:**
#react #reacthooks #javascript #webdev #coding #programming #tutorial #learntocode

---

## Advanced Features

- **Batch processing**: Process multiple source videos
- **Custom subtitle animations**: Word-by-word highlighting, karaoke style
- **Brand overlay**: Add logo/watermark to all shorts
- **Intro/outro templates**: Consistent branding across shorts
- **Multi-language subtitles**: Generate shorts in multiple languages
- **Platform-specific exports**: Different aspect ratios per platform

## Tips for Success

1. **Source quality**: Start with 1080p or higher source video
2. **Segment length**: 15-45 seconds performs best (max 60s)
3. **Hook priority**: First 2-3 seconds determine virality
4. **Subtitle readability**: Test on mobile device before publishing
5. **Audio clarity**: Ensure clean audio for accurate transcription
6. **Gemini prompting**: Customize analysis prompt for your niche
7. **Batch processing**: Process all shorts at once for efficiency

## Troubleshooting

### Download Issues
- **YouTube URL not working**: Check video availability, try different format
- **Drive link fails**: Verify sharing permissions set to "Anyone with link"

### Transcription Errors
- **Poor accuracy**: Improve source audio quality, use noise reduction
- **Missing timestamps**: Verify Whisper word-level timestamps enabled
- **Wrong language**: Specify language parameter in Whisper

### Subtitle Rendering Issues
- **Text cut off**: Adjust y-offset, reduce font size
- **Outline too thick**: Reduce outline width parameter
- **Wrong timing**: Verify SRT timestamps match video timing

### Performance Issues
- **Slow processing**: Process shorts sequentially instead of parallel
- **Large file sizes**: Increase CRF value (lower quality, smaller size)
- **Memory issues**: Process one short at a time, clear temp files

## Integration with Other Skills

- **script-generation**: Generate scripts for original shorts (not from existing video)
- **video-generation**: Create original short-form content with Veo
- **heygen-avatar**: Create avatar-narrated vertical shorts
- **upload-to-drive**: Automatic upload integration (already included)

## Related Skills

- **video-generation**: For creating original short content
- **heygen-avatar**: For avatar-based vertical videos
- **upload-to-drive**: For organized cloud storage
- **script-generation**: For planning original shorts
