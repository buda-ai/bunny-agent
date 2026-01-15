# SEO Keyword Mining Agent

A Claude Code agent template for analyzing Google Search Console data to identify keyword opportunities and generate actionable SEO strategy reports.

## Overview

This agent analyzes GSC data to:
- Identify keyword opportunities (page 2 rankings, CTR gaps, high-volume targets)
- Extract core keywords and classify by search intent
- Build topic clusters for content strategy
- Generate prioritized SEO action plans with ROI scoring

## Quick Start

### Two Usage Modes

#### Option 1: Live API Mode (Recommended - Real-time Data)

**Prerequisites**: Google Cloud Service Account with Search Console API access

1. **Setup Google Cloud Credentials**
   - Create a Google Cloud Project
   - Enable Search Console API
   - Create Service Account and download JSON key
   - Add service account email to your Search Console property (as Owner)
   - Save the JSON key as `gsc-credentials.json` in the project root

2. **Configure MCP**
   The `.claude/mcp.json` is already configured to use credentials at `gsc-credentials.json`

   Just place your `gsc-credentials.json` file in the project root directory.

3. **Start Agent**
   ```bash
   claude-code --agent .
   ```
   Then: `Analyze GSC data for https://example.com from last 90 days`

#### Option 2: CSV Export Mode (Fallback - No API Setup)

1. **Export GSC Data**
   - Go to Performance → Search results in Google Search Console
   - Date range: Last 90 days
   - Click Export → Download CSV
   - Save as `gsc-export-YYYY-MM-DD.csv`

2. **Setup**
   ```bash
   cp -r templates/seo-keywords-analytics my-keyword-analysis
   cd my-keyword-analysis
   mkdir -p data output
   mv ~/Downloads/gsc-export-*.csv ./data/
   ```

3. **Analyze**
   ```bash
   claude-code --agent .
   ```
   Then: `Analyze my GSC data and find keyword opportunities`

Reports will be saved in `./output/`:
- `keyword-mining-report-[date].md` - Comprehensive strategy report
- `quick-wins-keywords.csv` - Page 2 keywords (positions 11-20)
- `ctr-optimization-keywords.csv` - CTR improvement opportunities
- `high-volume-keywords.csv` - Growth targets

## Skill

### keyword-mining
Comprehensive SEO keyword analysis and strategic planning:
- Core keyword extraction and traffic analysis
- Quick win identification (page 2 rankings)
- CTR optimization opportunities
- Search intent classification (informational, commercial, transactional)
- Topic cluster creation for content strategy
- Priority scoring with Impact/Effort ROI
- Gap analysis and strategic reporting

## Opportunity Types

The agent identifies 5 types of keyword opportunities:

1. **Quick Wins** ⭐⭐⭐⭐⭐ - Keywords ranking positions 11-20 (page 2)
   - Small optimization = big traffic gain
   - Timeline: 2-4 weeks

2. **CTR Optimization** ⭐⭐⭐⭐ - High impressions, low CTR vs. expected
   - Title/meta improvements for immediate clicks
   - Timeline: Immediate

3. **Growth Keywords** ⭐⭐⭐ - High search volume, low position
   - Major traffic potential with content creation
   - Timeline: 4-12 weeks

4. **Emerging Trends** ⭐⭐⭐⭐ - Queries with growing impressions
   - First-mover advantage opportunity
   - Timeline: 1-2 weeks (time-sensitive)

5. **Branded Balance** - Health check on branded vs non-branded keywords
   - Indicates SEO maturity

## Example Queries

```
# Comprehensive analysis (recommended - gets everything)
Generate keyword mining report
Analyze my GSC data

# Specific opportunity types
Find quick win keywords on page 2
Show me CTR optimization opportunities
Identify high-volume growth targets
Track my search performance trends

# Strategic planning
Build topic clusters for content strategy
Prioritize keywords for next quarter
Create 90-day SEO roadmap
```

## Data Requirements

- **Minimum**: 30 days of GSC data (90 days recommended)
- **Format**: CSV export from GSC Performance report
- **Fields**: Query, Clicks, Impressions, CTR, Position, Page
- **Volume**: 100+ unique queries, 1,000+ total clicks

## Configuration

Located in `.claude/`:
- **settings.json** - Agent configuration (temperature: 0.3 for analytical consistency)
- **mcp.json** - MCP server setup with Google Search Console integration
- **skills/** - keyword-mining skill for comprehensive SEO analysis

### MCP Server Features

When using Live API Mode, you get access to:
- **Real-time data**: Up to 25,000 rows of performance data
- **Advanced filtering**: Regex patterns and multiple operators
- **Quick wins detection**: Automatic opportunity identification
- **Rich dimensions**: Query, page, country, device, search appearance
- **Flexible dates**: Custom reporting periods

Example MCP tool usage:
```
Fetch GSC data for https://example.com with:
- Date range: 2024-01-01 to 2024-01-31
- Dimensions: query, page, device
- Detect quick wins with position range 4-15
- Minimum 500 impressions
```

## Output Structure

```
output/
├── keyword-mining-report-[date].md    # Comprehensive report
├── quick-wins-keywords.csv            # Page 2 opportunities
├── ctr-optimization-keywords.csv      # CTR improvements
├── high-volume-keywords.csv           # Growth targets
├── topic-clusters.md                  # Content strategy
└── keyword-priority-list.csv          # Full prioritized list
```

Each report includes:
- Executive summary with key findings
- Performance overview (GSC metrics)
- Core keyword analysis with intent classification
- 5 types of opportunities identified
- Topic clusters for content planning
- Priority rankings (Impact vs. Effort ROI scoring)
- 30/60/90-day implementation roadmap

## Key Benchmarks

### CTR by Position
| Position | Expected CTR |
|----------|--------------|
| 1 | 28-35% |
| 2-3 | 10-20% |
| 4-10 | 3-9% |
| 11-20 | <1% |

### Opportunity Thresholds
- Quick Win: Position 11-20, Impressions > 100/month
- CTR Gap: Actual CTR < (Expected - 30%)
- High Volume: Impressions > 1000/month
- Emerging: Growth > 200% in 90 days

## Value Proposition

**vs. Manual Analysis:**
- Time: 5 minutes vs. 4-6 hours
- Consistency: Standardized ROI scoring
- Completeness: 5 opportunity types, not just top keywords

**vs. Paid SEO Tools:**
- Cost: Free vs. $99-399/month
- Data: Your actual GSC data, not estimates
- Focus: Keyword mining specific, not general SEO

## Privacy

All processing is local:
- **CSV Mode**: GSC exports stay in `./data/` (gitignored), no external API calls
- **API Mode**: Direct Google Search Console API access (requires your credentials)
- Reports saved locally in `./output/`
- Your data never leaves your control

## License

Apache-2.0
