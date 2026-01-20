# Feature: Output Format Support for runner-cli

## Summary

Added `--output-format` option to runner-cli, supporting both SSE stream and JSON output formats.

## Changes

### 1. CLI Interface (`apps/runner-cli/src/cli.ts`)

**Added:**
- `--output-format` option (short: `-o`)
- Validation for format values (`stream` | `json`)
- Updated help text with new option

**Usage:**
```bash
sandagent run --output-format json -- "Your task"
sandagent run -o json -- "Your task"
```

### 2. Runner (`apps/runner-cli/src/runner.ts`)

**Added:**
- `outputFormat` field to `RunAgentOptions` interface
- `parseSSEToJSON()` function to convert SSE stream to structured JSON
- Logic to handle different output formats

**Features:**
- Stream format: Outputs raw SSE events (default behavior)
- JSON format: Collects SSE stream, parses it, and outputs structured JSON

### 3. Documentation

**Created:**
- `docs/OUTPUT_FORMAT.md` - Comprehensive guide for output formats
- `apps/runner-cli/README.md` - CLI documentation with examples

**Test Script:**
- `test-output-format.sh` - Example usage and testing
## Output Format Details

### Stream Format (Default)

Server-Sent Events (SSE) protocol compatible with AI SDK UI:

```
data: {"type":"start","messageId":"msg_123"}
data: {"type":"text-delta","id":"text_1","delta":"Hello"}
data: [DONE]
```

### JSON Format

Structured JSON output:

```json
{
  "content": [
    { "type": "text", "text": "Hello" }
  ],
  "metadata": {
    "messageId": "msg_123",
    "model": "claude-sonnet-4-20250514",
    "finishReason": "stop",
    "usage": {
      "promptTokens": 10,
      "completionTokens": 5
    }
  }
}
```

## Use Cases

### Stream Format
- Real-time UI streaming
- Integration with AI SDK UI components
- Live progress display

### JSON Format
- API integration
- Automation scripts
- Result parsing with tools like `jq`
- Batch processing
- Testing and debugging

## Examples

```bash
# Default stream format
sandagent run -- "Calculate 2+2"

# JSON format
sandagent run --output-format json -- "Calculate 2+2"
sandagent run -o json -- "Calculate 2+2"

# Automation with jq
sandagent run -o json -- "Generate UUID" | jq -r '.content[0].text'

# Save to file
sandagent run -o json -- "Analyze data" > result.json

# Combined with other options
sandagent run -o json -m claude-sonnet-4-20250514 --max-turns 5 -- "Task"
```

## Implementation Notes

1. **SSE Parsing**: The `parseSSEToJSON()` function parses SSE events and aggregates:
   - Text deltas into complete text blocks
   - Tool calls with inputs
   - Tool results
   - Metadata (model, session, usage)

2. **Backward Compatibility**: Default behavior unchanged (stream format)

3. **Type Safety**: Full TypeScript support with proper types

4. **Error Handling**: Errors captured in JSON output's `error` field

## Testing

All type checks pass:
```bash
pnpm typecheck  # ✅ All packages pass
pnpm build      # ✅ Builds successfully
```

## Documentation

- [docs/OUTPUT_FORMAT.md](../../docs/OUTPUT_FORMAT.md) - Complete guide
- [apps/runner-cli/README.md](../../apps/runner-cli/README.md) - CLI reference
- Help text: `sandagent run --help`

## References

- [AI SDK UI Stream Protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)
- [Claude Agent SDK Options](https://platform.claude.com/docs/agent-sdk/typescript#options)

