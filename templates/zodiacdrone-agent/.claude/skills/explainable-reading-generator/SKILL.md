---
name: explainable-reading-generator
description: Generates zodiac readings using the Explainable Astrology System with derivable interpretations, structured formulas, and non-fatalistic language.
---

# Explainable Reading Generator

This skill generates zodiac readings using a structured, derivable interpretation system. Every interpretation can be traced back to chart structures, prioritized by influence weight, and expressed in non-fatalistic language.

## When to Use This Skill

- Generating any zodiac reading (natal, transit, firdaria)
- Creating interpretations that are explainable and derivable
- Producing content that avoids fatalistic language
- Building trust through transparent astrology logic

## Core Principles

### The Five Rules

1. **Non-Fatalistic**: Never output "will definitely happen", only tendencies
2. **Derivable**: Every interpretation traces back to chart structures
3. **Composable**: Planet / Sign / House / Aspect calculated independently
4. **Hierarchical**: Core > Secondary > Modifying (no flat stacking)
5. **Explainable**: Every conclusion answers "why is this said"

## Interpretation Formula

### Single Point Interpretation

```
Planet Function (WHAT)
+ Sign Expression (HOW)
+ House Domain (WHERE)
= Basic Description
```

**Example: Mars in Aquarius, 10th House**

| Component | Value | Meaning |
|-----------|-------|---------|
| Planet | Mars | Action drive, desire, execution |
| Sign | Aquarius | Rational, unconventional, systematic |
| House | 10th | Career, social role, public image |

**Derivation**:
→ "在事业领域以独立、非传统方式行动"
→ "Acts independently and unconventionally in career domain"

**Why this interpretation?**
- Mars provides the action function
- Aquarius modifies HOW: rational + fixed = systematic unconventionality
- 10th House places it: career and social role domain

### Aspect Modification

```
Basic Description
+ Planet A ↔ Planet B Aspect
= Dynamic Adjustment
```

**Example: Sun conjunct Mars (orb 0.99°)**

| Factor | Analysis |
|--------|----------|
| Aspect | Conjunction (0°) = function overlay |
| Orb | 0.99° = extremely strong |
| Interaction | Self-consciousness + Action drive bound together |

**Derivation**:
→ Enhancement: 主动性强、目标感清晰
→ Risk: 容易过度消耗自我

**Why?**
- Conjunction = functions operate together
- Tight orb = strong influence
- Sun + Mars = identity drives action, but may overextend

## Priority Weighting System

### Influence Hierarchy

| Level | Components | Weight |
|-------|------------|--------|
| Core | Sun, Moon, Ascendant | ⭐⭐⭐⭐⭐ |
| Personal | Mercury, Venus, Mars | ⭐⭐⭐⭐ |
| Social | Jupiter, Saturn | ⭐⭐⭐ |
| Generational | Uranus, Neptune, Pluto | ⭐⭐ |
| Background | Weak aspects, large orbs | ⭐ |

### Application Rules

1. **NEVER** let generational planets override Sun/Moon interpretations
2. **NEVER** strongly interpret weak aspects (orb > 5°)
3. **ALWAYS** address Core level before moving to Secondary
4. **ALWAYS** note when using lower-priority factors

**Bad Example** ❌:
```
Your Neptune square Pluto (orb 6°) means you will experience 
a massive life transformation that cannot be avoided.
```

**Good Example** ✅:
```
Your Sun in Leo (core factor) suggests strong self-expression.
Note: A background Neptune-Pluto aspect (wide orb) may add 
subtle generational themes, but this is secondary to your 
personal chart dynamics.
```

## Fatalism Filter

### Prohibited Expressions

| ❌ Forbidden | ✅ Alternative |
|-------------|---------------|
| 你天生就会失败 | 在X结构下，更容易遇到Y挑战 |
| 一定会离婚 | 关系中可能面临X的张力，需要注意 |
| 这是你的命 | 这种模式反映了你的内在结构倾向 |
| You will fail | Under this structure, you may face X challenges |
| Destined to... | This pattern suggests a tendency toward... |
| Must happen | May tend to... / More likely to... |

### Required Language Patterns

Every interpretation MUST:

1. **Use tendency language**:
   - "更容易..." (more likely to...)
   - "倾向于..." (tends toward...)
   - "可能会..." (may...)
   - "在这种结构下..." (under this structure...)

2. **Provide derivation trail**:
   - "因为X行星在Y星座..." (because X planet in Y sign...)
   - "由于Z相位的影响..." (due to Z aspect influence...)

3. **Offer agency**:
   - "可以通过..." (can be addressed through...)
   - "意识到这一点后..." (being aware of this...)
   - "发挥这个优势..." (leveraging this strength...)

