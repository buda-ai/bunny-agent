---
name: heygen-avatar
description: Generates professional talking avatar videos from detailed scripts using HeyGen API
---

# HeyGen Avatar Video Generation

## When to Use This Skill

- User provides a detailed script for video narration
- Need a professional talking head / avatar presenter video
- Want human-like narration without hiring talent
- Creating explainer videos with a presenter
- Need multilingual video versions with consistent avatar

## What This Skill Does

1. Accepts detailed timestamped scripts from users or script-generation skill
2. Validates script length and pacing for video production
3. Integrates with HeyGen MCP server to generate avatar videos
4. Allows avatar and voice customization
5. Produces professional presenter-style videos with synchronized lip-sync
6. Exports in 16:9 format suitable for product videos and presentations
7. Handles errors and provides fallback workflows

## How to Use

**With Provided Script:**
```
Create an avatar video with this script:
[Full script text with timestamps]

Avatar style: Professional female
Voice: Clear, friendly
Background: Office setting
```

**With Script from script-generation:**
```
Use the generated script to create an avatar presentation video
Avatar: Business professional male
Voice: Authoritative, warm
```

**Quick Mode:**
```
Make a HeyGen video from this script:
"Welcome to our platform. We help teams collaborate better..."
Duration: 60 seconds
```

## Instructions

### Prerequisites Check
1. Verify HeyGen MCP server is configured
2. Check HEYGEN_API_KEY is set in environment
3. Test HeyGen connection before proceeding
4. If unavailable, switch to fallback mode

### Script Validation Phase
1. Accept script from user or from script-generation skill
2. Validate script properties:
   - Length: 150-180 words for 60s video
   - Pacing: Read aloud test (should feel natural)
   - Clarity: No tongue-twisters or complex phrases
   - Pronunciation: Mark any special terms
3. Check for timestamps (if not provided, estimate timing)
4. Ensure script has clear structure:
   - Opening hook
   - Main content
   - Closing call-to-action

### Avatar & Voice Selection
1. Present avatar options to user (or use defaults):
   - **Professional female**: Business attire, office setting
   - **Professional male**: Suit, corporate background
   - **Casual presenter**: Friendly, approachable
   - **Industry-specific**: Tech, healthcare, education styles
2. Voice characteristics:
   - Tone: Professional, friendly, authoritative, casual
   - Pace: Normal, slow (for technical), fast (for energetic)
   - Language: English (default), or multilingual
3. Background setting:
   - Office/corporate
   - Clean/minimal
   - Industry-specific (tech, medical, etc.)
   - Custom (if HeyGen supports)

### HeyGen Video Generation
1. Use HeyGen MCP server to generate video:
   ```
   Tool: heygen MCP
   Method: generate_video or create_avatar_video

   Parameters:
   {
     "script": "Full script text here...",
     "avatar_id": "selected_avatar_id",
     "voice": {
       "voice_id": "selected_voice",
       "speed": 1.0,
       "pitch": 1.0
     },
     "background": "office",
     "dimension": {
       "width": 1920,
       "height": 1080
     }
   }
   ```

2. Monitor generation progress
3. Handle HeyGen API responses:
   - Success: Download video URL
   - Error: Retry with adjusted parameters
   - Rate limit: Queue and retry

