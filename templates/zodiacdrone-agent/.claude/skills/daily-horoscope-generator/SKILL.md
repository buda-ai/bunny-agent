---
name: daily-horoscope-generator
description: Creates engaging, personalized daily horoscopes for all zodiac signs with actionable insights and fortune predictions.
---

# Daily Horoscope Generator

This skill generates personalized daily horoscopes for individual or all zodiac signs. Each horoscope includes fortune predictions across multiple life dimensions with an empowering and positive tone.

## When to Use This Skill

- Creating daily horoscope content for the platform
- Generating batch horoscopes for all 12 zodiac signs
- Producing personalized forecasts for specific signs
- Creating content for social media sharing
- Providing daily guidance to users

## What This Skill Does

1. **Daily Forecast Generation**: Creates personalized horoscopes for the current or specified date
2. **Multi-dimensional Analysis**: Covers love, career, health, and financial aspects
3. **Lucky Elements**: Includes lucky numbers, colors, and activities
4. **Actionable Insights**: Provides specific guidance and recommendations
5. **Social-ready Format**: Optimizes content for easy sharing
6. **Emoji Integration**: Adds relevant emojis for visual engagement

## How to Use

### Generate Single Sign Horoscope

```
Generate a daily horoscope for Aries
```

```
Create today's horoscope for Scorpio with focus on career
```

### Generate All Signs

```
Create daily horoscopes for all zodiac signs
```

```
Generate tomorrow's horoscopes for all 12 signs
```

### With Specific Date

```
Generate daily horoscopes for all signs for 2026-02-15
```

```
Create Valentine's Day horoscope for Pisces
```

## Output Format

Each daily horoscope includes:

### Metadata
- Date
- Zodiac sign (with symbol)
- Element (Fire/Earth/Air/Water)
- Ruling planet
- Mood indicator

### Fortune Sections
- **Overall Fortune** (150-200 words): General daily outlook
- **Love & Relationships** ❤️: Romance and social connections
- **Career & Money** 💼: Work and financial prospects
- **Health & Wellness** 🏃: Physical and mental well-being

### Lucky Elements
- Lucky numbers (3-5 numbers)
- Lucky colors (1-2 colors)
- Lucky hours (time range)
- Power word/affirmation

### Quote of the Day
- Inspirational quote aligned with daily theme

## Implementation Details

### File Structure
```
output/daily/YYYY-MM-DD/
  ├── aries.md
  ├── taurus.md
  ├── gemini.md
  ├── cancer.md
  ├── leo.md
  ├── virgo.md
  ├── libra.md
  ├── scorpio.md
  ├── sagittarius.md
  ├── capricorn.md
  ├── aquarius.md
  └── pisces.md
```

### Content Template
```markdown
# Daily Horoscope for [Sign] ♈

**Date**: February 2, 2026
**Element**: Fire
**Ruling Planet**: Mars
**Today's Mood**: ⭐⭐⭐⭐☆ Energetic

## Overall Fortune ✨

[Engaging 150-200 word daily forecast that captures the day's energy, opportunities, and potential challenges. Written in second person, empowering tone.]

## Love & Relationships ❤️

[60-80 words on romantic prospects, social connections, and emotional energy]

## Career & Money 💼

[60-80 words on work dynamics, financial opportunities, and professional growth]

## Health & Wellness 🏃

[60-80 words on physical vitality, mental clarity, and self-care recommendations]

## Lucky Elements 🍀

- **Lucky Numbers**: 3, 17, 24
- **Lucky Colors**: Red, Gold
- **Lucky Hours**: 10:00-12:00, 16:00-18:00
- **Power Word**: Courage

## Quote of the Day 💭

> "Your energy introduces you before you even speak."

---

*Share your horoscope on social media and let your friends know what the stars have in store!*
```

## Writing Guidelines

### Tone & Style
- **Empowering**: Focus on agency and personal power
- **Positive**: Frame challenges as opportunities
- **Specific**: Provide concrete guidance, not vague statements
- **Relatable**: Use everyday language and situations
- **Encouraging**: Build confidence and optimism

### Content Principles
- Start with the most important insight
- Use active voice and direct address (you, your)
- Balance mystical with practical advice
- Include at least one actionable recommendation
- Vary sentence structure for rhythm
- Avoid negative predictions or fear-based content

### Astrological Accuracy
- Consider current planetary transits
- Reference moon phase when relevant
- Acknowledge retrograde periods
- Align with zodiac sign characteristics
- Maintain consistency with element and modality

## Example Usage

**User**: "Generate a daily horoscope for Leo"

**Process**:
1. Determine current date
2. Research current celestial events
3. Consider Leo characteristics (Fire, Fixed, Sun-ruled)
4. Generate content following template
5. Save to `output/daily/YYYY-MM-DD/leo.md`
6. Return summary with file location

## Quality Checklist

Before finalizing each horoscope:

- [ ] Date is accurate and clearly stated
- [ ] Content is 300-400 words total
- [ ] All four dimensions covered (Overall, Love, Career, Health)
- [ ] Lucky elements are included
- [ ] At least 3 emojis used appropriately
- [ ] Quote is inspiring and relevant
- [ ] Tone is positive and empowering
- [ ] Specific actionable advice provided
- [ ] No grammar or spelling errors
- [ ] Mobile-friendly formatting

## Success Metrics

A great daily horoscope should:
- Feel personalized to the zodiac sign
- Provide at least 2 actionable insights
- Balance optimism with realism
- Be shareable and quotable
- Reflect current astrological influences
- Encourage user engagement

---

Use this skill daily to maintain fresh, engaging horoscope content for ZodiacDrone users.
