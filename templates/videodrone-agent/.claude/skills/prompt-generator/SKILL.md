---
name: prompt-generator
description: Generates detailed image generation prompts from keyframes, descriptions, or style references. Optimized for AI image generators to create video-ready visuals.
---

# Prompt Generator

This skill creates detailed, optimized prompts for AI image generation tools (Midjourney, DALL-E, Stable Diffusion, etc.). Perfect for creating consistent visual assets for video production.

## When to Use This Skill

- Creating image prompts from extracted keyframes
- Generating prompts for B-roll visuals
- Designing consistent style across multiple images
- Translating descriptions into generation-ready prompts
- Creating variations while maintaining style consistency
- Batch prompt generation for video segments

## What This Skill Does

1. **Prompt Engineering**: Creates detailed, structured prompts for AI generators
2. **Style Consistency**: Ensures prompts maintain visual coherence
3. **Technical Optimization**: Includes proper parameters and quality markers
4. **Negative Prompts**: Specifies what to avoid in generation
5. **Batch Generation**: Creates multiple related prompts efficiently
6. **Platform Optimization**: Tailors prompts for specific AI tools

## How to Use

### From Keyframe

```
Generate image prompt from keyframe: [frame file or description]
```

### From Description

```
Create image prompts for: [scene description]
Style: [visual style]
```

### Batch Generation

```
Generate 5 image prompts for [topic/scene] with consistent [style]
```

## Instructions

When user requests prompt generation:

1. **Gather Input Information**

   ```markdown
   I'll create image generation prompts for you.
   
   **Source Material**:
   [ ] Keyframe/reference image
   [ ] Text description
   [ ] Style guide
   [ ] Existing video/brand materials
   
   **Generation Platform** (optional, for optimization):
   [ ] Midjourney
   [ ] DALL-E 3
   [ ] Stable Diffusion
   [ ] Other: ___________
   [ ] Generic (works across platforms)
   
   **Prompt Purpose**:
   [ ] Video backgrounds
   [ ] Product shots
   [ ] Character/presenter backgrounds
   [ ] B-roll visuals
   [ ] Title cards/graphics
   [ ] Other: ___________
   
   **Style Requirements**:
   - Visual style: [Modern/Cinematic/Minimal/Bold/etc.]
   - Color palette: [Colors or mood]
   - Mood/feeling: [Emotion to evoke]
   - Quality level: [Photorealistic/Illustrated/3D/etc.]
   ```

2. **Analyze Source Material**

   If keyframe provided:
   
   ```markdown
   ## Keyframe Analysis
   
   **Visual Elements Identified**:
   - Main subject: [Subject]
   - Setting/background: [Environment]
   - Lighting: [Lighting characteristics]
   - Colors: [Dominant colors]
   - Composition: [How elements arranged]
   - Style: [Aesthetic quality]
   - Technical: [Quality indicators]
   
   **Elements to Replicate**:
   - [Element 1]
   - [Element 2]
   - [Element 3]
   
   **Elements to Enhance/Change**:
   - [Element 1]: [How to improve]
   - [Element 2]: [How to improve]
   ```

3. **Prompt Structure Template**

   ```markdown
   ## Prompt Engineering Formula
   
   **Structure**: [Subject] + [Style] + [Setting] + [Lighting] + [Camera] + [Quality]
   
   **Components**:
   
   1. **Subject** (What's the main focus)
      - Primary subject
      - Actions/pose
      - Details and attributes
   
   2. **Style** (Visual aesthetic)
      - Art style (photorealistic, cinematic, illustrated, etc.)
      - Artistic reference (if any)
      - Medium (photography, digital art, 3D render, etc.)
   
   3. **Setting** (Environment/background)
      - Location description
      - Background elements
      - Atmosphere
   
   4. **Lighting** (Light quality and direction)
      - Light source
      - Quality (soft/hard)
      - Direction
      - Time of day
   
   5. **Camera** (Technical framing)
      - Shot type (close-up, medium, wide)
      - Angle (eye-level, high, low)
      - Lens characteristics
   
   6. **Quality** (Technical excellence markers)
      - Resolution (4K, 8K, etc.)
      - Rendering quality
      - Detail level
      - Professional indicators
   ```

