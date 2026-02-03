---
name: generate-brand-context
description: Interactive wizard to create brand context (siteinfo.md) through guided Q&A session for personalized BaZi consultations
---

# Generate Brand Context

This skill creates a comprehensive brand context file through an interactive Q&A session. This ensures all BaZi consultations are aligned with the platform's specific approach, target audience, and business goals.

## When to Use This Skill

- **First-time setup**: Before conducting any BaZi consultations
- **Platform rebranding**: When updating brand positioning or services
- **Missing context**: When siteinfo.md doesn't exist or needs updating

## What This Skill Does

1. **Interactive Q&A**: Guides through structured questions about the platform
2. **Context Generation**: Creates detailed siteinfo.md with brand information
3. **Validation**: Ensures all critical information is captured
4. **Persistence**: Saves context for all future consultations

## How to Use

Simply say:
```
Create brand context for my BaZi platform
```

Or:
```
Set up brand information
```

## Questions Covered

### Platform Identity
- Platform name and tagline
- Target audience and user personas
- Unique value proposition
- Brand personality and tone

### Service Offerings
- Core BaZi services provided
- Consultation types (personal, relationship, career, etc.)
- Pricing model and tiers
- Additional features (reports, visualizations, etc.)

### Consultation Approach
- Traditional vs. modern balance
- Interpretation philosophy
- Cultural considerations
- Language preferences (Chinese/English/Bilingual)

### Technical Details
- Platform technology stack
- Data privacy policies
- User data handling
- Output formats and deliverables

## Output

Creates `./output/context/siteinfo.md` containing:

```markdown
# BaZi AI Platform - Brand Context

## Platform Overview
- Name: [Platform Name]
- Tagline: [Tagline]
- Mission: [Mission Statement]

## Target Audience
- Primary Users: [Description]
- User Needs: [Key needs]
- Pain Points: [Problems solved]

## Services
- [Service 1]: [Description]
- [Service 2]: [Description]
...

## Consultation Philosophy
- Approach: [Traditional/Modern/Balanced]
- Tone: [Empathetic/Professional/Mystical]
- Focus Areas: [Life areas emphasized]

## Technical Configuration
- Language: [Simplified/Traditional Chinese, English]
- Output Formats: [PDF/Web/JSON]
- Privacy: [Data handling approach]
```

## Best Practices

- **Be specific**: Detailed answers create better context
- **Think long-term**: Brand context guides all future consultations
- **Be honest**: Accurate context ensures authentic consultations
- **Update regularly**: Refresh when brand evolves

## Example Usage

**User**: "Set up brand context"

**Agent**: 
```
I'll help you create the brand context for your BaZi platform. 
This will guide all future consultations.

Let's start with some questions:

1. What is your platform's name?
2. What is your tagline or main value proposition?
3. Who is your primary target audience?
   (e.g., young professionals, couples seeking compatibility, parents naming children)
4. What's your consultation style?
   (a) Traditional and classical
   (b) Modern and psychological
   (c) Balanced blend of both
5. What languages do you primarily serve?
   (a) Simplified Chinese
   (b) Traditional Chinese
   (c) English
   (d) Bilingual
...
```

## Integration

After creating brand context, it's automatically referenced in:
- All consultation sessions via `@./output/context/siteinfo.md`
- Report generation for consistent branding
- Chart visualization styling
- Communication tone and terminology

## Maintenance

Update brand context when:
- Launching new services
- Changing target audience
- Rebranding or repositioning
- Expanding to new markets
- Adding language support

---

**Note**: Brand context is the foundation of personalized, authentic BaZi consultations. Invest time in creating accurate context for best results.
