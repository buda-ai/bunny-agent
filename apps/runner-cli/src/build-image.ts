import { execSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface BuildImageOptions {
  /** Image name, e.g. "myorg/sandagent" */
  name: string;
  /** Image tag, e.g. "0.1.0" */
  tag: string;
  /** Full image override, e.g. "myorg/repo:tag" */
  image?: string;
  /** Docker platform (default: linux/amd64) */
  platform: string;
  /** Path to agent template directory to bake into the image */
  template?: string;
  /** Push image to registry after build */
  push: boolean;
  /** Repo/namespace for push (e.g. dockerhub username) */
  repo?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPackageRoot(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return resolve(thisDir, "..");
}

function getShippedDockerfile(): string {
  const p = join(getPackageRoot(), "Dockerfile");
  if (!existsSync(p)) {
    console.error(`❌ Dockerfile not found at ${p}`);
    process.exit(1);
  }
  return p;
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
  const imageName = templateName ? `${opts.name}-${templateName}` : opts.name;
  const localImage = opts.image ?? `${imageName}:${opts.tag}`;

  console.log("📦 SandAgent Docker Image Builder");
  console.log("========================");
  console.log(`  Image: ${localImage}`);
  console.log(`  Platform: ${opts.platform}`);
  console.log(`  Template: ${templateName ?? "(none)"}`);
  console.log(`  Push: ${opts.push}`);
  if (opts.push && opts.repo) {
    console.log(`  Repo: ${opts.repo}`);
  }
  console.log("");

  ensureDocker();

  const buildContext = join(process.cwd(), ".sandagent-build-context");
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

    let copyLines = "\n# Template files\nRUN mkdir -p /opt/sandagent/templates";
    if (existsSync(join(destDir, "CLAUDE.md"))) {
      copyLines += `\nCOPY templates/${templateName}/CLAUDE.md /opt/sandagent/templates/CLAUDE.md`;
    }
    if (existsSync(join(destDir, ".claude"))) {
      copyLines += `\nCOPY templates/${templateName}/.claude /opt/sandagent/templates/.claude`;
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

  let pushImage = localImage;
  if (!localImage.includes("/")) {
    if (!opts.repo) {
      console.error("❌ --push requires --name to include org/ or use --repo");
      process.exit(1);
    }
    pushImage = `${opts.repo}/${localImage}`;
  }

  if (pushImage !== localImage) {
    console.log(`🏷️  Tagging: ${pushImage}`);
    run(`docker tag ${localImage} ${pushImage}`);
  }

  console.log("🚀 Pushing image...");
  run(`docker push ${pushImage}`);
  console.log(`\n✅ Image pushed: ${pushImage}`);
}