4. **Create Detailed Prompts**

   ```markdown
   ## Generated Image Prompts
   
   ### Prompt 001: [Scene Name]
   
   **Main Prompt**:
   ```
   [Subject description], [action/pose], [detailed attributes],
   [style keywords], [artistic reference if any],
   [setting and environment description],
   [lighting setup and quality],
   [camera angle and framing],
   [mood and atmosphere],
   [technical quality indicators],
   --ar [aspect ratio] --v [version] [other parameters]
   ```
   
   **Simplified Version**:
   ```
   [Concise version of above, 1-2 sentences]
   ```
   
   **Negative Prompt** (what to avoid):
   ```
   [unwanted elements], [bad qualities], [artifacts to exclude],
   low quality, blurry, distorted, [specific issues]
   ```
   
   **Platform-Specific Notes**:
   - **Midjourney**: [MJ-specific parameters]
   - **DALL-E**: [DALL-E considerations]
   - **SD**: [Stable Diffusion settings]
   
   **Expected Output**:
   - Resolution: [Target resolution]
   - Aspect ratio: [16:9, 9:16, 1:1, etc.]
   - Use case: [Where in video]
   - Shot type: [Establishing/main/B-roll/etc.]
   
   ---
   
   ### Prompt 002: [Scene Name]
   
   [Same structure as above]
   
   ---
   
   [Continue for all requested prompts]
   ```

5. **Platform-Specific Optimization**

   **For Midjourney**:
   ```markdown
   ### Midjourney Prompt Template
   
   [Subject], [style], [setting], [lighting], [camera angle], [mood] --ar [ratio] --v 6 --style raw --s [stylize value]
   
   **Parameter Guide**:
   - `--ar 16:9`: Aspect ratio for video
   - `--v 6`: Version 6 (latest)
   - `--style raw`: More photographic
   - `--s 250`: Stylize (0-1000, higher = more artistic)
   - `--c 20`: Chaos (0-100, higher = more variation)
   - `--q 2`: Quality (0.25, 0.5, 1, 2)
   
   **Example**:
   ```
   modern office workspace with natural light streaming through large windows,
   professional business setting, minimalist design with plants,
   soft morning light, eye-level view, bright and airy atmosphere,
   photorealistic, architectural photography style, sharp focus,
   --ar 16:9 --v 6 --style raw --s 250
   ```
   ```
   
   **For DALL-E 3**:
   ```markdown
   ### DALL-E 3 Prompt Template
   
   [Detailed natural language description, longer and more narrative]
   
   **Tips**:
   - Use natural, descriptive language
   - Be specific about style and mood
   - Describe colors, lighting, composition
   - Can be longer than other platforms
   - No need for parameters
   
   **Example**:
   ```
   A modern office workspace bathed in warm natural morning light streaming through 
   floor-to-ceiling windows. The space features a minimalist aesthetic with clean 
   lines, a sleek wooden desk, and carefully placed green plants adding life to the 
   scene. The lighting creates a soft, inviting atmosphere with gentle shadows. 
   Shot from eye level to capture the balanced composition and professional yet 
   welcoming environment. Photorealistic style with sharp focus and architectural 
   photography aesthetics.
   ```
   ```
   
   **For Stable Diffusion**:
   ```markdown
   ### Stable Diffusion Prompt Template
   
   [Subject], [detailed description], ([style keywords]), ([quality keywords]), [lighting], [camera]
   
   **Emphasis Syntax**:
   - (keyword): mild emphasis
   - ((keyword)): stronger emphasis
   - (keyword:1.3): weighted emphasis (1.0-2.0)
   
   **Example**:
   ```
   modern office workspace, ((natural light)), large windows, minimalist design,
   (professional environment:1.2), plants, wooden desk, clean aesthetic,
   soft morning light, eye-level view, (photorealistic:1.3), (sharp focus:1.2),
   (8k uhd:1.1), architectural photography, (high quality:1.2)
   
   Negative: blurry, low quality, distorted, messy, cluttered, dark, artificial light
   ```
   ```

