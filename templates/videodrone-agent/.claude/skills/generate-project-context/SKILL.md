---
name: generate-project-context
description: Interactive wizard that creates comprehensive project context through guided Q&A session. Captures brand identity, target audience, visual style, and video production preferences.
---

# Generate Project Context

This skill creates a foundational project context file that guides all video production work. It ensures consistency across scripts, visuals, and production decisions.

## When to Use This Skill

- **First time using VideoDrone Agent** - establish project foundation
- Starting a new video series or campaign
- Working with a new client or brand
- Need to document video style guidelines
- Want to ensure consistent brand voice across videos

## What This Skill Does

1. **Brand Discovery**: Captures brand name, industry, values, and positioning
2. **Audience Definition**: Identifies target demographics and preferences
3. **Visual Style**: Documents color palette, visual references, and aesthetic preferences
4. **Voice & Tone**: Establishes communication style and brand personality
5. **Video Preferences**: Captures format preferences, platform targets, and production constraints
6. **Digital Human Settings**: Defines avatar preferences if applicable

## How to Use

```
Generate project context
```

```
Create brand context for video production
```

```
I need to set up my project context for a new video series
```

## Instructions

When user requests project context generation:

1. **Welcome and Explain**

   ```markdown
   I'll help you create a comprehensive project context that will guide all video production.
   This ensures consistency in scripts, visuals, and brand voice across all videos.
   
   This will take about 5-10 minutes. Let's get started!
   ```

2. **Brand Basics**

   Ask these questions:
   
   ```markdown
   ### Brand Identity
   
   1. **Brand/Company Name**: What's your brand or company name?
   
   2. **Industry**: What industry are you in?
   
   3. **What You Do**: In one sentence, what does your brand do?
   
   4. **Unique Value**: What makes you different from competitors?
   
   5. **Brand Values**: What are your top 3 brand values? (e.g., innovation, trust, sustainability)
   ```

3. **Target Audience**

   ```markdown
   ### Target Audience
   
   1. **Primary Audience**: Who is your main target audience?
      - Age range:
      - Demographics:
      - Job roles/interests:
   
   2. **Audience Pain Points**: What problems do they face that you solve?
   
   3. **Audience Goals**: What do they want to achieve?
   
   4. **Platform Preferences**: Where does your audience consume video content?
      [ ] YouTube
      [ ] LinkedIn
      [ ] Instagram
      [ ] TikTok
      [ ] Facebook
      [ ] Twitter/X
      [ ] Website/Landing pages
      [ ] Other: ___________
   ```

4. **Brand Voice & Tone**

   ```markdown
   ### Communication Style
   
   1. **Brand Voice**: How would you describe your brand's personality?
      [ ] Professional & Authoritative
      [ ] Friendly & Conversational
      [ ] Energetic & Enthusiastic
      [ ] Calm & Reassuring
      [ ] Witty & Humorous
      [ ] Educational & Informative
      [ ] Inspirational & Motivational
      [ ] Other: ___________
   
   2. **Tone Examples**: Which brands' communication style do you admire?
   
   3. **Language Preferences**:
      - Formality level: [Casual / Professional / Technical]
      - Use of jargon: [Minimal / Industry-standard / Technical]
      - Humor: [Yes / Subtle / No]
   ```

5. **Visual Style**

   ```markdown
   ### Visual Preferences
   
   1. **Brand Colors**: What are your primary brand colors?
      - Primary:
      - Secondary:
      - Accent:
   
   2. **Visual Style**: What visual aesthetic matches your brand?
      [ ] Modern & Minimal
      [ ] Bold & Vibrant
      [ ] Corporate & Clean
      [ ] Creative & Artistic
      [ ] Tech & Futuristic
      [ ] Warm & Human
      [ ] Other: ___________
   
   3. **Reference Videos**: Share URLs of videos whose style you like (optional)
   
   4. **Visual Elements**:
      - Logo usage: [Yes / Watermark / End card / No]
      - Typography preference: [Modern / Classic / Bold / Minimal]
      - Animation style: [Smooth / Dynamic / Subtle / None]
   ```

6. **Video Production Preferences**

   ```markdown
   ### Video Specifications
   
   1. **Typical Video Length**: What's your preferred video duration?
      [ ] Short (15-30s)
      [ ] Standard (1-2min)
      [ ] Medium (2-5min)
      [ ] Long (5-10min)
      [ ] Varies by content
   
   2. **Video Format**: Primary aspect ratio?
      [ ] Horizontal (16:9) - YouTube, website
      [ ] Vertical (9:16) - TikTok, Instagram Stories
      [ ] Square (1:1) - Instagram feed, Facebook
      [ ] Multiple formats needed
   
   3. **Content Types**: What types of videos will you create?
      [ ] Explainer videos
      [ ] Product demos
      [ ] Talking head / Presenter
      [ ] Tutorials / How-tos
      [ ] Marketing / Promotional
      [ ] Testimonials
      [ ] Behind-the-scenes
      [ ] Other: ___________
   
   4. **Production Frequency**: How often will you produce videos?
   ```

