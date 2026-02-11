---
name: digital-human-integrator
description: Integrates AI-generated digital human avatars into video content. Handles avatar selection, script-to-speech conversion, lip-sync, and presenter integration.
---

# Digital Human Integrator

This skill manages the integration of digital human avatars (AI presenters) into video content, including avatar configuration, speech synthesis, lip-sync, and scene composition.

## When to Use This Skill

- Creating talking head presenter videos without real humans
- Adding consistent brand spokesperson across videos
- Generating multilingual presenter videos
- Creating personalized video at scale
- Professional presenter without filming costs
- Content requiring always-available presenter

## What This Skill Does

1. **Avatar Selection**: Chooses or configures appropriate digital human
2. **Script Optimization**: Adapts script for natural digital human delivery
3. **Voice Generation**: Converts text to natural speech
4. **Lip-Sync**: Synchronizes avatar mouth movements with audio
5. **Background Integration**: Composites avatar with branded backgrounds
6. **Expression Control**: Manages facial expressions and gestures
7. **Output Rendering**: Generates final video with digital presenter

## How to Use

### Basic Integration

```
Create digital human video from this script: [script or filename]
```

```
Add digital presenter to explain [topic]
```

### With Specifications

```
Create a video with:
- Avatar: [professional female/male, style]
- Script: [paste or filename]
- Background: [office/studio/custom]
- Duration: [length]
```

## Instructions

When user requests digital human integration:

1. **Check Project Context**

   ```markdown
   Checking project context for digital human preferences...
   
   **From project-context.md**:
   - Avatar type: [Preference from context or ask]
   - Voice style: [From brand voice or ask]
   - Background setting: [From brand guidelines or ask]
   ```

2. **Avatar Configuration**

   ```markdown
   ## Digital Human Configuration
   
   **Avatar Selection**:
   
   **Appearance**:
   - [ ] Professional business person
   - [ ] Friendly expert
   - [ ] Young professional
   - [ ] Mature authority figure
   - [ ] Custom specification
   
   **Demographics**:
   - Gender: [Male/Female/Non-binary]
   - Age range: [20s/30s/40s/50+]
   - Ethnicity: [Specification or diverse]
   - Style: [Contemporary/Classic/Casual]
   
   **Attire**:
   - [ ] Business formal (suit/blazer)
   - [ ] Business casual (smart casual)
   - [ ] Casual professional (polo/button-down)
   - [ ] Industry-specific (lab coat, scrubs, etc.)
   - [ ] Custom: ___________
   
   **Avatar Platform**:
   - [ ] D-ID
   - [ ] Synthesia
   - [ ] HeyGen
   - [ ] Runway ML
   - [ ] Other: ___________
   
   [Note: Availability depends on user's subscriptions]
   ```

3. **Voice Configuration**

   ```markdown
   ## Voice Setup
   
   **Voice Selection**:
   
   **Voice Type**:
   - Gender: [Match avatar or specify]
   - Age: [Young/Middle-aged/Mature]
   - Accent: [American/British/Australian/Neutral/Other]
   - Language: [Primary language]
   
   **Voice Characteristics**:
   - Tone: [Professional/Friendly/Authoritative/Casual]
   - Pace: [Slow/Medium/Fast] (~[XXX] words/minute)
   - Energy: [Calm/Moderate/Energetic]
   - Pitch: [Lower/Medium/Higher]
   
   **Voice Platform**:
   - [ ] ElevenLabs
   - [ ] Murf.ai
   - [ ] Platform's built-in (D-ID, Synthesia)
   - [ ] Azure Speech
   - [ ] Google Text-to-Speech
   - [ ] Amazon Polly
   
   **Voice Sample Needed**: [Yes/No - provide reference if yes]
   ```

4. **Script Optimization for Digital Human**

   ```markdown
   ## Script Adaptation
   
   **Original Script Review**:
   - Total word count: [XXX] words
   - Estimated duration: [X:XX] at 150 wpm
   - Complexity check: [Simple/Moderate/Complex]
   
   **Optimization for Digital Human**:
   
   ✅ **Optimizations Made**:
   - [ ] Removed tongue twisters
   - [ ] Simplified complex words
   - [ ] Added natural pauses [pause]
   - [ ] Clarified pronunciation: [word] → [phonetic]
   - [ ] Adjusted pacing markers
   - [ ] Shortened overly long sentences
   - [ ] Added emphasis markers *word*
   
   **Pronunciation Guide**:
   | Word | Phonetic | Context |
   |------|----------|---------|
   | [Brand name] | [Pronunciation] | [When appears] |
   | [Technical term] | [Pronunciation] | [When appears] |
   
   **Adjusted Script**:
   ```
   [Script with digital human optimizations]
   ```
   ```

