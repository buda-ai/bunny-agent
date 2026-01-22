---
name: artifact
description: Create and manage artifact.json for task outputs. Use when creating research reports, notes, or any files that should be tracked as artifacts.
---

# Artifact Management Skill

Use this skill to create and manage `artifact.json` for tracking task outputs.

## Session Information

- **Current Session ID**: `${CLAUDE_SESSION_ID}`
- **Artifact Path**: `tasks/${CLAUDE_SESSION_ID}/artifact.json`

## Create Task Directory and Artifact.json

```bash
# Create task directory
mkdir -p "tasks/${CLAUDE_SESSION_ID}"

# Initialize artifact.json
cat > "tasks/${CLAUDE_SESSION_ID}/artifact.json" << 'EOF'
{
  "artifacts": []
}
EOF
```

## Add Artifact Entry

When you create a file that should be tracked, update `artifact.json`:

```json
{
  "artifacts": [
    {
      "id": "unique-id",
      "path": "tasks/${CLAUDE_SESSION_ID}/reports/report.md",
      "mimeType": "text/markdown",
      "description": "Description of the file"
    }
  ]
}
```

## Common MIME Types

- `text/markdown` - Markdown files (.md)
- `application/json` - JSON files (.json)
- `text/plain` - Plain text files (.txt)
- `text/html` - HTML files (.html)
- `text/csv` - CSV files (.csv)
- `application/pdf` - PDF files (.pdf)

## Example: Complete Artifact.json

```json
{
  "artifacts": [
    {
      "id": "research-report",
      "path": "tasks/${CLAUDE_SESSION_ID}/reports/quantum-computing-analysis.md",
      "mimeType": "text/markdown",
      "description": "Comprehensive research report on quantum computing"
    },
    {
      "id": "source-notes",
      "path": "tasks/${CLAUDE_SESSION_ID}/notes/sources.md",
      "mimeType": "text/markdown",
      "description": "Research sources and citations"
    }
  ]
}
```

## Important Notes

- Always use `${CLAUDE_SESSION_ID}` for the task directory
- File paths in `artifact.json` should be relative to the working directory (`/sandagent`)
- Update `artifact.json` whenever you create a new output file
