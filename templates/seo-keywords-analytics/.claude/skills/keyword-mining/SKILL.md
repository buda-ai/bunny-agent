---
name: keyword-mining
description: Analyzes Google Search Console data to extract core keywords, identify strategic opportunities (quick wins, CTR gaps, growth keywords), and generate actionable SEO reports with priority scoring and topic clusters. CRITICAL: This skill MUST be invoked for ANY keyword analysis request - do not call MCP tools directly.
---

# Keyword Mining

## IMPORTANT: When This Skill Should Be Used

**This skill is the ONLY way to perform keyword analysis.**

**MANDATORY**: Invoke this skill when the user asks for:
- "分析关键词" / "关键词情况" / "analyze keywords"
- "挖掘关键词" / "keyword mining"
- "GSC分析" / "GSC analysis" / "search console analysis"
- "搜索表现" / "search performance"
- "识别关键词机会" / "identify keyword opportunities"
- "关键词策略报告" / "keyword strategy report"

**DO NOT skip this skill** and directly call `gsc_search_analytics` MCP tool. The skill manages:
- Safe 14-day default data range (avoids rowLimit issues)
- Proper data validation and error handling
- Strategic analysis requirements
- Report language detection and generation

This skill performs comprehensive keyword analysis using Google Search Console data to extract core keywords, identify strategic opportunities, and generate prioritized reports for SEO decision-making.

**CRITICAL**: You are acting as an expert SEO analyst, NOT a data processing tool. Your goal is to provide **strategic insights and actionable recommendations**, not just data tables.

## When to Use This Skill

**Trigger Keywords**: When user asks to:
- "analyze keywords" / "关键词分析"
- "keyword mining" / "挖掘关键词"
- "GSC analysis" / "GSC数据分析"
- "search console report" / "搜索分析报告"
- "identify keyword opportunities" / "识别关键词机会"
- "keyword strategy report" / "关键词策略报告"

**Use Cases**:
- Generating keyword strategy reports
- Identifying website's core keyword themes
- Mining untapped keyword opportunities
- Creating data-driven SEO roadmaps
- Understanding keyword performance and intent
- Prioritizing keywords for content strategy
- Building topic cluster strategies

## What This Skill Does

1. **Core Keyword Extraction**: Identifies primary keywords driving search visibility
2. **Opportunity Mining**: Discovers high-potential keywords (quick wins, CTR gaps, growth keywords)
3. **Intent Mapping**: Classifies keywords by search intent (informational, commercial, transactional)
4. **Cluster Creation**: Groups related keywords into topic themes
5. **Priority Scoring**: Ranks keywords by potential impact and effort
6. **Gap Analysis**: Identifies missing keyword coverage
7. **Strategic Reporting**: Generates actionable keyword reports

## Analysis Depth Requirements

**CRITICAL MINDSET**: Think like an SEO consultant reviewing a client's data. For EVERY finding:

### Required Analysis Depth

For EACH significant opportunity you identify, you MUST provide:

1. **Why It Matters**: Explain the business impact in specific terms
   - ❌ BAD: "High impression keyword"
   - ✅ GOOD: "9,977 impressions at position 5 but only 2 clicks - this is a MASSIVE anomaly indicating the page ranking doesn't match user intent or has a misleading title"

2. **Root Cause Analysis**: Diagnose WHY the opportunity exists
   - ❌ BAD: "Low CTR"
   - ✅ GOOD: "CTR is 0.02% vs expected 7-9% for position 5. Likely causes: (1) Wrong page ranking for this query, (2) Title doesn't match search intent, (3) URL may not match user expectation"

3. **Specific Action Items**: Provide concrete, implementable steps
   - ❌ BAD: "Optimize title tag"
   - ✅ GOOD: "Update title from 'Bika - Automation' to 'AI-Powered Telegram Bot Builder | Bika.ai' to emphasize key value prop and include primary keyword naturally"

4. **Expected Outcomes**: Give specific estimates with reasoning
   - ❌ BAD: "Should improve traffic"
   - ✅ GOOD: "Moving from position 12 to position 6-8 could increase CTR from 0.8% to 4-5%, resulting in ~10-12 additional clicks per week (+500% increase)"

5. **Business Context**: Connect findings to existing content/pages
   - ❌ BAD: "Create content for this keyword"
   - ✅ GOOD: "You already have `/template/ai-batch-image-recognition` ranking at position 10! This is a quick win - optimize the existing page by adding '图片识别' to the title and creating a FAQ section"

### Analysis Quality Standards

**Always explain the "So What?"**:
- Don't just show data - interpret it
- Connect patterns across keywords
- Identify anomalies and investigate them
- Consider competitive landscape
- Think about user intent and journey

**Be specific and actionable**:
- Reference actual URLs/pages when possible
- Suggest exact title rewrites, not just "improve title"
- Explain why a keyword is important to THIS specific business
- Prioritize based on effort vs impact trade-offs

**Think strategically**:
- Group related opportunities into campaigns
- Consider resource constraints
- Flag high-priority items as "URGENT" with justification
- Suggest testing approaches for uncertain opportunities

## How to Use

### Full Keyword Analysis

```
Generate keyword analysis report for [URL]
Mine keywords from my GSC data
Create keyword strategy report
```

### Targeted Analysis

```
Find core keywords driving traffic
Identify quick win opportunities
Show me keyword gaps in my content
```

### Strategic Planning

```
Build keyword clusters for content strategy
Prioritize keywords for next quarter
Map keywords to content funnel stages
```

## Data Requirements

**Primary Method (Recommended)**: Real-time GSC API via MCP
- Fetch data directly from Google Search Console using MCP tools
- **SAFE DEFAULT**: Last 14 days (prevents hitting rowLimit on high-traffic sites)
- **IMPORTANT**: MCP has a `rowLimit: 25000` hard constraint
  - Start with 14 days to assess data volume
  - If rows < 10K: can extend to 30 days
  - If rows > 20K: keep to 14 days or use 7-day chunks
  - NEVER fetch 90+ days in single request