5. **Background & Scene Setup**

   ```markdown
   ## Scene Configuration
   
   **Background Selection**:
   
   **Background Type**:
   - [ ] Virtual office
   - [ ] Studio (plain/gradient)
   - [ ] Home office
   - [ ] Industry-specific setting
   - [ ] Custom uploaded background
   - [ ] Green screen for custom compositing
   
   **Background Details**:
   - Style: [Modern/Classic/Minimal/Detailed]
   - Color scheme: [From brand colors]
   - Lighting: [Bright/Balanced/Dramatic]
   - Blur level: [None/Slight/Heavy - for focus on presenter]
   
   **Brand Elements**:
   - Logo placement: [Yes/No - where if yes]
   - Brand colors: [Incorporated how]
   - Props/elements: [Any specific items]
   
   **Camera Framing**:
   - Shot type: [Head & shoulders/Medium/Waist-up]
   - Position: [Center/Rule of thirds]
   - Headroom: [Standard professional framing]
   ```

6. **Expression & Gesture Control**

   ```markdown
   ## Avatar Behavior Settings
   
   **Facial Expressions**:
   - Default: [Neutral friendly/Slight smile/Professional]
   - Smile intensity: [Subtle/Moderate/Warm]
   - Eye contact: [Direct/Natural variation]
   - Blink rate: [Natural/Frequent/Infrequent]
   
   **Gestures** (if platform supports):
   - Hand movements: [None/Subtle/Moderate/Expressive]
   - Head movements: [Minimal nods/Natural movement/Static]
   - Body language: [Formal/Relaxed/Animated]
   
   **Expression Cues from Script**:
   | Time | Script Line | Expression |
   |------|-------------|------------|
   | 0:05 | "Welcome..." | Warm smile |
   | 0:30 | "The problem is..." | Concerned |
   | 1:00 | "Here's the solution..." | Confident |
   | 2:00 | "Imagine..." | Excited |
   | 2:45 | "Get started today" | Encouraging |
   ```

7. **Platform-Specific Configuration**

   **For D-ID**:
   ```markdown
   ### D-ID Configuration
   
   **API Settings**:
   - Driver image: [Avatar image or stock]
   - Audio source: [Generated TTS or uploaded]
   - Stitch: [true/false - for longer videos]
   - Result format: [mp4, webm]
   
   **Script Format**:
   ```json
   {
     "script": {
       "type": "text",
       "input": "[Script text with SSML tags]",
       "provider": {
         "type": "microsoft",
         "voice_id": "[Voice ID]"
       }
     },
     "config": {
       "fluent": true,
       "pad_audio": 0,
       "stitch": true
     }
   }
   ```
   ```
   
   **For Synthesia**:
   ```markdown
   ### Synthesia Configuration
   
   **Avatar**: [Avatar ID from library]
   **Voice**: [Voice ID]
   **Background**: [Template ID or custom]
   
   **Script Input**:
   ```
   [Scene 1]
   [Script text]
   <pause>1000</pause>
   
   [Scene 2]
   [Script text]
   ```
   
   **Output Settings**:
   - Resolution: 1080p / 4K
   - Subtitles: On/Off
   - Background music: [Yes/No]
   ```
   
   **For HeyGen**:
   ```markdown
   ### HeyGen Configuration
   
   **Avatar Selection**: [Avatar from library or custom]
   **Voice Cloning**: [Yes/No - if yes, upload sample]
   
   **Scene Settings**:
   - Avatar position: [Center/Left/Right]
   - Avatar size: [Scale percentage]
   - Background: [Template or custom]
   
   **Text Input**:
   ```
   [Script with timing markers]
   {pause: 1} for 1 second pause
   {emphasis} for emphasized words
   ```
   ```

8. **Rendering Workflow**

   ```markdown
   ## Video Generation Process
   
   **Step 1: Audio Generation**
   - Generate voice from script using [platform]
   - Duration: [X:XX]
   - Preview and verify pronunciation
   - Adjust if needed: [List any adjustments]
   
   **Step 2: Avatar Animation**
   - Upload audio to digital human platform
   - Configure avatar and scene
   - Generate video with lip-sync
   - Estimated render time: [X minutes]
   
   **Step 3: Background Compositing** (if needed)
   - Add custom branded background
   - Insert logo/graphics
   - Apply color grading to match brand
   
   **Step 4: Post-Processing** (optional)
   - Add text overlays
   - Insert B-roll cutaways
   - Add background music
   - Apply transitions
   
   **Step 5: Quality Check**
   - [ ] Lip-sync accurate
   - [ ] Audio quality clear
   - [ ] Video quality high
   - [ ] Background appropriate
   - [ ] Brand elements present
   - [ ] Natural expressions
   - [ ] Smooth movements
   - [ ] Correct duration
   ```

