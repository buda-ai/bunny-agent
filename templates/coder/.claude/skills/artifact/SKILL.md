---
name: artifact
description: Create and manage artifact.json for task outputs. Use when creating code files, documentation, or any files that should be tracked as artifacts.
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
      "path": "src/components/Component.tsx",
      "mimeType": "text/typescript",
      "description": "Description of the file"
    }
  ]
}
```

## Common MIME Types

- `text/typescript` - TypeScript files (.ts, .tsx)
- `text/javascript` - JavaScript files (.js, .jsx)
- `text/markdown` - Markdown files (.md)
- `application/json` - JSON files (.json)
- `text/plain` - Plain text files (.txt)
- `text/css` - CSS files (.css)
- `text/html` - HTML files (.html)

## Example: Complete Artifact.json

```json
{
  "artifacts": [
    {
      "id": "main-component",
      "path": "src/components/UserAuth.tsx",
      "mimeType": "text/typescript",
      "description": "User authentication component"
    },
    {
      "id": "task-summary",
      "path": "tasks/${CLAUDE_SESSION_ID}/summary.md",
      "mimeType": "text/markdown",
      "description": "Task summary and documentation"
    }
  ]
}
```

## Important Notes

- Always use `${CLAUDE_SESSION_ID}` for the task directory
- File paths in `artifact.json` should be relative to the working directory (`/sandagent`)
- Code files can use paths like `src/...` (relative to working directory)
- Task-specific files should use `tasks/${CLAUDE_SESSION_ID}/...`
- Update `artifact.json` whenever you create a new output file
