---
name: calculate-bazi
description: Calculate Four Pillars (四柱) from birth date/time using lunar calendar conversion. Foundation skill for all BaZi analysis.
---

# Calculate BaZi

This skill calculates the Four Pillars (四柱 Sì Zhù) - the foundation of all BaZi fortune analysis. It converts birth date/time to the traditional Chinese lunar calendar and determines the Heavenly Stems (天干) and Earthly Branches (地支) for each pillar.

## When to Use This Skill

- **New consultation**: Starting any BaZi analysis
- **Verification**: Double-checking existing calculations
- **Batch processing**: Calculating charts for multiple people
- **Compatibility analysis**: Preparing charts for relationship matching

## What This Skill Does

1. **Lunar Calendar Conversion**: Converts Gregorian date to Chinese lunar calendar
2. **Four Pillars Calculation**: Determines Year, Month, Day, Hour pillars
3. **Hidden Stems Extraction**: Identifies Hidden Stems (地支藏干) in each Earthly Branch
4. **Day Master Identification**: Identifies the Heavenly Stem of Day Pillar (日主)
5. **Luck Cycle Setup**: Calculates 10-year luck cycle starting points (大运)
6. **Data Validation**: Verifies calculation accuracy and completeness

## Required Information

### Essential
- **Birth Date**: Year, Month, Day (Gregorian or Chinese)
- **Birth Time**: Hour and minute (as accurate as possible)
- **Gender**: Male (阳) or Female (阴) - affects luck cycle direction

### Recommended
- **Birth Location**: For timezone and local solar time adjustment
- **Birth Country**: For historical timezone rules
- **Name**: For personalized reporting

## How to Use

### Basic Calculation
```
Calculate BaZi for:
- Born: 1990年1月15日 18:30
- Gender: Male
- Location: Beijing, China
```

### With English Date
```
Calculate Four Pillars for someone born:
- Date: January 15, 1990
- Time: 6:30 PM
- Gender: Female
- Location: San Francisco, USA
```

### Multiple People
```
Calculate BaZi for compatibility analysis:

Person A:
- Born: 1988年3月22日 14:00
- Gender: Male
- Location: Shanghai

Person B:
- Born: 1990年7月8日 09:15
- Gender: Female
- Location: Beijing
```

## Output Format

### Four Pillars Display

