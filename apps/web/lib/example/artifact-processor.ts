import type {
  ArtifactProcessor,
  LanguageModelV3StreamPart,
  SandboxAdapter,
  StreamWriter,
} from "@sandagent/sdk";

/**
 * TaskDrivenArtifactProcessor
 *
 * Event-driven Artifact processor.
 * 1. Reads the artifact file list from tasks/{sessionId}/artifact.json
 * 2. On onChange, reads file contents and sends them via the writer
 */

export interface ArtifactManifest {
  artifacts: Array<{
    id?: string;
    path: string;
    mimeType?: string;
    description?: string;
  }>;
}

export interface TaskDrivenArtifactProcessorOptions {
  /**
   * Sandbox adapter for reading files
   */
  sandbox: SandboxAdapter;

  /**
   * Working directory, defaults to /workspace
   */
  workdir?: string;

  /**
   * Stream writer for writing artifact data directly
   */
  writer: StreamWriter;
}

export class TaskDrivenArtifactProcessor implements ArtifactProcessor {
  private sandbox: SandboxAdapter;
  private workdir: string;
  private artifactManifest: ArtifactManifest | null = null;
  private writer: StreamWriter;
  private sentArtifacts = new Map<string, string>();
  // Queue mechanism: ensures onChange executes sequentially
  private processingQueue: Promise<void> = Promise.resolve();

  constructor(options: TaskDrivenArtifactProcessorOptions) {
    this.sandbox = options.sandbox;
    this.workdir = options.workdir || "/workspace";
    this.writer = options.writer;
  }

  /**
   * Loads the tasks/{sessionId}/artifact.json manifest file.
   * Only updates the cache and logs when the file content changes.
   */
  private async loadManifest(sessionId: string): Promise<void> {
    try {
      const manifestPath = `${this.workdir}/tasks/${sessionId}/artifact.json`;
      const handle = this.sandbox.getHandle?.();
      if (!handle) {
        return;
      }

      const content = await handle.readFile(manifestPath);
      const newManifest = JSON.parse(content) as ArtifactManifest;

      // Compare new and old manifest; return cached result if content is the same
      if (
        this.artifactManifest &&
        JSON.stringify(newManifest) === JSON.stringify(this.artifactManifest)
      ) {
        return;
      }

      // Content changed — update cache
      this.artifactManifest = newManifest;
      console.log(
        "[ArtifactProcessor] Manifest loaded:",
        JSON.stringify(this.artifactManifest),
      );
    } catch (e) {
      console.error("[ArtifactProcessor] Failed to load manifest:", e);
    }
  }

  /**
   * Called when a stream part is received.
   * Uses a queue to ensure sequential execution and avoid concurrency issues.
   */
  onChange(part: LanguageModelV3StreamPart, sessionId: string): Promise<void> {
    if (
      part.type === "tool-result" &&
      (part as { toolName?: string }).toolName === "Write"
    ) {
      const manifestPath = `${this.workdir}/tasks/${sessionId}/artifact.json`;
      try {
        if (
          part.result &&
          typeof part.result === "object" &&
          "filePath" in part.result
        ) {
          if (part.result.filePath === manifestPath) {
            this.processingQueue = this.processingQueue
              .then(() => this.loadManifest(sessionId))
              .catch((e) => {
                console.error("[ArtifactProcessor] Queue error:", e);
              });
          }
        }
      } catch (_e) {
        return Promise.resolve();
      }
    }

    if (part.type !== "tool-result") {
      return Promise.resolve();
    }

    // Append processing task to the queue to ensure sequential execution.
    // Use .then().catch() so errors don't break the queue.
    this.processingQueue = this.processingQueue
      .then(() => this.processArtifacts())
      .catch((e) => {
        console.error("[ArtifactProcessor] Queue error:", e);
      });

    return this.processingQueue;
  }

  /**
   * Core artifact processing logic
   */
  private async processArtifacts(): Promise<void> {
    if (!this.artifactManifest?.artifacts?.length) {
      return;
    }

    // Try to get existing handle first, fallback to attach if not available
    const handle = this.sandbox.getHandle();
    if (!handle) {
      return;
    }

    // Read and send all artifact file contents
    for (const artifact of this.artifactManifest.artifacts) {
      try {
        // If path is absolute use it directly; otherwise resolve relative to workdir
        const filePath = artifact.path.startsWith("/")
          ? artifact.path
          : `${this.workdir}/${artifact.path}`;
        const content = await handle.readFile(filePath);
        if (!content) {
          continue;
        }

        const artifactId = artifact.id || artifact.path;
        const mimeType =
          artifact.mimeType ||
          (artifact.path.endsWith(".md")
            ? "text/markdown"
            : this.getMimeType(artifact.path));

        // Only send if content has changed
        if (this.sentArtifacts.get(artifactId) === content) {
          continue;
        }

        // Write directly via writer
        this.writer.write({
          type: "data-artifact",
          id: artifactId,
          data: { artifactId, content, mimeType },
        });
        this.sentArtifacts.set(artifactId, content);
        console.log("[ArtifactProcessor] Artifact written:", artifactId);
      } catch (e) {
        console.log(`[ArtifactProcessor] Failed to read ${artifact.path}:`, e);
      }
    }
  }

  private getMimeType(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      md: "text/markdown",
      json: "application/json",
      txt: "text/plain",
      html: "text/html",
      csv: "text/csv",
      pdf: "application/pdf",
    };
    return mimeTypes[ext || ""] || "application/octet-stream";
  }
}
