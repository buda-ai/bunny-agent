import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AppError } from "../utils.js";

// ---------------------------------------------------------------------------
// Helper: assert an AppError-like object (works across module reloads)
// ---------------------------------------------------------------------------
function isAppError(err: unknown): err is { status: number; message: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as any).status === "number" &&
    typeof (err as any).message === "string"
  );
}

// ---------------------------------------------------------------------------
// 4.1 — validateScriptName
// NOTE: No vi.resetModules() here so the static import of AppError is same instance.
// ---------------------------------------------------------------------------

describe("validateScriptName", () => {
  // Use the statically-imported module (no mock needed for pure sync logic)
  let validateScriptName: (name: string) => void;

  beforeEach(async () => {
    const mod = await import("../routes/site.js");
    validateScriptName = mod.validateScriptName;
  });

  it.each(["my-worker", "worker_1", "a", "a".repeat(64)])(
    "accepts valid name '%s'",
    (name) => {
      expect(() => validateScriptName(name)).not.toThrow();
    },
  );

  it.each(["", "   "])(
    "rejects empty/whitespace %j with 400",
    (name) => {
      let err: unknown;
      try { validateScriptName(name); } catch (e) { err = e; }
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(400);
      expect((err as AppError).message).toMatch(/scriptName is required/);
    },
  );

  it("rejects name longer than 64 chars with 400", () => {
    let err: unknown;
    try { validateScriptName("a".repeat(65)); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(400);
    expect((err as AppError).message).toMatch(/64 characters or fewer/);
  });

  it.each(["my worker", "foo.bar", "foo@bar"])(
    "rejects invalid chars in '%s' with 400",
    (name) => {
      let err: unknown;
      try { validateScriptName(name); } catch (e) { err = e; }
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(400);
      expect((err as AppError).message).toMatch(/alphanumeric|hyphens|underscores/);
    },
  );
});

// ---------------------------------------------------------------------------
// 4.2 — detectFramework
// ---------------------------------------------------------------------------

describe("detectFramework", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns 'vite' when vite.config.ts exists", async () => {
    vi.doMock("node:fs/promises", () => ({
      access: vi.fn().mockImplementation(async (p: unknown) => {
        const ps = String(p);
        if (ps.endsWith("vite.config.ts")) return;
        if (!ps.includes("vite.config") && !ps.includes("next.config")) return;
        throw new Error("not found");
      }),
      readFile: vi.fn(),
    }));
    vi.resetModules();
    const { detectFramework } = await import("../routes/site.js");
    expect(await detectFramework("/proj")).toBe("vite");
  });

  it("returns 'nextjs' when next.config.js exists and no vite config", async () => {
    vi.doMock("node:fs/promises", () => ({
      access: vi.fn().mockImplementation(async (p: unknown) => {
        const ps = String(p);
        if (ps.includes("vite.config")) throw new Error("not found");
        if (ps.endsWith("next.config.js")) return;
        if (!ps.includes("next.config")) return;
        throw new Error("not found");
      }),
      readFile: vi.fn(),
    }));
    vi.resetModules();
    const { detectFramework } = await import("../routes/site.js");
    expect(await detectFramework("/proj")).toBe("nextjs");
  });

  it("returns 'vite' when both configs exist (vite wins)", async () => {
    vi.doMock("node:fs/promises", () => ({
      access: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn(),
    }));
    vi.resetModules();
    const { detectFramework } = await import("../routes/site.js");
    expect(await detectFramework("/proj")).toBe("vite");
  });

  it("throws AppError(400) when neither config exists", async () => {
    vi.doMock("node:fs/promises", () => ({
      access: vi.fn().mockImplementation(async (p: unknown) => {
        const ps = String(p);
        if (
          ps.endsWith("vite.config.ts") || ps.endsWith("vite.config.js") ||
          ps.endsWith("next.config.js") || ps.endsWith("next.config.mjs") ||
          ps.endsWith("next.config.ts")
        ) {
          throw new Error("not found");
        }
        // directory access succeeds
      }),
      readFile: vi.fn(),
    }));
    vi.resetModules();
    const { detectFramework } = await import("../routes/site.js");
    let err: unknown;
    try { await detectFramework("/proj"); } catch (e) { err = e; }
    expect(isAppError(err)).toBe(true);
    expect((err as any).status).toBe(400);
  });

  it("throws AppError(400) 'project directory not found' when dir is inaccessible", async () => {
    vi.doMock("node:fs/promises", () => ({
      access: vi.fn().mockRejectedValueOnce(new Error("ENOENT")),
      readFile: vi.fn(),
    }));
    vi.resetModules();
    const { detectFramework } = await import("../routes/site.js");
    let err: unknown;
    try { await detectFramework("/no-such-dir"); } catch (e) { err = e; }
    expect(isAppError(err)).toBe(true);
    expect((err as any).message).toMatch(/project directory not found/);
  });
});