- Automatically includes Query, Clicks, Impressions, CTR, Position, Page

**Fallback Method**: Local CSV Export
- Use only if MCP is unavailable or user provides specific CSV
- CSV location: `./data/gsc-export-YYYY-MM-DD.csv`
- Required fields: Query, Clicks, Impressions, CTR, Position, Page (URL)

## Report Language

**Auto-detect from user request**: The report language must match the language of the user's request
- If user asks in Chinese → Generate report in Chinese
- If user asks in English → Generate report in English
- If user asks in other languages → Generate report in that language
- Apply to ALL sections: executive summary, analysis, recommendations, and action items

## Mining Process

### 1. Data Loading and Validation

**CRITICAL: Always prefer MCP over local CSV files!**

**Step A: Try MCP First (Primary Method)**

When user requests analysis without specifying a CSV file:
1. Ask for the website URL if not provided
2. **CRITICAL - Start with 14-day range to avoid rowLimit issues**
   - Default: Last 14 days (safer than 30 days for high-traffic sites)
   - If 14 days has < 10,000 rows, can extend to 30 days
   - If 14 days has > 20,000 rows, stick to 7-14 day range
3. **Handle rowLimit constraint**: MCP max rows = 25000
   - **NEVER fetch 90+ days in one call** - this will hit the limit
   - Start conservative (14 days), check data volume, then adjust
   - If you need longer period, fetch in weekly chunks and analyze separately
4. **NEW - Use MCP-side filtering to reduce tokens**:
   - Set `rowLimit: 10000` (balanced - covers most valuable keywords)
   - Use `dimensions: "query,page"` (minimum required - more dimensions = more data)
   - Consider `type: "web"` only (skip image/video/news unless specifically requested)
   - After fetch, if rows == 10000 (hit limit), can increase to 15000 or reduce date range
5. Dimensions: query, page (minimum required)

**Step B: DATA PRE-FILTERING (NEW - CRITICAL for performance)**

After fetching data, ALWAYS pre-filter to reduce processing load:

```bash
# PROGRESS: Step 1/4 - Pre-filtering data...
echo "⏳ [1/4] Pre-filtering data to reduce processing load..."

# Extract rows and save filtered version
cat mcp-response.json | jq '.[0].text' | jq '.rows' > raw-rows.json

# Count total rows
TOTAL_ROWS=$(cat raw-rows.json | jq '. | length')
echo "   📊 Total rows fetched: $TOTAL_ROWS"

# Apply value-based filters to reduce dataset:
# - Keep only keywords with >= 10 impressions (removes very long tail noise)
# - Keep only keywords with position <= 100 (include more ranking keywords)
cat raw-rows.json | jq '[.[] | select(.impressions >= 10 and .position <= 100)]' > filtered-rows.json

FILTERED_ROWS=$(cat filtered-rows.json | jq '. | length')
REMOVED_ROWS=$((TOTAL_ROWS - FILTERED_ROWS))
echo "   ✅ Filtered to $FILTERED_ROWS rows (removed $REMOVED_ROWS low-value rows)"
echo "   💾 Using filtered data for all subsequent analysis"
```

**Pre-filtering Benefits**:
- Reduces jq processing time by 40-60%
- Focuses analysis on high-value keywords
- Prevents timeout on large datasets
- Still captures all meaningful opportunities

**Example MCP call pattern - SAFE APPROACH (Token-Optimized)**:
```
# Step 1: Start with 14 days + ADAPTIVE rowLimit
Use gsc_search_analytics to fetch data for:
- Site: https://example.com
- Start date: [14 days ago]
- End date: [today]
- Dimensions: query, page
- Row limit: 10000 (balanced - good coverage without excessive tokens)
- Type: web (skip image/video unless requested)

# Step 2: Check result and ADAPT if needed
After receiving data, check actual rows:
├─ If rows == 10000 (hit limit)
│  └─ Option A: Increase rowLimit to 15000 and refetch
│  └─ Option B: Reduce to 7-day range for better coverage
│  └─ Option C: Proceed with 10000 (covers most valuable keywords)
│
├─ If rows 5000-9999 (excellent coverage)
│  └─ ✅ Proceed: This is optimal for comprehensive analysis
│
└─ If rows < 5000 (light coverage)
   └─ Can extend to 21-30 days if more historical data needed

# Step 3: Client-side pre-filtering
After fetch, filter for: impressions >= 10 AND position <= 100
This removes very low-value noise while preserving most opportunities
Note: If filtered results are still < 100 keywords, further relax to impressions >= 5

# Decision Matrix:
┌─────────────┬──────────┬─────────────────────────────────┐
| Actual Rows | Coverage | Action                          │
├─────────────┼──────────┼─────────────────────────────────┤
| 10000 (hit) | ~70-85%  │ Can extend to 15000 for more   │
| 5000-9999   | ~85-95%  │ ✅ Excellent - proceed         │
| <5000       | ~95-100% │ ✅ Complete - can extend days  │
└─────────────┴──────────┴─────────────────────────────────┘
```

**Key Insight**: 10000 rows captures 85-95% of valuable keywords while keeping token usage reasonable. Using impressions >= 10 and position <= 100 captures a comprehensive set including emerging opportunities.

**Step B: Fallback to CSV (Only if MCP fails or user specifies CSV)**

Only check for local CSV if:
- MCP tools are not available
- MCP fetch fails with error
- User explicitly says "use the CSV file" or "analyze the data in ./data/"

```bash
# Check for GSC data file (ONLY as fallback)
ls -la ./data/gsc-export-*.csv

# Validate data completeness
head -50 ./data/gsc-export-*.csv
```

Verify:
- Required fields present (Query, Clicks, Impressions, CTR, Position)
- Sufficient data volume (> 100 queries)
- Date range specified

### 2. PARALLEL ANALYSIS (NEW - Critical for performance)

**CRITICAL**: Execute analysis tasks in parallel using background processes to reduce total execution time from 30+ minutes to 5-10 minutes.

