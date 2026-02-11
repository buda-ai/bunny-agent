---
name: analyze-website-content
description: Extracts and analyzes website content to understand brand messaging, visual style, value propositions, and content themes for video script planning.
---

# Analyze Website Content

This skill crawls and analyzes website content to extract key information for video production. It identifies brand messaging, visual identity, core features, and content themes that can be transformed into video scripts.

## When to Use This Skill

- Starting a video project for a website or product
- Understanding a brand before creating marketing videos
- Extracting key messages for explainer videos
- Identifying content themes for video series
- Researching competitor websites for video ideas
- Building comprehensive brand context from online presence

## What This Skill Does

1. **Content Extraction**: Pulls headlines, copy, and key messages from website
2. **Value Proposition Analysis**: Identifies main benefits and unique selling points
3. **Visual Identity**: Documents colors, imagery style, design patterns
4. **Feature Analysis**: Catalogs product/service features and benefits
5. **Tone Detection**: Analyzes brand voice and communication style
6. **Content Themes**: Identifies recurring topics and messaging patterns
7. **CTA Analysis**: Notes calls-to-action and conversion strategies

## How to Use

### Basic Analysis

```
Analyze this website for video content: [URL]
```

```
Extract brand information from: [URL]
```

### Specific Focus

```
Analyze [URL] and identify the top 3 features to highlight in a video
```

```
What's the value proposition on [URL]? I need it for a script.
```

### For Script Planning

```
Analyze [URL] and create a video script outline for an explainer video
```

## Instructions

When user requests website analysis:

1. **Fetch Website Content**

   ```markdown
   I'll analyze: [URL]
   
   **Analysis Goals**:
   - [ ] Brand messaging and positioning
   - [ ] Visual identity and style
   - [ ] Key features and benefits
   - [ ] Target audience indicators
   - [ ] Content themes for video ideas
   - [ ] Tone and voice
   
   Let me fetch and analyze the content...
   ```

2. **Extract Core Information**

   ```markdown
   ## Website Analysis: [Website Name]
   
   **URL**: [URL]
   **Analyzed**: [Date]
   **Purpose**: Video content planning
   
   ---
   
   ### Brand Basics
   
   **Company/Product Name**: [Name]
   **Industry**: [Industry]
   **Tagline/Headline**: "[Main headline from homepage]"
   
   **Elevator Pitch** (from homepage):
   [One-sentence description of what they do]
   
   **About Section Summary**:
   [2-3 sentences from about page or company description]
   ```

3. **Value Proposition Analysis**

   ```markdown
   ### Value Proposition
   
   **Primary Value Proposition**:
   "[Main benefit or problem solved - from hero section]"
   
   **Key Benefits** (in order of prominence):
   
   1. **[Benefit 1]**
      - Supporting point: [Detail]
      - Evidence: [Stat, example, or proof point]
      - Video angle: [How to present this visually]
   
   2. **[Benefit 2]**
      - Supporting point: [Detail]
      - Evidence: [Stat, example, or proof point]
      - Video angle: [How to present this visually]
   
   3. **[Benefit 3]**
      - Supporting point: [Detail]
      - Evidence: [Stat, example, or proof point]
      - Video angle: [How to present this visually]
   
   **Differentiation** (What makes them unique):
   - [Unique aspect 1]
   - [Unique aspect 2]
   - [Unique aspect 3]
   ```

4. **Feature Analysis**

   ```markdown
   ### Features & Capabilities
   
   | Feature | Description | Benefit | Video Potential |
   |---------|-------------|---------|-----------------|
   | [Feature 1] | [What it does] | [Why it matters] | [Demo idea] |
   | [Feature 2] | [What it does] | [Why it matters] | [Demo idea] |
   | [Feature 3] | [What it does] | [Why it matters] | [Demo idea] |
   
   **Feature Priority for Video**:
   1. [Feature] - [Why lead with this]
   2. [Feature] - [Why second]
   3. [Feature] - [Why third]
   ```

5. **Target Audience Analysis**

   ```markdown
   ### Target Audience Indicators
   
   **Primary Audience** (based on language and messaging):
   - [Audience segment] - evidence: "[Quote or indicator]"
   
   **Pain Points Addressed**:
   - "[Pain point 1]" - from: [page section]
   - "[Pain point 2]" - from: [page section]
   - "[Pain point 3]" - from: [page section]
   
   **Jobs to Be Done**:
   - Users want to: [Goal 1]
   - Users want to: [Goal 2]
   - Users want to: [Goal 3]
   
   **Language & Terminology Used**:
   - Technical level: [Beginner/Intermediate/Expert]
   - Industry jargon: [List key terms]
   - Tone indicators: [Professional/Casual/etc.]
   ```

