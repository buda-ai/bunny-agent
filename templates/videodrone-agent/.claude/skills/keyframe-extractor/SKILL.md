---
name: keyframe-extractor
description: Extracts key frames from videos for style reference, regeneration, or analysis. Identifies visually significant moments and saves frames for further use.
---

# Keyframe Extractor

This skill extracts important frames from videos, identifying visually significant moments, scene changes, and stylistic reference points. Use for style matching, video regeneration, or visual analysis.

## When to Use This Skill

- Extracting style reference frames from videos
- Analyzing shot composition and visual style
- Preparing frames for image-to-video generation
- Creating visual mood boards from video
- Documenting video aesthetic for replication
- Extracting frames for prompt generation
- Getting screenshots for storyboards

## What This Skill Does

1. **Scene Detection**: Identifies major scene changes and transitions
2. **Keyframe Identification**: Selects visually representative frames
3. **Frame Extraction**: Saves high-quality still images from video
4. **Frame Analysis**: Provides description of visual elements in each frame
5. **Style Documentation**: Catalogs visual patterns across frames
6. **Metadata Capture**: Records timestamp and context for each frame

## How to Use

### Extract from Video URL

```
Extract keyframes from this video: [URL]
```

```
Get reference frames from: [URL]
```

### Specific Extraction

```
Extract [N] evenly-spaced frames from: [URL]
```

```
Get frames at: 0:05, 0:30, 1:15, 2:00 from [URL]
```

### For Style Reference

```
Extract keyframes from [URL] for style matching
```

## Instructions

When user requests keyframe extraction:

1. **Understand Requirements**

   ```markdown
   I'll extract keyframes from your video.
   
   **Video Source**: [URL or file path]
   
   **Extraction Method**:
   [ ] Automatic scene detection (AI identifies key moments)
   [ ] Evenly spaced (e.g., every 10 seconds)
   [ ] Specific timestamps (provide times)
   [ ] Smart sampling (balanced across video)
   
   **Number of Frames**: [How many frames to extract]
   
   **Purpose**:
   [ ] Style reference for new video
   [ ] Visual analysis
   [ ] Prompt generation for image recreation
   [ ] Storyboard creation
   [ ] Other: ___________
   ```

2. **Download/Access Video**

   ```markdown
   ## Video Processing
   
   **Video Details**:
   - Source: [URL or path]
   - Duration: [X:XX]
   - Resolution: [resolution]
   - FPS: [frame rate]
   
   **Extraction Settings**:
   - Method: [Scene detection / Interval / Timestamps]
   - Frame count: [N frames]
   - Output format: PNG (high quality)
   - Resolution: [Match source or specify]
   ```

3. **Extract Frames** (Using FFmpeg or similar)

   ```bash
   # Scene detection method
   ffmpeg -i input_video.mp4 -vf "select='gt(scene,0.3)',showinfo" -vsync vfr ./output/assets/keyframes/frame_%04d.png
   
   # Every N seconds method
   ffmpeg -i input_video.mp4 -vf fps=1/10 ./output/assets/keyframes/frame_%04d.png
   
   # Specific timestamps
   ffmpeg -i input_video.mp4 -ss 00:00:05 -vframes 1 ./output/assets/keyframes/frame_001.png
   ```

4. **Analyze Each Frame**

   For each extracted frame:

   ```markdown
   ## Keyframe Catalog
   
   ### Frame 001
   **Timestamp**: 0:00:05
   **Filename**: `frame_001.png`
   
   **Visual Description**:
   - **Subject**: [What's the main focus]
   - **Composition**: [How elements are arranged]
   - **Shot Type**: [Close-up/Medium/Wide]
   - **Setting**: [Location/background]
   
   **Color Analysis**:
   - **Dominant colors**: [List 3-5 colors]
   - **Color temperature**: [Warm/Cool/Neutral]
   - **Saturation**: [Low/Medium/High]
   - **Mood**: [Emotional quality]
   
   **Lighting**:
   - **Source**: [Natural/Studio/Mixed]
   - **Direction**: [Front/Side/Back]
   - **Quality**: [Soft/Hard]
   - **Mood**: [Bright/Dramatic/Neutral]
   
   **Elements Present**:
   - [ ] Person/People
   - [ ] Product
   - [ ] Text overlay
   - [ ] Graphics/Icons
   - [ ] Logo/Branding
   - [ ] Background elements
   
   **Technical Quality**:
   - Sharpness: [Sharp/Soft/Motion blur]
   - Exposure: [Well-exposed/Overexposed/Underexposed]
   - Depth of field: [Shallow/Deep]
   
   **Use Case**:
   - Style reference for: [What aspect]
   - Prompt potential: [How to recreate]
   - Storyboard position: [Where in narrative]
   
   ---
   
   ### Frame 002
   [Same structure as above]
   
   ---
   
   ### Frame 003
   [Continue for all extracted frames]
   ```

