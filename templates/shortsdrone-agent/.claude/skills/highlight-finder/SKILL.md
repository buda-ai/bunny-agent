---
name: highlight-finder
description: Analyze transcripts to identify the most engaging, quotable, or viral-worthy segments for short video clips.
---

# Highlight Finder

This skill analyzes video transcripts to identify the best segments for creating engaging short videos.

## When to Use This Skill

- After transcription is complete
- Want to find the best clips automatically
- Looking for viral-worthy moments
- Need help selecting which parts to extract

## What This Skill Does

1. **Analyze Content**: Reviews transcript for engagement signals
2. **Score Segments**: Rates segments by viral potential
3. **Find Hooks**: Identifies strong opening statements
4. **Detect Patterns**: Finds stories, insights, quotes, humor

## How to Use

### Find All Highlights

```
Find the best clips from: ./output/transcripts/VIDEO_ID.json
```

### With Specific Focus

```
Find the funniest moments in the video
Find educational segments under 60 seconds
Find controversial or opinion statements
```

## Instructions

When analyzing for highlights:

### Step 1: Load Transcript

```bash
cat ./output/transcripts/VIDEO_ID.json
```

### Step 2: Analyze Content

Look for these engagement signals:

**Strong Hooks** (Great for video openings):
- Questions that provoke curiosity
- Surprising statements or statistics
- Controversial opinions
- "Secret" or "tip" language
- Personal stories beginning

**High-Value Segments**:
- Clear, actionable advice
- Relatable experiences
- Emotional moments
- Humor and wit
- Unique insights

**Segment Criteria**:
- Self-contained (doesn't require context)
- 15-60 seconds in length
- Clear audio (no overlapping speech)
- Strong start and natural end

### Step 3: Score and Rank

Rate each potential clip:
- **Hook Strength**: 1-10 (how attention-grabbing is the start?)
- **Content Value**: 1-10 (how useful/entertaining?)
- **Standalone Score**: 1-10 (works without context?)
- **Shareability**: 1-10 (would people share this?)

### Step 4: Present Recommendations

```markdown
## 🎯 Top Clip Recommendations

### Clip 1: "The Secret to..." (⭐ Score: 9.2/10)
**Timestamp**: 02:34 - 03:15 (41 seconds)
**Hook**: "Nobody tells you this, but..."
**Why it works**: Strong curiosity hook + actionable advice
**Transcript preview**:
> "Nobody tells you this, but the real secret to productivity isn't about working harder..."

---

### Clip 2: "Personal Story" (⭐ Score: 8.7/10)
**Timestamp**: 08:12 - 09:01 (49 seconds)
**Hook**: "When I first started, I made this huge mistake..."
**Why it works**: Relatable failure story + lesson learned
**Transcript preview**:
> "When I first started, I made this huge mistake that cost me everything..."

---

### Clip 3: "Hot Take" (⭐ Score: 8.5/10)
**Timestamp**: 15:22 - 16:05 (43 seconds)
**Hook**: "Here's why everyone is wrong about..."
**Why it works**: Controversial opinion + generates discussion
**Transcript preview**:
> "Here's why everyone is wrong about remote work..."

---

## Summary

| # | Timestamp | Duration | Hook Type | Score |
|---|-----------|----------|-----------|-------|
| 1 | 02:34-03:15 | 41s | Curiosity | 9.2 |
| 2 | 08:12-09:01 | 49s | Story | 8.7 |
| 3 | 15:22-16:05 | 43s | Controversy | 8.5 |

**Next step**: Tell me which clip(s) you want to create, or say "create all" to generate all recommended shorts.
```

## Output

Saves analysis to: `./output/transcripts/{video_id}_highlights.json`

```json
{
  "video_id": "VIDEO_ID",
  "analyzed_at": "2024-01-01T12:00:00Z",
  "total_duration": 600,
  "highlights": [
    {
      "rank": 1,
      "start": 154,
      "end": 195,
      "duration": 41,
      "hook_type": "curiosity",
      "score": 9.2,
      "transcript": "Nobody tells you this...",
      "recommended": true
    }
  ]
}
```

## Engagement Patterns to Look For

1. **The Hook**: Questions, surprises, promises
2. **The Story**: Personal anecdotes, transformations
3. **The Insight**: Unique perspectives, "aha" moments
4. **The List**: Tips, steps, frameworks
5. **The Quote**: Memorable one-liners
6. **The Emotion**: Humor, inspiration, controversy
