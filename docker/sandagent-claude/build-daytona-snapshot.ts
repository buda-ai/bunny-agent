#!/usr/bin/env node
/**
 * Build Daytona snapshot from Docker image using SDK
 *
 * Usage (from project root):
 *   pnpm exec tsx docker/sandagent-claude/build-daytona-snapshot.ts [options]
 *
 * Or from script directory:
 *   npx tsx build-daytona-snapshot.ts [options]
 *
 * Options:
 *   --name <name>        Snapshot name (default: vikadata/sandagent)
 *   --image <image>      Docker image name (default: vikadata/sandagent:0.1.0)
 *   --cpu <count>        CPU cores (default: 2)
 *   --memory <gb>        Memory in GB (default: 4)
 *   --disk <gb>          Disk in GB (default: 8)
 *   --force              Delete existing snapshot before creating
 *
 * Requires:
 *   - DAYTONA_API_KEY in .env or environment
 *   - @daytonaio/sdk installed (use workspace dependency)
 */

import "dotenv/config";
import { execSync } from "node:child_process";
import { Daytona } from "@daytonaio/sdk";

// Parse command line arguments
function parseArgs() {
  // Read IMAGE_TAG from .env (loaded by dotenv/config)
  const imageTag = process.env.IMAGE_TAG || "0.1.0";
  const imageName = process.env.IMAGE_NAME || "vikadata/sandagent";

  const args: {
    name: string;
    image: string;
    cpu: number;
    memory: number;
    disk: number;
    force: boolean;
  } = {
    // Snapshot name includes version with colon: vikadata/sandagent:0.1.0
    name: `${imageName}:${imageTag}`,
    image: `${imageName}:${imageTag}`,
    cpu: 2,
    memory: 4,
    disk: 8,
    force: false,
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--name" && i + 1 < process.argv.length) {
      args.name = process.argv[++i];
    } else if (arg === "--image" && i + 1 < process.argv.length) {
      args.image = process.argv[++i];
    } else if (arg === "--cpu" && i + 1 < process.argv.length) {
      args.cpu = Number.parseInt(process.argv[++i], 10);
    } else if (arg === "--memory" && i + 1 < process.argv.length) {
      args.memory = Number.parseInt(process.argv[++i], 10);
    } else if (arg === "--disk" && i + 1 < process.argv.length) {
      args.disk = Number.parseInt(process.argv[++i], 10);
    } else if (arg === "--force") {
      args.force = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: npx tsx build-daytona-snapshot.ts [options]

Options:
  --name <name>     Snapshot name (default: vikadata/sandagent)
  --image <image>   Docker image name (default: vikadata/sandagent:0.1.0)
  --cpu <count>     CPU cores (default: 2)
  --memory <gb>     Memory in GB (default: 4)
  --disk <gb>       Disk in GB (default: 8)
  --force           Delete existing snapshot before creating
  --help, -h        Show this help message

Environment:
  DAYTONA_API_KEY   Required. Get from https://app.daytona.io
`);
      process.exit(0);
    }
  }

  return args;
}

async function main() {
  const { name, image, cpu, memory, disk, force } = parseArgs();

  // Check for API key
  const apiKey = process.env.DAYTONA_API_KEY;
  if (!apiKey) {
    console.error("Error: DAYTONA_API_KEY not found in environment");
    console.error("Please set it in .env file or export it:");
    console.error("  export DAYTONA_API_KEY=dtn_***");
    process.exit(1);
  }

  console.log("📦 Daytona Snapshot Builder");
  console.log("===========================");
  console.log(`  Snapshot: ${name}`);
  console.log(`  Image: ${image}`);
  console.log(`  CPU: ${cpu} cores`);
  console.log(`  Memory: ${memory} GB`);
  console.log(`  Disk: ${disk} GB`);
  console.log(`  Force: ${force}`);
  console.log("");

  // Initialize Daytona SDK
  const daytona = new Daytona({ apiKey });

  // Check if snapshot already exists
  try {
    const existingSnapshot = await daytona.snapshot.get(name);
    if (existingSnapshot) {
      // Debug: show snapshot info
      console.log(
        `⚠️  Snapshot "${name}" already exists (state: ${existingSnapshot.state})`,
      );
      console.log(`   ID: ${existingSnapshot.id || "N/A"}`);
      console.log(`   Name: ${existingSnapshot.name || "N/A"}`);

      if (force) {
        console.log("  Deleting existing snapshot...");
        try {
          // SDK delete() requires Snapshot object
          await daytona.snapshot.delete(existingSnapshot);
          console.log("  Deleted. Waiting for sync...");
          await new Promise((resolve) => setTimeout(resolve, 3000));
        } catch (deleteError: unknown) {
          const errMsg =
            deleteError instanceof Error
              ? deleteError.message
              : String(deleteError);
          console.error(`  ❌ Failed to delete via SDK: ${errMsg}`);
          // Try using CLI as fallback
          console.log("  Trying CLI fallback...");
          try {
            execSync(`daytona snapshot delete ${name} --yes`, {
              stdio: "pipe",
              env: { ...process.env, DAYTONA_API_KEY: apiKey },
            });
            console.log("  Deleted via CLI. Waiting for sync...");
            await new Promise((resolve) => setTimeout(resolve, 3000));
          } catch (cliError: unknown) {
            console.error(`  ❌ CLI fallback also failed`);
            console.error(
              "  Try deleting manually from: https://app.daytona.io/dashboard/snapshots",
            );
            process.exit(1);
          }
        }
      } else {
        console.error("");
        console.error("To update, use one of these options:");
        console.error(`  1. Use --force to delete and recreate`);
        console.error(`  2. Use a different name: --name ${name}-v2`);
        console.error(
          "  3. Delete manually from: https://app.daytona.io/dashboard/snapshots",
        );
        process.exit(1);
      }
    }
  } catch (error: unknown) {
    // Snapshot doesn't exist, which is fine
    const errMsg = error instanceof Error ? error.message : String(error);
    if (!errMsg.includes("not found") && !errMsg.includes("404")) {
      console.log(`  Note: Could not check existing snapshot: ${errMsg}`);
    }
  }

  // Ensure daytona CLI is logged in
  console.log("🔐 Authenticating with Daytona CLI...");
  try {
    execSync(`daytona login --api-key "${apiKey}"`, {
      stdio: "pipe",
      env: { ...process.env, DAYTONA_API_KEY: apiKey },
    });
  } catch (error) {
    console.log("  (login may have already been configured)");
  }

  // Set DOCKER_HOST for macOS if needed
  let dockerHost = process.env.DOCKER_HOST;
  if (!dockerHost && process.platform === "darwin") {
    // Try common Docker socket paths on macOS
    const fs = await import("node:fs");
    const possibleSockets = [
      "/var/run/docker.sock",
      `${process.env.HOME}/.docker/run/docker.sock`,
      "/Users/Shared/docker/run/docker.sock",
    ];
    for (const sock of possibleSockets) {
      if (fs.existsSync(sock)) {
        dockerHost = `unix://${sock}`;
        console.log(`  Found Docker socket: ${sock}`);
        break;
      }
    }
    if (!dockerHost) {
      console.error(
        "❌ Docker daemon not found. Please ensure Docker Desktop is running.",
      );
      console.error("   Checked paths:");
      for (const sock of possibleSockets) {
        console.error(`     - ${sock}`);
      }
      process.exit(1);
    }
  }

  // Push snapshot using CLI
  console.log("");
  console.log("🚀 Pushing snapshot to Daytona...");
  console.log(
    `  Command: daytona snapshot push ${image} --name ${name} --cpu ${cpu} --memory ${memory} --disk ${disk}`,
  );
  console.log("");

  try {
    const pushCmd = `daytona snapshot push ${image} --name ${name} --cpu ${cpu} --memory ${memory} --disk ${disk}`;
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      DAYTONA_API_KEY: apiKey,
    };
    if (dockerHost) {
      env.DOCKER_HOST = dockerHost;
    }

    const output = execSync(pushCmd, {
      stdio: "inherit",
      env,
      timeout: 10 * 60 * 1000, // 10 minutes timeout
    });
  } catch (error: unknown) {
    console.error("");
    console.error("❌ Failed to push snapshot");

    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes("layer does not exist")) {
      console.error("");
      console.error("The image layers may not have been pushed correctly.");
      console.error("Try:");
      console.error(
        `  1. Rebuild the image: docker build --platform=linux/amd64 -t ${image} .`,
      );
      console.error(`  2. Wait a moment and retry`);
    } else if (errMsg.includes("Conflict")) {
      console.error("");
      console.error("A snapshot with this name already exists.");
      console.error("Try:");
      console.error(`  1. Use --force to delete and recreate`);
      console.error(`  2. Use a different name`);
    }

    process.exit(1);
  }

  // Verify snapshot was created
  console.log("");
  console.log("🔍 Verifying snapshot...");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  try {
    const snapshot = await daytona.snapshot.get(name);
    if (snapshot) {
      console.log("");
      console.log("✅ Snapshot created successfully!");
      console.log(`   Name: ${snapshot.name}`);
      console.log(`   State: ${snapshot.state}`);
      console.log("");
      console.log("You can now use this snapshot in SandAgent:");
      console.log(`   snapshot: "${name}"`);
    }
  } catch (_error: unknown) {
    console.log("");
    console.log("⚠️  Snapshot may still be processing.");
    console.log(
      "   Check status at: https://app.daytona.io/dashboard/snapshots",
    );
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
