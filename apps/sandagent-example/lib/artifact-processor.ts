import type {
  ArtifactProcessor,
  ArtifactResult,
  LanguageModelV3StreamPart,
} from "@sandagent/ai-provider";
import type { SandboxAdapter } from "@sandagent/manager";

/**
 * TaskDrivenArtifactProcessor
 *
 * 事件驱动的 Artifact 处理器
 * 1. 从 tasks/{sessionId}/artifact.json 读取 artifact 文件列表
 * 2. onChange 时读取文件内容并返回
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
}

export class TaskDrivenArtifactProcessor implements ArtifactProcessor {
  private sandbox: SandboxAdapter;
  private workdir: string;
  private artifactManifest: ArtifactManifest | null = null;

  constructor(options: TaskDrivenArtifactProcessorOptions) {
    this.sandbox = options.sandbox;
    this.workdir = options.workdir || "/workspace";
  }

  /**
   * 加载 tasks/{sessionId}/artifact.json 清单文件
   */
  private async loadManifest(sessionId: string): Promise<ArtifactManifest> {
    if (this.artifactManifest) {
      return this.artifactManifest;
    }

    try {
      const manifestPath = `${this.workdir}/tasks/${sessionId}/artifact.json`;
      // Try to get existing handle first, fallback to attach if not available
      const handle = this.sandbox.getHandle?.();
      if (!handle) {
        return { artifacts: [] };
      }
      const content = await handle.readFile(manifestPath);
      this.artifactManifest = JSON.parse(content) as ArtifactManifest;
      return this.artifactManifest;
    } catch (e) {
      console.log(
        `[ArtifactProcessor] No manifest found at tasks/${sessionId}/artifact.json`,
      );
      return { artifacts: [] };
    }
  }

  /**
   * 当收到 stream part 时触发
   * 读取 artifact.json 中列出的所有文件，返回主要文件内容
   */
  async onChange(
    sessionId: string,
    part: LanguageModelV3StreamPart,
  ): Promise<ArtifactResult | ArtifactResult[] | undefined> {
    console.log(
      "[ArtifactProcessor] onChange:",
      part.type,
      "sessionId:",
      sessionId,
    );

    // 重新加载 manifest（因为可能有新的 artifact）
    this.artifactManifest = null;
    const manifest = await this.loadManifest(sessionId);

    if (!manifest.artifacts?.length) {
      return;
    }

    // Try to get existing handle first, fallback to attach if not available
    const handle = this.sandbox.getHandle?.();
    if (!handle) {
      return;
    }

    // 读取所有 artifact 文件内容
    // artifact.path 是相对于工作目录的路径
    const results: ArtifactResult[] = [];

    for (const artifact of manifest.artifacts) {
      try {
        // 如果路径是绝对路径，直接使用；否则相对于工作目录
        const filePath = artifact.path.startsWith("/")
          ? artifact.path
          : `${this.workdir}/${artifact.path}`;
        const content = await handle.readFile(filePath);

        results.push({
          artifactId: artifact.id || artifact.path,
          content,
          mimeType:
            artifact.mimeType ||
            (artifact.path.endsWith(".md")
              ? "text/markdown"
              : this.getMimeType(artifact.path)),
        });
      } catch (e) {
        console.log(`[ArtifactProcessor] Failed to read ${artifact.path}:`, e);
      }
    }

    // 返回所有成功读取的 artifacts
    return results.length > 0 ? results : undefined;
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
