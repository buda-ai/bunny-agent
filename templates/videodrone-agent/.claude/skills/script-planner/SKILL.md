---
name: script-planner
description: Analyzes input materials and creates comprehensive video script outlines with structure, key messages, talking points, and production notes.
---

# Script Planner

This skill transforms input materials (website content, documents, notes) into structured video script outlines ready for full script development.

## When to Use This Skill

- Starting a new video project with source materials
- Converting written content into video format
- Planning video structure before writing full script
- Creating multiple video outlines from comprehensive materials
- Organizing talking points into logical video flow

## What This Skill Does

1. **Content Analysis**: Extracts key messages and themes from input materials
2. **Structure Planning**: Organizes content into logical video segments
3. **Message Hierarchy**: Prioritizes information based on importance and engagement
4. **Timing Estimation**: Suggests segment durations for target video length
5. **Visual Planning**: Notes where visuals, graphics, or B-roll are needed
6. **Hook & CTA**: Plans compelling opening hook and strong call-to-action

## How to Use

### With Website URL

```
Create a video script outline from this website: [URL]
```

```
Plan a 2-minute explainer video based on: [URL]
```

### With Materials

```
Here's my product documentation: [paste or attach]
Create a video outline for a demo video
```

### With Topic Description

```
Plan a video outline for: [topic description]
Target length: [duration]
Purpose: [marketing/tutorial/explainer/etc.]
```

## Instructions

When user requests script planning:

1. **Gather Requirements**

   ```markdown
   To create the best video outline, I need:
   
   1. **Source Material**: What should the video be about?
      - Website URL
      - Document/text content
      - Topic description
   
   2. **Video Type**: What kind of video?
      [ ] Explainer
      [ ] Product demo
      [ ] Tutorial/How-to
      [ ] Marketing/promotional
      [ ] Educational
      [ ] Testimonial
      [ ] Other: ___
   
   3. **Target Duration**: How long should the video be?
      [ ] 15-30 seconds (social teaser)
      [ ] 30-60 seconds (short-form)
      [ ] 1-2 minutes (standard explainer)
      [ ] 2-5 minutes (detailed guide)
      [ ] 5+ minutes (comprehensive tutorial)
   
   4. **Platform**: Where will this be published?
   
   5. **Key Message**: If you had to summarize in one sentence, what should viewers remember?
   ```

2. **Analyze Source Material**

   If website provided:
   - Use web fetch to get content
   - Extract: value proposition, key features, benefits, use cases
   - Identify: brand tone, visual style, target audience
   
   If text provided:
   - Extract main topics and subtopics
   - Identify key information hierarchy
   - Note important data points, quotes, examples
   
   Document analysis:
   
   ```markdown
   ## Material Analysis
   
   **Main Topic**: [Topic]
   **Key Themes**: [Theme 1, Theme 2, Theme 3]
   **Target Audience**: [Audience]
   **Tone**: [Professional/Casual/Technical/etc.]
   
   **Key Points Extracted**:
   1. [Point 1]
   2. [Point 2]
   3. [Point 3]
   ...
   
   **Compelling Elements**:
   - [Stat, quote, or fact that stands out]
   - [Emotional hook or pain point]
   - [Unique angle or differentiation]
   ```

3. **Define Video Structure**

   Based on video type and duration, create structure:

   ```markdown
   ## Video Structure Template
   
   ### For 30-60s Videos:
   - Hook (3-5s)
   - Problem/Context (8-10s)
   - Solution/Value (15-20s)
   - Proof/Example (10-15s)
   - Call-to-Action (5-8s)
   
   ### For 1-2min Videos:
   - Hook (5-10s)
   - Introduction (10-15s)
   - Main Content (60-80s)
     - Point 1 (20-25s)
     - Point 2 (20-25s)
     - Point 3 (20-25s)
   - Recap (10-15s)
   - Call-to-Action (10s)
   
   ### For 2-5min Videos:
   - Hook (10-15s)
   - Introduction (15-20s)
   - Main Content (120-180s)
     - Section 1 (40-60s)
     - Section 2 (40-60s)
     - Section 3 (40-60s)
   - Case Study/Example (30-45s)
   - Recap (15-20s)
   - Call-to-Action (10-15s)
   ```

4. **Create Hook Options**

   Generate 3-5 compelling opening hooks:

   ```markdown
   ## Opening Hook Options
   
   1. **Question Hook**: "[Thought-provoking question]"
      - Targets: [Pain point/curiosity]
      - Emotion: [Curiosity/concern/interest]
   
   2. **Stat Hook**: "[Surprising statistic or fact]"
      - Impact: [Why this matters]
      - Credibility: [Source if applicable]
   
   3. **Story Hook**: "[Brief relatable scenario]"
      - Relatability: [Target audience connection]
      - Problem: [Sets up solution]
   
   4. **Bold Statement**: "[Controversial or bold claim]"
      - Attention: [Why this stands out]
      - Proof: [Will be backed up in video]
   
   5. **Direct Value**: "In the next [X] minutes, you'll learn [specific value]"
      - Clarity: [Exactly what they get]
      - Time commitment: [Respects viewer's time]
   
   **Recommended**: [Hook #] - [Reasoning]
   ```

