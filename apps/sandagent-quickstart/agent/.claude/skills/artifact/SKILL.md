---
name: artifact
description: Create and manage artifact.json for task outputs. Use when creating reports, documents, or any files that should be displayed in the UI.
---

# Artifact Management Skill

Use this skill to create and manage `artifact.json` for tracking task outputs that should be displayed in the user interface.

## Session Information

- **Current Session ID**: `${CLAUDE_SESSION_ID}`
- **Artifact Path**: `tasks/${CLAUDE_SESSION_ID}/artifact.json`

> Note: `${CLAUDE_SESSION_ID}` is automatically provided by Claude Code as a built-in variable.

## Creating Artifacts

### Step 1: Create Task Directory

```bash
mkdir -p "tasks/${CLAUDE_SESSION_ID}"
```

### Step 2: Create Your Output File

Example - Create a markdown report:

```bash
cat > "tasks/${CLAUDE_SESSION_ID}/report.md" << 'EOF'
# My Report

Your content here...
EOF
```

### Step 3: Register in artifact.json

```bash
cat > "tasks/${CLAUDE_SESSION_ID}/artifact.json" << 'EOF'
{
  "artifacts": [
    {
      "id": "report",
      "path": "tasks/${CLAUDE_SESSION_ID}/report.md",
      "mimeType": "text/markdown",
      "description": "Analysis report"
    }
  ]
}
EOF
```

## Adding Multiple Artifacts

To track multiple files, update the array in `artifact.json`:

```json
{
  "artifacts": [
    {
      "id": "report",
      "path": "tasks/${CLAUDE_SESSION_ID}/report.md",
      "mimeType": "text/markdown",
      "description": "Main report"
    },
    {
      "id": "data",
      "path": "tasks/${CLAUDE_SESSION_ID}/data.json",
      "mimeType": "application/json",
      "description": "Raw data"
    }
  ]
}
```

## Supported MIME Types

| MIME Type | File Type | Extension |
|-----------|-----------|-----------|
| `text/markdown` | Markdown | `.md` |
| `text/html` | HTML | `.html` |
| `application/json` | JSON | `.json` |
| `text/plain` | Plain Text | `.txt` |
| `text/javascript` | JavaScript | `.js` |
| `text/css` | CSS | `.css` |
| `text/csv` | CSV | `.csv` |

## Complete Example

Create a simple analysis report:

```bash
# 1. Create directory
mkdir -p "tasks/${CLAUDE_SESSION_ID}/reports"

# 2. Create report file
cat > "tasks/${CLAUDE_SESSION_ID}/reports/analysis.md" << 'EOF'
# Data Analysis Report

## Overview
This report presents key findings from the data analysis.

## Key Findings
- Finding 1
- Finding 2
- Finding 3

## Conclusion
Summary of insights and recommendations.
EOF

# 3. Register in artifact.json
cat > "tasks/${CLAUDE_SESSION_ID}/artifact.json" << 'EOF'
{
  "artifacts": [
    {
      "id": "data-analysis-report",
      "path": "tasks/${CLAUDE_SESSION_ID}/reports/analysis.md",
      "mimeType": "text/markdown",
      "description": "Data analysis report with key findings"
    }
  ]
}
EOF
```

## Important Notes

- Always use `${CLAUDE_SESSION_ID}` for the task directory
- The `artifact.json` file MUST be at `tasks/${CLAUDE_SESSION_ID}/artifact.json`
- Artifact files can be placed anywhere, but keep them organized under `tasks/${CLAUDE_SESSION_ID}/`
- Update `artifact.json` whenever you create a new artifact file
- Use meaningful IDs like `data-analysis-report` instead of `file-1`
