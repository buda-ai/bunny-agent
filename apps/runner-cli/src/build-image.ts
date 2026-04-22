import { execSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface BuildImageOptions {
  /** Image name, e.g. "vikadata/bunny-agent-seo" */
  name: string;
  /** Image tag, e.g. "0.1.0" */
  tag: string;
  /** Full image override, e.g. "myorg/myimage:v1" */
  image?: string;
  /** Docker platform (default: linux/amd64) */
  platform: string;
  /** Path to agent template directory to bake into the image */
  template?: string;
  /** Push image to registry after build */
  push: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPackageRoot(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return resolve(thisDir, "..");
}

function getShippedDockerfile(): string {
  // Look for Dockerfile in several locations:
  // 1. Package root (apps/runner-cli/Dockerfile) — shipped with npm package
  // 2. docker/bunny-agent-claude/Dockerfile — monorepo development
  // 3. CWD-relative docker/bunny-agent-claude/Dockerfile — global install invoked from repo root
  const packageRoot = getPackageRoot();
  const candidates = [
    join(packageRoot, "Dockerfile"),
    resolve(
      packageRoot,
      "..",
      "..",
      "docker",
      "bunny-agent-claude",
      "Dockerfile",
    ),
    resolve(process.cwd(), "docker", "bunny-agent-claude", "Dockerfile"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  console.error(
    `❌ Dockerfile not found. Searched:\n${candidates.map((c) => `   ${c}`).join("\n")}`,
  );
  process.exit(1);
}

function run(cmd: string, cwd?: string) {
  execSync(cmd, { stdio: "inherit", cwd });
}

function ensureDocker() {
  try {
    execSync("docker info", { stdio: "ignore" });
  } catch {
    console.error("❌ Docker is not running. Please start Docker first.");
    process.exit(1);
  }
}

function resolveTemplatePath(template: string): string {
  const abs = resolve(process.cwd(), template);
  if (!existsSync(abs)) {
    console.error(`❌ Template directory not found: ${abs}`);
    process.exit(1);
  }
  return abs;
}

function copyDirSync(src: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Build (and optionally push)
// ---------------------------------------------------------------------------

export async function buildImage(opts: BuildImageOptions): Promise<void> {
  const templatePath = opts.template
    ? resolveTemplatePath(opts.template)
    : null;
  const templateName = templatePath ? basename(templatePath) : null;
  const localImage = opts.image ?? `${opts.name}:${opts.tag}`;

  console.log("📦 BunnyAgent Docker Image Builder");
  console.log("========================");
  console.log(`  Image: ${localImage}`);
  console.log(`  Platform: ${opts.platform}`);
  console.log(`  Template: ${templateName ?? "(none)"}`);
  console.log(`  Push: ${opts.push}`);
  console.log("");

  ensureDocker();

  const buildContext = join(process.cwd(), ".docker-staging");
  mkdirSync(buildContext, { recursive: true });

  let dockerfile = readFileSync(getShippedDockerfile(), "utf8");

  if (templatePath && templateName) {
    const destDir = join(buildContext, "templates", templateName);
    mkdirSync(destDir, { recursive: true });

    const claudeMd = join(templatePath, "CLAUDE.md");
    if (existsSync(claudeMd))
      copyFileSync(claudeMd, join(destDir, "CLAUDE.md"));

    const claudeDir = join(templatePath, ".claude");
    if (existsSync(claudeDir)) copyDirSync(claudeDir, join(destDir, ".claude"));

    let copyLines =
      "\n# Template files\nRUN mkdir -p /opt/bunny-agent/templates";
    if (existsSync(join(destDir, "CLAUDE.md"))) {
      copyLines += `\nCOPY templates/${templateName}/CLAUDE.md /opt/bunny-agent/templates/CLAUDE.md`;
    }
    if (existsSync(join(destDir, ".claude"))) {
      copyLines += `\nCOPY templates/${templateName}/.claude /opt/bunny-agent/templates/.claude`;
    }

    dockerfile = dockerfile.replace(/^CMD /m, `${copyLines}\n\nCMD `);
    console.log("🧩 Injected template files into Dockerfile");
  }

  writeFileSync(join(buildContext, "Dockerfile"), dockerfile);

  console.log("🐳 Building Docker image...");
  run(
    `docker build --platform=${opts.platform} -t ${localImage} -f ${join(buildContext, "Dockerfile")} ${buildContext}`,
  );
  console.log(`\n✅ Image built: ${localImage}`);

  if (!opts.push) return;

  if (!localImage.includes("/")) {
    console.error(
      "❌ --push requires --name to include namespace (e.g. vikadata/bunny-agent-seo)",
    );
    process.exit(1);
  }

  console.log("🚀 Pushing image...");
  run(`docker push ${localImage}`);
  console.log(`\n✅ Image pushed: ${localImage}`);

  // Also push the latest tag
  const latestImage = `${opts.name}:latest`;
  if (localImage !== latestImage) {
    console.log("🏷️ Tagging and pushing latest...");
    run(`docker tag ${localImage} ${latestImage}`);
    run(`docker push ${latestImage}`);
    console.log(`✅ Image pushed: ${latestImage}`);
  }
}
