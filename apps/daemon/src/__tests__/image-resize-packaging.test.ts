import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { beforeAll, describe, expect, it } from "vitest";

// Exercise freshly built production assets, not source modules or stale dist.
const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const require = createRequire(path.join(packageRoot, "package.json"));
const logoPath = path.resolve(packageRoot, "../../docs/bunny-logo.png");
let isolatedDir: string;

type ResizeResult = {
  data: string;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  wasResized: boolean;
};

function expectResized(result: ResizeResult | null | undefined) {
  expect(result).toBeTruthy();
  if (!result) throw new Error("Image resize returned no result");
  expect(result.wasResized).toBe(true);
  expect(result.originalWidth).toBe(512);
  expect(result.originalHeight).toBe(512);
  expect(result.width).toBe(32);
  expect(result.height).toBe(32);
  expect(result.mimeType).toBe("image/png");
  const png = Buffer.from(result.data, "base64");
  expect(png.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  expect(png.toString("ascii", 12, 16)).toBe("IHDR");
  expect(png.readUInt32BE(16)).toBe(32);
  expect(png.readUInt32BE(20)).toBe(32);
  expect(Buffer.byteLength(result.data)).toBeLessThan(100_000);
}

beforeAll(async () => {
  execFileSync("node", ["scripts/build.mjs"], {
    cwd: packageRoot,
    stdio: "pipe",
    timeout: 90_000,
  });
  isolatedDir = mkdtempSync(path.join(os.tmpdir(), "daemon-image-resize-pkg-"));
  cpSync(path.join(packageRoot, "dist"), path.join(isolatedDir, "dist"), {
    recursive: true,
  });
  copyFileSync(
    path.join(packageRoot, "package.json"),
    path.join(isolatedDir, "package.json"),
  );
  copyFileSync(logoPath, path.join(isolatedDir, "input.png"));
  for (const entry of ["index.js", "nextjs.js", "bundle.mjs"]) {
    expect(
      readFileSync(path.join(isolatedDir, "dist", entry), "utf-8"),
    ).toContain(
      "const __dirname = __banner_dirname(__banner_fileURLToPath(import.meta.url));",
    );
  }

  // Bundle only the actual resize module, using production settings. Discover
  // its path through esbuild's ESM resolver, without unexported package imports
  // or writing a fixed-name scratch entry into another workspace package.
  const esbuild = require("esbuild") as typeof import("esbuild");
  const { sharedEsbuildOptions } = await import(
    "../../scripts/esbuild-shared.mjs"
  );
  const discovered = await esbuild.build({
    ...sharedEsbuildOptions,
    absWorkingDir: packageRoot,
    stdin: {
      contents:
        'export { resizeImage } from "@earendil-works/pi-coding-agent";',
      resolveDir: path.resolve(packageRoot, "../../packages/runner-pi"),
      sourcefile: "resize-probe-entry.mjs",
    },
    write: false,
    metafile: true,
  });
  const resizeInput = Object.keys(discovered.metafile?.inputs ?? {}).find((p) =>
    p.endsWith("/utils/image-resize.js"),
  );
  if (!resizeInput) throw new Error("Pi image-resize module was not resolved");
  await esbuild.build({
    ...sharedEsbuildOptions,
    entryPoints: [path.resolve(packageRoot, resizeInput)],
    absWorkingDir: packageRoot,
    outfile: path.join(isolatedDir, "dist", "resize-probe.js"),
  });
}, 120_000);

// Preserve isolated artifacts for inspection; never permanently delete files.
describe("daemon image-resize packaging", () => {
  it("includes worker and Photon WASM in the npm package file list", () => {
    const output = execFileSync("npm", ["pack", "--dry-run", "--json", "."], {
      cwd: packageRoot,
      encoding: "utf-8",
      timeout: 30_000,
    });
    const [{ files }] = JSON.parse(output) as Array<{
      files: Array<{ path: string }>;
    }>;
    const paths = files.map((f) => f.path);
    expect(paths).toContain("dist/image-resize-worker.js");
    expect(paths).toContain("dist/photon_rs_bg.wasm");
  });

  it("resizes through the emitted Worker with no workspace dependencies", async () => {
    const worker = new Worker(
      path.join(isolatedDir, "dist", "image-resize-worker.js"),
      { execArgv: [] },
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await new Promise<{
        result?: ResizeResult | null;
        error?: string;
      }>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Worker timed out")), 15_000);
        worker.once("message", resolve);
        worker.once("error", reject);
        worker.once("exit", (code) =>
          reject(new Error(`Worker exited before responding: ${code}`)),
        );
        const bytes = new Uint8Array(readFileSync(logoPath));
        worker.postMessage(
          {
            inputBytes: bytes,
            mimeType: "image/png",
            options: { maxWidth: 32, maxHeight: 32, maxBytes: 100_000 },
          },
          [bytes.buffer],
        );
      });
      expect(response.error).toBeUndefined();
      expectResized(response.result);
    } finally {
      clearTimeout(timer);
      await worker.terminate();
    }
  }, 20_000);

  it.each([
    false,
    true,
  ])("bundled resizeImage succeeds with forced fallback=%s", (forceFallback) => {
    const harness = path.join(isolatedDir, `probe-${forceFallback}.mjs`);
    writeFileSync(
      harness,
      `import { readFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import workerThreads from "node:worker_threads";
const OriginalWorker = workerThreads.Worker;
let attempts = 0;
let successfulMessages = 0;
workerThreads.Worker = class extends OriginalWorker {
  constructor(...args) {
    attempts++;
    if (${forceFallback}) throw new Error("Forced Worker construction failure");
    super(...args);
    this.on("message", (message) => {
      if (message.result) successfulMessages++;
    });
  }
};
syncBuiltinESMExports();
const { resizeImage } = await import("./dist/resize-probe.js");
const result = await resizeImage(new Uint8Array(readFileSync("./input.png")),
  "image/png", { maxWidth: 32, maxHeight: 32, maxBytes: 100000 });
console.log(JSON.stringify({ attempts, successfulMessages, result }));
`,
    );
    const output = execFileSync("node", [harness], {
      cwd: isolatedDir,
      encoding: "utf-8",
      timeout: 20_000,
      env: { ...process.env, NODE_PATH: "" },
    });
    const response = JSON.parse(output) as {
      attempts: number;
      successfulMessages: number;
      result: ResizeResult | null;
    };
    expect(response.attempts).toBe(1);
    expect(response.successfulMessages).toBe(forceFallback ? 0 : 1);
    expectResized(response.result);
  }, 25_000);
});
