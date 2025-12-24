# Persistence Guide

**How to maintain state across agent runs with SandAgent**

---

## Overview

SandAgent is designed around **persistent identity**. Each agent instance is tied to a unique `id` that determines:

1. Which sandbox to attach to
2. Which filesystem volume to mount
3. What execution context to resume

This guide explains how persistence works and best practices for managing agent state.

---

## How Persistence Works

### The Identity Model

```ts
const agent = new SandAgent({
  id: "user-123-project-a",  // <-- This is the identity key
  sandbox: new SandockSandbox(),
  runner: { kind: "claude-agent-sdk", model: "claude-sonnet-4-20250514" },
});
```

The `id` parameter is the **persistence key**. When you create a SandAgent with a given `id`:

1. **First time**: A new sandbox and volume are created
2. **Subsequent times**: The existing sandbox and volume are attached

### What Gets Persisted

| Component | Persisted? | Notes |
|-----------|------------|-------|
| Filesystem | ✅ Yes | All files in `/workspace` persist |
| Environment variables | ❌ No | Must be set each run |
| Running processes | ❌ No | Sandbox may restart between runs |
| Installed packages | ✅ Yes | If installed to filesystem |
| Git repositories | ✅ Yes | Stored in filesystem |

---

## Persistence Strategies

### Strategy 1: Session-based Persistence

Use a session ID that persists for the user's session:

```ts
// In your Next.js API route
export async function POST(req: Request) {
  const { messages, sessionId } = await req.json();
  
  const agent = new SandAgent({
    id: sessionId,  // User's session ID
    sandbox: new SandockSandbox(),
    runner: { kind: "claude-agent-sdk", model: "claude-sonnet-4-20250514" },
  });
  
  return agent.stream({ messages });
}
```

**When to use**: Chat-like applications where state should persist during a conversation but can be discarded afterward.

### Strategy 2: Project-based Persistence

Use a project identifier for long-term persistence:

```ts
const agent = new SandAgent({
  id: `user-${userId}-project-${projectId}`,
  sandbox: new SandockSandbox(),
  runner: { kind: "claude-agent-sdk", model: "claude-sonnet-4-20250514" },
});
```

**When to use**: Coding assistants, project workspaces, or any scenario where work should persist across multiple sessions.

### Strategy 3: Ephemeral (No Persistence)

Use a unique ID for each request:

```ts
import { randomUUID } from "crypto";

const agent = new SandAgent({
  id: randomUUID(),  // New ID each time
  sandbox: new SandockSandbox(),
  runner: { kind: "claude-agent-sdk", model: "claude-sonnet-4-20250514" },
});

// Clean up after use
try {
  const response = await agent.stream({ messages });
  // ... handle response
} finally {
  await agent.destroy();  // Clean up sandbox
}
```

**When to use**: One-off tasks, sandboxed code execution, or when isolation between requests is important.

---

## Managing the Filesystem

### Default Workspace

By default, agents work in `/workspace`:

```ts
await agent.stream({
  messages,
  workspace: { path: "/workspace" },  // This is the default
});
```

### Uploading Files Before Execution

You can pre-populate the workspace before the agent runs:

```ts
// Upload files to the workspace
await agent.uploadFiles([
  { path: "README.md", content: "# My Project\n\nThis is a test project." },
  { path: "src/index.ts", content: "console.log('Hello, World!');" },
]);

// Then run the agent
return agent.stream({
  messages: [{ role: "user", content: "Review the code and suggest improvements" }],
});
```

### Custom Workspace Paths

You can use a different workspace path:

```ts
await agent.stream({
  messages,
  workspace: { path: "/home/user/projects/myapp" },
});
```

---

## Database Considerations

### Tracking Agent Sessions

Store agent session metadata in your database:

```sql
CREATE TABLE agent_sessions (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  project_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP,
  metadata JSONB
);
```

### Session Lifecycle

```ts
// Create or resume a session
async function getOrCreateSession(userId: string, projectId: string) {
  const sessionId = `${userId}-${projectId}`;
  
  // Check if session exists in database
  let session = await db.sessions.findUnique({ where: { id: sessionId } });
  
  if (!session) {
    // Create new session record
    session = await db.sessions.create({
      data: { id: sessionId, userId, projectId },
    });
  } else {
    // Update last accessed time
    await db.sessions.update({
      where: { id: sessionId },
      data: { lastAccessedAt: new Date() },
    });
  }
  
  return sessionId;
}
```