5. **Pattern Analysis**

   ```markdown
   ## Visual Patterns Across Frames
   
   **Consistent Style Elements**:
   - **Color Palette**: [Colors appearing in multiple frames]
   - **Composition Style**: [Common framing approaches]
   - **Lighting Style**: [Consistent lighting approach]
   - **Visual Tone**: [Overall aesthetic consistency]
   
   **Scene Breakdown**:
   | Frame | Timestamp | Scene Type | Subject | Mood |
   |-------|-----------|------------|---------|------|
   | 001 | 0:05 | Opening | [Subject] | [Mood] |
   | 002 | 0:18 | Intro | [Subject] | [Mood] |
   | 003 | 0:45 | Content | [Subject] | [Mood] |
   | ... | ... | ... | ... | ... |
   
   **Transitions Between Frames**:
   - Frame 1 → 2: [How scene changes]
   - Frame 2 → 3: [How scene changes]
   
   **Visual Progression**:
   - [How visual style evolves through video]
   ```

6. **Style Guide Creation**

   ```markdown
   ## Visual Style Guide (from extracted frames)
   
   **Overall Aesthetic**: [Description]
   
   **Color Scheme**:
   ```
   Primary: [Color] (appears in frames: [list])
   Secondary: [Color] (appears in frames: [list])
   Accent: [Color] (appears in frames: [list])
   ```
   
   **Composition Rules**:
   - Rule of thirds: [Yes/No, which frames]
   - Center framing: [Yes/No, which frames]
   - Leading lines: [Yes/No, which frames]
   - Symmetry: [Yes/No, which frames]
   
   **Lighting Characteristics**:
   - Typical setup: [Description]
   - Key light position: [Common pattern]
   - Fill/background: [Treatment]
   - Overall brightness: [Light/Medium/Dark]
   
   **Common Visual Elements**:
   - Logo placement: [Where and how]
   - Text style: [Font, size, position]
   - Graphics: [Style description]
   - Backgrounds: [Typical settings]
   
   **Shot Variety**:
   - Close-ups: [X% of frames]
   - Medium shots: [X% of frames]
   - Wide shots: [X% of frames]
   - B-roll: [X% of frames]
   ```

7. **Generate Image Prompts**

   For each frame, create recreation prompt:

   ```markdown
   ## Image Generation Prompts
   
   ### Frame 001 Prompt
   ```
   [Detailed prompt to recreate this frame]
   
   Style: [aesthetic description]
   Subject: [main subject]
   Setting: [background/environment]
   Lighting: [lighting setup]
   Colors: [color palette]
   Mood: [emotional tone]
   Camera: [shot type and angle]
   Quality: [technical specs - 4K, photorealistic, etc.]
   ```
   
   **Negative prompt**: [Elements to avoid]
   
   ---
   
   ### Frame 002 Prompt
   [Same structure]
   
   ---
   
   [Continue for all frames]
   ```

8. **Organize Output**

   ```markdown
   ## File Organization
   
   **Directory Structure**:
   ```
   /output/assets/keyframes/[video-name]/
   ├── frame_001.png (timestamp: 0:05)
   ├── frame_002.png (timestamp: 0:18)
   ├── frame_003.png (timestamp: 0:45)
   ├── ...
   ├── keyframe_analysis.md (this document)
   └── prompts.txt (all prompts for regeneration)
   ```
   
   **Frame Index**:
   - Total frames: [N]
   - Format: PNG
   - Resolution: [WxH]
   - File size: ~[X]MB per frame
   ```

