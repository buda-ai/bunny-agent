import type {
  ArtifactProcessor,
  LanguageModelV3StreamPart,
  StreamWriter,
} from "@sandagent/ai-provider";
import type { SandboxAdapter } from "@sandagent/manager";

/**
 * TaskDrivenArtifactProcessor
 *
 * 事件驱动的 Artifact 处理器
 * 1. 从 tasks/{sessionId}/artifact.json 读取 artifact 文件列表
 * 2. onChange 时读取文件内容并通过 writer 发送
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
   * Sandbox adapter，用于读取文件
   */
  sandbox: SandboxAdapter;

  /**
   * 工作目录，默认为 /workspace
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
  // 队列机制：确保 onChange 顺序执行
  private processingQueue: Promise<void> = Promise.resolve();

  constructor(options: TaskDrivenArtifactProcessorOptions) {
    this.sandbox = options.sandbox;
    this.workdir = options.workdir || "/workspace";
    this.writer = options.writer;
  }

  /**
   * 加载 tasks/{sessionId}/artifact.json 清单文件
   * 只有当文件内容变化时才更新缓存并打印日志
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

      // 比较新旧 manifest，内容相同则直接返回缓存
      if (
        this.artifactManifest &&
        JSON.stringify(newManifest) === JSON.stringify(this.artifactManifest)
      ) {
        return;
      }

      // 内容变化了，更新缓存
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
   * 当收到 stream part 时触发
   * 使用队列机制确保顺序执行，避免并发问题
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
      } catch (e) {
        return Promise.resolve();
      }
    }

    if (part.type !== "tool-input-delta") {
      return Promise.resolve();
    }

    // 将处理任务追加到队列，确保顺序执行
    // 使用 .then().catch() 确保即使出错也不会断掉队列
    this.processingQueue = this.processingQueue
      .then(() => this.processArtifacts())
      .catch((e) => {
        console.error("[ArtifactProcessor] Queue error:", e);
      });

    return this.processingQueue;
  }

  /**
   * 实际处理 artifact 的逻辑
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

    // 读取所有 artifact 文件内容并发送
    for (const artifact of this.artifactManifest.artifacts) {
      try {
        // 如果路径是绝对路径，直接使用；否则相对于工作目录
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

        // 使用 writer 直接写入
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
