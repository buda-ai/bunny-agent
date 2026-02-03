# Write Tool UI Guide

## Output Shape

When the Write tool succeeds, its `output` typically looks like this:

```json
{
  "type": "create",
  "filePath": "/sandagent/output/technical-seo-audit-bika-ai.md",
  "content": "# Title\n\nFull file contents...",
  "structuredPatch": [],
  "originalFile": null
}
```

### Field Reference

| Field | Type | Notes |
|------|------|------|
| `type` | `string` | Usually `"create"` or `"edit"` |
| `filePath` | `string` | Absolute path of the file |
| `content` | `string` | Full file contents |
| `structuredPatch` | `array` | Patch data for edits |
| `originalFile` | `string | null` | Original file contents for edits |

## DynamicToolUIPart

```typescript
interface DynamicToolUIPart {
  toolName: "Write";
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input: {
    file_path: string;
    content: string;
  };
  output?: {
    type: "create" | "edit";
    filePath: string;
    content: string;
    structuredPatch: any[];
    originalFile: string | null;
  };
  errorText?: string;
}
```

### State Behavior

- `input-streaming`: model is generating file content
- `input-available`: content is ready to write
- `output-available`: write succeeded
- `output-error`: write failed