### HeyGen API Integration Details
According to HeyGen MCP documentation (https://docs.heygen.com/docs/heygen-mcp-server):

**Available HeyGen MCP Tools:**
- `create_video`: Generate avatar video from script
- `list_avatars`: Get available avatar options
- `list_voices`: Get available voice options
- `get_video_status`: Check generation progress
- `download_video`: Retrieve completed video

**Typical Workflow:**
```javascript
// 1. List available avatars
const avatars = await heygen.list_avatars();

// 2. List available voices
const voices = await heygen.list_voices();

// 3. Create video with selected avatar and voice
const videoJob = await heygen.create_video({
  script: scriptText,
  avatar_id: selectedAvatar,
  voice_id: selectedVoice,
  dimension: { width: 1920, height: 1080 }
});

// 4. Poll for completion
const status = await heygen.get_video_status(videoJob.id);

// 5. Download when ready
if (status === 'completed') {
  const videoUrl = await heygen.download_video(videoJob.id);
}
```

### Post-Processing (Optional)
1. Download generated HeyGen video
2. Add additional elements if needed:
   - Logo overlay
   - Product B-roll footage
   - Text overlays for key points
   - Background music (subtle, under voice)
3. Use FFmpeg for post-production:
   ```bash
   # Add logo overlay
   ffmpeg -i heygen_video.mp4 -i logo.png \
     -filter_complex "overlay=W-w-20:20" \
     -c:a copy output.mp4

   # Add subtle background music under narration
   ffmpeg -i heygen_video.mp4 -i bg_music.mp3 \
     -filter_complex "[1:a]volume=0.2[a1];[0:a][a1]amix=inputs=2:duration=shortest[aout]" \
     -map 0:v -map "[aout]" -c:v copy -c:a aac output.mp4
   ```

### Quality Validation
1. Check video playback smoothly
2. Verify lip-sync accuracy
3. Confirm audio clarity
4. Validate aspect ratio (16:9)
5. Ensure duration matches expectations
6. Test on target platforms

### Fallback Mode (If HeyGen Unavailable)
When HeyGen MCP is not available:
1. **Generate manual workflow document:**
   ```
   # Manual Avatar Video Production Plan

   ## Script (Ready for recording)
   [Formatted script with timing notes]

   ## Recording Options

   ### Option 1: HeyGen Web Interface
   1. Visit https://app.heygen.com
   2. Create new video project
   3. Select avatar: [recommended avatar]
   4. Paste script: [script content]
   5. Configure voice: [voice settings]
   6. Generate video
   7. Download when complete

   ### Option 2: Alternative Tools
   - **D-ID**: https://www.d-id.com (similar avatar generation)
   - **Synthesia**: https://www.synthesia.io (professional avatars)
   - **Colossyan**: https://www.colossyan.com (AI video platform)

   ### Option 3: Human Recording
   - Use teleprompter with script
   - Record in 1920x1080 resolution
   - Ensure good lighting and audio
   - Edit with standard video software
   ```

2. **Provide script in optimized format:**
   - Clear paragraphs with breathing points
   - Pronunciation guide for technical terms
   - Emphasis markers for key points
   - Timing guidelines

## Example

**User Request:**
> Create an avatar video with this script:
>
> "Are you struggling with team productivity? Traditional tools just aren't cutting it anymore.
> That's why we built TeamSync - the collaboration platform that actually works the way your team does.
> With real-time updates, intuitive workflows, and powerful integrations, TeamSync brings everything together.
> Try it free for 30 days. No credit card required."

**Agent Response:**

✓ Script received (47 words, ~19 seconds)
⚠ Note: This script is shorter than typical 60s videos. Consider expanding or confirming intent.

✓ Checking HeyGen MCP server...
✓ HeyGen available

**Avatar & Voice Selection:**

Based on your script's professional tone, I recommend:
- **Avatar**: Professional female in business attire
- **Voice**: Clear, friendly, medium pace
- **Background**: Modern office setting

Proceed with these settings? [Y/n]

**[User confirms]**

✓ Generating avatar video with HeyGen...
✓ Avatar: professional-female-01
✓ Voice: en-US-friendly-female
✓ Estimated duration: 20 seconds

[Progress: Submitting to HeyGen... Queued... Processing... 50%... 80%... Complete!]

✓ Video generated successfully
✓ Downloading from HeyGen...

**Generated Video:**
- File: `teamsync_avatar_intro.mp4`
- Resolution: 1920x1080 (16:9)
- Duration: 19 seconds
- Avatar: Professional female presenter
- Quality: High (HeyGen native quality)

**Technical Specs:**
- Codec: H.264
- Audio: AAC 192kbps stereo
- Lip-sync: Accurate
- File size: 8.2 MB

**Recommendations:**
1. Consider extending script to 60s for fuller product video
2. Could add B-roll product footage between avatar segments
3. Add soft background music at 15-20% volume
4. Include text overlay with website URL at end

**Next Steps:**
Would you like me to:
- Extend the script and regenerate?
- Add B-roll footage and music?
- Generate additional versions in other languages?
- Upload to Google Drive?

## Advanced Features

- **Multilingual generation**: Same avatar, different language voiceovers
- **A/B testing**: Generate multiple versions with different avatars
- **Custom avatars**: Use HeyGen custom avatar features (if available)
- **Batch generation**: Multiple videos from script variants
- **Avatar + B-roll mixing**: Combine avatar narration with product footage

## Tips for Success

1. **Script length**: Aim for 2.5-3 words per second of video
2. **Natural pacing**: Include pauses with ellipses "..."
3. **Conversational tone**: Write how people speak, not how they write
4. **Avatar selection**: Match avatar to target audience demographics
5. **Voice consistency**: Use same voice/avatar for video series
6. **Background choice**: Ensure background doesn't distract from message
7. **Test output**: Always review before publishing

## HeyGen Best Practices

1. **Script formatting for HeyGen:**
   - Use proper punctuation for natural pauses
   - Add commas for breathing points
   - Use periods to mark sentence endings clearly
   - Mark emphasis with CAPS for important words (use sparingly)

2. **Voice customization:**
   - Speed: 0.8-1.2x (1.0 is normal, 0.9 recommended for clarity)
   - Pitch: Adjust for gender/tone appropriateness
   - Emotion: Some HeyGen voices support emotional tags

3. **Avatar selection tips:**
   - Professional B2B: Business attire, office background
   - Consumer products: Casual, friendly avatars
   - Technical content: Authoritative, expert-looking avatars
   - International: Choose ethnically appropriate avatars

## Troubleshooting

### HeyGen API Errors
- **"Insufficient credits"**: Check HeyGen account balance
- **"Script too long"**: Split into multiple videos or trim script
- **"Invalid avatar_id"**: Use list_avatars to see available options
- **Rate limit exceeded**: Implement retry with exponential backoff

### Quality Issues
- **Poor lip-sync**: Simplify script, avoid complex words
- **Robotic voice**: Try different voice options, adjust speed
- **Unnatural pauses**: Review script punctuation

### Generation Failures
1. Retry with same parameters (temporary API issue)
2. Try different avatar/voice combination
3. Simplify script (remove special characters)
4. Split longer scripts into segments
5. Contact HeyGen support if persistent

## Integration with Other Skills

- **script-generation**: Receive scripts directly from script generation
- **video-generation**: Combine avatar narration with Veo-generated B-roll
- **upload-to-drive**: Upload completed avatar videos to cloud
- **shorts-creation**: Can create vertical versions of avatar videos

## Related Skills

- **script-generation**: For creating optimized scripts for avatar videos
- **video-generation**: For music-only visual videos
- **upload-to-drive**: For storing and sharing completed videos
