# Debugging Guide

**Troubleshoot and debug your Bunny Agent applications**

When things don't work as expected, this guide helps you figure out what's going on.

## Quick Troubleshooting

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| "API key not found" | Missing environment variable | Set `ANTHROPIC_API_KEY` |
| "Failed to create sandbox" | Missing sandbox API key | Set `E2B_API_KEY` or `SANDOCK_API_KEY` |
| Agent outputs nothing | Stream not consumed | Ensure you're reading the response body |
| Files not persisting | Different agent ID | Use consistent `id` across sessions |

---

## Table of Contents

1. [Transcript Recording](#transcript-recording)
2. [Analyzing Transcripts](#analyzing-transcripts)
3. [Common Error Scenarios](#common-error-scenarios)
4. [Troubleshooting Checklist](#troubleshooting-checklist)
5. [Debug Logging](#debug-logging)

---

## Transcript Recording

Bunny Agent supports JSONL transcript recording for debugging and replay. Transcripts capture all streamed data without modifying the passthrough behavior.

### Enable Transcript Recording

```ts
import { Bunny Agent, JsonlTranscriptWriter } from "@bunny-agent/core";
import { E2BSandbox } from "@bunny-agent/sandbox-e2b";

const agent = new BunnyAgent({
  id: "session-123",
  sandbox: new E2BSandbox(),
  runner: {
    kind: "claude-agent-sdk",
    model: "claude-sonnet-4-20250514",
  },
});

// Create a transcript writer
const writer = new JsonlTranscriptWriter("./transcript.jsonl");

// Stream with transcript recording
const response = await agent.stream({
  messages,
  transcriptWriter: writer,
});

// Close the writer when done
await writer.close();
```

### In-Memory Recording (for testing)

```ts
import { MemoryTranscriptWriter } from "@bunny-agent/core";

const writer = new MemoryTranscriptWriter();

const response = await agent.stream({
  messages,
  transcriptWriter: writer,
});

// Access the recorded data
console.log(writer.getFullOutput());
console.log(writer.getEntries());
```

### Console Logging

```ts
import { ConsoleTranscriptWriter } from "@bunny-agent/core";

const writer = new ConsoleTranscriptWriter();

// Will log all transcript entries to console in real-time
const response = await agent.stream({
  messages,
  transcriptWriter: writer,
});
```

### Multiple Outputs

```ts
import {
  MultiTranscriptWriter,
  JsonlTranscriptWriter,
  ConsoleTranscriptWriter,
} from "@bunny-agent/core";

const writer = new MultiTranscriptWriter([
  new JsonlTranscriptWriter("./transcript.jsonl"),
  new ConsoleTranscriptWriter(),
]);
```

---

## Analyzing Transcripts

### Transcript Entry Format

Each line in the JSONL transcript is a JSON object:

```json
{"timestamp":"2024-01-01T00:00:00.000Z","type":"start","agentId":"session-123","metadata":{"command":"bunny-agent run ...","workspace":"/workspace"}}
{"timestamp":"2024-01-01T00:00:01.000Z","type":"chunk","agentId":"session-123","data":"SGVsbG8=","text":"Hello"}
{"timestamp":"2024-01-01T00:00:02.000Z","type":"end","agentId":"session-123"}
```

### Entry Types

| Type | Description |
|------|-------------|
| `start` | Stream started, includes command and metadata |
| `chunk` | A data chunk from the stream |
| `error` | An error occurred |
| `end` | Stream completed successfully |
| `metadata` | Additional metadata (e.g., tool calls) |

### Parse and Analyze with Node.js

```ts
import * as fs from "fs";
import * as readline from "readline";

async function analyzeTranscript(filePath: string) {
  const stream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: stream });

  let chunks = 0;
  let errors = 0;
  let fullOutput = "";

  for await (const line of rl) {
    const entry = JSON.parse(line);
    
    switch (entry.type) {
      case "chunk":
        chunks++;
        if (entry.text) fullOutput += entry.text;
        break;
      case "error":
        errors++;
        console.error("Error:", entry.text);
        break;
    }
  }

  console.log(`Chunks: ${chunks}`);
  console.log(`Errors: ${errors}`);
  console.log(`Output length: ${fullOutput.length}`);
}
```

### Parse with jq (Command Line)

```bash
# Count entries by type
cat transcript.jsonl | jq -r '.type' | sort | uniq -c

# Get all error messages
cat transcript.jsonl | jq -r 'select(.type=="error") | .text'

# Extract full text output
cat transcript.jsonl | jq -r 'select(.type=="chunk") | .text' | tr -d '\n'

# Get metadata from start entry
cat transcript.jsonl | jq -r 'select(.type=="start") | .metadata'
```

---

## Common Error Scenarios

### 1. Sandbox Connection Failed

**Symptoms:**
- Error: "E2B API key not found"
- Error: "Failed to create sandbox"

**Solution:**
```bash
# Check E2B API key
echo $E2B_API_KEY

# Set the key
export E2B_API_KEY=your_key_here
```

### 2. Claude Agent SDK Not Available

**Symptoms:**
- Output shows "mock response"
- Warning about missing ANTHROPIC_API_KEY

**Solution:**
```bash
# Set Anthropic API key
export ANTHROPIC_API_KEY=your_key_here

# Install the SDK
npm install @anthropic-ai/claude-agent-sdk
```

### 3. Stream Interrupted

**Symptoms:**
- Response ends abruptly
- No `end` entry in transcript

**Causes:**
- Network timeout
- Sandbox terminated
- Client disconnected

**Debug:**
```ts
// Use transcript to see where it stopped
const writer = new MemoryTranscriptWriter();
try {
  const response = await agent.stream({ messages, transcriptWriter: writer });
  // consume response
} finally {
  console.log("Entries:", writer.getEntries().length);
  console.log("Last entry:", writer.getEntries().at(-1));
}
```

### 4. Template Not Found

**Symptoms:**
- Warning: "Template 'X' not found, using default"

**Solution:**
```bash
# Check template exists
ls templates/

# Set templates directory (in sandbox)
export BUNNY_AGENT_TEMPLATES_DIR=/path/to/templates
```

### 5. Workspace Permission Errors

**Symptoms:**
- Error: "Permission denied"
- Agent cannot write files

**Solution:**
```ts
// Ensure workspace exists and is writable
await agent.uploadFiles([], "/workspace"); // Creates directory
```

---

## Troubleshooting Checklist

### Pre-flight Checks

- [ ] E2B_API_KEY is set (for E2B sandbox)
- [ ] ANTHROPIC_API_KEY is set (for Claude)
- [ ] Docker is running (for Sandock sandbox)
- [ ] Network connectivity to APIs

### Runtime Checks

- [ ] Sandbox attaches successfully
- [ ] CLI command is correct (check transcript `start` entry)
- [ ] Chunks are being received (check transcript `chunk` entries)
- [ ] No errors in transcript

### Post-run Checks

- [ ] Transcript has `end` entry
- [ ] Output is valid AI SDK UI format
- [ ] No parse errors in client

---

## Debug Logging

### Enable CLI Debug Logging

```bash
export BUNNY_AGENT_LOG_LEVEL=debug
bunny-agent run -- "Test task"
```

### Enable Package Debug Logging

```ts
// In your application
process.env.DEBUG = "bunny-agent:*";
```

### Check Sandbox Stderr

The CLI writes diagnostic information to stderr:

```ts
// In Sandock adapter, stderr is logged:
// [E2B stderr] or [Sandock stderr]
```

### Verbose Benchmark Mode

```bash
bunny-agent-benchmark run --runner bunny-agent --verbose
```

---

## See Also

- [Quick Start Guide](./QUICK_START.md)
- [API Reference](./API_REFERENCE.md)
- [Persistence Guide](./PERSISTENCE_GUIDE.md)
- [Technical Specification](./TECHNICAL_SPEC.md)