9. **Integration with Video Workflow**

   ```markdown
   ## Video Composition
   
   **Digital Human Segments**:
   
   | Segment | Duration | Script | Avatar | Background |
   |---------|----------|--------|--------|------------|
   | Opening | 0:00-0:15 | [Intro] | [Avatar] | [Setting] |
   | Section 1 | 0:15-0:45 | [Content] | [Avatar] | [Setting] |
   | Section 2 | 0:45-1:15 | [Content] | [Avatar] | [Setting] |
   | Closing | 1:15-1:30 | [CTA] | [Avatar] | [Setting] |
   
   **B-Roll Integration**:
   - Cut away to B-roll at: [timestamps]
   - Return to avatar at: [timestamps]
   - Picture-in-picture: [Yes/No - where]
   
   **Final Composition**:
   ```
   Timeline:
   [00:00-00:05] Title card
   [00:05-00:15] Avatar intro
   [00:15-00:20] B-roll product shot
   [00:20-00:45] Avatar content
   [00:45-00:50] B-roll feature demo
   [00:50-01:15] Avatar content
   [01:15-01:30] Avatar CTA + End screen
   ```
   ```

10. **Quality Assurance Checklist**

    ```markdown
    ## QA Checklist
    
    **Audio Quality**:
    - [ ] Voice sounds natural (not robotic)
    - [ ] Pronunciation correct for all words
    - [ ] Pacing feels natural
    - [ ] Volume levels consistent
    - [ ] No audio artifacts or glitches
    - [ ] Background music balanced (if any)
    
    **Visual Quality**:
    - [ ] Lip-sync accurate throughout
    - [ ] Facial expressions appropriate
    - [ ] No uncanny valley effects
    - [ ] Lighting on avatar natural
    - [ ] Background complements avatar
    - [ ] Resolution and quality high
    - [ ] No visual artifacts or glitches
    
    **Brand Alignment**:
    - [ ] Avatar matches brand personality
    - [ ] Voice matches brand tone
    - [ ] Background reflects brand aesthetic
    - [ ] Colors aligned with brand palette
    - [ ] Logo/branding properly placed
    - [ ] Overall feeling matches brand
    
    **Content Accuracy**:
    - [ ] Script delivered as written
    - [ ] All key points covered
    - [ ] Duration matches target
    - [ ] CTA clear and prominent
    - [ ] No errors or misstatements
    ```

11. **Save Configuration**

    Save all settings to `./output/digital-human/config-[project-name]-[date].md` for reuse in future videos.

12. **Provide Summary**

    ```markdown
    ✅ Digital human video configuration complete!
    
    **Configuration Saved**: `./output/digital-human/config-[filename].md`
    
    **Video Details**:
    - Avatar: [Description]
    - Voice: [Type]
    - Background: [Setting]
    - Duration: [X:XX]
    - Platform: [Platform]
    
    **Generation Status**:
    - Audio: [Generated/Pending]
    - Video: [Generated/Rendering/Pending]
    - Estimated completion: [Time]
    
    **Output Location**: `./output/videos/digital-human-[filename].mp4`
    
    **Next Steps**:
    1. Review generated video
    2. Request adjustments if needed:
       - "Adjust voice to be more [characteristic]"
       - "Change avatar expression to [emotion]"
       - "Update background to [setting]"
    3. Integrate with other video segments
    4. Add post-production elements
    
    **For Future Videos**:
    - Configuration saved for reuse
    - Use same avatar: "Create another video with same avatar"
    - Change settings: "Modify avatar configuration for [change]"
    
    Ready to generate or need adjustments?
    ```

## Output Format

Digital human videos should:
- **Look natural**: Avoid uncanny valley effects
- **Sound professional**: Clear, natural voice
- **Match brand**: Align with brand personality and style
- **Be reusable**: Save configurations for consistency
- **Integrate smoothly**: Work well with other video elements

## Tips

- **Test short clip first**: Generate 10-15 seconds to verify quality
- **Natural language**: Write conversational scripts
- **Pronunciation guide**: Provide phonetics for difficult words
- **Consistent avatar**: Use same avatar for series consistency
- **Background simplicity**: Don't distract from message
- **Voice preview**: Test voice options before full generation
- **Save config**: Document settings for future videos

## Platform Comparison

| Feature | D-ID | Synthesia | HeyGen |
|---------|------|-----------|--------|
| Custom avatar | ✓ Easy | ✓ Premium | ✓ Easy |
| Voice cloning | ✓ | ✓ | ✓✓ Best |
| Gestures | Limited | ✓ Good | ✓✓ Best |
| API access | ✓✓ Best | ✓ | ✓ |
| Cost | $$ | $$$ | $$ |
| Quality | High | Highest | High |

## Related Skills

- Use `script-writer` to create optimized scripts first
- Reference `project-context` for avatar preferences
- Combine with `video-compositor` for final video
- Use `audio-sync-optimizer` if adjustments needed