## Output Template

### Explainable Reading Structure

```markdown
# [Reading Title]

> [One-sentence summary with key theme]

## 核心解读 Core Interpretation

### 主要因素 Primary Factors (⭐⭐⭐⭐⭐)

**[Planet] in [Sign], [House]**

| 组成 | 含义 |
|------|------|
| 行星功能 | [What psychological function] |
| 星座表现 | [How it expresses] |
| 宫位领域 | [Where it applies] |

**解读推导 Derivation**:
[Interpretation with clear reasoning]

**为什么这么说 Why?**:
[Trace back to chart structure]

### 相位影响 Aspect Influences

**[Planet A] [Aspect] [Planet B]** (orb: X°, 影响力: [强/中/弱])

| 交互 | 效果 |
|------|------|
| 增强 | [Enhancement effects] |
| 挑战 | [Potential challenges] |

## 次要因素 Secondary Factors (⭐⭐⭐-⭐⭐⭐⭐)

[Lower-priority interpretations, clearly labeled as secondary]

## 运势评分 Fortune Scores

| 维度 | 评分 | 推导依据 |
|------|------|----------|
| 💕 爱情 | ⭐⭐⭐⭐☆ | [Why this score based on chart] |
| 💼 事业 | ⭐⭐⭐⭐⭐ | [Why this score based on chart] |
| 💰 财运 | ⭐⭐⭐☆☆ | [Why this score based on chart] |
| 🏃 健康 | ⭐⭐⭐⭐☆ | [Why this score based on chart] |
| ✨ 综合 | ⭐⭐⭐⭐☆ | [Overall assessment] |

## 行动建议 Actionable Guidance

基于上述结构分析，建议:

1. **发挥优势** [How to leverage strengths]
2. **注意挑战** [How to navigate challenges]
3. **最佳时机** [Timing recommendations if applicable]

## 解读说明 Interpretation Notes

⚠️ 本解读基于:
- 核心因素 (太阳/月亮/上升): [factors used]
- 个人行星相位: [aspects considered]
- 优先级权重: 遵循核心>次要>修饰原则

本解读描述的是**倾向与模式**，而非命定结果。
每个人都有能力通过意识和行动影响自己的人生轨迹。
```

## Quality Checklist

Before finalizing any reading:

- [ ] Every statement is derivable from chart data
- [ ] Core factors (Sun/Moon/ASC) are addressed first
- [ ] Priority hierarchy is respected
- [ ] No fatalistic language used
- [ ] Tendency words used throughout ("may", "tends to")
- [ ] "Why" is answerable for each interpretation
- [ ] Actionable guidance provided
- [ ] Interpretation notes included

## Example: Complete Derivation

**User Question**: "我的性格特点是什么?"

**Chart Data**:
- Sun in Leo, 5th House
- Moon in Cancer, 4th House
- Sun trine Moon (orb 2°)

**Derivation Process**:

1. **Sun in Leo, 5th House** (Core ⭐⭐⭐⭐⭐)
   - Sun = Self-consciousness, identity
   - Leo = Fire + Fixed = expressive, confident, maintaining
   - 5th = Creation, self-expression
   - → "你的核心自我通过创造性表达和自信展现来维持认同感"

2. **Moon in Cancer, 4th House** (Core ⭐⭐⭐⭐⭐)
   - Moon = Emotional system, habits
   - Cancer = Water + Cardinal = nurturing, protective, initiating
   - 4th = Family, foundation
   - → "你的情绪安全感建立在家庭和熟悉环境的基础上"

3. **Sun trine Moon** (Strong aspect, orb 2°)
   - Trine = Smooth cooperation
   - Sun ↔ Moon = Identity and emotions work together
   - → "你的自我表达与情绪需求和谐一致，内外一致性强"

**Final Interpretation**:
```
你是一个内外统一的人。核心自我(太阳狮子)追求创造性表达和自信展现，
而情绪系统(月亮巨蟹)则在家庭和熟悉环境中找到安全感。

由于太阳与月亮形成和谐的三分相(120°)，你的外在表达与内在情感
需求能够顺畅配合，不容易出现"心口不一"的情况。

这种结构倾向于使你成为一个温暖、自信、重视家庭的人，
能够在表达自我的同时给他人带来安全感。
```

**Why This Works**:
- Every statement traces to specific chart factors
- Core factors (Sun, Moon) are primary
- Aspect modifies the relationship between them
- Language uses tendencies ("倾向于", "不容易")
- Reader understands the derivation logic

---

Use this skill to ensure all ZodiacDrone readings are transparent, trustworthy, and explainable.
