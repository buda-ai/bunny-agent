import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMediaSession,
  forkMediaSession,
  openMediaSession,
} from "../media-session-manager.js";
import { sessionMediaCodec } from "../session-media.js";

const roots: string[] = [];
function directory(): string {
  const path = mkdtempSync(join(tmpdir(), "pi-session-media-"));
  roots.push(path);
  return path;
}
afterEach(() => {
  vi.unstubAllEnvs();
  for (const path of roots.splice(0))
    rmSync(path, { recursive: true, force: true });
});
const image = (data: string) => ({
  type: "image" as const,
  mimeType: "image/png",
  data,
});
const message = (data: string) => ({
  role: "user" as const,
  content: [
    {
      type: "text" as const,
      text: "Keep the original task and use these images.",
    },
    image(data),
    image(data),
  ],
  timestamp: Date.now(),
});

describe("Pi session image persistence", () => {
  it("deduplicates large images on disk and restores exact pixels and task after restart", () => {
    const root = directory();
    const manager = createMediaSession(root, root);
    const data = Buffer.alloc(4 * 1024 * 1024, 42).toString("base64");
    const input = message(data);
    const entryId = manager.appendMessage(input);
    const file = manager.getSessionFile()!;
    expect(readFileSync(file, "utf8").length).toBeLessThan(2000);
    expect(readFileSync(file, "utf8")).not.toContain(data);
    expect(readdirSync(join(root, ".media"))).toHaveLength(1);
    expect(input.content[1]).toEqual(image(data));
    const reopened = openMediaSession(file);
    expect(reopened.getSessionId()).toBe(manager.getSessionId());
    expect(reopened.getEntry(entryId)).toEqual(manager.getEntry(entryId));
    expect(reopened.buildSessionContext().messages).toEqual([input]);
  });

  it("hydrates tool-result images and relocates sidecars when forking across directories", () => {
    const source = directory();
    const target = directory();
    const manager = createMediaSession(source, source);
    manager.appendMessage(message("cGl4ZWxz"));
    manager.appendMessage({
      role: "toolResult",
      toolCallId: "read-1",
      toolName: "read",
      isError: false,
      content: [image("dG9vbCBwaXhlbHM=")],
      timestamp: Date.now(),
    });
    const fork = forkMediaSession(manager.getSessionFile()!, target, target);
    expect(fork.buildSessionContext().messages).toEqual(
      manager.buildSessionContext().messages,
    );
    expect(readdirSync(join(target, ".media"))).toHaveLength(2);
    rmSync(source, { recursive: true, force: true });
    const reopened = openMediaSession(fork.getSessionFile()!);
    expect(reopened.buildSessionContext().messages).toEqual(
      fork.buildSessionContext().messages,
    );
    expect(readFileSync(fork.getSessionFile()!, "utf8")).not.toContain(
      "dG9vbCBwaXhlbHM=",
    );
  });

  it("keeps branch rewrites externalized", () => {
    const root = directory();
    const manager = createMediaSession(root, root);
    const first = manager.appendMessage(message("cGl4ZWxz"));
    manager.appendMessage(message("bW9yZSBwaXhlbHM="));
    const branch = manager.createBranchedSession(first)!;
    const raw = readFileSync(branch, "utf8");
    expect(raw).toContain("bunnyMedia");
    expect(raw).not.toContain("cGl4ZWxz");
    const reopened = openMediaSession(branch);
    expect(reopened.buildSessionContext().messages).toEqual([
      manager.getEntry(first)!.type === "message"
        ? (manager.getEntry(first) as { message: unknown }).message
        : null,
    ]);
  });

  it("supports legacy inline images and fails visibly for missing or corrupt media", () => {
    const root = directory();
    const legacy = SessionManager.create(root, root);
    legacy.appendMessage(message("bGVnYWN5"));
    const original = legacy.getSessionFile()!;
    const hydrated = openMediaSession(original);
    expect(hydrated.buildSessionContext().messages).toEqual(
      legacy.buildSessionContext().messages,
    );
    hydrated.appendMessage(message("bmV3"));
    const files = readdirSync(join(root, ".media"));
    const path = join(dirname(original), ".media", files[0]);
    writeFileSync(path, "corrupted");
    expect(() => openMediaSession(original)).toThrow(/checksum mismatch/);
    rmSync(path);
    expect(() => openMediaSession(original)).toThrow(
      /Cannot restore session image/,
    );
  });

  it("does not append a dangling reference when publishing media fails", () => {
    const root = directory();
    const manager = createMediaSession(root, root);
    manager.appendMessage(message("cGl4ZWxz"));
    const file = manager.getSessionFile()!;
    const before = readFileSync(file, "utf8");
    const [media] = readdirSync(join(root, ".media"));
    writeFileSync(join(root, ".media", media), "corrupted");
    expect(() => manager.appendMessage(message("cGl4ZWxz"))).toThrow(
      /checksum mismatch/,
    );
    expect(readFileSync(file, "utf8")).toBe(before);
    expect(
      readdirSync(join(root, ".media")).filter((name) => name.endsWith(".tmp")),
    ).toHaveLength(0);
  });

  it("hydrates references when switching an existing manager to another session", () => {
    const root = directory();
    const first = createMediaSession(root, root);
    first.appendMessage(message("Zmlyc3Q="));
    const second = createMediaSession(root, root);
    second.appendMessage(message("c2Vjb25k"));
    first.setSessionFile(second.getSessionFile()!);
    expect(first.buildSessionContext().messages).toEqual(
      second.buildSessionContext().messages,
    );
    first.appendMessage(message("dGhpcmQ="));
    expect(readFileSync(first.getSessionFile()!, "utf8")).not.toContain(
      "dGhpcmQ=",
    );
  });

  it("rejects a new oversized image before publishing media or JSONL", () => {
    const root = directory();
    const manager = createMediaSession(root, root);
    vi.stubEnv("SANDAGENT_MAX_SESSION_MEDIA_BYTES", "4");
    expect(() => manager.appendMessage(message("cGl4ZWxz"))).toThrow(
      /hydration limit/,
    );
    expect(existsSync(manager.getSessionFile()!)).toBe(false);
    expect(existsSync(join(root, ".media"))).toBe(false);
    expect(readdirSync(root)).toHaveLength(0);
  });

  it("caps aggregate hydration before reading repeated image references", () => {
    const root = directory();
    const manager = createMediaSession(root, root);
    manager.appendMessage(message("cGl4ZWxz"));
    const file = manager.getSessionFile()!;
    const before = readFileSync(file, "utf8");
    // Each image is 8 bytes, and the same reference occurs twice.
    vi.stubEnv("SANDAGENT_MAX_SESSION_MEDIA_BYTES", "12");
    expect(() => openMediaSession(file)).toThrow(
      /SANDAGENT_MAX_SESSION_MEDIA_BYTES/,
    );
    expect(readFileSync(file, "utf8")).toBe(before);
    vi.stubEnv("SANDAGENT_MAX_SESSION_MEDIA_BYTES", "16");
    expect(openMediaSession(file).buildSessionContext().messages).toEqual(
      manager.buildSessionContext().messages,
    );
  });

  it("caps legacy inline image hydration and rejects an oversized blob before validation reads", () => {
    const root = directory();
    const legacy = SessionManager.create(root, root);
    legacy.appendMessage(message("cGl4ZWxz"));
    const file = legacy.getSessionFile()!;
    const before = readFileSync(file, "utf8");
    vi.stubEnv("SANDAGENT_MAX_SESSION_MEDIA_BYTES", "12");
    expect(() => openMediaSession(file)).toThrow(/hydration limit/);
    expect(readFileSync(file, "utf8")).toBe(before);
    vi.stubEnv("SANDAGENT_MAX_SESSION_MEDIA_BYTES", "16");
    const encoded = sessionMediaCodec.encode(image("cGl4ZWxz"), file);
    vi.stubEnv("SANDAGENT_MAX_SESSION_MEDIA_BYTES", "4");
    expect(() => sessionMediaCodec.encode(encoded, file)).toThrow(
      /hydration limit/,
    );
  });

  it.each([
    "0",
    "-1",
    "NaN",
    "1.5",
  ])("uses the default hydration cap for invalid override %s", (value) => {
    vi.stubEnv("SANDAGENT_MAX_SESSION_MEDIA_BYTES", value);
    const input = message("cGl4ZWxz");
    expect(
      sessionMediaCodec.decode(input, join(directory(), "session.jsonl")),
    ).toEqual(input);
  });

  it("rejects unsupported reference versions and path traversal", () => {
    expect(() =>
      sessionMediaCodec.decode(
        {
          type: "image",
          mimeType: "image/png",
          bunnyMedia: {
            version: 1,
            sha256: "../../etc/passwd",
            encoding: "base64",
          },
        },
        join(directory(), "session.jsonl"),
      ),
    ).toThrow(/Invalid image reference/);
  });
});