6. **Brand Voice & Tone**

   ```markdown
   ### Brand Voice Analysis
   
   **Overall Tone**: [Professional/Friendly/Bold/Calm/etc.]
   
   **Voice Characteristics**:
   - Formality: [Casual ← → Formal] (rating 1-5: X/5)
   - Enthusiasm: [Reserved ← → Energetic] (rating 1-5: X/5)
   - Technical: [Simple ← → Complex] (rating 1-5: X/5)
   - Humor: [Serious ← → Playful] (rating 1-5: X/5)
   
   **Sample Copy** (representative of tone):
   > "[Quote 1]"
   > "[Quote 2]"
   > "[Quote 3]"
   
   **Key Messaging Patterns**:
   - Uses "[pattern]" structure (e.g., "We help X do Y")
   - Emphasizes: [What's emphasized]
   - Avoids: [What's not mentioned]
   
   **Vocabulary Style**:
   - Common words: [List frequently used words]
   - Power words: [Impactful words used]
   - Avoided words: [Technical terms they simplify]
   ```

7. **Visual Identity**

   ```markdown
   ### Visual Style Guide
   
   **Color Palette**:
   - Primary brand color: [Color] (hex: [#code])
   - Secondary colors: [Colors]
   - Accent colors: [Colors]
   - Background: [Light/Dark/Gradient]
   
   **Typography**:
   - Headings: [Font style - Modern/Classic/Bold/etc.]
   - Body text: [Font style and readability]
   - Overall feel: [Minimal/Decorative/Professional/etc.]
   
   **Imagery Style**:
   - Photo style: [Lifestyle/Product shots/Illustrations/Abstract]
   - Image treatment: [Bright/Muted/High contrast/etc.]
   - Common subjects: [What's shown in images]
   - Illustration style: [If applicable]
   
   **Design Patterns**:
   - Layout: [Spacious/Dense/Structured/etc.]
   - Use of whitespace: [Generous/Minimal]
   - Animation: [Subtle/Dynamic/None]
   - Overall aesthetic: [Modern/Classic/Bold/Minimal/etc.]
   
   **Video Style Implications**:
   - Color grade: [Match color palette]
   - Graphics style: [Match design patterns]
   - Animation pace: [Match website interactions]
   - Visual density: [Match layout style]
   ```

8. **Call-to-Action Analysis**

   ```markdown
   ### CTAs & Conversion Strategy
   
   **Primary CTA**: "[Main CTA text]"
   - Action: [What it leads to]
   - Placement: [Where on page]
   - Visual treatment: [Button style, color, size]
   
   **Secondary CTAs**:
   - "[CTA 2]" → [Action]
   - "[CTA 3]" → [Action]
   
   **CTA Language Patterns**:
   - [Pattern observed - e.g., "Get started", "Try free", etc.]
   
   **For Video CTAs**:
   - Primary CTA for video: [Recommendation]
   - CTA positioning: [When in video]
   - CTA style: [Soft/Hard/Urgent]
   ```

9. **Content Themes**

   ```markdown
   ### Content Themes & Topics
   
   **Main Content Categories** (from navigation/blog):
   1. [Category 1]
      - Subtopics: [List]
      - Video series potential: [Ideas]
   
   2. [Category 2]
      - Subtopics: [List]
      - Video series potential: [Ideas]
   
   **Frequently Asked Questions**:
   - "[Question 1]" - Video idea: [Short answer format]
   - "[Question 2]" - Video idea: [Tutorial]
   - "[Question 3]" - Video idea: [Comparison]
   
   **Customer Quotes/Testimonials**:
   - "[Quote 1]" - Use case: [Application]
   - "[Quote 2]" - Benefit highlighted: [Benefit]
   
   **Social Proof Elements**:
   - Customer count: [Number]
   - Stats: [Impressive numbers]
   - Awards/recognition: [Any badges or mentions]
   - Case studies: [Available or not]
   ```