// ---------------------------------------------------------------------------
// 4.3 — locateArtifact
// ---------------------------------------------------------------------------

describe("locateArtifact", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("vite: returns .output/worker.js when it exists", async () => {
    vi.doMock("node:fs/promises", () => ({
      access: vi.fn().mockImplementation(async (p: unknown) => {
        if (String(p).endsWith(".output/worker.js")) return;
        throw new Error("not found");
      }),
      unlink: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn(),
      readdir: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock("node:child_process", () => ({
      spawn: vi.fn().mockReturnValue({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event: string, cb: (code: number) => void) => {
          if (event === "close") cb(0);
        }),
      }),
    }));
    vi.resetModules();
    const { locateArtifact } = await import("../routes/site.js");
    const result = await locateArtifact("/proj", "vite");
    expect(result.absolutePath).toMatch(/\.output\/worker\.js$/);
    expect(result.filename).toBe("worker.js");
  });

  it("vite: returns dist/worker.js when only that exists", async () => {
    vi.doMock("node:fs/promises", () => ({
      access: vi.fn().mockImplementation(async (p: unknown) => {
        const ps = String(p);
        if (ps.endsWith("dist/worker.js")) return;
        throw new Error("not found");
      }),
      unlink: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn(),
      readdir: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock("node:child_process", () => ({
      spawn: vi.fn().mockReturnValue({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event: string, cb: (code: number) => void) => {
          if (event === "close") cb(0);
        }),
      }),
    }));
    vi.resetModules();
    const { locateArtifact } = await import("../routes/site.js");
    const result = await locateArtifact("/proj", "vite");
    expect(result.absolutePath).toMatch(/dist\/worker\.js$/);
    expect(result.filename).toBe("worker.js");
  });

  it("vite: returns dist/_worker.js when only that exists", async () => {
    vi.doMock("node:fs/promises", () => ({
      access: vi.fn().mockImplementation(async (p: unknown) => {
        const ps = String(p);
        if (ps.endsWith("dist/_worker.js")) return;
        throw new Error("not found");
      }),
      unlink: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn(),
      readdir: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock("node:child_process", () => ({
      spawn: vi.fn().mockReturnValue({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event: string, cb: (code: number) => void) => {
          if (event === "close") cb(0);
        }),
      }),
    }));
    vi.resetModules();
    const { locateArtifact } = await import("../routes/site.js");
    const result = await locateArtifact("/proj", "vite");
    expect(result.absolutePath).toMatch(/dist\/_worker\.js$/);
    expect(result.filename).toBe("_worker.js");
  });

  it("vite: throws AppError(400) 'vite build output not found' when none exist", async () => {
    vi.doMock("node:fs/promises", () => ({
      access: vi.fn().mockRejectedValue(new Error("not found")),
      unlink: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn(),
      readdir: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock("node:child_process", () => ({
      spawn: vi.fn().mockReturnValue({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event: string, cb: (code: number) => void) => {
          if (event === "close") cb(0);
        }),
      }),
    }));
    vi.resetModules();
    const { locateArtifact } = await import("../routes/site.js");
    let err: unknown;
    try { await locateArtifact("/proj", "vite"); } catch (e) { err = e; }
    expect(isAppError(err)).toBe(true);
    expect((err as any).message).toMatch(/vite build output not found/);
  });

  it("nextjs: returns .open-next/worker.js", async () => {
    vi.doMock("node:fs/promises", () => ({
      access: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn(),
    }));
    vi.resetModules();
    const { locateArtifact } = await import("../routes/site.js");
    const result = await locateArtifact("/proj", "nextjs");
    expect(result.absolutePath).toMatch(/\.open-next\/worker\.js$/);
    expect(result.filename).toBe("worker.js");
  });

  it("nextjs: throws AppError(400) 'opennextjs-cloudflare build output not found'", async () => {
    vi.doMock("node:fs/promises", () => ({
      access: vi.fn().mockRejectedValue(new Error("not found")),
      readFile: vi.fn(),
    }));
    vi.resetModules();
    const { locateArtifact } = await import("../routes/site.js");
    let err: unknown;
    try { await locateArtifact("/proj", "nextjs"); } catch (e) { err = e; }
    expect(isAppError(err)).toBe(true);
    expect((err as any).message).toMatch(/opennextjs-cloudflare build output not found/);
  });
});

// ---------------------------------------------------------------------------
// 4.4 — deploy pipeline
// ---------------------------------------------------------------------------

describe("deploy pipeline", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of [
      "CLOUDFLARE_API_TOKEN",
      "CLOUDFLARE_ACCOUNT_ID",
      "CLOUDFLARE_DISPATCH_NAMESPACE",
    ]) {
      savedEnv[k] = process.env[k];
      process.env[k] = `test-${k}`;
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns ok:true with framework field", async () => {
    vi.doMock("node:fs/promises", () => ({
      access: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(Buffer.from("x")),
      readdir: vi.fn().mockResolvedValue([]),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => false, isFile: () => false }),
    }));

    vi.doMock("node:child_process", () => ({
      spawn: vi.fn().mockReturnValue({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event: string, cb: (code: number) => void) => {
          if (event === "close") cb(0);
        }),
      }),
    }));

    vi.doMock("cloudflare", () => {
      const updateFn = vi.fn().mockResolvedValue({});
      class MockCloudflare {
        workersForPlatforms = {
          dispatch: {
            namespaces: {
              scripts: { update: updateFn },
            },
          },
        };
      }
      return {
        default: MockCloudflare,
        toFile: vi.fn().mockResolvedValue("mockFile"),
      };
    });

    vi.resetModules(); // flush module cache so the doMocks take effect
    const { deploy } = await import("../routes/site.js");
    const result = await deploy({} as any, {
      projectDir: "/tmp/proj",
      scriptName: "my-worker",
    });
    expect(result.ok).toBe(true);
    expect((result.data as any).framework).toMatch(/^(vite|nextjs)$/);
  });
});

