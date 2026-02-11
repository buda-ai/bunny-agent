---
name: video-analyzer
description: Analyzes existing videos to understand shot composition, pacing, editing style, visual language, and cinematic techniques for reference or replication.
---

# Video Analyzer

This skill provides deep analysis of video content, breaking down visual style, editing patterns, pacing, shot composition, and production techniques. Use it to understand what makes videos effective or to replicate a specific style.

## When to Use This Skill

- Understanding competitor video strategies
- Analyzing reference videos for style matching
- Learning from successful video examples
- Extracting style guidelines from existing content
- Preparing to replicate a video aesthetic
- Studying editing patterns and pacing
- Benchmarking video performance elements

## What This Skill Does

1. **Visual Analysis**: Breaks down shot types, composition, color grading
2. **Pacing Analysis**: Measures cut frequency, segment duration, rhythm
3. **Content Structure**: Identifies narrative structure and information flow
4. **Editing Style**: Documents transition types, effects, motion graphics
5. **Audio Analysis**: Notes music style, sound design, voiceover approach
6. **Engagement Elements**: Identifies hooks, pattern interrupts, retention tactics
7. **Technical Specs**: Extracts resolution, aspect ratio, frame rate

## How to Use

### Analyze Video URL

```
Analyze this video: [URL]
```

```
Study the style of this video and create a style guide: [URL]
```

### Specific Analysis

```
Analyze the pacing and editing style of: [URL]
```

```
What makes this video engaging? [URL]
```

### Comparative Analysis

```
Compare the style of these two videos: [URL1] [URL2]
```

## Instructions

When user requests video analysis:

1. **Get Video Access**

   ```markdown
   I'll analyze the video. Please provide:
   
   - **Video URL**: [YouTube, Vimeo, or accessible URL]
   - **Analysis Focus**: What aspects are you most interested in?
     [ ] Overall style for replication
     [ ] Pacing and editing patterns
     [ ] Visual composition and aesthetics
     [ ] Content structure and messaging
     [ ] Engagement techniques
     [ ] All of the above
   
   - **Purpose**: What will you use this analysis for?
     [ ] Creating similar style video
     [ ] Learning from successful example
     [ ] Competitive analysis
     [ ] Style guide creation
     [ ] Other: ___________
   ```

2. **Technical Specifications**

   Extract and document:

   ```markdown
   ## Technical Specifications
   
   **Video Details**:
   - Platform: [YouTube/Vimeo/etc.]
   - Duration: [X:XX]
   - Resolution: [1080p/4K/etc.]
   - Aspect Ratio: [16:9/9:16/1:1]
   - Frame Rate: [24/30/60 fps]
   - Upload Date: [Date]
   
   **Channel/Creator**:
   - Channel: [Name]
   - Subscribers/Followers: [Count]
   - Views: [Count]
   - Engagement Rate: [If available]
   ```

3. **Content Structure Analysis**

   ```markdown
   ## Content Structure
   
   **Overall Type**: [Explainer/Tutorial/Review/Vlog/Marketing/etc.]
   
   **Narrative Structure**:
   
   ### Opening (0:00-0:XX)
   - **Hook Type**: [Question/Stat/Story/Bold Statement/Visual]
   - **Hook Content**: "[Actual hook]"
   - **Effectiveness**: [What makes it work]
   
   ### Introduction (0:XX-0:XX)
   - What's covered
   - Value proposition stated
   - Presenter introduction style
   
   ### Main Content Breakdown
   
   **Section 1** (0:XX-X:XX): [Topic]
   - Duration: [XX seconds]
   - Key points covered: [List]
   - Transition method: [How it moves to next section]
   
   **Section 2** (X:XX-X:XX): [Topic]
   - Duration: [XX seconds]
   - Key points covered: [List]
   - Transition method: [Description]
   
   [Continue for all sections...]
   
   ### Conclusion (X:XX-X:XX)
   - Recap method: [How summary is presented]
   - Key takeaways emphasized: [List]
   
   ### Call-to-Action (X:XX-X:XX)
   - Primary CTA: [What action]
   - CTA style: [Soft/Hard/Urgent/Casual]
   - Visual CTA elements: [Graphics, overlays, end screen]
   ```

