#!/usr/bin/env node
/**
 * Build (and optionally push) the SandAgent Docker image.
 *
 * Usage (from project root):
 *   pnpm exec tsx docker/sandagent-claude/build-image.ts [options]
 *
 * Or from this directory:
 *   pnpm run image [-- options]
 *
 * Options:
 *   --name <name>        Image name (default: vikadata/sandagent)
 *   --tag <tag>          Image tag (default: root package.json version)
 *   --image <image>      Full image name override (e.g., user/repo:tag)
 *   --repo <repo>        Repo/namespace for push (e.g., dockerhub username)
 *   --platform <plat>    Build platform (default: linux/amd64)
 *   --template <name>    Include template (e.g., researcher, coder) → name-templateName
 *   --context <path>     Build context (default: script directory)
 *   --push               Push image to registry after build
 *   --help, -h           Show this help message
 *
 * Environment:
 *   IMAGE_NAME           Default image name (fallback: vikadata/sandagent)
 *   IMAGE_TAG            Override image tag (default: root package.json version)
 *   DOCKERHUB_USERNAME   Default repo/namespace for push
 */

import "dotenv/config";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Read version from repo root package.json (single source of truth). */
function getPackageVersion(scriptDir: string): string {
  const path = resolve(scriptDir, "../../package.json");
  if (!existsSync(path)) return "0.1.0";
  try {
    const json = JSON.parse(readFileSync(path, "utf8"));
    return typeof json?.version === "string" ? json.version : "0.1.0";
  } catch {
    return "0.1.0";
  }
}

type Args = {
  name: string;
  tag: string;
  image: string | null;
  repo: string | null;
  platform: string;
  template: string | null;
  context: string | null;
  push: boolean;
  contextProvided: boolean;
};

function parseArgs(scriptDir: string): Args {
  const defaultTag =
    process.env.IMAGE_TAG || getPackageVersion(scriptDir);
  const args: Args = {
    name: process.env.IMAGE_NAME || "vikadata/sandagent",
    tag: defaultTag,
    image: null,
    repo: process.env.DOCKERHUB_USERNAME || null,
    platform: "linux/amd64",
    template: null,
    context: null,
    push: false,
    contextProvided: false,
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--name" && i + 1 < process.argv.length) {
      args.name = process.argv[++i];
    } else if (arg === "--tag" && i + 1 < process.argv.length) {
      args.tag = process.argv[++i];
    } else if (arg === "--image" && i + 1 < process.argv.length) {
      args.image = process.argv[++i];
    } else if (arg === "--repo" && i + 1 < process.argv.length) {
      args.repo = process.argv[++i];
    } else if (arg === "--platform" && i + 1 < process.argv.length) {
      args.platform = process.argv[++i];
    } else if (arg === "--template" && i + 1 < process.argv.length) {
      args.template = process.argv[++i];
    } else if (arg === "--context" && i + 1 < process.argv.length) {
      args.context = process.argv[++i];
      args.contextProvided = true;
    } else if (arg === "--push") {
      args.push = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: pnpm run image [-- options]   or   tsx build-image.ts [options]

Options:
  --name <name>        Image name (default: vikadata/sandagent)
  --tag <tag>          Image tag (default: root package.json version)
  --image <image>      Full image name override (e.g., user/repo:tag)
  --repo <repo>        Repo/namespace for push (e.g., dockerhub username)
  --platform <plat>    Build platform (default: linux/amd64)
  --template <name>    Include template → vikadata/sandagent-<name>
  --context <path>     Build context (default: script directory)
  --push               Push image to registry after build
  --help, -h           Show this help message

Environment:
  IMAGE_NAME           Default image name (fallback: vikadata/sandagent)
  IMAGE_TAG            Override tag (default: root package.json version)
  DOCKERHUB_USERNAME   Default repo/namespace for push

Examples:
  pnpm run image -- --push
  pnpm run image -- --template researcher --push
  pnpm run image -- --push   # pushes vikadata/sandagent:0.1.0
`);
      process.exit(0);
    }
  }

  return args;
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

async function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const args = parseArgs(scriptDir);

  const imageName = args.template ? `${args.name}-${args.template}` : args.name;
  const localImage = args.image ?? `${imageName}:${args.tag}`;

  const context = args.contextProvided
    ? resolve(process.cwd(), args.context || ".")
    : scriptDir;

  const usingTemplate = Boolean(args.template);
  const buildContext = usingTemplate
    ? resolve(scriptDir, ".build-context")
    : context;
  const dockerfilePath = usingTemplate
    ? resolve(buildContext, "Dockerfile")
    : resolve(context, "Dockerfile");

  console.log("📦 SandAgent Docker Image Builder");
  console.log("========================");
  console.log(`  Image: ${localImage}`);
  console.log(`  Platform: ${args.platform}`);
  console.log(`  Context: ${context}`);
  console.log(`  Template: ${args.template ?? "(none)"}`);
  console.log(`  Push: ${args.push}`);
  if (args.push) {
    console.log(`  Repo: ${args.repo ?? "(from image name)"}`);
  }
  console.log("");

  ensureDocker();

  if (usingTemplate) {
    const templatesPath = resolve(scriptDir, "../../templates");
    if (!existsSync(templatesPath)) {
      console.error(`❌ Templates path not found: ${templatesPath}`);
      process.exit(1);
    }
    console.log("🧩 Generating Dockerfile with template...");
    run(
      `./generate-dockerfile.sh ${args.template} ${templatesPath} true`,
      scriptDir,
    );
    if (!existsSync(dockerfilePath)) {
      console.error(`❌ Generated Dockerfile not found: ${dockerfilePath}`);
      process.exit(1);
    }
  } else if (!existsSync(dockerfilePath)) {
    console.error(`❌ Dockerfile not found: ${dockerfilePath}`);
    process.exit(1);
  }

  console.log("🐳 Building Docker image...");
  const dockerfileFlag = usingTemplate
    ? `-f ${resolve(buildContext, "Dockerfile")}`
    : "";
  const buildCmd = `docker build --platform=${args.platform} -t ${localImage} ${dockerfileFlag} ${buildContext}`;
  run(buildCmd, scriptDir);

  console.log("");
  console.log("✅ Image built:", localImage);

  if (!args.push) {
    return;
  }

  let pushImage = localImage;
  if (!localImage.includes("/")) {
    if (!args.repo) {
      console.error("❌ --push requires --repo or DOCKERHUB_USERNAME");
      process.exit(1);
    }
    pushImage = `${args.repo}/${localImage}`;
  }

  if (pushImage !== localImage) {
    console.log("🏷️  Tagging image for push:", pushImage);
    run(`docker tag ${localImage} ${pushImage}`, scriptDir);
  }

  console.log("🚀 Pushing image...");
  run(`docker push ${pushImage}`, scriptDir);

  console.log("");
  console.log("✅ Image pushed:", pushImage);
  console.log("");
  console.log("You can now use this image (e.g. in Sandock):");
  console.log(`  image: "${pushImage}"`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
