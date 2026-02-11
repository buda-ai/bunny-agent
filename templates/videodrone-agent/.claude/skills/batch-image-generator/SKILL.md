---
name: batch-image-generator
description: Generates multiple images with consistent style from prompts for video production. Manages batch generation, style consistency, and asset organization.
---

# Batch Image Generator

This skill generates multiple images with consistent visual style for use in video production. It manages the batch generation process, ensures style coherence, and organizes output assets.

## When to Use This Skill

- Creating multiple B-roll images for video
- Generating consistent visual assets for video series
- Producing background images for digital human videos
- Creating graphics and illustrations for explainer videos
- Generating product shots or scene backgrounds
- Building visual asset libraries for projects

## What This Skill Does

1. **Batch Processing**: Generates multiple images efficiently
2. **Style Consistency**: Ensures visual coherence across all images
3. **Quality Control**: Validates outputs against requirements
4. **Organization**: Saves and categorizes generated assets
5. **Metadata Tracking**: Records prompts and settings for each image
6. **Iteration Management**: Handles regeneration and refinements

## How to Use

### From Prompt List

```
Generate images from these prompts: [filename or paste list]
```

### From Storyboard

```
Generate all images needed for storyboard: [storyboard filename]
```

### Batch Specification

```
Generate [N] images with consistent style:
- Style: [description]
- Theme: [topic]
- Purpose: [use case]
```

## Instructions

When user requests batch image generation:

1. **Understand Requirements**

   ```markdown
   I'll generate a batch of images for your video.
   
   **Prompt Source**:
   [ ] Prompt file (already have prompts)
   [ ] Storyboard (generate from storyboard)
   [ ] Description (I'll create prompts)
   
   **Generation Platform**:
   [ ] Midjourney
   [ ] DALL-E 3
   [ ] Stable Diffusion
   [ ] Multiple platforms
   [ ] Your choice (I'll recommend)
   
   **Batch Size**: [Number of images]
   
   **Style Requirements**:
   - Visual style: [Photorealistic/Illustrated/3D/etc.]
   - Color palette: [Specific colors or mood]
   - Consistency level: [Strict/Moderate/Varied]
   
   **Timeline**: [Urgent/Standard/Flexible]
   ```

2. **Load or Create Prompts**

   ```markdown
   ## Prompt Preparation
   
   **Total Images**: [N]
   **Style Template**: [Base style to apply to all]
   
   ### Prompt List
   
   **Image 001**: [Name/Description]
   ```
   [Full prompt]
   ```
   **Negative**: [Negative prompt]
   **Purpose**: [Where used in video]
   
   **Image 002**: [Name/Description]
   ```
   [Full prompt]
   ```
   **Negative**: [Negative prompt]
   **Purpose**: [Where used in video]
   
   [Continue for all images...]
   ```

3. **Style Consistency Check**

   ```markdown
   ## Consistency Validation
   
   **Common Style Elements** (present in all prompts):
   - ✅ Color palette: [Specified in all]
   - ✅ Lighting style: [Consistent]
   - ✅ Quality keywords: [Same across all]
   - ✅ Technical specs: [Matching]
   - ✅ Artistic style: [Consistent]
   
   **Variable Elements** (changes per image):
   - Subject matter
   - Specific composition
   - Scene details
   
   **Potential Issues**:
   - [ ] No style conflicts detected
   - [ ] Minor variations noted: [List]
   - [ ] Significant inconsistencies: [List and recommend fixes]
   ```

4. **Platform Selection & Optimization**

   ```markdown
   ## Platform Recommendation
   
   **Recommended Platform**: [Platform name]
   
   **Reasoning**:
   - [Why this platform is best for these images]
   - [Cost consideration]
   - [Quality expected]
   - [Generation speed]
   
   **Alternative Options**:
   - **Option 2**: [Platform] - [Pros/Cons]
   - **Option 3**: [Platform] - [Pros/Cons]
   
   **Platform-Specific Optimizations Applied**:
   - [Optimization 1]
   - [Optimization 2]
   - [Optimization 3]
   ```

5. **Generation Plan**

   ```markdown
   ## Batch Generation Plan
   
   **Strategy**:
   [ ] Sequential (one at a time, review each)
   [ ] Parallel (batch submit, review all together)
   [ ] Hybrid (key images first, then batch)
   
   **Grouping**:
   
   **Group 1: High Priority** (Generate first)
   - Image 001: [Description] - [Reason for priority]
   - Image 003: [Description] - [Reason for priority]
   
   **Group 2: Standard**
   - Image 002: [Description]
   - Image 004: [Description]
   - Image 005: [Description]
   
   **Group 3: Optional/Backup**
   - Image 006: [Description]
   - Image 007: [Description]
   
   **Estimated Timeline**:
   - Group 1: [X minutes]
   - Group 2: [X minutes]
   - Group 3: [X minutes]
   - Total: [X minutes to X hours]
   ```

