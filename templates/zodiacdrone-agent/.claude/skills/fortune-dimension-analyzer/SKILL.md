---
name: fortune-dimension-analyzer
description: Provides multi-dimensional fortune analysis across love, career, health, and finance with personalized insights and recommendations.
---

# Fortune Dimension Analyzer

This skill performs deep-dive analysis of specific life dimensions (love, career, health, finance) for zodiac signs, providing detailed insights, timing recommendations, and actionable guidance for each area.

## When to Use This Skill

- User requests focused analysis on a specific life area
- Creating specialized content for platform sections
- Providing detailed guidance beyond general horoscopes
- Answering specific questions about love/career/health/finance
- Generating targeted advice content

## What This Skill Does

1. **Dimension-Specific Analysis**: Deep dive into one life area
2. **Trend Identification**: Spots patterns and upcoming shifts
3. **Timing Optimization**: Recommends best times for specific actions
4. **Challenge Navigation**: Provides solutions for dimension-specific obstacles
5. **Opportunity Mapping**: Identifies upcoming chances in each area
6. **Personalized Recommendations**: Tailored advice by zodiac sign

## How to Use

### Single Dimension Analysis

```
Analyze career fortune for Virgo this month
```

```
What's the love forecast for Libra this week?
```

### Comparative Analysis

```
Compare career vs finance outlook for Taurus this quarter
```

### Problem-Solving

```
Help Aries navigate current relationship challenges
```

```
What career moves should Capricorn make this month?
```

## Output Format

Each dimension analysis includes:

### Analysis Header
- Zodiac sign
- Dimension focus
- Time period
- Overall dimension rating
- Current cosmic influences

### Main Analysis
- **Current State** (100-150 words): Where things stand now
- **Key Influences** (80-100 words): Astrological factors at play
- **Opportunities** (100-120 words): What to embrace
- **Challenges** (80-100 words): What to navigate
- **Action Steps** (100-120 words): Specific recommendations
- **Best Timing** (80-100 words): When to act

### Quick Reference
- Dimension score (1-10)
- Key dates
- Do's and Don'ts
- Success indicators

## The Four Dimensions

### 💕 Love & Relationships

**Focus Areas**:
- Romantic relationships
- Dating and new connections
- Existing partnership dynamics
- Communication in relationships
- Emotional intimacy
- Social connections
- Family relationships

**Analysis Elements**:
- Venus and Mars positions
- 5th house (romance) and 7th house (partnerships)
- Current planetary aspects affecting love
- Moon phase impact on emotions
- Compatibility current transits

**Key Questions**:
- Single or partnered outlook?
- Best dates for romance?
- Communication challenges?
- Relationship milestones?
- Social opportunities?

### 💼 Career & Professional Growth

**Focus Areas**:
- Career advancement
- Job opportunities
- Professional reputation
- Workplace dynamics
- Skills development
- Leadership opportunities
- Career transitions

**Analysis Elements**:
- 10th house (career) transits
- Saturn (discipline) and Jupiter (expansion)
- Mercury (communication) for networking
- Sun (authority) and Mars (ambition)
- Professional timing windows

**Key Questions**:
- Promotion potential?
- Job change timing?
- Networking opportunities?
- Skill development focus?
- Leadership readiness?

### 🏃 Health & Wellness

**Focus Areas**:
- Physical health
- Energy levels
- Mental wellness
- Fitness goals
- Sleep and rest
- Stress management
- Vitality and immunity

**Analysis Elements**:
- 6th house (health) activity
- Mars (energy) and Moon (emotions)
- Stress indicators
- Healing transits
- Restorative periods

**Key Questions**:
- Energy patterns?
- Health focus areas?
- Best exercise timing?
- Rest needs?
- Wellness priorities?

### 💰 Finance & Abundance

**Focus Areas**:
- Income and earnings
- Investments
- Savings and budgeting
- Financial decisions
- Money mindset
- Material resources
- Financial security

**Analysis Elements**:
- 2nd house (income) and 8th house (shared resources)
- Jupiter (abundance) and Saturn (discipline)
- Venus (values) position
- Financial timing windows
- Risk vs security balance

**Key Questions**:
- Income opportunities?
- Investment timing?
- Budget priorities?
- Financial decisions?
- Abundance mindset?

## Implementation Details

### File Structure
```
output/dimensions/
  ├── love/
  │   ├── aries-love-2026-02.md
  │   └── taurus-love-weekly.md
  ├── career/
  │   ├── gemini-career-2026-q1.md
  │   └── capricorn-career-monthly.md
  ├── health/
  │   ├── leo-health-2026-02.md
  │   └── virgo-health-spring.md
  └── finance/
      ├── scorpio-finance-2026-q1.md
      └── pisces-finance-monthly.md
```