```bash
# PROGRESS: Step 2/4 - Running parallel analysis...
echo "⏳ [2/4] Running parallel analysis (4 tasks)..."
echo "   🔄 This will run multiple analyses simultaneously to save time"
echo ""

# Create output directory for intermediate results
mkdir -p ./analysis-cache

# Run ALL analysis tasks in parallel using background jobs (&)
# Each task saves results to a separate cache file

# Task A: Core Keywords Analysis
echo "   ▶ Task 1/4: Extracting core keywords..."
(cat filtered-rows.json | jq -r '.[] | "\(.keys[0])|\(.clicks)|\(.impressions)|\(.ctr*100)|\(.position)"' | \
  sort -t'|' -k2 -nr | head -30 > ./analysis-cache/core-keywords.txt) &
PID_CORE=$!

# Task B: Quick Wins (Page 2 Rankings)
echo "   ▶ Task 2/4: Identifying quick wins..."
(cat filtered-rows.json | jq -r '.[] | select(.position > 10 and .position < 20 and .impressions >= 100) | "\(.keys[0])|\(.position)|\(.impressions)|\(.clicks)|\(.keys[1])"' | \
  sort -t'|' -k3 -nr | head -20 > ./analysis-cache/quick-wins.txt) &
PID_QUICK=$!

# Task C: CTR Opportunities
echo "   ▶ Task 3/4: Finding CTR optimization opportunities..."
(cat filtered-rows.json | jq -r '.[] | select(.position <= 10 and .impressions >= 500) | "\(.keys[0])|\(.position)|\(.impressions)|\(.ctr*100)|\(.keys[1])"' | \
  awk -F'|' 'BEGIN{bench[1]=28;bench[2]=18;bench[3]=11;bench[4]=8;bench[5]=7;bench[6]=5;bench[7]=4;bench[8]=3;bench[9]=2;bench[10]=1.5}
    {pos=int($2);exp=bench[pos];if(exp && $4<exp*0.7) print $0}' > ./analysis-cache/ctr-ops.txt) &
PID_CTR=$!

# Task D: High Volume Keywords
echo "   ▶ Task 4/4: Identifying high-volume opportunities..."
(cat filtered-rows.json | jq -r '.[] | select(.impressions >= 1000) | "\(.keys[0])|\(.impressions)|\(.position)|\(.clicks)|\(.keys[1])"' | \
  sort -t'|' -k2 -nr | head -30 > ./analysis-cache/high-volume.txt) &
PID_VOL=$!

echo "   ⏸️  All tasks started. Waiting for completion..."

# Wait for all tasks and show completion
wait $PID_CORE && echo "   ✅ Task 1/4 complete: Core keywords"
wait $PID_QUICK && echo "   ✅ Task 2/4 complete: Quick wins"
wait $PID_CTR && echo "   ✅ Task 3/4 complete: CTR opportunities"
wait $PID_VOL && echo "   ✅ Task 4/4 complete: High volume analysis"

echo ""
echo "   🎉 All parallel analysis tasks completed!"
echo "   📂 Results cached in ./analysis-cache/"
```

**Parallel Processing Benefits**:
- **4x faster** than sequential processing
- Reduces total analysis time from 20-30 minutes to 5-10 minutes
- Each analysis runs independently in the background
- Results cached for reuse during report generation

**Progress Tracking Pattern**:
```bash
# Always show progress with these emojis:
echo "⏳ [Step X/Total] Description..."    # In progress
echo "   ▶ Subtask N/M: Details..."        # Starting subtask
echo "   ✅ Task complete"                  # Finished
echo "🎉 All tasks completed!"              # All done
echo "📊 Result: X rows, Y keywords"        # Summary
echo "💾 Saved to: ./path/to/file"         # Location
```

### 3. Extract Core Keywords (Using Cached Results)

```markdown
## Core Keyword Identification

### Primary Traffic Drivers

Keywords generating majority of your organic clicks:

| Keyword | Clicks | Impressions | CTR | Position | Value |
|---------|--------|-------------|-----|----------|-------|
| [keyword] | [X] | [X] | [X%] | [X] | ⭐⭐⭐⭐⭐ |

**Analysis**:
- Total core keywords: [X]
- Combined clicks: [X] ([Y]% of total)
- Average position: [X]
- Average CTR: [X%]

**Theme Identification**:
- Theme 1: [Topic] ([X] keywords, [Y] clicks)
- Theme 2: [Topic] ([X] keywords, [Y] clicks)
```

### 3. Classify Keywords by Intent (Using Filtered Data)

```markdown
## Keyword Intent Analysis

| Intent | Keywords | Clicks | Avg CTR | Avg Position | Strategy |
|--------|----------|--------|---------|--------------|----------|
| Informational | [X] | [X] | [X%] | [X] | Educational content |
| Commercial | [X] | [X] | [X%] | [X] | Comparison content |
| Transactional | [X] | [X] | [X%] | [X] | Product pages |
| Navigational | [X] | [X] | [X%] | [X] | Brand pages |

### Intent Patterns

**Informational** (what, how, why, guide):
- [query examples]
- Content need: Comprehensive guides, tutorials

**Commercial** (best, review, vs, compare):
- [query examples]
- Content need: Comparisons, reviews, case studies

**Transactional** (buy, price, discount):
- [query examples]
- Content need: Product pages, pricing, CTAs
```

### 4. Mine Keyword Opportunities (Using Cached Results)

**CRITICAL**: For each opportunity type, you MUST provide detailed analysis, not just tables!