6. **Generation Execution**

   ```markdown
   ## Generation Log
   
   ### Image 001: [Name]
   **Status**: ⏳ Generating... / ✅ Complete / ❌ Failed / 🔄 Regenerating
   **Prompt Used**: `[Prompt]`
   **Platform**: [Platform name]
   **Attempts**: [N]
   **Generation Time**: [X seconds/minutes]
   **File**: `./output/assets/images/generated/image_001.png`
   
   **Quality Check**:
   - [ ] Matches prompt description
   - [ ] Style consistent with batch
   - [ ] Technical quality sufficient
   - [ ] Resolution correct
   - [ ] Usable for video
   
   **Issues**: [None / List any problems]
   **Action**: [Approved / Regenerate / Adjust prompt]
   
   ---
   
   ### Image 002: [Name]
   [Same structure as Image 001]
   
   ---
   
   [Continue for all images...]
   
   ---
   
   ## Batch Summary
   
   **Generated**: [X] / [Total]
   **Success Rate**: [X]%
   **Failed**: [N] - [Reasons]
   **Regenerations Needed**: [N]
   ```

7. **Quality Control Process**

   ```markdown
   ## Quality Control Checklist
   
   ### Per-Image QC
   
   For each image:
   - [ ] Subject matter correct
   - [ ] Composition as specified
   - [ ] Style matches batch
   - [ ] Colors align with palette
   - [ ] Technical quality high
   - [ ] No artifacts or errors
   - [ ] Resolution sufficient (min [X]p)
   - [ ] Aspect ratio correct
   - [ ] Usable for intended purpose
   
   ### Batch-Level QC
   
   - [ ] Visual consistency across all images
   - [ ] Color palette coherent
   - [ ] Style uniformity maintained
   - [ ] Quality level consistent
   - [ ] No outliers or mismatches
   
   ### Issues Found
   
   **Image [N]**: [Issue description]
   - **Severity**: [Low/Medium/High]
   - **Action**: [Approve anyway / Minor edit / Full regenerate]
   - **Note**: [Any relevant notes]
   
   **Image [N]**: [Issue description]
   [Same structure]
   ```

