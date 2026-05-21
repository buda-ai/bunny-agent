/**
 * Property-based tests for the simple-git-rpc endpoint.
 *
 * Uses fast-check with vitest to verify correctness properties across
 * large input spaces. Each property test runs 100 iterations.
 */
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DaemonRouter } from "../router.js";
import { SIMPLE_GIT_RPC_COMMANDS, simpleGitRpc } from "../routes/git.js";
import { createSimpleGitProxy } from "../shared/git-types.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

let tmpRepoPath: string;
let router: DaemonRouter;

beforeAll(() => {
  // Create a temp directory and initialise a real git repo in it
  tmpRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), "simple-git-rpc-pbt-"));

  childProcess.execSync("git init", { cwd: tmpRepoPath, stdio: "pipe" });
  childProcess.execSync('git config user.email "test@example.com"', {
    cwd: tmpRepoPath,
    stdio: "pipe",
  });
  childProcess.execSync('git config user.name "Test User"', {
    cwd: tmpRepoPath,
    stdio: "pipe",
  });

  // Initialise the router pointing at the temp repo as its root
  router = new DaemonRouter({ root: tmpRepoPath });
});

afterAll(() => {
  if (tmpRepoPath) {
    fs.rmSync(tmpRepoPath, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe("simple-git-rpc PBT", () => {
  it("placeholder — scaffolding compiles and fixtures initialise", () => {
    // Verify the shared fixtures were set up correctly
    expect(typeof tmpRepoPath).toBe("string");
    expect(tmpRepoPath.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(tmpRepoPath, ".git"))).toBe(true);
    expect(router).toBeDefined();

    // Verify imports are available
    expect(SIMPLE_GIT_RPC_COMMANDS).toBeDefined();
    expect(SIMPLE_GIT_RPC_COMMANDS.size).toBeGreaterThan(0);
    expect(typeof simpleGitRpc).toBe("function");
    expect(typeof createSimpleGitProxy).toBe("function");
    expect(typeof fc.string).toBe("function");
  });

  /**
   * Property 5: Proxy sends correct request body for any command and options
   *
   * Validates: Requirements 7.2, 7.3
   *
   * Note: options values are constrained to JSON-safe types (no `undefined`,
   * no `bigint`, no functions) because the proxy serialises the body via
   * JSON.stringify and the test inspects the round-tripped value.
   */
  it("Property 5: proxy sends correct request body for any command and options", async () => {
    const endpoint = "http://localhost:3000/api/git/simple-git-rpc";
    const defaultPayload = { repo: "/test/repo" };

    // Produce only JSON-serializable leaf values so the round-trip is lossless.
    const jsonSafeValue: fc.Arbitrary<unknown> = fc.oneof(
      fc.string(),
      fc.integer(),
      fc.double({ noNaN: true, noDefaultInfinity: true }),
      fc.boolean(),
      fc.constant(null),
    );

    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.string({ minLength: 1 }),
          fc.dictionary(fc.string(), jsonSafeValue),
        ),
        async ([command, options]) => {
          let captured: RequestInit | undefined;

          const mockFetch = async (
            _url: string | URL | Request,
            init?: RequestInit,
          ): Promise<Response> => {
            captured = init;
            return {
              ok: true,
              json: async () => ({ ok: true, data: null, error: null }),
            } as Response;
          };

          const proxy = createSimpleGitProxy(
            endpoint,
            mockFetch as typeof fetch,
            defaultPayload,
          );

          await proxy[command](options as Record<string, unknown>);

          expect(captured).toBeDefined();
          const body = JSON.parse(captured!.body as string);
          expect(body.command).toBe(command);
          expect(body.options).toEqual(options);
          expect(body.repo).toBe(defaultPayload.repo);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 6: Proxy resolves with data on ok:true responses
   *
   * For any value X, when the mocked fetchFn returns { ok: true, data: X, error: null },
   * the proxy method SHALL resolve its promise with X.
   *
   * Validates: Requirements 7.4
   */
  it("Property 6: proxy resolves with data on ok:true responses", async () => {
    const endpoint = "http://localhost:3000/api/git/simple-git-rpc";

    await fc.assert(
      fc.asyncProperty(fc.anything(), async (data) => {
        const mockFetch = async (_url: unknown, _init?: unknown) =>
          ({
            json: async () => ({ ok: true, data, error: null }),
          }) as unknown as Response;

        const proxy = createSimpleGitProxy(
          endpoint,
          mockFetch as typeof fetch,
          {
            repo: ".",
          },
        );

        const result = await proxy.status();
        expect(result).toEqual(data);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 1: Allowlisted commands succeed on a valid repo
   *
   * For any command in SIMPLE_GIT_RPC_COMMANDS and a valid initialized git
   * repository, the handler must never return HTTP 500. Commands that require
   * a remote (fetch, pull, push) or an initial commit (log, show, etc.) may
   * legitimately return 400, but all errors must be handled gracefully.
   *
   * Validates: Requirements 2.2, 3.4
   */
  it("Property 1 — allowlisted commands succeed on a valid repo", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...SIMPLE_GIT_RPC_COMMANDS),
        async (command) => {
          const response = await router.handle(
            "POST",
            "/api/git/simple-git-rpc",
            { repo: ".", command },
          );

          // The router must always return a response (never null) for a known route
          expect(response).not.toBeNull();

          // The response must be either 200 (success) or 400 (expected git error,
          // e.g. no remote for fetch/pull/push, no commits for log/show, etc.).
          // It must NEVER be 500 — all simple-git errors must be caught and
          // surfaced as AppError(400), not as unhandled exceptions.
          expect([200, 400]).toContain(response!.status);

          if (response!.status === 200) {
            // On success the envelope must have ok: true
            expect(response!.body.ok).toBe(true);
          } else {
            // On a handled error the envelope must have ok: false with an error message
            expect(response!.body.ok).toBe(false);
            expect(typeof response!.body.error).toBe("string");
          }
        },
      ),
      { numRuns: 100 },
    );
  }, 30_000); // 30 s — each run invokes a real git subprocess; 100 runs need extra time

  /**
   * Property 7: Proxy rejects with Error on ok:false responses
   *
   * Validates: Requirements 7.5
   */
  it("Property 7: proxy rejects with Error on ok:false responses", async () => {
    const endpoint = "http://localhost/api/git/simple-git-rpc";

    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), async (errorMsg) => {
        const mockFetch = async (_url: string, _init?: RequestInit) =>
          ({
            json: async () => ({ ok: false, data: null, error: errorMsg }),
          }) as unknown as Response;

        const proxy = createSimpleGitProxy(endpoint, mockFetch, {
          repo: ".",
        });

        await expect(proxy.status()).rejects.toThrow(errorMsg);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2: Non-allowlisted commands are rejected with status 400
   *
   * Validates: Requirements 3.2
   */
  it("Property 2: non-allowlisted commands are rejected with status 400", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string().filter((s) => !SIMPLE_GIT_RPC_COMMANDS.has(s)),
        async (command) => {
          const result = await router.handle(
            "POST",
            "/api/git/simple-git-rpc",
            { repo: ".", command },
          );

          // result must not be null (route is registered)
          expect(result).not.toBeNull();
          if (result === null) return;

          expect(result.status).toBe(400);
          expect(result.body.ok).toBe(false);
          expect(result.body.error).toContain(command);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 3: Path traversal attempts are rejected with status 400
   *
   * Validates: Requirements 4.2
   */
  it("Property 3: path traversal attempts are rejected with status 400", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.string().map((s) => `../../${s}`),
          fc.string().map((s) => `/absolute/${s}`),
        ),
        async (repo) => {
          const result = await router.handle(
            "POST",
            "/api/git/simple-git-rpc",
            { repo, command: "status" },
          );

          // result must not be null (route is registered)
          expect(result).not.toBeNull();
          if (result === null) return;

          expect(result.status).toBe(400);
          expect(result.body.ok).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4: All simple-git errors surface as status 400, not 500
   *
   * For any error thrown by simple-git during command execution, the
   * simpleGitRpc handler SHALL re-throw it as AppError(400, ...), causing
   * DaemonRouter to return { ok: false, error: <message> } with HTTP status
   * 400 — never HTTP 500.
   *
   * Strategy: route requests to a directory that is NOT a git repository.
   * simple-git will throw a "not a git repository" error on every command,
   * which the handler must catch and surface as AppError(400). The arbitrary
   * string drives the command selection from the allowlist so we exercise
   * multiple code paths, but the invariant (status 400, ok false) must hold
   * for all of them.
   *
   * Validates: Requirements 5.1, 5.2, 5.3
   */
  it("Property 4: simple-git errors surface as status 400, not 500", async () => {
    // A plain temp directory with no .git — every simple-git call will throw.
    const nonRepoDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "simple-git-rpc-pbt-non-repo-"),
    );
    const nonRepoRouter = new DaemonRouter({ root: nonRepoDir });

    try {
      await fc.assert(
        fc.asyncProperty(
          // Use a command from the allowlist so we get past the allowlist guard
          // and actually reach the simple-git dispatch (which will throw).
          fc.constantFrom(...SIMPLE_GIT_RPC_COMMANDS),
          async (command) => {
            const result = await nonRepoRouter.handle(
              "POST",
              "/api/git/simple-git-rpc",
              { repo: ".", command },
            );

            // result must not be null (route is registered)
            expect(result).not.toBeNull();
            if (result === null) return;

            // simple-git errors must surface as 400, never 500
            expect(result.status).toBe(400);
            expect(result.body.ok).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    } finally {
      fs.rmSync(nonRepoDir, { recursive: true, force: true });
    }
  });

  /**
   * Property 8: Existing /api/git/rpc endpoint is unaffected
   *
   * After adding the new /api/git/simple-git-rpc endpoint, the original
   * /api/git/rpc endpoint (backed by isomorphic-git) must continue to work
   * correctly. Uses "version" as the safe command — it returns the
   * isomorphic-git version string and requires no repo state.
   *
   * Validates: Requirements 8.1, 8.3, 8.5
   */
  it("Property 8: existing /api/git/rpc endpoint is unaffected", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant("version"), async (command) => {
        const result = await router.handle("POST", "/api/git/rpc", {
          repo: tmpRepoPath,
          command,
        });

        // The route must be registered and return a non-null response
        expect(result).not.toBeNull();
        if (result === null) return;

        expect(result.status).toBe(200);
        expect(result.body.ok).toBe(true);
      }),
      { numRuns: 10 },
    );
  });
});
