# Write 工具 UI 文档

## Output 对象结构

当 Write 工具执行成功后，`output` 字段包含以下结构：

```json
{
  "type": "create",
  "filePath": "/sandagent/output/technical-seo-audit-bika-ai.md",
  "content": "# 标题\n\n文件的完整内容...",
  "structuredPatch": [],
  "originalFile": null
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `string` | 操作类型，通常为 `"create"` 或 `"edit"` |
| `filePath` | `string` | 文件的完整路径（绝对路径） |
| `content` | `string` | 文件的完整内容（可能包含 `\n` 等转义字符） |
| `structuredPatch` | `array` | 结构化的补丁数组（编辑操作时使用） |
| `originalFile` | `string \| null` | 原始文件内容（编辑操作时使用，创建时为 `null`） |

## UI 渲染逻辑

前端根据 `DynamicToolUIPart` 的 `output` 字段渲染：

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

### 状态说明

- `input-streaming`: 模型正在生成文件内容
- `input-available`: 内容已完成，准备执行写入
- `output-available`: 文件写入成功
- `output-error`: 写入过程中发生错误