6. **Style Consistency Guidelines**

   ```markdown
   ## Maintaining Visual Consistency
   
   **For Series of Images**:
   
   **Consistent Elements** (keep in all prompts):
   - Color palette: [Specify exact colors]
   - Lighting setup: [Keep lighting description same]
   - Style keywords: [Use same style descriptors]
   - Quality markers: [Same technical terms]
   - Aspect ratio: [Same ratio for all]
   
   **Variable Elements** (change per prompt):
   - Subject/action
   - Specific setting details
   - Camera angle (if varied shots needed)
   
   **Example Series**:
   
   **Base Style Template**:
   ```
   [Subject], cinematic lighting, warm color palette with dominant blues and oranges,
   professional photography, shallow depth of field, 35mm lens, golden hour lighting,
   photorealistic, 8k uhd, sharp focus --ar 16:9
   ```
   
   **Prompt 1**: "tech startup founder [BASE STYLE]"
   **Prompt 2**: "modern workspace [BASE STYLE]"
   **Prompt 3**: "digital dashboard closeup [BASE STYLE]"
   
   [Each uses same style foundation but different subject]
   ```

7. **Quality Enhancement Keywords**

   ```markdown
   ## Quality & Technical Keywords
   
   **Resolution/Detail**:
   - 8k uhd, 4k, ultra high definition
   - highly detailed, intricate details, sharp focus
   - professional quality, studio quality
   
   **Photorealism**:
   - photorealistic, photo-realistic, hyperrealistic
   - realistic lighting, natural lighting
   - professional photography, DSLR
   - shot on [camera model]
   
   **Cinematic**:
   - cinematic lighting, dramatic lighting
   - depth of field, bokeh, shallow focus
   - film grain, 35mm, anamorphic
   - movie still, film screenshot
   
   **Artistic Style**:
   - digital art, concept art, matte painting
   - illustrated, stylized, artistic
   - trending on artstation, award winning
   
   **Lighting Descriptors**:
   - golden hour, blue hour, magic hour
   - soft light, hard light, dramatic light
   - rim light, back light, volumetric light
   - natural light, studio lighting, professional lighting
   
   **Camera/Lens**:
   - wide angle, telephoto, macro
   - 35mm, 50mm, 85mm lens
   - shallow depth of field, f/1.8, bokeh
   - eye level, high angle, low angle, bird's eye view
   ```

8. **Negative Prompt Library**

   ```markdown
   ## Common Negative Prompts
   
   **Quality Issues**:
   ```
   low quality, blurry, out of focus, pixelated, jpeg artifacts,
   low resolution, grainy (unless intended), noisy, distorted
   ```
   
   **Unwanted Elements**:
   ```
   watermark, text, signature, logo (unless wanted),
   border, frame, username, watermark
   ```
   
   **Anatomical Issues** (if people):
   ```
   deformed, disfigured, bad anatomy, wrong anatomy,
   extra limbs, missing limbs, floating limbs, disconnected limbs,
   mutation, mutated, ugly, disgusting, amputation
   ```
   
   **Style Issues**:
   ```
   amateur, unprofessional, bad composition, bad framing,
   cluttered, messy, chaotic (unless intended)
   ```
   
   **Lighting Issues**:
   ```
   bad lighting, overexposed, underexposed, harsh shadows (unless intended),
   too dark, too bright, flat lighting (unless intended)
   ```
   
   **Artistic Issues**:
   ```
   cartoon (unless intended), anime (unless intended), sketch (unless intended),
   painting (unless photo wanted), drawing, illustration (unless intended)
   ```
   ```

