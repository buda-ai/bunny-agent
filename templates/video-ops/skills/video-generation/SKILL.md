---
name: video-generation
description: Generates music-only product videos using Google AI (Veo) for video scenes, optimized for website URLs and keywords
---

# Video Generation (Music-Only)

## When to Use This Skill

- User provides only website URL and/or product keywords
- Need a visual product demo video without narration
- Want to create atmospheric product showcase videos
- Need background videos with music for product pages
- Creating brand awareness videos focused on visuals

## What This Skill Does

1. Analyzes website URLs to extract product information and visual concepts
2. Processes product keywords into visual scene descriptions
3. Uses Google AI (Veo) to generate video scenes
4. Optionally uses nanobanana for additional visual generation
5. Composes scenes into cohesive 60-second product videos
6. Adds background music (royalty-free or user-provided)
7. Exports in 16:9 format optimized for web delivery

## How to Use

**From Website URL:**
```
Create a product video for https://example.com
Style: Modern, minimal
Music: Upbeat electronic
```

**From Keywords:**
```
Generate a video with these keywords: "speed", "innovation", "cloud", "security"
Product: Enterprise software platform
Duration: 60 seconds
```

**From Website + Keywords:**
```
Create a video for https://example.com
Keywords: "automation", "efficiency", "simplicity"
Visual style: Clean, professional
```

## Instructions

### Input Analysis Phase
1. Accept website URL and/or keywords from user
2. If website URL provided:
   - Fetch and analyze website content
   - Extract product features and benefits
   - Identify visual elements (screenshots, imagery)
   - Note color scheme and brand aesthetic
3. If keywords provided:
   - Understand product category
   - Map keywords to visual concepts
   - Identify emotional tone
4. Determine video duration (default: 60 seconds)
5. Clarify visual style preferences

### Visual Planning Phase
1. Break 60-second video into 8-10 scenes (6-8s each)
2. Map each scene to specific visual concept:
   - Product demonstrations
   - Abstract concepts (speed, security, collaboration)
   - Use case scenarios
   - Brand moments
3. Create scene-by-scene storyboard:
   ```
   Scene 1 (0-6s): Logo reveal with dynamic background
   Scene 2 (6-12s): Dashboard interface showcase
   Scene 3 (12-18s): Data flowing through networks (represent "cloud")
   Scene 4 (18-24s): Lock/security visualization
   Scene 5 (24-30s): Speed/performance visualization
   Scene 6 (30-36s): Team collaboration representation
   Scene 7 (36-48s): Product in use, happy users
   Scene 8 (48-60s): Logo with call-to-action
   ```
4. Define transitions between scenes
5. Note pacing and rhythm for music sync

### Video Generation with Google AI (Veo)
1. Check if Google AI MCP server is available
2. For each scene, generate video clip using Veo:
   ```
   Tool: google-ai (Veo video generation)
   Input: Detailed scene description
   Duration: 6-8 seconds per scene
   Style: Consistent visual style across scenes
   Resolution: 1920x1080 (16:9)
   ```
3. Example Veo prompt structure:
   ```
   "Modern dashboard interface with clean design, floating data cards smoothly
   animating in, professional color scheme with blue accents, camera slowly
   pushing in, 4k quality, cinematic lighting"
   ```
4. Generate 8-10 scenes with Veo
5. Maintain visual consistency across all scenes

### Alternative: Nanobanana for Scene Generation
If nanobanana is preferred or available:
1. Use nanobanana for simpler scene generation
2. Focus on abstract visualizations and transitions
3. Combine with static product screenshots
4. Apply motion effects in post-processing

### Scene Composition Phase
1. Assemble generated scenes in sequence
2. Add transitions between scenes:
   - Crossfade (0.5-1s)
   - Cut (immediate)
   - Push/slide for energetic feel
3. Use FFmpeg for composition:
   ```bash
   ffmpeg -i scene1.mp4 -i scene2.mp4 -i scene3.mp4 \
     -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.5:offset=5.5[v01]; \
     [v01][2:v]xfade=transition=fade:duration=0.5:offset=11[v012]; \
     # Continue for all scenes..." \
     -c:v libx264 -preset medium -crf 23 composed.mp4
   ```

### Music Integration Phase
1. Select background music:
   - Match energy to product/brand
   - Ensure royalty-free licensing
   - Duration: 60 seconds exactly
2. Sync visual transitions with musical beats if possible
3. Mix audio at appropriate level (-14 LUFS for web)
4. Add audio to video:
   ```bash
   ffmpeg -i composed.mp4 -i background_music.mp3 \
     -c:v copy -c:a aac -b:a 192k -shortest \
     final_video.mp4
   ```

### Post-Processing & Optimization
1. Add text overlays (optional):
   - Product name at opening
   - Key features as text cards
   - Call-to-action at closing
2. Color grading for consistency
3. Apply 16:9 aspect ratio verification
4. Optimize for web delivery:
   ```bash
   ffmpeg -i final_video.mp4 \
     -c:v libx264 -preset slow -crf 22 \
     -vf "scale=1920:1080" \
     -c:a aac -b:a 192k \
     -movflags +faststart \
     product_video_final.mp4
   ```
5. Target bitrate: 3-5 Mbps
6. File size: Aim for under 30MB

