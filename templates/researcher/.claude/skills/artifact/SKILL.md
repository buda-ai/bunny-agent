---
name: artifact
description: Create and manage artifact.json for task outputs. Use at the START of every task to define planned deliverables before beginning research.
---

# Artifact Management

Every task must have an `artifact.json` that declares all output files.

## Setup

```bash
mkdir -p "tasks/${CLAUDE_SESSION_ID}/reports"
mkdir -p "tasks/${CLAUDE_SESSION_ID}/notes"

cat > "tasks/${CLAUDE_SESSION_ID}/artifact.json" << 'EOF'
{
  "artifacts": []
}
EOF
```

## Adding Artifacts

Read the current file, append new entries, and write it back. Each entry needs:

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (e.g. `research-report`) |
| `path` | Yes | File path relative to `/sandagent` |
| `mimeType` | Yes | MIME type of the file |
| `description` | No | Brief description of the content |

## Example

```json
{
  "artifacts": [
    {
      "id": "research-report",
      "path": "tasks/${CLAUDE_SESSION_ID}/reports/report.md",
      "mimeType": "text/markdown",
      "description": "Main research report with findings and analysis"
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

## Common MIME Types

| Type | Extension |
|------|-----------|
| `text/markdown` | .md |
| `text/plain` | .txt |
| `text/html` | .html |
| `text/csv` | .csv |
| `application/json` | .json |
| `application/pdf` | .pdf |

## Rules

- Always call this skill BEFORE starting research
- Use `${CLAUDE_SESSION_ID}` in paths — it auto-resolves in this file
- Update `artifact.json` whenever you create a new output file
- Every task must produce at least one artifact (typically a Markdown report)