9. **Batch Prompt Generation Template**

   ```markdown
   ## Batch Prompts: [Topic/Series Name]
   
   **Shared Style Foundation**:
   ```
   [Common elements across all prompts]
   ```
   
   **Negative Prompt** (all prompts):
   ```
   [Shared negative prompt]
   ```
   
   ---
   
   ### Image 001: [Description]
   **Full Prompt**: `[Complete prompt]`
   **Use**: [Where in video]
   **Duration**: [How long shown]
   
   ### Image 002: [Description]
   **Full Prompt**: `[Complete prompt]`
   **Use**: [Where in video]
   **Duration**: [How long shown]
   
   ### Image 003: [Description]
   **Full Prompt**: `[Complete prompt]`
   **Use**: [Where in video]
   **Duration**: [How long shown]
   
   [Continue for all needed]
   
   ---
   
   **Generation Order**: [Recommended sequence]
   **Estimated Total Generation Time**: [Estimate]
   **Platform Recommended**: [Best platform for this batch]
   ```

10. **Test and Iterate Template**

    ```markdown
    ## Prompt Testing Guide
    
    **Initial Generation**:
    - Generate from Prompt 001
    - Review results
    - Note what works and what doesn't
    
    **Refinement**:
    
    **If too generic**:
    - Add more specific details
    - Add style references
    - Increase stylize/creativity
    
    **If too chaotic**:
    - Simplify description
    - Be more specific
    - Lower chaos/variation parameters
    
    **If wrong style**:
    - Add style keywords
    - Reference specific artists/styles
    - Use style parameters
    
    **If wrong composition**:
    - Be explicit about framing
    - Specify camera angle clearly
    - Describe element placement
    
    **Iteration Versions**:
    
    **v1** (Original): `[Prompt]`
    **v2** (Refinement 1): `[Adjusted prompt]`
    **v3** (Refinement 2): `[Further adjusted]`
    **Final**: `[Best performing prompt]`
    ```

11. **Save Prompts**

    Save to `./output/assets/prompts/[prompt-set-name]-[date].md` and also create a plain text file for easy copying: `./output/assets/prompts/[prompt-set-name]-[date].txt`

12. **Provide Summary**

    ```markdown
    ✅ Image prompts generated!
    
    **Saved to**: 
    - `./output/assets/prompts/[filename].md` (detailed)
    - `./output/assets/prompts/[filename].txt` (copy-ready)
    
    **Prompt Summary**:
    - Total prompts: [N]
    - Style: [Style description]
    - Platform optimized for: [Platform or generic]
    - Aspect ratio: [Ratio]
    
    **Quick Start**:
    1. Copy prompts from .txt file
    2. Paste into [recommended platform]
    3. Generate images
    4. Review and refine if needed
    
    **Next Steps**:
    1. Generate images: `Generate images from these prompts`
    2. Refine prompts: `Adjust prompts to be more [specific quality]`
    3. Create variations: `Generate 3 variations of prompt [N]`
    4. Batch generate: `Generate all images in batch mode`
    
    Ready to generate images?
    ```

## Output Format

Prompts should be:
- **Detailed yet concise**: Specific but not overly verbose
- **Structured**: Organized flow from subject to technical
- **Consistent**: Series prompts maintain visual coherence
- **Platform-appropriate**: Optimized for target generator
- **Actionable**: Ready to copy and use immediately

## Tips

- **Test first**: Generate 1-2 test images before full batch
- **Iterate**: Refine prompts based on results
- **Save winners**: Document prompts that work well
- **Version control**: Keep track of prompt iterations
- **Platform differences**: Same subject may need different prompt per platform
- **Style consistency**: Use prompt templates for series
- **Negative prompts**: Just as important as positive prompts

## Related Skills

- Use after `keyframe-extractor` to recreate frames
- Input to `batch-image-generator` for mass generation
- Reference `project-context` for brand visual style
- Use `video-analyzer` results to match existing aesthetics