5. **Build Detailed Outline**

   Create comprehensive outline with all elements:

   ```markdown
   # Video Script Outline: [Title]
   
   **Video Type**: [Type]
   **Target Duration**: [X:XX]
   **Platform**: [Platform(s)]
   **Tone**: [Tone description]
   
   ---
   
   ## Opening Hook (0:00-0:0X)
   
   **Hook**: [Selected hook]
   
   **Visual**: [Suggested visual - eye-catching opener]
   
   **Goal**: Grab attention and make viewer want to keep watching
   
   ---
   
   ## Introduction (0:0X-0:XX)
   
   **Talking Points**:
   - Brief self/brand introduction
   - What this video is about
   - Why viewer should care (WIIFM - What's In It For Me)
   
   **Key Message**: [Main message]
   
   **Visual**: [Suggested visual - presenter introduction or text overlay]
   
   ---
   
   ## Main Content
   
   ### Section 1: [Topic/Point 1] (0:XX-1:XX)
   
   **Key Points**:
   - [Main point]
   - [Supporting detail 1]
   - [Supporting detail 2]
   - [Example or data point]
   
   **Visual Needs**:
   - [Graphic/animation needed]
   - [B-roll suggestion]
   - [Text overlay points]
   
   **Transition to Next**: [How to bridge to section 2]
   
   ---
   
   ### Section 2: [Topic/Point 2] (1:XX-2:XX)
   
   **Key Points**:
   - [Main point]
   - [Supporting detail 1]
   - [Supporting detail 2]
   - [Example or data point]
   
   **Visual Needs**:
   - [Graphic/animation needed]
   - [B-roll suggestion]
   - [Text overlay points]
   
   **Transition to Next**: [How to bridge to section 3]
   
   ---
   
   ### Section 3: [Topic/Point 3] (2:XX-3:XX)
   
   [Same structure as above]
   
   ---
   
   ## Recap/Summary (X:XX-X:XX)
   
   **Summary Points**:
   - [Key takeaway 1]
   - [Key takeaway 2]
   - [Key takeaway 3]
   
   **Visual**: [Quick recap graphics or text overlays]
   
   ---
   
   ## Call-to-Action (X:XX-X:XX)
   
   **Primary CTA**: [Main action you want viewer to take]
   - [Specific instruction]
   - [Where to go / what to do]
   
   **Secondary CTA** (optional): [Like, subscribe, follow, etc.]
   
   **Visual**: 
   - [CTA text overlay]
   - [Link/button display]
   - [End screen elements]
   
   ---
   
   ## Production Notes
   
   **Presenter Style**: 
   - [Talking head / voiceover / digital human]
   - [Camera angle suggestions]
   - [Background setting]
   
   **Visual Style**:
   - [Animation style needed]
   - [Color scheme from brand]
   - [Graphics/motion graphics needs]
   
   **B-Roll Requirements**:
   - [List specific B-roll shots needed]
   
   **Audio Considerations**:
   - [Background music style]
   - [Sound effects needed]
   - [Voice style - energetic, calm, professional, etc.]
   
   **Text Overlays**:
   - [Key points that should be text on screen]
   - [Statistics or quotes to display]
   
   ---
   
   ## Next Steps
   
   1. Review outline and approve structure
   2. Use `script-writer` skill to generate full script
   3. Use `storyboard-generator` for visual planning
   4. Gather or generate visual assets
   ```

6. **Save Outline**

   Save to `./output/scripts/outline-[topic-slug]-[date].md`

7. **Provide Summary**

   ```markdown
   ✅ Video script outline created!
   
   **Saved to**: `./output/scripts/outline-[filename].md`
   
   **Video Details**:
   - Type: [Type]
   - Duration: [Duration]
   - Structure: [# sections]
   - Hook: [Hook type]
   - CTA: [Primary CTA]
   
   **Next Steps**:
   1. Review the outline and suggest any changes
   2. Ready to write full script? Use: `Write full script from this outline`
   3. Want visual planning? Use: `Create storyboard from this outline`
   
   What would you like to do next?
   ```

## Output Format

Outlines should be:
- **Structured**: Clear sections with timing
- **Detailed**: Enough detail to write script from
- **Visual**: Include visual and production notes
- **Actionable**: Ready for next step in production

## Tips for Good Outlines

- **Start with strong hook**: First 3-5 seconds are critical
- **Logical flow**: Each section leads naturally to next
- **Visual thinking**: Note where visuals enhance message
- **Timing awareness**: Be realistic about content per time
- **Clear CTA**: Know exactly what viewer should do next
- **Brand alignment**: Check against project context for consistency

## Related Skills

- Use `script-writer` to turn outline into full script
- Use `storyboard-generator` for visual planning
- Reference `project-context.md` for brand consistency
