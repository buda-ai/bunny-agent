---
name: weekly-horoscope-generator
description: Generates comprehensive weekly horoscopes covering the full week ahead with detailed insights and planning guidance for all zodiac signs.
---

# Weekly Horoscope Generator

This skill creates detailed weekly horoscopes that provide users with a comprehensive outlook for the week ahead, including key themes, opportunities, and timing for important decisions.

## When to Use This Skill

- Creating weekly forecast content for the platform
- Planning content for week-ahead guidance
- Generating batch weekly horoscopes for all signs
- Providing detailed weekly insights to users
- Creating premium weekly content

## What This Skill Does

1. **Weekly Theme Identification**: Identifies the main astrological theme for the week
2. **Day-by-Day Highlights**: Provides key insights for important days
3. **Multi-dimensional Forecast**: Covers love, career, health, and personal growth
4. **Best Days Identification**: Highlights optimal days for different activities
5. **Challenge Navigation**: Provides guidance for navigating weekly challenges
6. **Action Planning**: Offers strategic timing recommendations

## How to Use

### Generate Single Sign Weekly

```
Generate a weekly horoscope for Virgo
```

```
Create this week's forecast for Capricorn
```

### Generate All Signs

```
Create weekly horoscopes for all zodiac signs
```

```
Generate next week's horoscopes for all 12 signs
```

### With Specific Date Range

```
Generate weekly horoscopes for the week of February 3-9, 2026
```

## Output Format

Each weekly horoscope includes:

### Header
- Week date range
- Zodiac sign (with symbol)
- Weekly theme/keyword
- Overall energy rating (1-5 stars)

### Main Content
- **Week Overview** (200-250 words): Comprehensive weekly forecast
- **Love & Relationships** ❤️ (100-120 words): Weekly romance and social forecast
- **Career & Finance** 💼 (100-120 words): Work and money outlook
- **Health & Wellness** 🏃 (80-100 words): Physical and mental health focus
- **Personal Growth** 🌱 (80-100 words): Development opportunities

### Weekly Planner
- **Best Days For**: Romance, Career moves, Health focus, Creativity
- **Days to Watch**: Potential challenges
- **Week's Mantra**: Guiding affirmation

## Implementation Details

### File Structure
```
output/weekly/YYYY-WW/
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
# Weekly Horoscope for [Sign] ♊

**Week**: February 3-9, 2026
**Weekly Theme**: Communication & Connection
**Energy Rating**: ⭐⭐⭐⭐☆

## Week Overview 🌟

[Comprehensive 200-250 word forecast covering the week's main themes, energy shifts, and key astrological influences. Provide context for what to expect and how to make the most of the week.]

## Love & Relationships ❤️

[100-120 words on romantic developments, social dynamics, and relationship opportunities throughout the week. Include timing for best connection days.]

## Career & Finance 💼

[100-120 words on professional opportunities, work dynamics, financial prospects, and strategic timing for career moves.]

## Health & Wellness 🏃

[80-100 words on energy levels, physical vitality, mental clarity, and self-care priorities for the week.]

## Personal Growth 🌱

[80-100 words on learning opportunities, spiritual development, and personal breakthroughs available this week.]

## Weekly Planner 📅

### Best Days For:
- **Romance & Connection**: Wednesday, Friday 💕
- **Career Moves & Decisions**: Tuesday, Thursday 💼
- **Health & Fitness**: Monday, Saturday 🏃
- **Creativity & Self-Expression**: Friday, Sunday 🎨

### Days to Watch:
- **Wednesday Evening**: Communication may be challenging; practice patience
- **Saturday Morning**: Avoid impulsive financial decisions

### Week's Mantra 💫
> "I communicate with clarity and connect with authenticity."

---

*Plan your week with the stars and make the most of cosmic opportunities!*
```

## Writing Guidelines

### Tone & Style
- **Forward-looking**: Focus on possibilities and preparation
- **Strategic**: Help users plan and time activities
- **Comprehensive**: Cover all major life areas
- **Empowering**: Build confidence for the week ahead
- **Specific**: Provide detailed day-by-day guidance

### Content Principles
- Open with the week's main theme
- Provide context for astrological influences
- Include specific day references
- Balance opportunities with challenges
- Offer strategic timing advice
- Close with empowering call-to-action

### Weekly Structure
- **Monday-Wednesday**: Week's building energy
- **Thursday-Friday**: Peak activity and decisions
- **Weekend**: Integration and reflection
- Highlight standout days for each life area

## Astrological Considerations

### Key Factors to Address
- Planetary transits during the week
- Moon phase shifts
- Mercury/Venus/Mars movements
- Aspect patterns forming
- Retrograde influences
- Weekend vs weekday energy differences

### Integration Tips
- Connect weekly theme to zodiac sign strengths
- Reference element and modality
- Consider ruling planet activity
- Align guidance with current sky patterns

## Example Usage

**User**: "Create weekly horoscopes for all signs"

**Process**:
1. Determine current week date range
2. Research weekly astrological events
3. Identify main themes for each element group
4. Generate personalized content for each sign
5. Save to `output/weekly/YYYY-WW/[sign].md`
6. Return summary of files created

## Quality Checklist

Before finalizing each weekly horoscope:

- [ ] Week date range is accurate
- [ ] Content is 600-700 words total
- [ ] All five dimensions covered
- [ ] Best days identified for each area
- [ ] At least 3 specific day references
- [ ] Weekly mantra is included
- [ ] Tone is strategic and empowering
- [ ] Astrological context provided
- [ ] Actionable weekly guidance included
- [ ] Mobile-friendly formatting

## Advanced Features

### Personalization Layers
- Early week (Mon-Tue) focus
- Mid-week (Wed-Thu) opportunities
- Weekend (Fri-Sun) integration
- Best day for sign-specific strengths
- Warning days with solutions

### Special Week Types
- **Eclipse Weeks**: Extra guidance on transformation
- **Retrograde Weeks**: Focus on review and patience
- **New Moon Weeks**: Emphasis on beginnings
- **Full Moon Weeks**: Highlight culmination and release

## Success Metrics

A great weekly horoscope should:
- Provide clear weekly roadmap
- Help users plan important activities
- Balance all life dimensions
- Offer 3-5 specific actionable insights
- Reference at least 3 specific days
- Feel both mystical and practical
- Inspire confidence for the week

---

Use this skill weekly to provide users with comprehensive planning guidance and cosmic insights for the week ahead.
