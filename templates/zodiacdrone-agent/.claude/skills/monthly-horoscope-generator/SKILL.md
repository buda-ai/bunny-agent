---
name: monthly-horoscope-generator
description: Produces detailed monthly horoscope reports with major themes, key dates, and comprehensive forecasts across all life dimensions.
---

# Monthly Horoscope Generator

This skill creates in-depth monthly horoscopes that provide users with a comprehensive outlook for the entire month, including major themes, critical dates, and strategic guidance for long-term planning.

## When to Use This Skill

- Creating premium monthly content for the platform
- Generating long-form forecasts for planning
- Providing monthly guidance for all zodiac signs
- Creating shareable monthly reports
- Offering strategic monthly insights

## What This Skill Does

1. **Monthly Theme Analysis**: Identifies overarching themes for the month
2. **Key Dates Mapping**: Highlights important astrological dates
3. **Phase-by-Phase Forecast**: Divides month into phases with distinct energies
4. **Goal Setting Guidance**: Provides strategic planning recommendations
5. **Long-term Outlook**: Connects monthly themes to bigger picture
6. **Comprehensive Coverage**: Detailed analysis of all life areas

## How to Use

### Generate Single Sign Monthly

```
Generate a monthly horoscope for Libra
```

```
Create February 2026 horoscope for Aquarius
```

### Generate All Signs

```
Create monthly horoscopes for all zodiac signs
```

```
Generate March horoscopes for all 12 signs
```

### With Future Date

```
Generate monthly horoscopes for all signs for April 2026
```

## Output Format

Each monthly horoscope includes:

### Header
- Month and year
- Zodiac sign (with symbol)
- Monthly theme/keyword
- Overall energy rating
- Key planetary influences

### Main Sections
- **Month Overview** (300-400 words): Comprehensive monthly forecast
- **Love & Relationships** ❤️ (200-250 words): Romance and social forecast
- **Career & Finance** 💼 (200-250 words): Professional and financial outlook
- **Health & Wellness** 🏃 (150-180 words): Physical and mental health
- **Personal Growth** 🌱 (150-180 words): Development and learning

### Strategic Planning
- **Key Dates** 📅: Important days to mark
- **Monthly Phases**: Week-by-week energy breakdown
- **Goals to Set**: Recommended focus areas
- **Things to Avoid**: Potential pitfalls
- **Monthly Affirmation**: Power statement for the month

## Implementation Details

### File Structure
```
output/monthly/YYYY-MM/
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
# Monthly Horoscope for [Sign] ♒

**Month**: February 2026
**Monthly Theme**: Innovation & Breakthrough
**Energy Rating**: ⭐⭐⭐⭐⭐
**Key Planets**: Uranus (awakening), Mercury (communication)

## Month Overview 🌟

[Comprehensive 300-400 word forecast covering the month's major themes, astrological influences, and overall energy pattern. Set the context for what makes this month unique and how to leverage its potential.]

## Love & Relationships ❤️

[200-250 words on romantic developments, relationship milestones, social opportunities, and emotional themes throughout the month. Include specific timing for key relationship moments.]

**First Half (Week 1-2)**: [Relationship dynamics and opportunities]

**Second Half (Week 3-4)**: [Relationship evolution and outcomes]

**Single**: [Specific guidance for single individuals]

**Coupled**: [Specific guidance for those in relationships]

## Career & Finance 💼

[200-250 words on professional opportunities, career advancement, financial planning, and money matters. Include strategic timing for important career decisions.]

**Professional Highlights**: [Key career opportunities and developments]

**Financial Focus**: [Money management and financial opportunities]

**Networking**: [Professional connections and collaborations]

**Best Time for Career Moves**: [Specific dates or weeks]

## Health & Wellness 🏃

[150-180 words on energy levels, physical health, mental wellness, and self-care priorities for the month.]

**Physical Health**: [Body and fitness focus]

**Mental Wellness**: [Stress management and mental clarity]

**Energy Patterns**: [High and low energy periods]

**Recommended Activities**: [Exercise, meditation, rest]

## Personal Growth 🌱

[150-180 words on learning opportunities, spiritual development, personal breakthroughs, and self-improvement focus.]

**Growth Areas**: [Specific development opportunities]

**Learning Focus**: [Skills or knowledge to acquire]

**Spiritual Practices**: [Meditation, reflection, journaling]

**Breakthrough Potential**: [Major insights or transformations]

## Key Dates 📅

- **February 3**: New Moon in Aquarius - Set intentions for innovation
- **February 9**: Venus enters Aries - Passion in relationships
- **February 14**: Valentine's Day - Enhanced romance energy
- **February 17**: Full Moon in Leo - Creative culmination
- **February 24**: Mercury enters Pisces - Intuitive communication

## Monthly Phases 🌙

### Week 1 (Feb 1-7): Building Momentum
[Energy description and focus areas for first week]

### Week 2 (Feb 8-14): Peak Activity
[Energy description and focus areas for second week]

### Week 3 (Feb 15-21): Integration
[Energy description and focus areas for third week]

### Week 4 (Feb 22-28): Reflection & Preparation
[Energy description and focus areas for fourth week]

## Strategic Planning 🎯

### Goals to Set This Month
1. [Specific, achievable goal aligned with monthly theme]
2. [Career or financial goal]
3. [Personal development goal]

### Things to Avoid
- [Specific pitfall or challenge to watch for]
- [Timing to avoid for major decisions]
- [Common mistakes for this sign this month]

### Success Tips
- [Actionable tip #1]
- [Actionable tip #2]
- [Actionable tip #3]

## Monthly Affirmation 💫

> "I embrace innovation and welcome breakthrough moments. My unique vision creates positive change in all areas of my life."

---

*Use this monthly guide to plan ahead and align your goals with cosmic rhythms. Share your monthly horoscope and inspire others to live in harmony with the stars!*
```

