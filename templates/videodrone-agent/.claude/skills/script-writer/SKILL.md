---
name: script-writer
description: Generates detailed, production-ready video scripts with precise timing, talking points, transitions, and presenter notes. Optimized for natural delivery and engagement.
---

# Script Writer

This skill creates full, word-for-word video scripts ready for recording or digital human generation. Scripts include timing markers, delivery notes, and production cues.

## When to Use This Skill

- Converting outlines into full scripts
- Writing talking-head presenter scripts
- Creating voiceover scripts
- Generating digital human dialogue
- Producing tutorial or explainer scripts
- Writing marketing video copy

## What This Skill Does

1. **Full Script Writing**: Converts outlines into complete, spoken dialogue
2. **Timing Precision**: Adds timing markers for pacing control
3. **Natural Language**: Writes conversational, engaging copy
4. **Delivery Cues**: Includes emphasis, pauses, and tone indicators
5. **Visual Cues**: Notes where visuals should appear
6. **Multiple Versions**: Can generate variations for A/B testing

## How to Use

### From Outline

```
Write full script from this outline: [paste outline or filename]
```

### From Topic

```
Write a video script about [topic] for [duration], targeting [audience]
```

### With Specifications

```
Create a script for:
- Topic: [topic]
- Style: [conversational/professional/energetic]
- Duration: [X:XX]
- Presenter: [human/digital avatar]
- Platform: [YouTube/TikTok/LinkedIn]
```

## Instructions

When user requests script writing:

1. **Gather Requirements**

   If not provided:
   
   ```markdown
   To write your script, I need:
   
   1. **Content Source**:
      - Existing outline (filename or paste)
      - Topic/subject description
      - Website or materials to reference
   
   2. **Video Details**:
      - Duration: [target length]
      - Type: [explainer/demo/tutorial/marketing]
      - Platform: [where it will be published]
   
   3. **Presenter**:
      - Human presenter
      - Digital human/avatar
      - Voiceover only
   
   4. **Style Preferences**:
      - Formality: [casual/professional/technical]
      - Energy level: [calm/moderate/high-energy]
      - Special requests: [any specific requirements]
   ```

2. **Review Project Context**

   Check `@./output/context/project-context.md` for:
   - Brand voice and tone
   - Target audience
   - Key messages
   - Communication style
   - Terminology preferences