4. **Visual Style Analysis**

   ```markdown
   ## Visual Style & Composition
   
   **Overall Aesthetic**: [Modern/Corporate/Minimal/Bold/Vibrant/etc.]
   
   **Color Grading**:
   - Color temperature: [Warm/Cool/Neutral]
   - Saturation level: [Low/Medium/High]
   - Contrast: [Low/Medium/High]
   - Dominant colors: [List primary colors]
   - Color mood: [Description of emotional impact]
   
   **Shot Types & Frequency**:
   | Shot Type | Frequency | Purpose |
   |-----------|-----------|---------|
   | Close-up (CU) | [%] | [When used] |
   | Medium close-up (MCU) | [%] | [When used] |
   | Medium shot (MS) | [%] | [When used] |
   | Wide shot (WS) | [%] | [When used] |
   | B-roll inserts | [%] | [When used] |
   | Screen recordings | [%] | [When used] |
   | Graphics/animations | [%] | [When used] |
   
   **Camera Work**:
   - Movement: [Static/Slow pan/Dynamic/Handheld]
   - Angles: [Eye-level/High/Low/Dutch]
   - Depth of field: [Shallow/Deep]
   - Focus techniques: [Rack focus/Always sharp]
   
   **Composition Rules Used**:
   - [ ] Rule of thirds
   - [ ] Center framing
   - [ ] Leading lines
   - [ ] Symmetry
   - [ ] Negative space
   - [ ] Frame within frame
   
   **Lighting**:
   - Style: [Natural/Studio/Dramatic/Flat]
   - Key light position: [Description]
   - Overall mood: [Bright/Dark/Balanced]
   ```

5. **Editing & Pacing Analysis**

   ```markdown
   ## Editing Style & Pacing
   
   **Overall Pace**: [Slow/Medium/Fast/Varies]
   
   **Cut Frequency**:
   - Average shot duration: [X seconds]
   - Cuts per minute: [X]
   - Pacing pattern: [Consistent/Accelerates/Varies by section]
   
   **Editing Timeline**:
   
   | Time | Shot/Segment | Duration | Visual Elements |
   |------|-------------|----------|-----------------|
   | 0:00 | Opening hook | 5s | [Description] |
   | 0:05 | Intro card | 3s | [Animated logo] |
   | 0:08 | Presenter MCU | 12s | [Talking head] |
   | 0:20 | B-roll #1 | 4s | [Product shot] |
   | 0:24 | Presenter MS | 15s | [Continues talking] |
   | ... | ... | ... | ... |
   
   **Transition Types**:
   - Cut (hard cut): [%]
   - Cross dissolve: [%]
   - Wipe/Swipe: [%]
   - Zoom transition: [%]
   - Other effects: [List]
   
   **Pattern Interrupts**: [List moments that break pattern to maintain attention]
   - [Timestamp]: [What happens]
   - [Timestamp]: [What happens]
   
   **Visual Effects**:
   - Motion graphics: [Frequency and style]
   - Text animations: [Style description]
   - Color flashes: [Yes/No, when used]
   - Speed ramps: [When used]
   - Other effects: [List]
   ```

6. **Text & Graphics Analysis**

   ```markdown
   ## On-Screen Text & Graphics
   
   **Text Overlay Strategy**:
   - Frequency: [Constant/Frequent/Occasional/Rare]
   - Placement: [Lower third/Center/Varies]
   - Purpose: [Emphasize/Translate/Add info/Branding]
   
   **Typography**:
   - Primary font: [Font name or style description]
   - Font style: [Bold/Regular/Modern/Playful]
   - Text size: [Large/Medium/Small relative to frame]
   - Colors used: [Colors]
   - Animation style: [Pop in/Fade/Slide/Typewriter/etc.]
   
   **Graphic Elements**:
   - Lower thirds: [Yes/No, style description]
   - Animated icons: [Yes/No, frequency]
   - Data visualization: [Charts, graphs, infographics used]
   - Progress indicators: [Yes/No]
   - Callout boxes: [Yes/No, style]
   - Arrows/highlights: [Yes/No, when used]
   
   **Branding Elements**:
   - Logo placement: [Position, size, duration]
   - Brand colors: [Where used]
   - Watermarks: [Yes/No]
   - Consistent visual identity: [Description]
   ```

7. **Audio Analysis**

   ```markdown
   ## Audio Design
   
   **Voice/Narration**:
   - Type: [Presenter on camera/Voiceover/Both]
   - Voice style: [Professional/Casual/Energetic/Calm]
   - Speaking pace: [Slow/Medium/Fast] - [~XXX words/minute]
   - Tone: [Friendly/Authoritative/Educational/Entertaining]
   - Audio quality: [Studio/Clean/Natural/Echo-y]
   
   **Background Music**:
   - Present: [Yes/No]
   - Style: [Upbeat/Corporate/Emotional/Ambient/etc.]
   - Volume level: [Quiet/Balanced/Prominent]
   - Changes: [Does music change with sections?]
   - Mood contribution: [How music affects feeling]
   
   **Sound Effects**:
   - Frequency: [Never/Rare/Occasional/Frequent]
   - Types used: [Swoosh, pop, ding, etc.]
   - Purpose: [Emphasize, transition, engagement]
   
   **Audio Transitions**:
   - Music fades: [Yes/No, where]
   - Sound bridges: [Description]
   - Silence used strategically: [Yes/No, where]
   ```