8. **File Organization**

   ```markdown
   ## File Management
   
   **Directory Structure**:
   ```
   /output/assets/images/generated/[project-name]-[date]/
   ├── image_001_[description].png
   ├── image_002_[description].png
   ├── image_003_[description].png
   ├── ...
   ├── batch_metadata.json
   ├── prompts_used.txt
   └── generation_log.md
   ```
   
   **Naming Convention**:
   - Format: `image_[###]_[short-description].png`
   - Example: `image_001_office-workspace.png`
   
   **Metadata File** (batch_metadata.json):
   ```json
   {
     "batch_id": "[unique-id]",
     "project": "[project-name]",
     "date": "[date]",
     "total_images": [N],
     "platform": "[platform]",
     "style": "[style-description]",
     "images": [
       {
         "id": "001",
         "filename": "image_001_[description].png",
         "prompt": "[full-prompt]",
         "negative_prompt": "[negative-prompt]",
         "generation_time": "[timestamp]",
         "attempts": [N],
         "purpose": "[video-scene]",
         "status": "approved"
       },
       // ... more images
     ]
   }
   ```
   ```

9. **Regeneration Management**

   ```markdown
   ## Regeneration Queue
   
   **Images Requiring Regeneration**:
   
   ### Image [N]: [Name]
   **Reason**: [Why regenerating]
   **Original Prompt**: `[prompt]`
   **Adjusted Prompt**: `[new-prompt]`
   **Changes Made**: [Specific adjustments]
   **Attempt**: [N]
   **Status**: [Pending / In Progress / Complete]
   
   ### Image [N]: [Name]
   [Same structure]
   
   ---
   
   **Regeneration Strategy**:
   - **Variation level**: [Same with tweaks / Significant changes]
   - **Expected attempts**: [N]
   - **Time estimate**: [X minutes]
   ```

10. **Cost & Resource Tracking**

    ```markdown
    ## Resource Usage
    
    **Generation Costs** (if applicable):
    - Platform: [Platform name]
    - Images generated: [N]
    - Images kept: [N]
    - Total attempts: [N]
    - Cost per image: [Amount]
    - Total cost: [Amount]
    - Credits used: [N]
    - Credits remaining: [N]
    
    **Time Investment**:
    - Prompt creation: [X minutes]
    - Generation waiting: [X minutes]
    - QC and review: [X minutes]
    - Regenerations: [X minutes]
    - Total time: [X hours]
    ```

11. **Batch Delivery Report**

    ```markdown
    ## Batch Generation Complete! ✅
    
    **Project**: [Project name]
    **Date**: [Date]
    **Total Images**: [N]
    
    ### Deliverables
    
    **Generated Images** ([N] files):
    - Location: `./output/assets/images/generated/[folder]/`
    - Format: PNG
    - Resolution: [X x Y]
    - Total size: [X] MB
    
    **Documentation**:
    - `batch_metadata.json` - Full generation data
    - `prompts_used.txt` - All prompts (copy-ready)
    - `generation_log.md` - Detailed generation log
    
    ### Quality Metrics
    
    - Success rate: [X]% first attempt
    - Images approved: [N]
    - Images regenerated: [N]
    - Average attempts: [X]
    - Style consistency: [High/Medium/Low]
    
    ### Image Breakdown by Purpose
    
    | Purpose | Count | Images |
    |---------|-------|--------|
    | Backgrounds | [N] | [List IDs] |
    | B-roll | [N] | [List IDs] |
    | Products | [N] | [List IDs] |
    | Graphics | [N] | [List IDs] |
    | Other | [N] | [List IDs] |
    
    ### Style Consistency Report
    
    **Color Palette Adherence**: [X]%
    **Lighting Consistency**: [X]%
    **Quality Level**: [Consistent / Minor variations / Some outliers]
    **Overall Visual Coherence**: [Score or description]
    
    ### Issues & Notes
    
    **Challenges Encountered**:
    - [Issue 1]: [How resolved]
    - [Issue 2]: [How resolved]
    
    **Recommendations**:
    - [Recommendation for future batches]
    - [Platform insights]
    - [Prompt refinements]
    
    ### Next Steps
    
    1. Review all images: `Show me all generated images`
    2. Regenerate specific image: `Regenerate image [N] with [changes]`
    3. Generate variations: `Create 3 variations of image [N]`
    4. Use in video: `Create video using these images`
    5. Generate more: `Generate [N] more images in same style`
    
    **Ready for video production!** 🎬
    ```

12. **Create Usage Guide**

    ```markdown
    ## Image Usage Guide
    
    ### For Video Editing
    
    **Importing Images**:
    ```bash
    # Import all images
    ls ./output/assets/images/generated/[folder]/*.png
    ```
    
    **Recommended Usage**:
    
    **Image 001** (office-workspace.png):
    - **Use for**: B-roll during intro section
    - **Duration**: 3-5 seconds
    - **Timing**: 0:15-0:20 in video
    - **Transition**: Fade in from previous shot
    
    **Image 002** (product-closeup.png):
    - **Use for**: Feature demonstration
    - **Duration**: 4-6 seconds
    - **Timing**: 0:45-0:50 in video
    - **Transition**: Cut from talking head
    
    [Continue for all images...]
    
    ### Color Grading Notes
    
    **To Match Video**:
    - Temperature: [Adjustment]
    - Tint: [Adjustment]
    - Saturation: [Adjustment]
    - Contrast: [Adjustment]
    
    **LUT Recommendation**: [If applicable]
    ```

13. **Save All Files**

    - Images: `./output/assets/images/generated/[project]/`
    - Log: `./output/assets/images/generated/[project]/generation_log.md`
    - Metadata: `./output/assets/images/generated/[project]/batch_metadata.json`
    - Prompts: `./output/assets/images/generated/[project]/prompts_used.txt`

## Output Format

Batch generation should produce:
- **High-quality images**: Meeting technical requirements
- **Consistent style**: Visually coherent set
- **Organized files**: Properly named and categorized
- **Complete documentation**: Prompts, metadata, logs
- **Ready to use**: Immediately usable in video production

## Tips

- **Test first**: Generate 2-3 samples before full batch
- **Consistency tokens**: Use same seed or style parameters when possible
- **Version prompts**: Small tweaks can cause big style changes
- **Backup strategy**: Generate extras for critical shots
- **Batch efficiently**: Group similar subjects together
- **Document everything**: Save prompts that work well
- **Quality over quantity**: Better to regenerate than settle

## Platform-Specific Tips

### Midjourney
- Use `--seed` for consistency across batch
- Same `--style` value for all images
- Reference first image: `--sref [URL]`

### DALL-E 3
- Keep prompts similar structure for consistency
- Use style references in all prompts
- Consider generation style (vivid vs natural)

### Stable Diffusion
- Lock seed for consistency
- Use same model/checkpoint
- Same LoRA weights if applicable

## Related Skills

- Use `prompt-generator` to create prompts first
- Reference `project-context` for brand style
- Input from `storyboard-generator` for shot list
- Output to `video-segment-creator` or `video-compositor`