### Fallback Mode (If Veo Unavailable)
When Google AI Veo is not available:
1. Generate detailed production plan
2. Create storyboard with scene descriptions
3. Recommend stock footage sources:
   - Pexels, Pixabay (free)
   - Artgrid, Storyblocks (premium)
4. Provide FFmpeg assembly commands
5. List specific search terms for each scene
6. Document complete manual workflow

## Example

**User Request:**
> Create a product video for https://cloudops.example.com
> Keywords: automation, scalability, enterprise
> Duration: 60 seconds

**Agent Response:**

✓ Analyzing website: cloudops.example.com
✓ Product identified: Cloud Infrastructure Management Platform
✓ Visual style: Professional, tech-forward
✓ Color scheme: Blue, white, purple accents

**Generating Video Plan:**

**Scene Breakdown:**
1. **Scene 1 (0-7s)**: Logo reveal
   - Dark background with CloudOps logo materializing
   - Particles forming logo shape
   - Veo prompt: "Elegant logo reveal with glowing particles forming shape on dark background, professional lighting, 4k"

2. **Scene 2 (7-14s)**: Infrastructure visualization
   - Server racks with flowing data streams
   - Veo prompt: "Modern data center with glowing server racks, blue data streams flowing between systems, cinematic camera movement"

3. **Scene 3 (14-21s)**: Automation concept
   - Robotic arms organizing cloud icons
   - Veo prompt: "Abstract visualization of automation, mechanical elements smoothly organizing cloud symbols, clean white environment"

4. **Scene 4 (21-28s)**: Scalability visualization
   - Single server multiplying into many
   - Veo prompt: "Network topology expanding from one node to many, smooth growth animation, blue and purple glowing connections"

5. **Scene 5 (28-35s)**: Dashboard showcase
   - CloudOps dashboard with real-time metrics
   - Veo prompt: "Professional software dashboard with animated charts and metrics, clean interface design, data updating smoothly"

6. **Scene 6 (35-42s)**: Enterprise scale
   - Global network visualization
   - Veo prompt: "Earth globe with connection lines spreading globally, enterprise scale visualization, professional and impressive"

7. **Scene 7 (42-52s)**: Team collaboration
   - Abstract team working together
   - Veo prompt: "Silhouettes of business professionals collaborating around digital screens, modern office environment, inspiring mood"

8. **Scene 8 (52-60s)**: Call-to-action
   - Logo with tagline and website
   - Veo prompt: "Clean logo presentation with text overlay, professional finish, subtle animation"

✓ Generating scenes with Google AI (Veo)...
[Progress: Scene 1/8... Scene 2/8... etc.]

✓ Composing video...
✓ Adding background music (upbeat corporate instrumental)
✓ Optimizing for web delivery...

**Generated Video:**
- File: `cloudops_product_video_60s.mp4`
- Resolution: 1920x1080 (16:9)
- Duration: 60 seconds
- Size: 24.8 MB
- Bitrate: 3.5 Mbps
- Audio: Background music only, no narration

**Technical Specs:**
- Codec: H.264
- Audio: AAC 192kbps
- Fast-start enabled
- Web-optimized

**Recommended Use:**
- Product landing page hero section
- YouTube product channel
- Email marketing campaigns
- Social media (landscape posts)

## Advanced Features

- **Style templates**: Minimal, dramatic, playful, corporate
- **Dynamic text overlays**: Animated key features
- **Logo animations**: Custom brand integration
- **Color grading**: Match brand colors automatically
- **Multi-length versions**: 30s, 60s, 90s from same scenes

## Tips for Success

1. **Scene variety**: Mix close-ups, wide shots, abstract and concrete
2. **Pacing**: Match music energy - fast cuts for upbeat, slow for elegance
3. **Visual consistency**: Keep color palette and style unified
4. **Text sparingly**: Let visuals tell the story, minimal text
5. **Music selection**: Music sets 80% of the emotional tone
6. **Brand alignment**: Ensure visual style matches brand identity

## FFmpeg Command Reference

### Scene Composition with Crossfade
```bash
ffmpeg -i scene1.mp4 -i scene2.mp4 -i scene3.mp4 -i scene4.mp4 \
  -filter_complex \
  "[0:v][1:v]xfade=transition=fade:duration=0.5:offset=6.5[v01]; \
   [v01][2:v]xfade=transition=fade:duration=0.5:offset=13[v012]; \
   [v012][3:v]xfade=transition=fade:duration=0.5:offset=19.5[vout]" \
  -map "[vout]" -c:v libx264 -crf 23 composed.mp4
```

### Add Background Music
```bash
ffmpeg -i video.mp4 -i music.mp3 \
  -c:v copy -c:a aac -b:a 192k \
  -map 0:v:0 -map 1:a:0 \
  -shortest output.mp4
```

### Add Text Overlay
```bash
ffmpeg -i video.mp4 -vf \
  "drawtext=text='Your Product Name':fontsize=72:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,0,3)'" \
  -c:a copy output_with_text.mp4
```

## Integration with Other Skills

- **script-generation**: Use scripts to inform visual concepts (even without narration)
- **heygen-avatar**: Can combine with avatar narration for hybrid videos
- **upload-to-drive**: Upload completed videos to cloud storage
- **shorts-creation**: Repurpose scenes into vertical short clips

## Related Skills

- **script-generation**: For planning narrative structure
- **heygen-avatar**: For adding narration to videos
- **upload-to-drive**: For storing and sharing videos