```markdown
## Keyword Opportunity Mining

### Priority 1: Quick Wins (Page 2 Rankings)

**Criteria**: Position 11-20, Impressions > 100/month

These keywords rank positions 11-20 with decent impression volume. Small optimizations (title tags, content updates, internal linking) could push them to page 1.

| Query | Position | Impressions | Current Clicks | Potential Clicks* | Impact |
|-------|----------|-------------|----------------|-------------------|--------|
| [keyword] | [15] | [X] | [X] | [~Y] | +Z clicks |

*Potential clicks calculated based on moving from position 11-20 to position 6-10 (3-5% CTR)

**REQUIRED FOR EACH TOP QUICK WIN** (pick top 3-5):

**[Keyword Name]** (Impressions: X, Position: Y)
- Current: X clicks/week (Y% CTR)
- Potential at position 6-8: ~Z clicks/week (W% CTR)
- **Gain: +N clicks/week (+M%)**

**Root Cause**: [Why is it stuck at position 12-15? Thin content? Weak backlinks? Missing keywords in title?]

**Action Items**:
1. [Specific action with the actual page URL if possible]
2. [Concrete recommendation, not generic advice]
3. [Expected timeline and success metrics]

**Example of GOOD analysis**:
> **"twitter automation"** (247 impressions, position 12.35)
> - Current: 2 clicks/week (0.81% CTR)
> - Potential at position 8: ~12 clicks/week (5% CTR)
> - **Gain: +10 clicks/week (+500%)**
>
> **Root Cause**: The page `/template/x-ai-automated-tweets` has good content but the title is buried. It's ranking #12 because competitors have "Twitter Automation" in their H1 and title tags.
>
> **Action Items**:
> 1. Optimize `/template/x-ai-automated-tweets` page for "twitter automation" keyword
> 2. Update title tag to move "Twitter Automation" to the beginning: "Twitter Automation Tool | AI-Powered Tweet Scheduling | Bika"
> 3. Add internal links from high-authority pages (homepage, blog) using anchor text "twitter automation tool"
> 4. Add FAQ section: "How to automate twitter posts", "Best twitter automation tools 2026"
> 5. Timeline: 2-3 weeks to see position improvement

---

### Priority 2: CTR Optimization

**Criteria**: Position ≤ 10, CTR < 70% of expected benchmark

High-impression keywords with CTR significantly below expected benchmarks for their position.

**CTR Benchmarks by Position**:
- Position 1: 28-35% | Position 2: 15-20% | Position 3: 10-13%
- Position 4-5: 7-9% | Position 6-10: 3-5%

| Query | Position | Impressions | CTR | Expected CTR | CTR Gap | Potential Gain |
|-------|----------|-------------|-----|--------------|---------|----------------|
| [keyword] | [5] | [X] | [Y%] | [Z%] | [-W%] | +N clicks |

**REQUIRED FOR EACH TOP CTR OPPORTUNITY** (pick top 3-5):

**[Keyword Name]** (Impressions: X, Position: Y)
- Current: X clicks (Y% CTR) at position Z
- Expected: W clicks (V% CTR) for position Z
- **Missing: N-M clicks per week**

**Root Cause Analysis**: [Why is CTR so low? Wrong page ranking? Generic title? Misleading meta? Competitor has rich snippets?]

**Urgent Investigation Required** (if CTR gap > 5%): [What specifically needs to be checked in GSC?]

**Specific Fix**:
- Current title: "[exact current title]"
- Suggested title: "[exact new title with reasoning]"
- Meta description update: "[specific recommendation]"
- Other actions: [schema markup, featured snippet optimization, etc.]

**Example of GOOD analysis**:
> **"混元" (Tencent Hunyuan AI)** (903 impressions, Position 5.96)
> - Current: 1 click (0.11% CTR) at position 6
> - Expected: 27-36 clicks (3-4% CTR) for position 6
> - **Missing: 25-35 clicks per week**
>
> **Root Cause**: The ranking page is likely a generic integration reference page, not dedicated content about Hunyuan. Users searching "混元" want to learn about the AI model, not see it as one line in a features list.
>
> **Urgent Investigation Required**: Check in GSC which page is ranking. If it's just a brief mention in a larger page, this explains the terrible CTR.
>
> **Specific Fix**:
> - If current page is integration list: Create dedicated "如何在Bika中使用腾讯混元AI" guide page
> - If dedicated page exists: Update title from generic "Bika AI Integration" to "腾讯混元AI自动化集成指南 | 完整教程 | Bika.ai"
> - Add compelling meta: "通过Bika.ai连接腾讯混元大模型，实现智能对话、文本生成等AI能力。5分钟快速接入，附完整代码示例。"
> - Add structured FAQ schema for "什么是混元AI", "如何使用混元"
> - Timeline: Immediate if just title/meta fix; 1-2 weeks if new content needed

### Type 3: High Volume, Low Position

**Criteria**: Impressions > 1000/month, Position > 20

| Keyword | Impressions | Position | Est. Monthly Searches | Potential at Pos 5 |
|---------|-------------|----------|----------------------|-------------------|
| [keyword] | [5,000] | [35] | [~30,000] | [~1,500 clicks] |

**Why**: Huge traffic potential
**Effort**: High (major content creation)
**Timeline**: 4-12 weeks

### Type 4: Emerging Trends

**Criteria**: Impression growth > 200% in last 90 days

| Keyword | Current Impressions | Growth | Position | Opportunity |
|---------|-------------------|--------|----------|-------------|
| [keyword] | [800] | +450% | [18] | First mover |

**Why**: Growing demand, low competition window
**Effort**: Medium
**Timeline**: 1-2 weeks (time-sensitive)

### Type 5: Branded vs Non-Branded Balance

| Type | Queries | Clicks | % of Total | Health Check |
|------|---------|--------|------------|--------------|
| Branded | [X] | [X] | [X%] | [assessment] |
| Non-Branded | [X] | [X] | [X%] | [assessment] |

**Healthy Mix**: 60-80% non-branded clicks for SEO growth
```

### 5. Build Topic Clusters

**CRITICAL**: Don't just list keywords - provide strategic content recommendations!