9. **Provide Recommendations**

   ```markdown
   ## Recommendations for Use
   
   **For Style Matching**:
   - Use frames [X, Y, Z] as primary reference
   - Match color palette from frame [X]
   - Replicate composition style from frame [Y]
   - Use lighting from frame [Z] as template
   
   **For Regeneration**:
   - Frames [X, Y] are best for image-to-video start points
   - Frame [Z] works well for ending shot
   - Transitions needed between: [frame pairs]
   
   **For Storyboarding**:
   - Frame sequence represents: [narrative flow]
   - Use as visual reference for: [storyboard sections]
   - Adapt composition from: [specific frames]
   ```

10. **Create Comparison Grid** (Optional)

    ```markdown
    ## Visual Grid
    
    [Create a markdown table or description showing frames side-by-side]
    
    | Frame 001 | Frame 002 | Frame 003 |
    |-----------|-----------|-----------|
    | [0:05] | [0:18] | [0:45] |
    | Opening hook | Intro | Main content |
    | Wide shot | Medium | Close-up |
    
    **Visual Evolution**: [How visual style progresses]
    ```

11. **Save All Assets**

    - Save frames to: `./output/assets/keyframes/[video-name]/`
    - Save analysis to: `./output/assets/keyframes/[video-name]/keyframe_analysis.md`
    - Save prompts to: `./output/assets/keyframes/[video-name]/prompts.txt`
    - Add thumbnails to: `./output/assets/keyframes/[video-name]/thumbnails/` (optional)

12. **Provide Summary**

    ```markdown
    ✅ Keyframe extraction complete!
    
    **Extracted**: [N] frames from [video name]
    **Saved to**: `./output/assets/keyframes/[video-name]/`
    
    **Frame Summary**:
    - Total frames: [N]
    - Time span: [start] to [end]
    - Resolution: [WxH]
    - Style: [Overall aesthetic]
    
    **Notable Frames**:
    - Frame [X] (timestamp): [Why notable]
    - Frame [Y] (timestamp): [Why notable]
    - Frame [Z] (timestamp): [Why notable]
    
    **Files Created**:
    - [N] PNG frame files
    - keyframe_analysis.md
    - prompts.txt
    
    **Next Steps**:
    1. Review frames and analysis
    2. Use frames for style reference
    3. Generate images: `Generate images from these keyframe prompts`
    4. Create storyboard: `Create storyboard using these frames`
    5. Analyze patterns: `Analyze visual style from these frames`
    
    What would you like to do with these frames?
    ```

## Output Format

Keyframe extraction should produce:
- **High-quality frame images**: PNG format, original resolution
- **Detailed analysis**: Visual description for each frame
- **Image prompts**: Ready to use for regeneration
- **Style guide**: Patterns and consistency analysis
- **Organized files**: Clear naming and folder structure

## Tips

- **Scene detection**: Works best for videos with clear scene changes
- **Interval method**: Good for consistent sampling across video
- **Quality over quantity**: 5-10 meaningful frames better than 50 random ones
- **Timestamp notes**: Always record exact timestamp for context
- **Prompt detail**: More specific prompts = better regeneration results
- **Style consistency**: Look for patterns across frames, not just individual shots

## Technical Notes

```bash
# Extract one frame per second
ffmpeg -i input.mp4 -vf fps=1 output_%04d.png

# Extract high-quality frames at specific times
ffmpeg -i input.mp4 -ss 00:01:30 -vframes 1 -q:v 2 output.png

# Extract frames with scene detection (0.3 = sensitivity)
ffmpeg -i input.mp4 -vf "select='gt(scene,0.3)'" -vsync vfr output_%04d.png

# Extract every Nth frame
ffmpeg -i input.mp4 -vf "select='not(mod(n\,30))'" -vsync vfr output_%04d.png
```

## Related Skills

- Use `video-analyzer` first to understand video structure
- Use `prompt-generator` to create detailed prompts from frames
- Use `batch-image-generator` to recreate style from frame prompts
- Use frames as reference when using `video-segment-creator`