---

## Cleanup and Lifecycle

### Destroying Sandboxes

When you're done with an agent, clean up its resources:

```ts
// Destroy the sandbox and release resources
await agent.destroy();
```

**Note**: This destroys the sandbox container but may not delete the volume depending on the sandbox adapter configuration.

### Automatic Cleanup

Implement cleanup for stale sessions:

```ts
// Clean up sessions older than 24 hours
async function cleanupStaleSessions() {
  const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const staleSessions = await db.sessions.findMany({
    where: { lastAccessedAt: { lt: staleThreshold } },
  });
  
  for (const session of staleSessions) {
    const agent = new SandAgent({
      id: session.id,
      sandbox: new SandockSandbox(),
      runner: { kind: "claude-agent-sdk", model: "claude-sonnet-4-20250514" },
    });
    
    await agent.destroy();
    await db.sessions.delete({ where: { id: session.id } });
  }
}
```

---

## Sandbox Adapter Specifics

### Sandock (Docker-based)

```ts
import { SandockSandbox } from "@sandagent/sandbox-sandock";

const sandbox = new SandockSandbox({
  image: "node:20-slim",        // Docker image to use
  volumePrefix: "/data/volumes", // Where volumes are stored
  networkEnabled: true,          // Enable network access
});
```

**Volume persistence**: Volumes are stored at `{volumePrefix}/{agentId}` on the host.

### E2B (Cloud-based)

```ts
import { E2BSandbox } from "@sandagent/sandbox-e2b";

const sandbox = new E2BSandbox({
  apiKey: process.env.E2B_API_KEY,
  template: "base",
  timeout: 60000,
});
```

**Volume persistence**: E2B manages volumes in the cloud. Refer to E2B documentation for retention policies.

---

## Best Practices

### 1. Use Meaningful IDs

```ts
// Good: Meaningful, traceable IDs
const id = `user-${userId}-project-${projectId}`;
const id = `org-${orgId}-workspace-${workspaceName}`;

// Avoid: Random IDs for persistent sessions (hard to debug)
const id = randomUUID();  // Only for ephemeral sessions
```

### 2. Handle Concurrent Access

SandAgent doesn't prevent concurrent access to the same ID. Implement your own locking if needed:

```ts
async function withLock(sessionId: string, fn: () => Promise<Response>) {
  const lock = await acquireLock(sessionId);
  try {
    return await fn();
  } finally {
    await releaseLock(lock);
  }
}
```

### 3. Monitor Resource Usage

Track sandbox resources in your observability stack:

```ts
const agent = new SandAgent({ id, sandbox, runner });

// Log session activity
logger.info("Agent session started", { 
  sessionId: id,
  userId,
  timestamp: new Date().toISOString(),
});
```

### 4. Implement Graceful Shutdown

Clean up active sandboxes on server shutdown:

```ts
const activeSessions = new Map<string, SandAgent>();

process.on("SIGTERM", async () => {
  console.log("Shutting down, cleaning up sandboxes...");
  for (const [id, agent] of activeSessions) {
    await agent.destroy();
  }
  process.exit(0);
});
```

---

## Troubleshooting

### Session Not Resuming

**Symptom**: Agent starts fresh instead of resuming.

**Possible causes**:
1. Different `id` being used (check for typos, case sensitivity)
2. Sandbox volume was deleted
3. Sandbox adapter configuration changed

**Solution**: Verify the `id` matches exactly and check volume storage.

### Filesystem Changes Not Persisting

**Symptom**: Files created in one run are missing in the next.

**Possible causes**:
1. Files created outside the mounted volume path
2. Sandbox was destroyed between runs
3. Volume mount failed

**Solution**: Ensure files are in `/workspace` and check sandbox logs.

### Out of Disk Space

**Symptom**: Sandbox fails to start or write operations fail.

**Possible causes**:
1. Volume has accumulated too much data
2. Host disk is full

**Solution**: Implement cleanup policies and monitor disk usage.

---

## Summary

| Concept | Key Point |
|---------|-----------|
| **Identity** | `id` is the persistence key |
| **Filesystem** | `/workspace` persists across runs |
| **Cleanup** | Call `destroy()` when done |
| **Strategy** | Choose based on your use case |

For more details, see the [Technical Specification](./TECHNICAL_SPEC.md).