10. **Video Content Recommendations**

    ```markdown
    ## Video Content Recommendations
    
    Based on website analysis, here are recommended video ideas:
    
    ### Priority 1: Explainer Video
    **Title**: "[Suggested title]"
    **Duration**: 60-90 seconds
    **Key Messages**:
    - [Message from value prop]
    - [Message from features]
    - [Message from benefits]
    **Hook**: [Suggested hook based on pain points]
    **CTA**: [Recommended CTA]
    
    ### Priority 2: Feature Demo
    **Focus**: [Top feature identified]
    **Format**: Screen recording + voiceover
    **Duration**: 2-3 minutes
    **Highlight**: [Specific capability]
    
    ### Priority 3: Customer Story
    **Angle**: [Based on testimonials/case studies]
    **Format**: Testimonial or case study format
    **Duration**: 1-2 minutes
    
    ### Video Series Idea
    **Theme**: [Content theme identified]
    **Episodes**: [Suggested topics based on FAQs or categories]
    - Episode 1: [Topic]
    - Episode 2: [Topic]
    - Episode 3: [Topic]
    
    ### Social Media Shorts
    **Quick wins** (15-30 second videos):
    - Stat highlight: "[Impressive number]"
    - Quick tip: [From content]
    - Feature tease: [Top feature]
    ```

11. **Competitor Intelligence** (if applicable)

    ```markdown
    ### Competitive Positioning (from website messaging)
    
    **Competitors Mentioned**: [If any]
    
    **Comparison Points**:
    - [How they position vs. competitors]
    
    **Advantages Claimed**:
    - [Claimed benefit 1]
    - [Claimed benefit 2]
    
    **Video Opportunity**: Create comparison video showing [specific advantages]
    ```

12. **Extraction Summary**

    ```markdown
    ## Quick Reference for Script Writing
    
    **One-Liner**: [Single sentence describing offering]
    
    **3 Key Benefits** (for script):
    1. [Benefit 1] - "[How to say it]"
    2. [Benefit 2] - "[How to say it]"
    3. [Benefit 3] - "[How to say it]"
    
    **Target Viewer**: [Who this video is for]
    
    **Pain Point to Address**: "[Problem that resonates]"
    
    **Unique Angle**: [What makes this different]
    
    **Tone for Video**: [Match website tone]
    
    **Visual Style**: [Match website aesthetics]
    
    **CTA**: [Primary action]
    ```

13. **Save Analysis**

    Save to `./output/context/website-analysis-[domain]-[date].md`
    
    If project context doesn't exist, also update or create:
    `./output/context/project-context.md` with key findings

14. **Provide Summary**

    ```markdown
    ✅ Website analysis complete!
    
    **Saved to**: `./output/context/website-analysis-[filename].md`
    
    **Key Findings**:
    - Primary value: [Top benefit]
    - Target audience: [Audience]
    - Tone: [Voice characteristics]
    - Top features to highlight: [Top 3]
    
    **Video Recommendations**:
    1. [Video type 1] - [Duration]
    2. [Video type 2] - [Duration]
    3. [Video type 3] - [Duration]
    
    **Next Steps**:
    1. Review analysis and approve direction
    2. Create video outline: `Plan a video script based on this analysis`
    3. Generate project context: `Generate project context` (if not exists)
    4. Start script: `Write script for [recommended video type]`
    
    Which video should we tackle first?
    ```

## Output Format

Analysis should be:
- **Comprehensive**: Cover all key brand and content elements
- **Actionable**: Lead directly to video content decisions
- **Organized**: Easy to reference during script writing
- **Visual**: Note visual styles for video production
- **Prioritized**: Clear recommendations on what to focus on

## Tips

- **Go deep on homepage**: Most key messaging is there
- **Check multiple pages**: About, Features, Pricing for full picture
- **Note exact quotes**: Use actual website language when possible
- **Identify gaps**: What's missing that video could address
- **Think visually**: How can text become video moments
- **Consider platform**: Website content may need adaptation for video

## Related Skills

- Use `generate-project-context` to formalize brand guidelines
- Use `script-planner` to turn analysis into video outline
- Reference analysis when using `script-writer`
- Save as reference for consistent video series

## Multi-Page Analysis

For comprehensive sites, analyze:
- Homepage (hero, value prop)
- About page (story, team, mission)
- Features/Product page (capabilities)
- Pricing page (packaging, CTAs)
- Resources/Blog (content themes)
- FAQ page (common questions)