8. **Engagement Techniques**

   ```markdown
   ## Engagement & Retention Tactics
   
   **Hook Effectiveness**:
   - First 3 seconds: [What happens]
   - Attention grab method: [Description]
   - Promise/value stated: [What viewer will get]
   
   **Retention Elements**:
   
   | Technique | Timestamp | Description |
   |-----------|-----------|-------------|
   | Pattern interrupt | 0:45 | [What changes] |
   | Curiosity gap | 1:20 | ["Coming up..." tease] |
   | Visual variety | Throughout | [B-roll every Xs] |
   | Energy shift | 2:10 | [Pace increases] |
   | Question to viewer | 1:05 | [Direct engagement] |
   
   **Psychological Triggers**:
   - [ ] Curiosity
   - [ ] FOMO (fear of missing out)
   - [ ] Social proof
   - [ ] Authority
   - [ ] Scarcity
   - [ ] Reciprocity
   - [ ] Story/narrative
   
   **Viewer Involvement**:
   - Direct address ("you"): [Frequency]
   - Questions posed: [Count and examples]
   - Interactive elements: [Polls, comments requested, etc.]
   - Call-backs to earlier points: [Yes/No]
   ```

9. **Strengths & Opportunities**

   ```markdown
   ## What Works Well
   
   **Strengths**:
   1. [Strength 1]: [Why it works]
   2. [Strength 2]: [Why it works]
   3. [Strength 3]: [Why it works]
   
   **Unique Elements**:
   - [What makes this video stand out]
   
   **Professional Quality Indicators**:
   - [List production quality markers]
   
   ## Areas for Improvement
   
   **Potential Enhancements**:
   1. [Opportunity 1]: [Suggestion]
   2. [Opportunity 2]: [Suggestion]
   
   **Industry Benchmarks**:
   - [How this compares to top performers]
   ```

10. **Replication Guide**

    If purpose is style replication:

    ```markdown
    ## Style Replication Guide
    
    To create a video in this style:
    
    **Pre-Production**:
    - [ ] Script pace: [XXX words for X:XX duration]
    - [ ] Plan [X] main sections
    - [ ] Prepare [list types] of B-roll
    
    **Shooting**:
    - [ ] Camera angles: [Specific shots needed]
    - [ ] Lighting setup: [Description]
    - [ ] Background: [Style description]
    - [ ] Shot list: [Itemized list]
    
    **Post-Production**:
    - [ ] Cut every [X] seconds average
    - [ ] Use [transition types] transitions
    - [ ] Add text overlays at: [when]
    - [ ] Color grade: [Settings/LUT suggestion]
    - [ ] Music: [Style description]
    - [ ] Sound effects: [When and type]
    
    **Key Style Elements to Match**:
    1. [Element 1]: [How to achieve]
    2. [Element 2]: [How to achieve]
    3. [Element 3]: [How to achieve]
    ```

11. **Save Analysis**

    Save to `./output/reports/video-analysis-[video-title-slug]-[date].md`

12. **Provide Summary**

    ```markdown
    ✅ Video analysis complete!
    
    **Saved to**: `./output/reports/video-analysis-[filename].md`
    
    **Key Findings**:
    - Style: [Style description]
    - Pace: [X cuts/min, X words/min]
    - Strengths: [Top 2-3]
    - Unique elements: [Notable features]
    
    **Recommended Actions**:
    1. [Action based on analysis purpose]
    2. [Action based on analysis purpose]
    
    **Next Steps**:
    - Extract keyframes: `Extract keyframes from this video`
    - Create style guide: `Create production guide from this analysis`
    - Replicate style: `Plan a video in this style for [topic]`
    
    What would you like to do with this analysis?
    ```

## Output Format

Analysis should be:
- **Comprehensive**: Cover all major aspects
- **Specific**: Include timestamps and concrete details
- **Actionable**: Provide insights that can be applied
- **Visual**: Include frame grabs or descriptions of key moments
- **Organized**: Easy to scan and reference

## Tips

- **Watch multiple times**: Once for content, once for technical, once for engagement
- **Take timestamps**: Note exact moments for key observations
- **Compare to benchmarks**: How does it stack against industry leaders?
- **Consider context**: Platform, audience, and goals affect style choices
- **Look for patterns**: What's consistent vs. what varies?

## Related Skills

- Use `keyframe-extractor` to get visual samples from analyzed video
- Use `script-planner` to plan a video in similar style
- Use `prompt-generator` to recreate visual aesthetic
- Save analysis for future reference when creating similar content