```markdown
## Topic Cluster Strategy

**Analysis Approach**:
1. Group related keywords by topic/theme
2. Identify pillar content opportunities (high-volume head terms)
3. Map supporting content (long-tail variations)
4. Assess current content coverage and gaps
5. Provide specific content creation recommendations

### Cluster [N]: [Topic Name] ([Performance Level]: Core Strength / Growth Opportunity / Weak Coverage)

**Performance Summary**:
- **Total Keywords**: [X] variations
- **Total Impressions**: [X]/week (or /month)
- **Total Clicks**: [X]
- **Average Position**: [X]
- **Overall Assessment**: [1-2 sentences on current state]

**Current Content**:
- Pillar page: [URL if exists, or "MISSING" if needed]
- Supporting pages: [List 2-3 key pages, or note gaps]
- Content quality: [Strong/Moderate/Weak - with brief reasoning]

**Keyword Breakdown**:
| Keyword | Impressions | Position | Clicks | Status |
|---------|-------------|----------|--------|--------|
| [main keyword] | [X] | [Y] | [Z] | [Pillar candidate] |
| [variation 1] | [X] | [Y] | [Z] | [Supporting] |
| [variation 2] | [X] | [Y] | [Z] | [Gap - create content] |

**Strategic Recommendation**:

[For STRONG clusters]:
**Leverage & Expand**: You're already ranking well for [topic]. Focus on:
1. [Specific action to consolidate authority]
2. [Cross-linking strategy]
3. [Content refresh priorities]

[For GROWTH clusters]:
**Build Authority**: Significant search demand but weak current presence. Priority actions:
1. **Create pillar content**: "[Exact title suggestion]" targeting [main keyword]
   - Required sections: [list key topics to cover]
   - Target length: [X] words
   - Key differentiators: [what makes this better than competitors]
2. **Supporting content** (create [N] articles):
   - "[Article title 1]" for [keyword]
   - "[Article title 2]" for [keyword]
3. **Internal linking structure**: [Hub-and-spoke diagram or explanation]
4. **Expected timeline**: [realistic timeframe]
5. **Estimated impact**: +[X] clicks/month after 3-6 months

[For WEAK/COMPETITIVE clusters]:
**Strategic Caution**: High competition or low relevance. Consider:
- Whether to compete at all (resource vs ROI)
- Long-tail alternatives instead of head terms
- Partnership/guest post opportunities

**Example of GOOD cluster analysis**:

> ### Cluster 1: Telegram Automation (Core Strength)
>
> **Performance Summary**:
> - **Total Keywords**: 150+ variations (telegram bot, tg机器人, telegram频道, etc.)
> - **Total Impressions**: ~2,500/week
> - **Total Clicks**: 65/week
> - **Average Position**: 5.8
> - **Overall Assessment**: This is your strongest content cluster with dominant rankings (positions 3-8) across most Telegram-related queries. High CTR indicates strong content-search intent match.
>
> **Current Content**:
> - Pillar page: `/help/guide/automation/telegram-send-message-action` (ranking well)
> - Supporting pages: Multiple template pages, integration guides
> - Content quality: Strong - comprehensive guides with code examples
>
> **Strategic Recommendation**:
>
> **Leverage & Expand**: You're the authority for Telegram automation in your niche. Focus on consolidating:
>
> 1. **Content Refresh Priority**: Update the pillar guide with 2026 Telegram API changes
> 2. **Fill Content Gaps**: Create these high-demand guides:
>    - "Telegram Channel Management Bot - Complete Setup Guide" (targeting "telegram频道机器人", 231 impressions, position 5.5)
>    - "How to Build a Telegram Group Moderation Bot" (targeting "telegram group bot", 103 impressions, currently not ranking with dedicated page)
> 3. **Internal Linking**: Cross-link all 15+ Telegram templates back to the main automation guide. Currently seeing fragmented authority.
> 4. **Comparison Content**: "Telegram vs Discord for Business Automation" - capitalize on "telegram vs" queries (47 impressions)
> 5. **Expected Impact**: Consolidating authority could improve positions 5-8 keywords to 3-5, gaining +15-20 clicks/week

---

> ### Cluster 2: AI Model Integrations (Growth Opportunity)
>
> **Performance Summary**:
> - **Total Keywords**: 混元, 通义千问, doubao, qianwen variations
> - **Total Impressions**: ~3,500/week
> - **Total Clicks**: 4/week (0.11% CTR - TERRIBLE)
> - **Average Position**: 6.4
> - **Overall Assessment**: MASSIVE opportunity - ranking well (positions 5-8) but getting almost zero clicks. Pages ranking don't match user intent.
>
> **Current Content**:
> - Pillar page: MISSING (likely just integration list page ranking)
> - Supporting pages: Generic AI integration mentions
> - Content quality: Weak - not dedicated content for these models
>
> **Strategic Recommendation**:
>
> **Build Dedicated Content Immediately**: This is your highest ROI opportunity.
>
> 1. **Create pillar content** (Priority: URGENT):
>    - "如何在Bika中使用中国AI大模型完整指南" (How to use Chinese AI models in Bika)
>    - Target length: 2,500-3,000 words
>    - Cover: 通义千问, 腾讯混元, 豆包, API setup, use cases, examples
>
> 2. **Supporting content** (create 3 individual guides):
>    - "腾讯混元AI自动化集成教程" for 混元/腾讯混元 (1,047 combined impressions)
>    - "通义千问API接入指南" for 千问/通义千问 (1,930 combined impressions)
>    - "字节豆包AI集成方案" for doubao queries (42 impressions - emerging)
>
> 3. **Technical requirements**:
>    - Each guide needs: API key setup, code examples, workflow templates, troubleshooting
>    - Add FAQ schema for common questions
>    - Include video walkthrough if possible
>
> 4. **Internal linking**:
>    - Hub page linking to individual model guides
>    - Cross-link from general automation guides
>    - Feature in homepage "Popular Integrations" section
>
> 5. **Timeline**: 2-3 weeks for all content
> 6. **Estimated Impact**: Fix CTR from 0.11% to 3-4% = +105-140 clicks/week (+2,500%!)
```

### 6. Priority Scoring