### Analysis Template
```markdown
# [Dimension] Fortune Analysis: [Sign] 💕

**Period**: February 2026
**Dimension Rating**: ⭐⭐⭐⭐☆ (8/10)
**Key Theme**: Deepening Connections
**Cosmic Influences**: Venus in Pisces, Mars in Gemini

## Current State 🌟

[100-150 words describing the current situation in this life dimension for this zodiac sign. What's happening now? What's the general energy? What phase are they in?]

## Key Cosmic Influences 🔮

[80-100 words detailing the astrological factors currently affecting this dimension:]

**Primary Factors**:
- [Planet/Transit #1 and its impact]
- [Planet/Transit #2 and its impact]
- [Aspect/Event #1 and its significance]

**Supporting Influences**:
- [Secondary factor affecting this dimension]

## Opportunities Ahead ✨

[100-120 words highlighting positive prospects and chances:]

**Major Opportunities**:
1. **[Opportunity #1]**: [Description and how to leverage]
2. **[Opportunity #2]**: [Description and timing]
3. **[Opportunity #3]**: [Description and action steps]

**Hidden Gems**:
- [Subtle opportunity that might be overlooked]
- [Unexpected advantage or gift]

## Challenges to Navigate ⚠️

[80-100 words addressing potential difficulties:]

**Key Challenges**:
1. **[Challenge #1]**: [Description and solution approach]
2. **[Challenge #2]**: [Description and coping strategy]

**How to Handle**:
[Practical advice for overcoming these challenges]

## Action Steps 🎯

[100-120 words with specific, actionable recommendations:]

**Immediate Actions (This Week)**:
1. [Specific action #1]
2. [Specific action #2]
3. [Specific action #3]

**Medium-term Goals (This Month)**:
1. [Goal #1]
2. [Goal #2]

**Long-term Vision (This Quarter)**:
[Overarching objective for this dimension]

## Best Timing ⏰

[80-100 words on optimal timing for different activities:]

**Peak Dates**:
- **February 5-7**: [Best for specific activity]
- **February 14**: [Perfect for particular action]
- **February 20-22**: [Ideal time for certain endeavor]

**Caution Dates**:
- **February 11**: [What to avoid and why]
- **February 26**: [Challenging timing explanation]

## Dimension Score Breakdown 📊

| Factor | Score | Notes |
|--------|-------|-------|
| Current Flow | 8/10 | Positive momentum |
| Opportunities | 9/10 | Multiple openings |
| Challenges | 6/10 | Manageable obstacles |
| Cosmic Support | 8/10 | Favorable transits |
| Action Readiness | 7/10 | Mostly prepared |

**Overall**: 8/10 - Excellent prospects ⭐⭐⭐⭐☆

## Do's and Don'ts 📋

### ✅ Do:
- [Recommended action #1]
- [Recommended action #2]
- [Recommended action #3]
- [Recommended approach or attitude]

### ❌ Don't:
- [Action to avoid #1]
- [Action to avoid #2]
- [Pitfall to watch out for]

## Success Indicators 🏆

You'll know you're on track when:
- [Positive sign #1]
- [Positive sign #2]
- [Positive sign #3]
- [Progress indicator]

## Affirmation 💫

> "[Powerful affirmation specific to this dimension and sign]"

## Additional Resources

**Recommended Reading**: [Relevant article or guide]
**Related Skills**: [Other skills that complement this analysis]
**Check Your**: [Related horoscope or compatibility check]

---

*Focus your energy on this dimension and watch it flourish. Share your progress and inspire others!*
```

## Writing Guidelines

### Tone & Style
- **Specific**: Avoid vague generalizations
- **Action-oriented**: Emphasize what to do
- **Balanced**: Acknowledge both potential and challenges
- **Empowering**: Build confidence and agency
- **Practical**: Ground mystical insights in real life

### Content Principles
- Lead with current state assessment
- Identify 3-5 specific opportunities
- Acknowledge 2-3 key challenges
- Provide 5-7 concrete action steps
- Include specific dates and timing
- Use dimension-specific language and concerns

### Astrological Depth
- Reference relevant houses (2nd, 5th, 6th, 7th, 10th)
- Consider ruling planet activity
- Note applicable transits
- Include aspect patterns
- Reference moon phase influence

## Analysis Frameworks

### Love Dimension Framework
1. Current relationship status and energy
2. Venus and Mars positioning
3. Communication (Mercury) influence
4. Emotional climate (Moon)
5. Romantic opportunities and timing
6. Challenge areas and solutions
7. Connection-building action steps

### Career Dimension Framework
1. Current professional standing
2. 10th house and Midheaven activity
3. Saturn (structure) and Jupiter (growth)
4. Networking opportunities (11th house)
5. Leadership potential
6. Obstacles and strategies
7. Career advancement steps

### Health Dimension Framework
1. Current vitality and energy levels
2. 6th house influences
3. Mars (physical energy) and Moon (emotional health)
4. Stress indicators and management
5. Wellness opportunities
6. Health challenges and prevention
7. Self-care action plan

### Finance Dimension Framework
1. Current financial standing
2. 2nd house (income) and 8th house (investments)
3. Jupiter (expansion) and Saturn (discipline)
4. Money opportunities
5. Financial risks and mitigation
6. Abundance blocks and solutions
7. Financial growth strategies

## Example Usage

**User**: "Analyze love fortune for Cancer this month"

**Process**:
1. Identify current month and Cancer characteristics
2. Research Venus, Mars, and relationship-related transits
3. Assess 5th and 7th house activity for Cancer
4. Generate comprehensive love dimension analysis
5. Save to `output/dimensions/love/cancer-love-2026-02.md`
6. Return summary of key insights

## Quality Checklist

- [ ] Dimension clearly identified
- [ ] Time period specified
- [ ] Current state accurately described
- [ ] 3+ opportunities highlighted
- [ ] 2+ challenges addressed
- [ ] 5+ action steps provided
- [ ] Specific dates included
- [ ] Score breakdown complete
- [ ] Do's and don'ts listed
- [ ] Affirmation included
- [ ] Content is 800-1000 words

## Success Metrics

A great dimension analysis should:
- Provide actionable, specific guidance
- Include 5+ concrete recommendations
- Reference 3+ specific dates
- Address current astrological influences
- Balance optimism with realism
- Feel personalized to the sign
- Empower decision-making
- Offer both immediate and long-term guidance

---

Use this skill to provide users with focused, actionable insights in their most important life areas.
