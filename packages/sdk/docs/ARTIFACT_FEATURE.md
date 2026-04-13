# Artifacts: Implementation Details

## Overview

Artifacts let the agent generate files (reports, charts, code, etc.) that can be streamed to the UI. This document focuses on the backend processor and data flow. For user-facing setup and UI integration, see the [Artifacts Guide](https://bunny-agent.dev/docs/artifacts).

## Architecture

### Core Components

1. **TaskDrivenArtifactProcessor**: backend processor that reads and streams artifact files
2. **StreamWriter**: writes `data-artifact` parts into the AI SDK UI stream
3. **UI**: receives `data-artifact` parts and renders them

### Flow

```
Agent writes artifact.json (manifest)
    ↓
TaskDrivenArtifactProcessor detects manifest change
    ↓
Reads listed artifact files
    ↓
Streams data-artifact parts to UI
    ↓
UI renders artifacts
```

## Backend Processor

### Interface

```typescript
export interface ArtifactProcessor {
  onChange(part: LanguageModelV3StreamPart, sessionId: string): Promise<void>;
}
```

### Key Behavior

- Only reacts to `Write` tool results that target `tasks/{sessionId}/artifact.json`
- Uses a Promise queue to serialize processing
- Caches manifest and artifact contents to avoid duplicate streaming

### Example (Simplified)

```typescript
export class TaskDrivenArtifactProcessor implements ArtifactProcessor {
  private artifactManifest: ArtifactManifest | null = null;
  private sentArtifacts = new Map<string, string>();
  private processingQueue: Promise<void> = Promise.resolve();

  onChange(part: LanguageModelV3StreamPart, sessionId: string): Promise<void> {
    if (
      part.type === "tool-result" &&
      part.toolName === "Write" &&
      part.result?.filePath === `${workdir}/tasks/${sessionId}/artifact.json`
    ) {
      return this.loadManifest(sessionId);
    }

    if (part.type === "tool-input-delta") {
      this.processingQueue = this.processingQueue
        .then(() => this.processArtifacts())
        .catch((e) => console.error("Artifact queue error:", e));
    }

    return Promise.resolve();
  }

  private async processArtifacts(): Promise<void> {
    if (!this.artifactManifest) return;

    for (const artifact of this.artifactManifest.artifacts) {
      const content = await handle.readFile(artifact.path);
      const artifactId = artifact.id || artifact.path;

      if (this.sentArtifacts.get(artifactId) !== content) {
        this.writer.write({
          type: "data-artifact",
          id: artifactId,
          data: { artifactId, content, mimeType: artifact.mimeType },
        });
        this.sentArtifacts.set(artifactId, content);
      }
    }
  }
}
```

## API Route Integration

```typescript
import { TaskDrivenArtifactProcessor } from "@/lib/artifact-processor";

export async function POST(request: Request) {
  const { sessionId, messages } = await request.json();

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const artifactProcessor = new TaskDrivenArtifactProcessor({
        sandbox,
        workdir: sandbox.getWorkdir?.() || "/bunny-agent",
        writer,
      });

      const bunny-agent = createBunny Agent({
        sandbox,
        artifactProcessors: [artifactProcessor],
      });

      const result = streamText({
        model: bunny-agent(model),
        messages,
      });

      writer.merge(result.toUIMessageStream());
      await result.response;
    },
  });

  return createUIMessageStreamResponse({ stream });
}
```

## Performance Notes

- **Manifest cache**: reload only when content changes
- **Content dedupe**: stream only when file content differs
- **Queueing**: serialize IO to avoid concurrent reads

## Data Format

The processor streams `data-artifact` parts:

```typescript
{
  type: "data-artifact",
  id: string,
  data: {
    artifactId: string,
    content: string,
    mimeType: string,
  }
}
```

## Related Docs

- [Artifacts Guide](https://bunny-agent.dev/docs/artifacts) (manifest format, skills, UI rendering)
- [SDK Development Guide](https://bunny-agent.dev/docs/sdk-guide) (full SDK integration)
- [Write Tool UI](https://bunny-agent.dev/docs/write-tool-ui) (Write tool UI details)