## Writing Guidelines

### Tone & Style
- **Comprehensive**: Cover the full monthly arc
- **Strategic**: Help with long-term planning
- **Inspirational**: Motivate goal-setting
- **Detailed**: Provide depth and context
- **Forward-thinking**: Focus on possibilities

### Content Principles
- Open with month's unique qualities
- Provide historical/astrological context
- Include specific dates and timing
- Break month into manageable phases
- Offer concrete goals and action steps
- Balance optimism with practical wisdom

### Monthly Arc Structure
- **Week 1**: Building and initiating
- **Week 2**: Peak activity and momentum
- **Week 3**: Adjustment and integration
- **Week 4**: Completion and transition

## Astrological Considerations

### Major Factors to Include
- New Moon and Full Moon dates/themes
- Major planetary transits
- Sign-specific transits
- Retrograde periods (if any)
- Eclipse seasons (if applicable)
- Planetary aspects
- Seasonal shifts

### Element & Modality Integration
- Reference element strengths (Fire, Earth, Air, Water)
- Acknowledge modality (Cardinal, Fixed, Mutable)
- Connect to opposite sign themes
- Consider element compatibility for relationships

## Example Usage

**User**: "Generate monthly horoscopes for all signs for February"

**Process**:
1. Research February 2026 astrological events
2. Identify new moon, full moon, and major transits
3. Determine monthly themes for each element
4. Generate personalized content for each sign
5. Save to `output/monthly/2026-02/[sign].md`
6. Create summary report of key themes

## Quality Checklist

Before finalizing each monthly horoscope:

- [ ] Month and year are accurate
- [ ] Content is 1000-1200 words total
- [ ] All five dimensions comprehensively covered
- [ ] At least 5 key dates included
- [ ] Monthly phases broken down by week
- [ ] 3 specific goals provided
- [ ] Monthly affirmation included
- [ ] Astrological context explained
- [ ] Strategic guidance offered
- [ ] Mobile-friendly formatting with clear sections

## Advanced Features

### Personalization Layers
- Birthday month special notes
- Ruling planet activity
- Element-specific themes
- Modality-based timing
- House-based forecasts (if advanced)

### Special Month Types
- **Eclipse Months**: Extra emphasis on transformation
- **Retrograde Heavy Months**: Focus on review and revision
- **Birth Month**: Personal year themes
- **Opposite Sign Emphasis**: Relationship focus
- **Saturn Return Months**: Maturity themes (if applicable)

## Premium Content Ideas

### Extended Analysis
- Compatibility focus for the month
- Career advance planning
- Financial strategy guide
- Health and wellness plan
- Relationship roadmap

### Interactive Elements
- Monthly goal worksheet
- Date planner printable
- Affirmation cards
- Phase tracker
- Success journal prompts

## Success Metrics

A great monthly horoscope should:
- Provide complete monthly roadmap
- Help users set meaningful goals
- Offer 5-7 key dates to remember
- Balance all life dimensions equally
- Feel both profound and practical
- Inspire monthly intention-setting
- Give enough detail for planning
- Create anticipation for the month

---

Use this skill monthly to provide users with comprehensive forecasts that support goal-setting, planning, and living in alignment with cosmic rhythms.