3. **Script Structure Template**

   ```markdown
   # Video Script: [Title]
   
   **Video Type**: [Type]
   **Target Duration**: [X:XX]
   **Word Count**: ~[XXX words] (based on 150 words/minute)
   **Presenter**: [Human/Digital Human/VO]
   **Tone**: [Tone description]
   **Date**: [Date]
   
   ---
   
   ## Production Notes
   
   **Presenter Instructions**:
   - [Delivery style notes]
   - [Energy level]
   - [Special considerations]
   
   **Visual Style**:
   - [Brand colors: from context]
   - [Animation style]
   - [B-roll requirements]
   
   **Audio**:
   - Background music: [style]
   - Sound effects: [where needed]
   
   ---
   
   ## Script
   
   ### [00:00-00:05] OPENING HOOK
   
   **[VISUAL: Strong opening visual - eye-catching, relevant]**
   
   **PRESENTER**:
   [Opening hook - punchy, attention-grabbing]
   
   *[Delivery note: Energetic, confident]*
   
   ---
   
   ### [00:05-00:20] INTRODUCTION
   
   **[VISUAL: Presenter on screen or B-roll establishing context]**
   
   **PRESENTER**:
   [Introduction copy - who you are, what video is about, why they should watch]
   
   [Brief pause]
   
   [Continue with value proposition]
   
   *[Delivery note: Warm, welcoming, clear]*
   
   **[TEXT OVERLAY: Key phrase or video title]**
   
   ---
   
   ### [00:20-01:00] MAIN POINT 1: [Topic]
   
   **[VISUAL: Relevant graphics, screenshots, or B-roll]**
   
   **PRESENTER**:
   [Main talking point - start with topic sentence]
   
   [Supporting detail 1 - explain, give example]
   
   [Supporting detail 2 - elaborate, provide context]
   
   [Transition sentence to next point]
   
   *[Delivery note: Clear, explanatory, use hand gestures if presenter]*
   
   **[TEXT OVERLAY: "Key Point #1" + brief summary]**
   **[GRAPHIC: Illustration or diagram if applicable]**
   
   ---
   
   ### [01:00-01:40] MAIN POINT 2: [Topic]
   
   **[VISUAL: New visual to signal transition]**
   
   **PRESENTER**:
   [Transition from previous point]
   
   [Main point 2 introduction]
   
   [Supporting details and examples]
   
   [Make it relatable - use "you" language]
   
   *[Delivery note: Maintain energy, emphasize key phrases]*
   
   **[TEXT OVERLAY: Statistics or key data point]**
   **[B-ROLL: Example footage or product demo]**
   
   ---
   
   ### [01:40-02:20] MAIN POINT 3: [Topic]
   
   [Same structure as above sections]
   
   ---
   
   ### [02:20-02:40] RECAP/SUMMARY
   
   **[VISUAL: Clean background, focus on presenter]**
   
   **PRESENTER**:
   So, let's quickly recap what we've covered:
   
   [Brief pause]
   
   [Key takeaway 1 - one sentence]
   
   [Key takeaway 2 - one sentence]
   
   [Key takeaway 3 - one sentence]
   
   *[Delivery note: Clear, slightly slower pace for retention]*
   
   **[TEXT OVERLAY: Bullet points appear as each is mentioned]**
   
   ---
   
   ### [02:40-03:00] CALL-TO-ACTION
   
   **[VISUAL: CTA graphics, links, end screen elements]**
   
   **PRESENTER**:
   [Transition to CTA - "Now, here's what I want you to do..." or similar]
   
   [Clear, specific action step]
   
   [Reason why they should take action - benefit]
   
   [Secondary CTA if applicable - subscribe, follow, etc.]
   
   [Friendly sign-off]
   
   *[Delivery note: Confident, encouraging, friendly]*
   
   **[TEXT OVERLAY: Website URL, CTA button, social handles]**
   **[END SCREEN: Channel branding, suggested videos]**
   
   ---
   
   ## Script Statistics
   
   - **Total Word Count**: [XXX] words
   - **Estimated Duration**: [X:XX] (at 150 words/minute)
   - **Sections**: [#] main sections
   - **Visual Cues**: [#] visual notes
   - **Text Overlays**: [#] text elements
   
   ---
   
   ## Alternative Versions
   
   ### Shorter Version (XX seconds)
   
   [If requested, provide condensed version]
   
   ### Alternative Hook Options
   
   1. [Alternative opening 1]
   2. [Alternative opening 2]
   
   ### Alternative CTAs
   
   1. [Alternative CTA 1]
   2. [Alternative CTA 2]
   ```

4. **Writing Guidelines**

   Apply these principles:

   ```markdown
   ### Conversational Writing
   
   ✅ **Do**:
   - Write like you talk
   - Use contractions (you're, we're, it's)
   - Use "you" to address viewer directly
   - Keep sentences short and punchy
   - Use rhetorical questions
   - Include natural pauses [pause]
   
   ❌ **Don't**:
   - Use overly formal language
   - Write long, complex sentences
   - Use passive voice
   - Include jargon without explanation
   - Write text-speak or abbreviations for verbal delivery
   
   ### Engagement Techniques
   
   - **Pattern interrupts**: Change energy or topic to maintain attention
   - **Story elements**: Include brief examples or scenarios
   - **Emotional hooks**: Connect to feelings, not just facts
   - **Social proof**: "Thousands of users..." "Studies show..."
   - **Curiosity gaps**: Tease information before revealing
   - **Direct address**: "You might be thinking..." "Here's the thing..."
   
   ### Pacing Control
   
   - **Vary sentence length**: Mix short punchy sentences with longer explanatory ones
   - **Mark pauses**: Use [pause] or [brief pause] where needed
   - **Emphasis cues**: Use *italics* for words to emphasize
   - **Breathing room**: Don't pack too much into short time
   - **Rule of thumb**: 150 words per minute for natural delivery
   
   ### Digital Human Optimization
   
   If script is for digital human:
   - Avoid tongue twisters or difficult pronunciation
   - Use clear punctuation for natural pauses
   - Write slightly slower pace (140 words/minute)
   - Avoid complex emotions that are hard to animate
   - Keep gestures simple and natural
   - Test pronunciation of brand names or technical terms
   ```

