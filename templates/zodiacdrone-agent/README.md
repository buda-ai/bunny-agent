# ZodiacDrone Agent Template

AI-powered Claude agent template for generating horoscope content, zodiac analysis, and astrological insights for the [ZodiacDrone](https://zodiacdrone.app/) platform.

## Overview

This template configures Claude as a professional astrology expert specialized in creating engaging, personalized horoscope content across multiple dimensions and time periods. It's designed to support the full content creation workflow for an AI-driven zodiac platform.

## Product Context

**ZodiacDrone** is an AI-powered horoscope analysis and sharing platform featuring:
- 🌟 **Three Chart Types** - Natal (personality), Transit (trends), Firdaria (life stages)
- ♈ **12 Zodiac Signs** - Complete coverage from Aries to Pisces
- 💫 **Fortune Sharing** - One-click social media sharing
- 🔮 **Compatibility Analysis** - Relationship insights between signs
- 🌙 **Lunar Phase Tracking** - New moon, full moon, and celestial events
- 💕 **5-Dimensional Scoring** - Love, Career, Wealth, Health, Overall ratings

## Features

### Core Workflow

**Two-Step Analysis Process:**
1. **Question Analysis** - Determine chart type based on keywords
2. **Reading Generation** - Create personalized interpretation with scores

### Three Chart Types

1. **本命盘 (Natal Chart)** - "Who am I?"
   - Personality traits and characteristics
   - Natural talents and potentials
   - Life foundation and purpose
   - Keywords: 性格, 天赋, 本质, personality, traits, talent

2. **时运盘 (Transit Chart)** - "What's happening now?"
   - Current trends and timing
   - Fortune predictions
   - Optimal timing for actions
   - Keywords: 最近, 这个月, 运势, recently, this month, forecast

3. **法达盘 (Firdaria Chart)** - "Where am I in life?"
   - Life stage analysis
   - Current life chapter themes
   - Journey milestones
   - Keywords: 人生阶段, 大运, life stage, life chapter

### 5-Dimensional Scoring

Each reading includes star ratings (1-5) for:
- 💕 **Love** (爱情) - Romance and relationships
- 💼 **Career** (事业) - Professional growth
- 💰 **Wealth** (财运) - Financial prospects
- 🏃 **Health** (健康) - Physical and mental wellness
- ✨ **Overall** (综合) - General fortune

### 8 Specialized Skills

#### Content Creation (3 skills)
1. **daily-horoscope-generator** - Generate engaging daily forecasts
2. **weekly-horoscope-generator** - Create comprehensive weekly outlooks
3. **monthly-horoscope-generator** - Produce detailed monthly reports

#### Analysis & Insights (3 skills)
4. **compatibility-analyzer** - Analyze relationship compatibility between signs
5. **fortune-dimension-analyzer** - Deep-dive analysis of love/career/health/finance
6. **zodiac-profile-manager** - Create and maintain comprehensive sign profiles

#### Tracking & Sharing (2 skills)
7. **lunar-phase-tracker** - Track moon phases and celestial events
8. **share-content-generator** - Create optimized social media content

## Installation

1. Copy the `zodiacdrone-agent` folder to your Claude templates directory
2. Open Claude with the template activated
3. The agent will be ready with all skills and configurations loaded

## Usage Examples

### Natal Chart Analysis (本命盘)
```
我的性格特点是什么？
What are my natural talents and strengths?
我适合什么样的职业？
```

### Transit Chart Analysis (时运盘)
```
我这个月的运势如何？
What should I focus on recently?
今年的事业运怎么样？
When is the best time to make a career move?
```

### Firdaria Chart Analysis (法达盘)
```
我现在处于人生的什么阶段？
What life chapter am I currently in?
当前的人生主题是什么？
```

### Compatibility Analysis
```
Analyze compatibility between Leo and Sagittarius
狮子座和射手座合适吗？
```

### Other Features
```
Track lunar phases for February 2026
```

### Create Social Content
```
Create Instagram posts from today's horoscopes
```

### Dimension-Specific Analysis
```
Analyze career fortune for Virgo this month
```

## File Structure

```
zodiacdrone-agent/
├── CLAUDE.md                    # Main agent configuration
├── README.md                    # This file
└── .claude/
    ├── settings.json           # Agent settings and permissions
    └── skills/
        ├── daily-horoscope-generator/
        │   └── SKILL.md
        ├── weekly-horoscope-generator/
        │   └── SKILL.md
        ├── monthly-horoscope-generator/
        │   └── SKILL.md
        ├── compatibility-analyzer/
        │   └── SKILL.md
        ├── fortune-dimension-analyzer/
        │   └── SKILL.md
        ├── lunar-phase-tracker/
        │   └── SKILL.md
        ├── share-content-generator/
        │   └── SKILL.md
        └── zodiac-profile-manager/
            └── SKILL.md
```

## Output Structure

The agent generates content in organized directories:

```
output/
├── daily/              # Daily horoscopes
│   └── YYYY-MM-DD/
│       ├── aries.md
│       ├── taurus.md
│       └── ...
├── weekly/             # Weekly horoscopes
│   └── YYYY-WW/
├── monthly/            # Monthly horoscopes
│   └── YYYY-MM/
├── compatibility/      # Compatibility reports
│   ├── aries-taurus.md
│   └── ...
├── dimensions/         # Dimension-specific analysis
│   ├── love/
│   ├── career/
│   ├── health/
│   └── finance/
├── lunar/             # Lunar phase tracking
│   └── YYYY-MM-tracker.md
├── profiles/          # Zodiac sign profiles
│   ├── aries.md
│   └── ...
└── share-content/     # Social media content
    ├── daily/
    ├── weekly/
    └── monthly/
```

## Zodiac Signs Coverage

The template supports all 12 zodiac signs:

### Fire Signs 🔥
- ♈ **Aries** (Mar 21 - Apr 19) - Bold, energetic, pioneering
- ♌ **Leo** (Jul 23 - Aug 22) - Confident, charismatic, generous
- ♐ **Sagittarius** (Nov 22 - Dec 21) - Adventurous, optimistic, philosophical

### Earth Signs 🌍
- ♉ **Taurus** (Apr 20 - May 20) - Stable, sensual, persistent
- ♍ **Virgo** (Aug 23 - Sep 22) - Analytical, helpful, detail-oriented
- ♑ **Capricorn** (Dec 22 - Jan 19) - Ambitious, disciplined, responsible

### Air Signs 💨
- ♊ **Gemini** (May 21 - Jun 20) - Curious, adaptable, communicative
- ♎ **Libra** (Sep 23 - Oct 22) - Balanced, diplomatic, aesthetic
- ♒ **Aquarius** (Jan 20 - Feb 18) - Innovative, humanitarian, independent

### Water Signs 💧
- ♋ **Cancer** (Jun 21 - Jul 22) - Nurturing, emotional, protective
- ♏ **Scorpio** (Oct 23 - Nov 21) - Intense, transformative, mysterious
- ♓ **Pisces** (Feb 19 - Mar 20) - Compassionate, artistic, intuitive

## Content Guidelines

### Two-Step Workflow

1. **Analyze Question** - Identify chart type through keywords
2. **Generate Reading** - Create interpretation with scores

### Output Format

Each reading includes:
- **Title & Summary** - Engaging headline and overview
- **Detailed Interpretation** - Chart-specific analysis
- **Fortune Scores** - 5-dimensional star ratings
- **Tags** - Categorization and searchability
- **Actionable Advice** - Practical recommendations

### Tone & Style
- **Empowering**: Focus on personal agency and positive outcomes
- **Specific**: Provide concrete, actionable guidance
- **Positive**: Frame challenges as growth opportunities
- **Engaging**: Use conversational, relatable language
- **Mystical yet Practical**: Balance cosmic wisdom with real-world advice

### Writing Principles
- Front-load key insights
- Use second person (you, your)
- Include relevant emojis for visual appeal
- Provide specific dates and timing when applicable
- Balance optimism with realistic expectations
- Respect all relationship types and life paths

## Agent Configuration

### Keyword-Driven Analysis

The agent uses keyword matching to determine chart type:

**Natal Chart Keywords**: 性格, 天赋, 本质, 特点, personality, traits, talent, who am i

**Transit Chart Keywords**: 最近, 这个月, 今年, 运势, recently, this month, forecast, when

**Firdaria Chart Keywords**: 人生阶段, 大运, 当前阶段, life stage, life chapter, current phase

### Settings
- **Temperature**: 0.7 (balanced creativity and consistency)
- **Max Tokens**: 8096
- **Timeout**: 600000ms (10 minutes)
- **Max Turns**: 100

### Permissions
- Skill execution
- Web search and fetch
- File read/write in output directory
- Bash commands (limited)
- User questions (ask permission)

## Best Practices

1. **Daily Content**: Generate horoscopes early in the day for timely delivery
2. **Batch Generation**: Create content for all signs at once for consistency
3. **Lunar Alignment**: Update horoscopes around new/full moons for relevance
4. **Social Optimization**: Generate shareable content alongside horoscopes
5. **Profile Maintenance**: Update zodiac profiles seasonally or annually
6. **Compatibility Focus**: Create compatibility content for Valentine's Day, etc.

## Customization

To customize this template for your needs:

1. **Edit CLAUDE.md**: Modify the main agent configuration and brand context
2. **Adjust settings.json**: Change temperature, permissions, or timeout
3. **Modify Skills**: Edit individual SKILL.md files for different approaches
4. **Add Skills**: Create new skill folders following the existing pattern
5. **Update Output Structure**: Modify file paths in skill templates

## Integration with ZodiacDrone

This agent is designed to integrate with the ZodiacDrone platform:

- **Content API**: Generated markdown can be parsed and served via API
- **Social Sharing**: Share content includes platform-specific optimizations
- **User Personalization**: Sign-specific content enables personalized experiences
- **Lunar Alerts**: Phase tracking supports notification features
- **Compatibility Tools**: Analysis powers relationship features

## License

[Same as parent project]

## Contributing

Contributions to improve the template are welcome:
- Enhance existing skills with better prompts
- Add new skills for additional features
- Improve output formatting
- Expand astrological accuracy
- Optimize for specific use cases

## Support

For questions or issues:
- Check individual SKILL.md files for detailed documentation
- Review CLAUDE.md for agent capabilities
- Refer to examples in this README

---

**Template Version**: 1.0
**Created**: February 2026
**Platform**: [ZodiacDrone](https://zodiacdrone.app/)
**Purpose**: AI-powered horoscope content generation

*May the stars guide your content creation journey! ✨🔮🌙*