```markdown
## Keyword Prioritization

### Scoring Formula

**Impact Score** (0-100):
- Click potential: 40%
- Impression volume: 30%
- Current position: 20%
- Strategic value: 10%

**Effort Score** (0-100):
- Content exists: 10-40 points
- Content needs creation: 60-80 points
- Technical complexity: varies

**ROI Score** = Impact / Effort

### Top 20 Priority Keywords

| Rank | Keyword | Impact | Effort | ROI | Type | Timeline |
|------|---------|--------|--------|-----|------|----------|
| 1 | [keyword] | 85 | 25 | 3.4 | Quick Win | 2 weeks |
| 2 | [keyword] | 90 | 30 | 3.0 | CTR Fix | Immediate |

### Recommended Focus

**This Month** (Quick ROI):
- Quick Wins: [X] keywords, est. [Y] clicks/month
- CTR Fixes: [X] keywords, est. [Y] clicks/month

**Next Quarter** (Growth):
- High-volume targets: [X] keywords
- Topic clusters: [X] clusters to build
```

### 7. Gap Analysis

```markdown
## Keyword Coverage Analysis

### Missing Opportunities

| Keyword Theme | Est. Volume | Current Ranking | Gap Type | Priority |
|---------------|-------------|----------------|----------|----------|
| [theme] | High | Not ranking | Content gap | High |
| [theme] | Medium | Pos 40+ | Optimization | Medium |

### Intent Coverage

| Intent | Coverage | Industry Avg | Gap | Recommendation |
|--------|----------|--------------|-----|----------------|
| Informational | [X%] | 70% | [gap] | [action] |
| Commercial | [X%] | 60% | [gap] | [action] |
| Transactional | [X%] | 40% | [gap] | [action] |
```

### 8. Generate Report

**IMPORTANT - Language Detection**: Before generating the report, detect the language from the user's original request:
- Chinese request → Generate entire report in Chinese
- English request → Generate entire report in English
- Other languages → Match the user's request language

**NEW - STAGED REPORT GENERATION (Critical for avoiding timeouts)**:

**IMPORTANT**: Generate the report in stages AUTOMATICALLY without requiring user confirmation for each stage. The stages are only for progress tracking, NOT for approval gates.

Generate the complete report by:
1. Using the Write tool to create the file
2. Building the report content progressively through the Write tool
3. Showing progress updates between major sections
4. **DO NOT ask for user approval between stages**

**Process**:
```
1. Create report file with header (use Write tool)
2. Progress: "▶ Writing executive summary..."
3. Append executive summary (use Write tool with append mode or Edit)
4. Progress: "✅ Complete. ▶ Writing performance overview..."
5. Continue for all sections automatically
6. Final: "🎉 Report saved to ./output/keyword-mining-report-[date].md"
```

**Staged Generation Benefits**:
- Prevents timeout from generating massive content in one operation
- User sees progress (stages) instead of hanging
- Each stage is small and fast
- Report file is built incrementally
- **NO user intervention required**

**Using Cached Analysis Results**:
When writing the Opportunity Mining section, load from cache instead of re-analyzing:
```bash
# Read from cache files during analysis
QUICK_WINS=$(cat ./analysis-cache/quick-wins.txt | wc -l)
CTR_OPS=$(cat ./analysis-cache/ctr-ops.txt | wc -l)
# Use these counts in your report generation
```

Save to: `./output/keyword-mining-report-[date].md`

```markdown
# Keyword Mining Report: [Domain]

**Date**: [date]
**Data Period**: [date range]
**Data Source**: Google Search Console
**Report Language**: [detected from user request]

## Executive Summary

- Total keywords analyzed: [X]
- Core keywords identified: [X] driving [Y]% of clicks
- Quick wins found: [X] keywords on page 2
- CTR opportunities: [X] keywords with [Y] impressions
- High-volume targets: [X] keywords with major potential
- Recommended focus: [priority areas]

## Performance Overview

| Metric | Value | Context |
|--------|-------|---------|
| Total Queries | [X] | [vs industry] |
| Total Clicks | [X] | [trend] |
| Total Impressions | [X] | [trend] |
| Overall CTR | [X%] | [vs benchmark] |
| Avg Position | [X] | [assessment] |

## Core Keywords
[Section 2 content]

## Intent Analysis
[Section 3 content]

## Opportunity Mining
[Section 4 content]

## Topic Clusters
[Section 5 content]

## Priority Rankings
[Section 6 content]

## Gap Analysis
[Section 7 content]

## Implementation Roadmap

### Month 1: Quick Wins
- [ ] Optimize [X] page-2 keywords
- [ ] Fix [X] title tags for CTR
- Expected: +[Y] clicks/month

### Month 2-3: Growth
- [ ] Create content for [X] high-volume keywords
- [ ] Build topic cluster for [theme]
- Expected: +[Y] clicks/month

### Month 4-6: Authority
- [ ] Complete [X] topic clusters
- [ ] Target competitive keywords
- Expected: +[Y] clicks/month

## Tracking Metrics

**Weekly**:
- Position changes for top 50 keywords
- CTR trends for optimized pages

**Monthly**:
- Total clicks and impressions growth
- New keywords ranking top 20
- Topic cluster performance

**Quarterly**:
- Overall organic visibility improvement
- Market share in target topics
```

## Output Files

**IMPORTANT - SINGLE OUTPUT FILE ONLY**:

Generate ONLY ONE file: `./output/keyword-mining-report-[date].md`

- ✅ **DO**: Create a comprehensive markdown report with all analysis
- ❌ **DO NOT**: Create separate CSV files
- ❌ **DO NOT**: Create multiple markdown files
- ❌ **DO NOT**: Export data to external formats

All keyword data, tables, and analysis should be embedded directly in the single markdown report using markdown tables.

**Report Location**: `./output/keyword-mining-report-[date].md`

## Success Metrics

### 30 Days
- [X] keywords moved from page 2 to page 1
- [Y]% increase in overall CTR
- [Z]% increase in total clicks

### 90 Days
- [X]% increase in organic clicks
- [Y] new keywords in top 10
- [Z] topic clusters established

## Tips