5. **Timing Calculation**

   ```markdown
   ## Duration Formula
   
   **Standard Speaking Rate**: 150 words per minute
   **Slower/Educational**: 130-140 words per minute
   **Fast/Energetic**: 160-180 words per minute
   **Digital Human**: 140-150 words per minute
   
   **Example**:
   - 30-second video: ~75 words
   - 1-minute video: ~150 words
   - 2-minute video: ~300 words
   - 5-minute video: ~750 words
   
   **Buffer**: Include 10% buffer for pauses and visual moments
   ```

6. **Add Delivery Notes**

   Throughout script, include:
   
   - *[Tone: confident, friendly, serious, playful]*
   - *[Emphasis: stress this word]*
   - *[Pause: 2 seconds for visual]*
   - *[Energy: increase pace and enthusiasm]*
   - *[Gesture: point, open hands, count on fingers]*
   - *[Expression: smile, serious look, surprise]*

7. **Visual Cues**

   Mark where visuals should appear:
   
   - **[VISUAL: description of what should be on screen]**
   - **[TEXT OVERLAY: exact text to display]**
   - **[GRAPHIC: type of graphic or animation]**
   - **[B-ROLL: type of footage needed]**
   - **[TRANSITION: wipe, fade, cut, etc.]**

8. **Quality Check**

   Before finalizing:
   
   ```markdown
   ## Script Checklist
   
   - [ ] Matches target duration (±10 seconds)
   - [ ] Strong hook in first 5 seconds
   - [ ] Clear value proposition early
   - [ ] Conversational, natural language
   - [ ] Logical flow between sections
   - [ ] Key points highlighted with text overlays
   - [ ] Visual cues for all main points
   - [ ] Delivery notes for emphasis/tone
   - [ ] Clear, actionable CTA
   - [ ] Matches brand voice from context
   - [ ] No jargon without explanation
   - [ ] Timing markers every 20-30 seconds
   - [ ] Pronounceable for digital human (if applicable)
   ```

9. **Save Script**

   Save to `./output/scripts/script-[topic-slug]-[date].md`

10. **Provide Summary**

    ```markdown
    ✅ Video script completed!
    
    **Saved to**: `./output/scripts/script-[filename].md`
    
    **Script Details**:
    - Word count: [XXX] words
    - Estimated duration: [X:XX]
    - Sections: [#]
    - Tone: [Tone]
    - Ready for: [Presenter type]
    
    **Next Steps**:
    1. Review script and request any revisions
    2. Create storyboard: `Create storyboard for this script`
    3. Start production: `Generate video from this script`
    4. Alternative versions: `Create a shorter/longer version`
    
    What would you like to do next?
    ```

## Output Format

Scripts should be:
- **Production-ready**: Can be used as-is for recording
- **Well-timed**: Accurate duration estimates
- **Clearly marked**: Visual and delivery cues throughout
- **Conversational**: Natural, engaging language
- **Brand-aligned**: Matches project context

## Tips for Great Scripts

- **Read aloud**: Test how it sounds when spoken
- **Time it**: Actually time yourself reading it
- **Cut ruthlessly**: Every word should earn its place
- **Front-load value**: Best content in first third
- **End strong**: CTA should be compelling and clear
- **Visual thinking**: Script should work with visuals, not against them

## Related Skills

- Use `script-planner` to create outline first
- Use `storyboard-generator` to visualize script
- Use `digital-human-integrator` if using avatar presenter
- Reference `project-context.md` for brand voice

## Script Variations

Can generate:
- **Short version**: Condensed for social media
- **Long version**: Extended for comprehensive content
- **A/B test versions**: Different hooks or CTAs
- **Platform-specific**: Optimized for TikTok vs YouTube
- **Language variations**: Different tones or formality levels