```
八字命盘 (BaZi Chart)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

姓名：[Name]
性别：[Gender]
公历：1990年1月15日 18:30
农历：己巳年 腊月十九 酉时

┌─────┬─────┬─────┬─────┐
│ 年柱 │ 月柱 │ 日柱 │ 时柱 │
│Year │Month│ Day │Hour │
├─────┼─────┼─────┼─────┤
│ 己  │ 丁  │ 甲  │ 癸  │
│ 土  │ 火  │ 木  │ 水  │
├─────┼─────┼─────┼─────┤
│ 巳  │ 丑  │ 子  │ 酉  │
│ 火  │ 土  │ 水  │ 金  │
└─────┴─────┴─────┴─────┘

日主：甲木 (Day Master: Wood)
命格：[Pattern classification]

地支藏干 (Hidden Stems):
- 巳 (Fire): 庚金, 丙火, 戊土
- 丑 (Earth): 己土, 癸水, 辛金
- 子 (Water): 癸水
- 酉 (Metal): 辛金

五行统计 (Five Elements Count):
木 (Wood): 1
火 (Fire): 2
土 (Earth): 3
金 (Metal): 2
水 (Water): 3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### JSON Data Structure

```json
{
  "personalInfo": {
    "name": "User Name",
    "gender": "male",
    "birthDate": {
      "gregorian": "1990-01-15T18:30:00+08:00",
      "lunar": "己巳年腊月十九酉时",
      "year": 1990,
      "month": 1,
      "day": 15,
      "hour": 18,
      "minute": 30,
      "timezone": "+08:00"
    },
    "location": "Beijing, China"
  },
  "fourPillars": {
    "year": {
      "stem": "己",
      "branch": "巳",
      "element": {
        "stem": "土",
        "branch": "火"
      },
      "hiddenStems": ["庚", "丙", "戊"]
    },
    "month": {
      "stem": "丁",
      "branch": "丑",
      "element": {
        "stem": "火",
        "branch": "土"
      },
      "hiddenStems": ["己", "癸", "辛"]
    },
    "day": {
      "stem": "甲",
      "branch": "子",
      "element": {
        "stem": "木",
        "branch": "水"
      },
      "hiddenStems": ["癸"]
    },
    "hour": {
      "stem": "癸",
      "branch": "酉",
      "element": {
        "stem": "水",
        "branch": "金"
      },
      "hiddenStems": ["辛"]
    }
  },
  "dayMaster": {
    "stem": "甲",
    "element": "木",
    "yinYang": "阳"
  },
  "elementsBalance": {
    "wood": 1,
    "fire": 2,
    "earth": 3,
    "metal": 2,
    "water": 3
  },
  "luckCycle": {
    "direction": "forward",
    "startAge": 3,
    "cycles": [...]
  }
}
```

## Technical Details

### Calculation Steps

1. **Timezone Adjustment**
   - Convert to local solar time
   - Account for daylight saving (if applicable)
   - Adjust for geographic longitude

2. **Lunar Calendar Conversion**
   - Map Gregorian date to Chinese lunar date
   - Identify solar term (节气) for month pillar
   - Determine correct year boundary (立春 vs. 正月初一)

3. **Pillar Derivation**
   - **Year Pillar**: Based on year of 立春 (Start of Spring)
   - **Month Pillar**: Based on solar term of birth month
   - **Day Pillar**: Use万年历 (perpetual calendar) lookup
   - **Hour Pillar**: Divide day into 12 two-hour periods

4. **Hidden Stems Extraction**
   - Each Earthly Branch contains 1-3 Hidden Stems
   - Primary, middle, and residual stems have different influence strengths

5. **Luck Cycle Calculation**
   - Male Yang year or Female Yin year: Forward direction
   - Male Yin year or Female Yang year: Backward direction
   - Calculate starting age based on birth proximity to solar term

### Edge Cases

**Midnight Births (23:00-01:00)**
- 23:00-24:00: Previous day's Hour Pillar (子时)
- 00:00-01:00: Current day's Hour Pillar (子时)
- Always confirm with user which "night" they remember

**Near Solar Term Births**
- Month pillar changes at solar term, not lunar month
- Verify exact solar term timestamp for boundary dates

**Historical Timezone Changes**
- Use historical timezone rules for older birth dates
- Pre-1949 China: Use local solar time
- 1949-1986: Single China timezone established
- Post-1986: Modern timezone rules

**Leap Months (闰月)**
- Lunar calendar occasionally has 13 months
- Use the same solar term rules for month pillar
- Document leap month in lunar date notation

## Best Practices

### Accuracy Checks
- ✅ Verify birth time with user (exact time, AM/PM, timezone)
- ✅ Confirm location for timezone adjustment
- ✅ Cross-reference with perpetual calendar (万年历)
- ✅ Validate elemental counts add up correctly
- ✅ Check Hidden Stems match standard references

### User Communication
- Explain why accurate birth time matters
- Offer to calculate with time range if uncertain
- Mention common time recording issues (hospital clock vs. actual, DST)
- Provide calculation breakdown for transparency

### Data Storage
- Save calculation details in `./output/charts/[name]-[date].json`
- Keep human-readable version in `.md` format
- Include metadata (calculation date, version, method)
- Store source data (raw input) separately

## Common Issues & Solutions

**Issue**: Birth time unknown
**Solution**: Calculate for 12:00 noon (default) and note uncertainty. Offer range analysis.

**Issue**: Born in different country, different timezone
**Solution**: Use historical timezone database (e.g., IANA TZ). Explicitly state assumptions.

**Issue**: Conflicting lunar calendar sources
**Solution**: Use authoritative source (中国科学院紫金山天文台). Document methodology.

**Issue**: Leap month confusion
**Solution**: Always verify with solar term. Leap months don't affect month pillar.

## Implementation

### Core Library
This skill uses the shared **BaZi Core Library** located at `.claude/lib/bazi_core.py`.

**Python API**:
```python
from lib.bazi_core import BaZiCalculator

calculator = BaZiCalculator()
result = calculator.calculate_bazi(
    birth_date="1990-05-15",  # Format: YYYY-MM-DD
    birth_time="10:00",        # Format: HH:MM
    location="北京"            # Optional, default: 北京
)

# Access results
print(result['four_pillars'])
print(result['day_master'])
print(result['elements_balance'])
```

**Command Line**:
```bash
# Basic usage
python /bunny-agent/.claude/lib/bazi_core.py 1990-05-15 10:00 北京

# With JSON output
python /bunny-agent/.claude/lib/bazi_core.py 1990-05-15 10:00 北京 --json
```

### Manual Verification
- Cross-check with online 万年历 (perpetual calendar)
- Verify against printed BaZi almanacs
- Use multiple sources for critical consultations

## Output Files

After calculation, generates:
- `./output/charts/[name]-bazi-[YYYYMMDD].json` - Complete data
- `./output/charts/[name]-bazi-[YYYYMMDD].md` - Readable format
- `./output/charts/[name]-bazi-[YYYYMMDD].txt` - Plain text for printing

## Next Steps

After calculating BaZi:
1. ✅ **Verify accuracy** with user
2. ➡️ **day-master-analysis**: Analyze core personality
3. ➡️ **five-elements-balance**: Examine elemental distribution
4. ➡️ **luck-cycle-forecast**: Interpret timing and trends

---

**Principle**: 差之毫厘，谬以千里 - A tiny error in calculation leads to vastly different conclusions. Accuracy is paramount.
