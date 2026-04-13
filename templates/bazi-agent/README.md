# BaZi AI Agent Template

> 🌟 AI-Powered Chinese Fortune Telling Platform  
> 基于 AI 的中国八字命理分析平台

A comprehensive Claude agent template for providing professional BaZi (八字) fortune analysis. This template combines traditional Chinese astrology wisdom with modern AI technology to deliver personalized, insightful consultations.

## 📋 Overview

BaZi AI is a specialized Claude agent configured to act as a wise and empathetic Chinese astrology master (命理大师). It provides:

- **八字排盘** (BaZi Chart Calculation) - Accurate Four Pillars calculation
- **命理分析** (Fortune Analysis) - AI-driven deep interpretation
- **流年运势** (Annual Fortune) - Year-by-year predictions
- **合婚配对** (Relationship Compatibility) - BaZi matching analysis  
- **起名建议** (Name Recommendations) - Auspicious name selection
- **事业指导** (Career Guidance) - Career path recommendations

## 🎯 Core Features

### Foundation Skills
1. **generate-brand-context** - Platform setup and brand context creation
2. **calculate-bazi** - Four Pillars calculation from birth data

### Analysis Skills  
3. **day-master-analysis** - Core personality interpretation
4. **five-elements-balance** - Elemental balance analysis
5. **luck-cycle-forecast** - 10-year cycles and annual predictions

### Application Skills
6. **relationship-compatibility** - Romantic compatibility analysis
7. **career-path-advisor** - Career guidance and recommendations  
8. **name-recommendation** - Chinese name selection
9. **chart-visualizer** - Visual charts and reports

## 🚀 Quick Start

### 1. Configure Your Agent

The template is ready to use with pre-configured:
- **CLAUDE.md** - Complete agent instructions and expertise
- **.claude/settings.json** - Optimized configuration (temperature, tokens, permissions)
- **.claude/skills/** - 9 specialized skill modules

### 2. First Time Setup

Start by generating brand context:

```
Create brand context for my BaZi platform
```

This interactive wizard will configure:
- Platform name and approach
- Target audience and services
- Consultation philosophy and style
- Language preferences

### 3. Start a Consultation

Basic workflow:

```
User: "Calculate my BaZi chart"
→ Provide birth date/time/location

Agent: [Calculates Four Pillars]
→ Then suggest: "Would you like me to analyze your Day Master and life path?"

User: "Yes, and show me career guidance"
→ Agent provides personalized career analysis based on chart
```

## 📚 Skills Documentation

Each skill is fully documented with:
- **When to use** - Appropriate scenarios
- **What it does** - Functionality overview  
- **How to use** - Usage examples
- **Output format** - Detailed output structure
- **Best practices** - Guidelines and tips
- **Integration** - How it connects with other skills

See individual skill SKILL.md files in `.claude/skills/` for complete documentation.

## 🎨 Design Philosophy

### Neo-Zen Cyberpunk
Blending ancient Chinese aesthetics with modern design:

**Colors**:
- 🌳 Wood: Forest Green `#2D5016`
- 🔥 Fire: Cinnabar Red `#E63946`  
- ⛰️ Earth: Earthy Gold `#D4A574`
- ⚡ Metal: Silver `#C0C0C0`
- 💧 Water: Deep Blue `#1B263B`

**Typography**:
- Chinese: Noto Serif SC (traditional wisdom)
- English: Inter (modern readability)
- Data: JetBrains Mono (technical precision)

### Consultation Approach

**Empathetic & Balanced**:
- ✅ Warm and supportive tone
- ✅ Culturally respectful
- ✅ Evidence-based (reference chart specifics)
- ✅ Non-deterministic (emphasize free will)
- ✅ Actionable insights

**Avoid**:
- ❌ Absolute predictions about death or disaster
- ❌ Creating dependency or fear
- ❌ Overly technical without explanation
- ❌ Cultural insensitivity

## 🔧 Technical Stack

### Core Technologies
- **Lunar Calendar**: `lunar-javascript` for accurate calculations
- **Visualization**: ASCII art, Markdown tables, Mermaid diagrams
- **Reporting**: Markdown and optionally PDF/PNG exports

### Data Structure

```javascript
{
  personalInfo: { name, gender, birthDate, location },
  fourPillars: { year, month, day, hour },
  dayMaster: { stem, element, yinYang },
  elementsBalance: { wood, fire, earth, metal, water },
  luckCycles: [ /* 10-year cycles */ ],
  analysis: { /* interpretations */ }
}
```

## 📖 Example Workflows

### New Consultation
```
1. generate-brand-context (first time only)
2. calculate-bazi → Get birth info, generate Four Pillars
3. day-master-analysis → Core personality insights
4. five-elements-balance → Elemental overview
5. luck-cycle-forecast → Current and future periods
6. chart-visualizer → Create visual report
```

### Relationship Matching
```
1. calculate-bazi → For Person A
2. calculate-bazi → For Person B  
3. relationship-compatibility → Compare charts
4. chart-visualizer → Side-by-side visual comparison
```

### Career Guidance
```
1. calculate-bazi → Generate chart
2. five-elements-balance → Identify strengths
3. career-path-advisor → Match to careers
4. luck-cycle-forecast → Optimal timing for transitions
```

### Name Selection
```
1. calculate-bazi → For child
2. five-elements-balance → Identify needs
3. name-recommendation → Generate options with meanings
```

## 🌟 Best Practices

### Accuracy First
- ✅ Always confirm birth time accuracy
- ✅ Consider timezone and DST adjustments  
- ✅ Verify calculations against reference sources
- ✅ Document assumptions and methods

### Cultural Respect
- ✅ Use proper Chinese terminology with pinyin
- ✅ Explain traditional concepts accessibly
- ✅ Honor cultural significance
- ✅ Balance tradition with modernity

### Ethical Guidelines
- ✅ Emphasize personal agency and free will
- ✅ Frame challenges as growth opportunities
- ✅ Never make deterministic predictions about tragedy
- ✅ Maintain confidentiality and privacy
- ✅ Acknowledge limitations of astrology

### User Experience
- ✅ Start with strengths and positives
- ✅ Provide actionable, practical advice
- ✅ Use accessible language and examples
- ✅ Welcome questions and dialogue
- ✅ Adjust depth to user's familiarity level

## 📁 File Structure

```
bazi-agent/
├── CLAUDE.md                          # Main agent instructions
├── README.md                          # This file
└── .claude/
    ├── settings.json                  # Agent configuration
    └── skills/
        ├── generate-brand-context/    # Platform setup
        │   └── SKILL.md
        ├── calculate-bazi/            # Four Pillars calculation
        │   └── SKILL.md
        ├── day-master-analysis/       # Personality analysis
        │   └── SKILL.md
        ├── five-elements-balance/     # Element balance
        │   └── SKILL.md
        ├── luck-cycle-forecast/       # Timing and cycles
        │   └── SKILL.md
        ├── relationship-compatibility/ # Relationship matching
        │   └── SKILL.md
        ├── career-path-advisor/       # Career guidance
        │   └── SKILL.md
        ├── name-recommendation/       # Name selection
        │   └── SKILL.md
        └── chart-visualizer/          # Visual reports
            └── SKILL.md