1. **Focus on impressions > 100/month** - Lower volume too variable
2. **Page 2 keywords = gold** - Easiest ROI
3. **CTR gaps = quick wins** - Immediate impact
4. **Group into themes** - Build topical authority
5. **Track weekly** - Positions change fast
6. **Intent matters** - Match content to search intent
7. **Update monthly** - New opportunities emerge constantly

---

## CRITICAL EXECUTION REMINDERS

### ❌ What NOT to Do

**Don't be a data dumper**:
- ❌ Don't just create tables and move on
- ❌ Don't use generic advice like "optimize title tag"
- ❌ Don't skip the "why" and only show the "what"
- ❌ Don't ignore business context and existing content
- ❌ Don't write Python scripts to "process the data"

**Example of BAD analysis**:
```markdown
## Quick Wins
| Keyword | Position | Impressions |
|---------|----------|-------------|
| twitter automation | 12.3 | 247 |

Action: Optimize title tag and add internal links.
```

### ✅ What TO Do

**Be an SEO consultant**:
- ✅ Analyze data deeply and explain findings
- ✅ Provide specific, actionable recommendations
- ✅ Connect to business goals and existing assets
- ✅ Diagnose root causes, not just symptoms
- ✅ Give concrete examples and estimates

**Example of GOOD analysis**:
```markdown
## Quick Wins - Detailed Analysis

**Top Opportunity: "twitter automation"** (247 impressions, position 12.35)

**Current State**:
- 2 clicks/week (0.81% CTR)
- Ranking page: `/template/x-ai-automated-tweets`
- Position: Bottom of page 2

**Root Cause**:
The page has good content but loses to competitors because:
1. Title tag buries the keyword: "Bika | AI Tweet Templates" instead of "Twitter Automation..."
2. No internal links from high-authority pages
3. Missing FAQ content that could capture featured snippet

**Specific Actions**:
1. Update title tag: "Twitter Automation Tool | AI-Powered Tweet Scheduling | Bika"
2. Add 3 internal links from:
   - Homepage (use anchor "twitter automation tool")
   - Blog post about automation (if exists)
   - Main features page
3. Add FAQ section with schema markup:
   - "How to automate Twitter posts in 2026?"
   - "Best Twitter automation tools comparison"
4. Add "Last updated: [date]" to show freshness

**Expected Outcome**:
- Position improvement: 12.3 → 6-8 (in 2-3 weeks)
- CTR increase: 0.81% → 4-5%
- Traffic gain: +10-12 clicks/week (+500%)
- Total effort: 2-3 hours of work

**ROI**: VERY HIGH - Minimal effort, significant return
```

### Processing Instructions

**CRITICAL - NO PYTHON SCRIPTS ALLOWED**:

❌ **ABSOLUTELY FORBIDDEN**:
- Do NOT write Python files to process data
- Do NOT create `analyze_topics.py`, `export_csv.py` or any other Python scripts
- Do NOT use Python for data analysis, filtering, or CSV generation

✅ **MANDATORY - USE BASH TOOLS ONLY**:

All data processing MUST be done with bash commands:
- `head`, `tail` - preview data
- `wc` - count lines/words
- `grep` - search and filter
- `awk` - text processing and calculations
- `sort` - sorting data
- `uniq` - remove duplicates
- `cut` - extract columns
- `jq` - JSON processing (essential for MCP data)

**NEW - PERFORMANCE OPTIMIZATION REQUIREMENTS**:

✅ **PARALLEL PROCESSING (MANDATORY for large datasets)**:
- ALWAYS run analysis tasks in parallel using background jobs (`&`)
- Use `wait` to track completion
- Cache results to `./analysis-cache/` for reuse
- This reduces processing time from 30+ minutes to 5-10 minutes

✅ **PROGRESS FEEDBACK (MANDATORY for all operations)**:
- ALWAYS show progress with emoji indicators
- Use format: `⏳ [Step X/Total] Description...`
- Show subtasks: `▶ Subtask N/M: Details...`
- Show completion: `✅ Task complete`
- Show final summary: `🎉 All tasks completed!`

✅ **DATA PRE-FILTERING (MANDATORY after data fetch)**:
- ALWAYS filter data after fetching: `impressions >= 10 AND position <= 100`
- If filtered results < 100 keywords, relax to: `impressions >= 5 AND position <= 100`
- This reduces processing load while preserving meaningful opportunities
- Prevents timeout on large datasets

✅ **TOKEN OPTIMIZATION (MANDATORY for cost control)**:
- **Set MCP `rowLimit: 10000`** (not 25000) - balances coverage and cost
- **Use 14-day default range** - shorter period = less data
- **Avoid verbose intermediate output** - don't print full datasets
- **Limit deep analysis to Top 10-15** opportunities (not every single keyword)
- **Use cached results** - don't re-read raw JSON multiple times
- Target: Keep total token usage under 150K per report

**Token Budget Breakdown**:
| Component | Target | Maximum | Notes |
|-----------|--------|---------|-------|
| MCP Data Fetch (10000 rows) | 50K | 100K | Scales with rowLimit |
| Skill File Read | 5K | 10K | Fixed |
| Bash Processing | 10K | 20K | Fixed |
| LLM Analysis | 50K | 100K | Depends on depth |
| Report Generation | 20K | 50K | Fixed |
| **Total (10000 rows)** | **135K** | **280K** | ✅ Target range |
| **Total (5000 rows)** | **~100K** | **~200K** | For quick analysis |
| **Total (15000 rows)** | **~180K** | **~360K** | For large sites |