// ---------------------------------------------------------------------------
// 4.4b — deployNextjsWithWrangler
// ---------------------------------------------------------------------------

describe("deployNextjsWithWrangler", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  function makeSpawnMock(exitCode: number) {
    return vi.fn().mockReturnValue({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn().mockImplementation((event: string, cb: (code: number) => void) => {
        if (event === "close") cb(exitCode);
      }),
    });
  }

  it("patches wrangler.jsonc name with scriptName, runs wrangler, then restores original", async () => {
    const originalContent = JSON.stringify({
      name: "original",
      main: ".open-next/worker.js",
      services: [{ binding: "WORKER_SELF_REFERENCE", service: "original" }],
    });
    let writtenContents: string[] = [];
    const spawnMock = makeSpawnMock(0);

    vi.doMock("node:fs/promises", () => ({
      access: vi.fn().mockImplementation(async (p: unknown) => {
        if (String(p).endsWith("wrangler.jsonc")) return;
        throw new Error("not found");
      }),
      readFile: vi.fn().mockResolvedValue(originalContent),
      writeFile: vi.fn().mockImplementation(async (_p: unknown, content: string) => {
        writtenContents.push(content);
        return undefined;
      }),
    }));
    vi.doMock("node:child_process", () => ({ spawn: spawnMock }));

    vi.resetModules();
    const { deployNextjsWithWrangler } = await import("../routes/site.js");
    await deployNextjsWithWrangler("my-worker" as any, "/proj" as any, {
      apiToken: "tok",
      accountId: "acc",
      dispatchNamespace: "ns",
    });

    // First write: patched config with scriptName
    const patched = JSON.parse(writtenContents[0]);
    expect(patched.name).toBe("my-worker");
    expect(patched.main).toBe(".open-next/worker.js");
    // Service binding self-reference rewritten to match new name
    expect(patched.services[0].service).toBe("my-worker");

    // Second write: original content restored
    expect(writtenContents[1]).toBe(originalContent);

    // wrangler was called with dispatch-namespace flag
    expect(spawnMock).toHaveBeenCalledWith(
      "npx",
      ["wrangler", "deploy", "--dispatch-namespace", "ns"],
      expect.objectContaining({ cwd: "/proj" }),
    );
  });

  it("restores original config even when wrangler exits non-zero", async () => {
    const originalContent = JSON.stringify({ name: "original" });
    let restoredContent: string | null = null;
    const spawnMock = makeSpawnMock(1); // non-zero exit

    vi.doMock("node:fs/promises", () => ({
      access: vi.fn().mockImplementation(async (p: unknown) => {
        if (String(p).endsWith("wrangler.jsonc")) return;
        throw new Error("not found");
      }),
      readFile: vi.fn().mockResolvedValue(originalContent),
      writeFile: vi.fn().mockImplementation(async (_p: unknown, content: string) => {
        restoredContent = content; // capture last write
        return undefined;
      }),
    }));
    vi.doMock("node:child_process", () => ({ spawn: spawnMock }));
    const { deployNextjsWithWrangler } = await import("../routes/site.js");
    let err: unknown;
    try {
      await deployNextjsWithWrangler("my-worker" as any, "/proj" as any, {
        apiToken: "tok",
        accountId: "acc",
        dispatchNamespace: "ns",
      });
    } catch (e) { err = e; }

    expect(isAppError(err)).toBe(true);
    expect((err as any).status).toBe(500);
    // Original content was restored even though wrangler failed
    expect(restoredContent).toBe(originalContent);
  });

  it("throws AppError(400) when no wrangler config file is found", async () => {
    vi.doMock("node:fs/promises", () => ({
      access: vi.fn().mockRejectedValue(new Error("ENOENT")),
      readFile: vi.fn(),
      writeFile: vi.fn(),
    }));
    vi.doMock("node:child_process", () => ({ spawn: vi.fn() }));

    vi.resetModules();
    const { deployNextjsWithWrangler } = await import("../routes/site.js");
    let err: unknown;
    try {
      await deployNextjsWithWrangler("my-worker" as any, "/proj" as any, {
        apiToken: "tok",
        accountId: "acc",
        dispatchNamespace: "ns",
      });
    } catch (e) { err = e; }

    expect(isAppError(err)).toBe(true);
    expect((err as any).status).toBe(400);
    expect((err as any).message).toMatch(/wrangler config not found/);
  });

  it("passes CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to wrangler env", async () => {
    const spawnMock = makeSpawnMock(0);

    vi.doMock("node:fs/promises", () => ({
      access: vi.fn().mockImplementation(async (p: unknown) => {
        if (String(p).endsWith("wrangler.jsonc")) return;
        throw new Error("not found");
      }),
      readFile: vi.fn().mockResolvedValue(JSON.stringify({ name: "original" })),
      writeFile: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("node:child_process", () => ({ spawn: spawnMock }));

    vi.resetModules();
    const { deployNextjsWithWrangler } = await import("../routes/site.js");
    await deployNextjsWithWrangler("my-worker" as any, "/proj" as any, {
      apiToken: "test-token",
      accountId: "test-account",
      dispatchNamespace: "ns",
    });

    const spawnEnv = spawnMock.mock.calls[0][2].env;
    expect(spawnEnv.CLOUDFLARE_API_TOKEN).toBe("test-token");
    expect(spawnEnv.CLOUDFLARE_ACCOUNT_ID).toBe("test-account");
  });
});


// ---------------------------------------------------------------------------

function withDeleteMock(deleteFn: () => Promise<unknown>) {
  vi.doMock("cloudflare", () => {
    class MockCloudflare {
      workersForPlatforms = {
        dispatch: { namespaces: { scripts: { delete: deleteFn } } },
      };
    }
    return { default: MockCloudflare, toFile: vi.fn() };
  });
}

describe("deleteSite", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of [
      "CLOUDFLARE_API_TOKEN",
      "CLOUDFLARE_ACCOUNT_ID",
      "CLOUDFLARE_DISPATCH_NAMESPACE",
    ]) {
      savedEnv[k] = process.env[k];
      process.env[k] = `test-${k}`;
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns ok:true with deleted:true on success", async () => {
    withDeleteMock(() => Promise.resolve({}));
    vi.resetModules();
    const { deleteSite } = await import("../routes/site.js");
    const result = await deleteSite({} as any, { scriptName: "my-worker" });
    expect(result.ok).toBe(true);
    expect((result.data as any).deleted).toBe(true);
  });

  it("throws AppError(404) 'worker not found' when delete returns 404", async () => {
    withDeleteMock(() => Promise.reject({ status: 404 }));
    vi.resetModules();
    const { deleteSite } = await import("../routes/site.js");
    let err: unknown;
    try { await deleteSite({} as any, { scriptName: "missing-worker" }); } catch (e) { err = e; }
    expect(isAppError(err)).toBe(true);
    expect((err as any).status).toBe(404);
    expect((err as any).message).toMatch(/worker not found/);
  });

  it("throws AppError(500) for generic errors", async () => {
    withDeleteMock(() => Promise.reject(new Error("Quota exceeded")));
    vi.resetModules();
    const { deleteSite } = await import("../routes/site.js");
    let err: unknown;
    try { await deleteSite({} as any, { scriptName: "my-worker" }); } catch (e) { err = e; }
    expect(isAppError(err)).toBe(true);
    expect((err as any).status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// 4.6 — validateEnv
// ---------------------------------------------------------------------------

describe("validateEnv", () => {
  const ENV_KEYS = [
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_DISPATCH_NAMESPACE",
  ] as const;

  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k];
      process.env[k] = `test-value-${k}`;
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.resetModules();
  });

  for (const key of ENV_KEYS) {
    it(`throws AppError(500) 'missing required env var: ${key}' when ${key} is absent`, async () => {
      delete process.env[key];
      vi.resetModules();
      const { validateEnv } = await import("../routes/site.js");
      let err: unknown;
      try { validateEnv(); } catch (e) { err = e; }
      expect(isAppError(err)).toBe(true);
      expect((err as any).status).toBe(500);
      expect((err as any).message).toBe(`missing required env var: ${key}`);
    });
  }
});

// ---------------------------------------------------------------------------
// 4.7 — PBT: validateScriptName is total and consistent
// Validates: Requirements 5.4, 5.5, 5.6
// ---------------------------------------------------------------------------

import * as fc from "fast-check";

describe("PBT: validateScriptName", () => {
  let validateScriptName: (s: string) => void;
  beforeEach(async () => {
    vi.resetModules();
    validateScriptName = (await import("../routes/site.js")).validateScriptName;
  });

  it("never throws for strings matching the valid pattern", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z0-9_-]{1,64}$/), (s) => {
        expect(() => validateScriptName(s)).not.toThrow();
      }),
    );
  });

  it("always throws for strings containing disallowed characters", () => {
    // Generate a string that has at least one char not in [A-Za-z0-9_-], is non-empty
    const disallowedCharArb = fc.string({ minLength: 1 }).filter(
      (s) => s.trim().length > 0 && !/^[A-Za-z0-9_-]{1,64}$/.test(s),
    );
    fc.assert(
      fc.property(disallowedCharArb, (s) => {
        let threw = false;
        try { validateScriptName(s); } catch { threw = true; }
        expect(threw).toBe(true);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// 4.8 — PBT: Framework detection is deterministic
// Validates: Requirements 1.1, 1.2, 1.3, 1.4
// ---------------------------------------------------------------------------

describe("PBT: detectFramework", () => {
  afterEach(() => { vi.resetModules(); vi.restoreAllMocks(); });

  it("is deterministic given same file presence", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), fc.boolean(), async (hasVite, hasNext) => {
        vi.doMock("node:fs/promises", () => ({
          access: vi.fn().mockImplementation(async (p: unknown) => {
            const ps = String(p);
            const isViteConfig = ps.endsWith("vite.config.ts") || ps.endsWith("vite.config.js");
            const isNextConfig = ps.endsWith("next.config.js") || ps.endsWith("next.config.mjs") || ps.endsWith("next.config.ts");
            if (isViteConfig && !hasVite) throw new Error("ENOENT");
            if (isNextConfig && !hasNext) throw new Error("ENOENT");
          }),
          readFile: vi.fn(),
        }));
        vi.resetModules();
        const { detectFramework } = await import("../routes/site.js");
        if (hasVite) {
          expect(await detectFramework("/proj")).toBe("vite");
        } else if (hasNext) {
          expect(await detectFramework("/proj")).toBe("nextjs");
        } else {
          let threw = false;
          try { await detectFramework("/proj"); } catch { threw = true; }
          expect(threw).toBe(true);
        }
      }),
      { numRuns: 20 },
    );
  });
});

// ---------------------------------------------------------------------------
// 4.9 — PBT: Artifact location priority is stable
// Validates: Requirements 2.1, 2.3, 3.1, 3.2
// ---------------------------------------------------------------------------

describe("PBT: locateArtifact priority", () => {
  afterEach(() => { vi.resetModules(); vi.restoreAllMocks(); });

  it("always returns highest-priority existing vite path", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(), fc.boolean(), fc.boolean(),
        async (hasOutput, hasDist, hasDistUnderscore) => {
          vi.doMock("node:fs/promises", () => ({
            access: vi.fn().mockImplementation(async (p: unknown) => {
              const ps = String(p);
              if (ps.endsWith(".output/worker.js") && !hasOutput) throw new Error("ENOENT");
              if (ps.endsWith("dist/worker.js") && !hasDist) throw new Error("ENOENT");
              if (ps.endsWith("dist/_worker.js") && !hasDistUnderscore) throw new Error("ENOENT");
            }),
            unlink: vi.fn().mockResolvedValue(undefined),
            readFile: vi.fn(),
            readdir: vi.fn().mockResolvedValue([]),
          }));
          vi.doMock("node:child_process", () => ({
            spawn: vi.fn().mockReturnValue({
              stdout: { on: vi.fn() },
              stderr: { on: vi.fn() },
              on: vi.fn().mockImplementation((event: string, cb: (code: number) => void) => {
                if (event === "close") cb(0);
              }),
            }),
          }));
          vi.resetModules();
          const { locateArtifact } = await import("../routes/site.js");
          if (hasOutput) {
            const r = await locateArtifact("/proj", "vite");
            expect(r.absolutePath).toMatch(/\.output\/worker\.js$/);
          } else if (hasDist) {
            const r = await locateArtifact("/proj", "vite");
            expect(r.absolutePath).toMatch(/dist\/worker\.js$/);
            expect(r.absolutePath).not.toMatch(/_worker\.js$/);
          } else if (hasDistUnderscore) {
            const r = await locateArtifact("/proj", "vite");
            expect(r.absolutePath).toMatch(/dist\/_worker\.js$/);
          } else {
            let threw = false;
            try { await locateArtifact("/proj", "vite"); } catch { threw = true; }
            expect(threw).toBe(true);
          }
        },
      ),
      { numRuns: 20 },
    );
  });
});