```

## 🎓 Learning Resources

### BaZi Fundamentals
- **Four Pillars (四柱)**: Year, Month, Day, Hour stems and branches
- **Day Master (日主)**: Core self - Heavenly Stem of Day Pillar
- **Five Elements (五行)**: Wood, Fire, Earth, Metal, Water
- **Yin-Yang (阴阳)**: Balance between opposing forces
- **Luck Cycles (大运)**: 10-year periods of influence

### Element Relationships
- **Generating (相生)**: Water→Wood→Fire→Earth→Metal→Water
- **Controlling (相克)**: Water controls Fire, Fire controls Metal, etc.

### Interpretation Keys
- Element balance indicates life areas of strength/challenge
- Day Master reveals core personality and approach
- Luck cycles show timing for different life phases
- Relationships between elements predict interactions

## 🤝 Contributing

This template can be extended with additional skills:

**Future Skills Ideas**:
- **hidden-stems-analysis** - Deep dive into hidden stems
- **health-recommendations** - Health insights from elements
- **feng-shui-advisor** - Environment optimization
- **auspicious-date-selector** - Date selection for events (择日)
- **annual-forecast-detailed** - Month-by-month predictions
- **business-name-selector** - Company naming
- **life-stage-analysis** - Age-specific guidance

## 📝 License

This template is part of the SandAgent project. Refer to the main repository for licensing information.

## 🙏 Acknowledgments

Built with respect for traditional Chinese metaphysics and modern AI capabilities. Special thanks to the wisdom of countless BaZi masters throughout history.

---

**Philosophy**: 
> "命由天定，运由己造"  
> *Fate is given by heaven, but fortune is created by oneself.*

Let ancient wisdom illuminate the path forward. 🌟✨

---

**Created**: 2026-02-02  
**Template Version**: 1.0.0  
**Status**: ✅ Production Ready