7. **Digital Human Preferences** (if applicable)

   ```markdown
   ### Digital Human / Avatar Settings
   
   1. **Use Digital Human**: Do you want to use AI-generated presenters?
      [ ] Yes, always
      [ ] Sometimes
      [ ] No
   
   If yes:
   
   2. **Avatar Type**:
      [ ] Professional business person
      [ ] Friendly expert
      [ ] Young and energetic
      [ ] Mature and authoritative
      [ ] Custom specification: ___________
   
   3. **Avatar Characteristics**:
      - Gender preference:
      - Age range:
      - Ethnicity:
      - Attire style:
   
   4. **Background Setting**:
      [ ] Office/Professional
      [ ] Minimal/Studio
      [ ] Home/Casual
      [ ] Custom: ___________
   ```

8. **Content Sources**

   ```markdown
   ### Input Materials
   
   1. **Website**: Do you have a website we can reference?
      URL: ___________
   
   2. **Existing Content**: Do you have existing materials to reference?
      [ ] Brand guidelines
      [ ] Existing videos
      [ ] Marketing materials
      [ ] Product documentation
      [ ] Blog posts
   
   3. **Content Topics**: What topics will your videos typically cover?
   ```

9. **Create Context File**

   Save all gathered information to `./output/context/project-context.md`:

   ```markdown
   # Project Context - [Brand Name]
   
   Generated: [Date]
   
   ## Brand Overview
   
   **Brand Name**: [Name]
   **Industry**: [Industry]
   **What We Do**: [Description]
   **Unique Value**: [Value proposition]
   **Website**: [URL]
   
   **Brand Values**:
   - [Value 1]
   - [Value 2]
   - [Value 3]
   
   ---
   
   ## Target Audience
   
   **Primary Audience**: [Description]
   - Age: [Range]
   - Demographics: [Details]
   - Roles/Interests: [Details]
   
   **Pain Points**:
   - [Pain point 1]
   - [Pain point 2]
   
   **Goals**:
   - [Goal 1]
   - [Goal 2]
   
   **Platform Preferences**: [Platforms]
   
   ---
   
   ## Brand Voice & Communication
   
   **Personality**: [Voice description]
   **Tone**: [Tone details]
   **Formality**: [Level]
   **Technical Language**: [Usage]
   **Humor**: [Yes/No/Subtle]
   
   **Reference Brands**: [Examples]
   
   ---
   
   ## Visual Style Guide
   
   **Color Palette**:
   - Primary: [Color]
   - Secondary: [Color]
   - Accent: [Color]
   
   **Visual Aesthetic**: [Style description]
   
   **Typography**: [Preference]
   **Animation Style**: [Style]
   **Logo Usage**: [Guidelines]
   
   **Reference Videos**:
   - [URL 1]
   - [URL 2]
   
   ---
   
   ## Video Production Standards
   
   **Typical Duration**: [Length]
   **Primary Format**: [Aspect ratio]
   **Content Types**: [List]
   **Production Frequency**: [Frequency]
   
   ---
   
   ## Digital Human Configuration
   
   **Use Digital Presenter**: [Yes/No/Sometimes]
   
   [If yes:]
   **Avatar Type**: [Description]
   **Characteristics**:
   - Gender: [Preference]
   - Age: [Range]
   - Ethnicity: [Preference]
   - Attire: [Style]
   
   **Background**: [Setting]
   
   ---
   
   ## Content Topics & Focus
   
   [List of typical topics]
   
   ---
   
   ## Production Notes
   
   [Any additional guidelines or preferences]
   
   ---
   
   *This context file guides all video production decisions. Update as brand evolves.*
   ```

10. **Confirm and Summarize**

    ```markdown
    ✅ Project context created successfully!
    
    Saved to: `./output/context/project-context.md`
    
    **Summary**:
    - Brand: [Name]
    - Audience: [Description]
    - Style: [Visual style]
    - Voice: [Communication style]
    - Platforms: [Main platforms]
    
    This context will now be used for all script writing, visual generation, 
    and video production to ensure brand consistency.
    
    You can review and edit the file anytime if preferences change.
    ```

## Output Format

The context file should be comprehensive, well-organized, and referenced by `@./output/context/project-context.md` in all subsequent video production tasks.

## Tips

- **Be conversational**: Make the Q&A process feel natural, not like a form
- **Provide examples**: Help users articulate preferences with examples
- **Allow flexibility**: Let users skip or come back to questions
- **Confirm understanding**: Summarize answers before moving to next section
- **Save incrementally**: Save progress even if user exits mid-session
- **Update capability**: Allow users to update context as brand evolves

## Related Skills

After creating project context, users typically:
- Use `analyze-website-content` to extract more brand details
- Use `script-planner` to start video production
- Reference this context in all subsequent video work