**Optimized Data Processing Workflow with MCP JSON Data**:
```bash
# Step 0: PRE-FILTERING (CRITICAL - Do this FIRST)
echo "⏳ [1/4] Pre-filtering data to reduce processing load..."
cat mcp-response.json | jq '.[0].text' | jq '.rows' > raw-rows.json
TOTAL_ROWS=$(cat raw-rows.json | jq '. | length')
cat raw-rows.json | jq '[.[] | select(.impressions >= 10 and .position <= 100)]' > filtered-rows.json
FILTERED_ROWS=$(cat filtered-rows.json | jq '. | length')
echo "   ✅ Filtered to $FILTERED_ROWS rows (removed $((TOTAL_ROWS - FILTERED_ROWS)) low-value rows)"
# If still too few keywords, relax filter further
if [ "$FILTERED_ROWS" -lt 100 ]; then
  echo "   ⚠️  Only $FILTERED_ROWS keywords, relaxing filter..."
  cat raw-rows.json | jq '[.[] | select(.impressions >= 5 and .position <= 100)]' > filtered-rows.json
  FILTERED_ROWS=$(cat filtered-rows.json | jq '. | length')
  echo "   ✅ Expanded to $FILTERED_ROWS rows"
fi

# Step 1: PARALLEL ANALYSIS (All tasks run simultaneously)
echo "⏳ [2/4] Running parallel analysis..."
mkdir -p ./analysis-cache

# Task A: Core keywords
echo "   ▶ Task 1/4: Core keywords..."
(cat filtered-rows.json | jq -r '.[] | "\(.keys[0])|\(.clicks)|\(.impressions)|\(.ctr*100)|\(.position)"' | \
  sort -t'|' -k2 -nr | head -30 > ./analysis-cache/core-keywords.txt) &
PID_CORE=$!

# Task B: Quick wins
echo "   ▶ Task 2/4: Quick wins..."
(cat filtered-rows.json | jq -r '.[] | select(.position > 10 and .position < 20 and .impressions >= 100) | "\(.keys[0])|\(.position)|\(.impressions)|\(.clicks)|\(.keys[1])"' | \
  sort -t'|' -k3 -nr | head -20 > ./analysis-cache/quick-wins.txt) &
PID_QUICK=$!

# Task C: CTR opportunities
echo "   ▶ Task 3/4: CTR opportunities..."
(cat filtered-rows.json | jq -r '.[] | select(.position <= 10 and .impressions >= 500) | "\(.keys[0])|\(.position)|\(.impressions)|\(.ctr*100)|\(.keys[1])"' | \
  awk -F'|' 'BEGIN{bench[1]=28;bench[2]=18;bench[3]=11;bench[4]=8;bench[5]=7;bench[6]=5;bench[7]=4;bench[8]=3;bench[9]=2;bench[10]=1.5}
    {pos=int($2);exp=bench[pos];if(exp && $4<exp*0.7) print $0}' > ./analysis-cache/ctr-ops.txt) &
PID_CTR=$!

# Task D: High volume
echo "   ▶ Task 4/4: High volume keywords..."
(cat filtered-rows.json | jq -r '.[] | select(.impressions >= 1000) | "\(.keys[0])|\(.impressions)|\(.position)|\(.clicks)|\(.keys[1])"' | \
  sort -t'|' -k2 -nr | head -30 > ./analysis-cache/high-volume.txt) &
PID_VOL=$!

# Wait for all parallel tasks
wait $PID_CORE && echo "   ✅ Task 1/4 complete"
wait $PID_QUICK && echo "   ✅ Task 2/4 complete"
wait $PID_CTR && echo "   ✅ Task 3/4 complete"
wait $PID_VOL && echo "   ✅ Task 4/4 complete"
echo "🎉 All parallel analysis completed!"

# Step 2: USE CACHED RESULTS for report generation
echo "⏳ [3/4] Analyzing cached results..."
# Load from ./analysis-cache/*.txt files instead of re-processing
echo "📊 Analysis complete: $(cat ./analysis-cache/quick-wins.txt | wc -l) quick wins identified"

# Step 3: REPORT GENERATION (Automatic, no user confirmation)
echo "⏳ [4/4] Generating comprehensive report..."
echo "   📝 This will proceed automatically through all stages"
# Generate report using Write tool progressively
# Show progress but DO NOT ask for approval
echo "🎉 Report saved to ./output/keyword-mining-report-$(date +%Y%m%d).md"
```

**Key Performance Improvements**:
| Approach | Time | Status |
|----------|------|--------|
| Old (Sequential) | 30-40 min | ❌ Times out |
| New (Parallel + Filtered) | 5-10 min | ✅ Reliable |
| Improvement | **4x faster** | ✅ Standard |

**Progress Indicators (Use these emojis)**:
| Emoji | Meaning | Usage |
|-------|---------|-------|
| ⏳ | In progress | `⏳ [Step 1/4] Description...` |
| ▶ | Starting subtask | `▶ Task 1/3: Details...` |
| ✅ | Complete | `✅ Task complete` |
| 🎉 | All done | `🎉 All tasks completed!` |
| 📊 | Data summary | `📊 Result: X rows` |
| 💾 | File saved | `💾 Saved to: ./path/file` |
| ⚠️ | Warning | `⚠️ Large dataset detected` |
| ❌ | Error/Failed | `❌ Task failed: reason` |

**IMPORTANT - jq is your best friend for MCP data**:
- Always use `jq` to parse JSON responses from MCP tools
- Use `jq -r` for raw output (no quotes) when piping to other tools
- Chain jq commands for complex filtering
- Combine with `sort`, `uniq`, `head` for analysis

**If you need complex analysis, use inline bash commands with jq, NOT separate Python files**

### Report Quality Checklist

Before finalizing your report, verify:

- [ ] Each top opportunity has detailed root cause analysis
- [ ] Specific action items (not "optimize", but HOW to optimize)
- [ ] Referenced actual URLs/pages where possible
- [ ] Included traffic gain estimates with reasoning
- [ ] Connected to business context ("You already have X page...")
- [ ] Flagged urgent items with clear justification
- [ ] Grouped related opportunities into campaigns
- [ ] Provided both quick wins AND long-term strategy
- [ ] Report reads like a consultant's analysis, not a data dump

### Success = Strategic Value

Your goal is for the reader to finish your report and think:

✅ "Wow, this is incredibly actionable"
✅ "I know exactly what to do next week"
✅ "The ROI calculations help me prioritize"
✅ "They really understand my business"

NOT:

❌ "This is just my data in table form"
❌ "These recommendations are too generic"
❌ "I don't understand why this matters"
❌ "A Python script could have done this"

---
