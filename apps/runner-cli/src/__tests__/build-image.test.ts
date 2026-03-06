import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock child_process so we never actually run docker
vi.mock("node:child_process", () => ({
  execSync: vi.fn((cmd: string) => {
    // docker info check — pretend docker is running
    if (cmd === "docker info") return Buffer.from("");
    // Record the command for assertions
    return Buffer.from("");
  }),
}));

import { execSync } from "node:child_process";
import { buildImage } from "../build-image.js";

const mockedExecSync = vi.mocked(execSync);

const TEST_DIR = join(process.cwd(), ".test-build-image");
const BUILD_CONTEXT = join(TEST_DIR, ".docker-staging");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  mockedExecSync.mockClear();
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  rmSync(BUILD_CONTEXT, { recursive: true, force: true });
  // Also clean up the default build context location
  rmSync(join(process.cwd(), ".docker-staging"), {
    recursive: true,
    force: true,
  });
});

describe("buildImage", () => {
  it("builds a plain image without template", async () => {
    await buildImage({
      name: "myorg/sandagent",
      tag: "0.1.0",
      platform: "linux/amd64",
      push: false,
    });

    // Should have called docker info + docker build
    const calls = mockedExecSync.mock.calls.map((c) => c[0] as string);
    expect(calls.some((c) => c === "docker info")).toBe(true);
    expect(calls.some((c) => c.includes("docker build"))).toBe(true);

    // docker build should reference the correct image name
    const buildCmd = calls.find((c) => c.includes("docker build"))!;
    expect(buildCmd).toContain("-t myorg/sandagent:0.1.0");
    expect(buildCmd).toContain("--platform=linux/amd64");

    // Should NOT have called docker push
    expect(calls.some((c) => c.includes("docker push"))).toBe(false);
  });

  it("generates Dockerfile in build context", async () => {
    await buildImage({
      name: "myorg/sandagent",
      tag: "1.0.0",
      platform: "linux/amd64",
      push: false,
    });

    const contextDir = join(process.cwd(), ".docker-staging");
    const dockerfilePath = join(contextDir, "Dockerfile");
    expect(existsSync(dockerfilePath)).toBe(true);

    const content = readFileSync(dockerfilePath, "utf8");
    expect(content).toContain("FROM node:20-slim");
    expect(content).toContain("@sandagent/runner-cli");
    expect(content).toContain('CMD ["bash", "-c", "start-cdp; sleep infinity"]');
  });

  it("uses --image override when provided", async () => {
    await buildImage({
      name: "sandagent",
      tag: "latest",
      image: "custom/image:v2",
      platform: "linux/amd64",
      push: false,
    });

    const calls = mockedExecSync.mock.calls.map((c) => c[0] as string);
    const buildCmd = calls.find((c) => c.includes("docker build"))!;
    expect(buildCmd).toContain("-t custom/image:v2");
  });

  it("builds with template and injects COPY instructions", async () => {
    // Create a fake template directory
    const templateDir = join(TEST_DIR, "my-agent");
    mkdirSync(templateDir, { recursive: true });
    writeFileSync(join(templateDir, "CLAUDE.md"), "# My Agent");
    const claudeDir = join(templateDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, "settings.json"), '{"max_tokens": 4096}');

    await buildImage({
      name: "myorg/sandagent",
      tag: "0.1.0",
      platform: "linux/amd64",
      template: templateDir,
      push: false,
    });

    // Image name should include template name
    const calls = mockedExecSync.mock.calls.map((c) => c[0] as string);
    const buildCmd = calls.find((c) => c.includes("docker build"))!;
    expect(buildCmd).toContain("-t myorg/sandagent:0.1.0");

    // Generated Dockerfile should have template COPY lines
    const contextDir = join(process.cwd(), ".docker-staging");
    const dockerfile = readFileSync(join(contextDir, "Dockerfile"), "utf8");
    expect(dockerfile).toContain("COPY templates/my-agent/CLAUDE.md");
    expect(dockerfile).toContain("COPY templates/my-agent/.claude");
    expect(dockerfile).toContain("mkdir -p /opt/sandagent/templates");

    // Template files should be copied into build context
    expect(
      existsSync(join(contextDir, "templates", "my-agent", "CLAUDE.md")),
    ).toBe(true);
    expect(
      existsSync(
        join(contextDir, "templates", "my-agent", ".claude", "settings.json"),
      ),
    ).toBe(true);
  });

  it("pushes when --push is set", async () => {
    await buildImage({
      name: "myorg/sandagent",
      tag: "0.1.0",
      platform: "linux/amd64",
      push: true,
    });

    const calls = mockedExecSync.mock.calls.map((c) => c[0] as string);
    expect(calls.some((c) => c.includes("docker push"))).toBe(true);
    expect(
      calls.some((c) => c.includes("docker push myorg/sandagent:0.1.0")),
    ).toBe(true);
  });

  it("fails push when name has no namespace", async () => {
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    const mockError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      buildImage({
        name: "sandagent",
        tag: "0.1.0",
        platform: "linux/amd64",
        push: true,
      }),
    ).rejects.toThrow("process.exit");

    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining("--push requires --name to include namespace"),
    );

    mockExit.mockRestore();
    mockError.mockRestore();
  });

  it("does not push when --push is false", async () => {
    await buildImage({
      name: "myorg/sandagent",
      tag: "0.1.0",
      platform: "linux/amd64",
      push: false,
    });

    const calls = mockedExecSync.mock.calls.map((c) => c[0] as string);
    expect(calls.some((c) => c.includes("docker push"))).toBe(false);
    expect(calls.some((c) => c.includes("docker tag"))).toBe(false);
  });
});
