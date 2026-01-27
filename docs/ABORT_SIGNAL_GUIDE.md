# Abort Signal Guide

This guide explains how abort signals work in Sandagent to enable graceful cancellation of long-running agent operations.

## Overview

Sandagent uses the standard [AbortController/AbortSignal API](https://developer.mozilla.org/en-US/docs/Web/API/AbortController) to handle operation cancellation. The signal flows through multiple layers, from the API layer down to the sandbox execution environment.

## Architecture

### Signal Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. API Route                                                     │
│    const signal = request.signal  // From Request object        │
│    agent.stream({ signal })                                     │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. SandAgent (packages/core)                                    │
│    - Receives signal from caller                                │
│    - Passes signal to sandbox.exec()                            │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. Sandbox Adapter (E2B/Sandock)                                │
│    - Listens to signal.addEventListener('abort', ...)           │
│    - Sends kill command to remote process                       │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Remote Process (runner-cli in sandbox)                       │
│    - Receives OS signal (SIGTERM)                               │
│    - Creates internal AbortController                           │
│    - Stops Claude Runner execution                              │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. API Layer (Request Signal)

The API route uses the signal from the Request object directly:

```typescript
// Example: API route
export async function POST(request: Request) {
  // Extract signal from Request object
  const signal = request.signal;
  
  // Stream agent execution
  const response = await agent.stream({
    messages: [...],
    signal  // Pass request signal to agent
  });
  
  return response;
}
```

**Key Points:**
- Uses `request.signal` directly (no need to create AbortController)
- Signal is automatically aborted when client disconnects
- No need to check `signal.aborted` before starting - if client disconnected, they won't receive response
- Signal is passed down through all layers where it's actually checked
- Can be triggered by user action (fetch abort) or client disconnect

### 2. SandAgent (Core)

The SandAgent receives the signal and passes it to the sandbox:

```typescript
// packages/core/src/sand-agent.ts
async stream(input: StreamInput): Promise<Response> {
  const signal = input.signal;
  
  // Check if already aborted
  if (signal?.aborted) {
    throw new Error("Operation was aborted");
  }
  
  // Pass signal to sandbox execution
  const stdout = handle.exec(command, {
    cwd: workspacePath,
    env: this.env,
    signal,  // Signal flows to sandbox
  });
  
  // ...
}
```

**Key Points:**
- Does not create new AbortController
- Simply passes signal through
- Checks for early abort before execution

### 3. Sandbox Adapter (E2B/Sandock)

The sandbox adapter listens to the signal and handles process termination:

```typescript
// packages/sandbox-e2b/src/e2b-sandbox.ts
exec(command: string[], opts?: ExecOptions): AsyncIterable<Uint8Array> {
  const signal = opts?.signal;
  
  // Capture PID for termination
  const pidFile = `/tmp/sandagent-${Date.now()}-${Math.random().toString(36).substring(7)}.pid`;
  const shellCommand = `(${baseCommand}) & echo $! > ${pidFile}; wait $!; EXIT_CODE=$?; rm -f ${pidFile}; exit $EXIT_CODE`;
  
  // Handle abort signal
  const abortHandler = async () => {
    console.log("[E2B] Abort signal received, terminating process...");
    
    finished = true;
    error = new Error("Operation aborted");
    error.name = "AbortError";
    
    // Kill the remote process
    const killCmd = `if [ -f ${pidFile} ]; then 
      PID=$(cat ${pidFile}); 
      kill -TERM $PID; 
      rm -f ${pidFile}; 
    fi`;
    
    await self.instance.commands.run(killCmd, { timeoutMs: 5000 });
  };
  
  // Listen to abort signal
  if (signal) {
    signal.addEventListener("abort", abortHandler);
  }
  
  // ... execute command and stream output
}
```

**Key Points:**
- Listens to the passed-in signal (does not create new AbortController)
- Captures process PID for later termination
- Sends `kill -TERM` to remote process when aborted
- Sets error state for async iterator

#### PID Capture Technique

The shell command wraps the actual command to capture its PID:

```bash
(command) & echo $! > /tmp/pid-file.pid; wait $!; EXIT_CODE=$?; rm -f /tmp/pid-file.pid; exit $EXIT_CODE
```

Breakdown:
- `(command) &` - Run command in background
- `echo $! > pidfile` - Save PID of background process
- `wait $!` - Wait for process to complete
- `EXIT_CODE=$?` - Capture exit code
- `rm -f pidfile` - Clean up PID file
- `exit $EXIT_CODE` - Exit with original exit code

This allows the sandbox to:
1. Start the command immediately
2. Save its PID for later termination
3. Wait for completion and preserve exit code
4. Kill the process if abort is triggered

### 4. Runner CLI (Inner AbortController)

The runner-cli runs inside the sandbox and has its own AbortController:

```typescript
// apps/runner-cli/src/runner.ts
export async function runAgent(options: RunAgentOptions): Promise<void> {
  // Create internal AbortController
  const abortController = new AbortController();
  
  // Handle OS signals (SIGTERM/SIGINT)
  const signalHandler = () => {
    console.error("[Runner] Received termination signal, stopping...");
    abortController.abort();  // Convert OS signal to AbortSignal
  };
  
  process.on("SIGTERM", signalHandler);
  process.on("SIGINT", signalHandler);
  
  try {
    const runner = createClaudeRunner(runnerOptions);
    
    // Use internal signal for Claude Runner
    for await (const chunk of runner.run(
      options.userInput,
      abortController.signal  // Internal signal
    )) {
      process.stdout.write(chunk);
    }
  } finally {
    // Clean up signal handlers
    process.off("SIGTERM", signalHandler);
    process.off("SIGINT", signalHandler);
  }
}
```

**Key Points:**
- Creates its own AbortController (cannot access outer one)
- Bridges OS signals (SIGTERM) to AbortSignal
- Passes internal signal to Claude Runner
- Cleans up signal handlers on completion

## Complete Cancellation Flow

### Step-by-Step Execution

1. **User Triggers Cancellation (Frontend)**
   ```typescript
   // In browser/client
   abortController.abort();  // Aborts the fetch request
   ```

2. **Fetch Aborts Request (Network Layer)**
   - Browser cancels the HTTP request
   - Server's `request.signal` becomes aborted

3. **Signal Propagates to SandAgent**
   - `request.signal.aborted` becomes `true`
   - Any code checking `signal.aborted` sees the change

4. **Sandbox Adapter's abortHandler Fires**
   ```typescript
   signal.addEventListener("abort", abortHandler);
   // abortHandler executes when request is aborted
   ```

5. **Kill Command Sent to Remote Process**
   ```bash
   kill -TERM <PID>
   ```
   - Reads PID from temporary file
   - Sends SIGTERM to the process
   - Cleans up PID file

6. **Runner CLI Receives SIGTERM**
   ```typescript
   process.on("SIGTERM", signalHandler);
   // signalHandler executes
   ```

7. **Internal AbortController Triggered**
   ```typescript
   abortController.abort();  // In runner-cli
   ```

8. **Claude Runner Stops**
   ```typescript
   for await (const chunk of runner.run(input, signal)) {
     // Loop exits when signal.aborted === true
   }
   ```

9. **Cleanup and Error Propagation**
   - Async iterator completes
   - AbortError thrown or returned
   - Resources cleaned up

## Usage Examples

### Basic Usage

```typescript
import { SandAgent } from "@sandagent/core";

const agent = new SandAgent({
  id: "my-agent",
  sandbox: mySandbox,
  runner: "claude"
});

// In an API route
export async function POST(request: Request) {
  const response = await agent.stream({
    messages: [{ role: "user", content: "Long running task" }],
    signal: request.signal  // Use request signal
  });
  
  return response;
}
```

### With Client-Side Cancellation

```typescript
// Frontend - using fetch with AbortController
const abortController = new AbortController();

async function runAgent() {
  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      body: JSON.stringify({ messages }),
      signal: abortController.signal  // Pass to fetch
    });
    
    // Stream response...
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('User cancelled operation');
    }
  }
}

// Cancel button handler
function handleCancel() {
  abortController.abort();  // Aborts fetch, which aborts request.signal
}
```

### With Request Cancellation

```typescript
export async function POST(request: Request) {
  const signal = request.signal;
  
  // No need to check signal.aborted - just pass it through
  // The actual abort handling happens in SandAgent and sandbox adapters
  
  try {
    const body = await request.json();
    const response = await agent.stream({
      messages: body.messages,
      signal  // Pass request signal
    });
    
    return response;
  } catch (error) {
    // This catch block may not execute if client already disconnected
    // But it's useful for logging server-side errors
    if (error.name === "AbortError") {
      console.log("Operation was aborted");
      // Client already disconnected, this response won't be received
      return new Response(null, { status: 499 });
    }
    throw error;
  }
}
```

**Note**: When `signal.aborted` is true, the client has already disconnected. Any Response you return won't be received by the client. The abort handling is mainly for cleaning up server-side resources (stopping sandbox processes, etc.).

### Manual Cancellation Button

```typescript
// Frontend
const abortController = new AbortController();

async function runAgent() {
  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      body: JSON.stringify({ messages }),
      signal: abortController.signal  // Fetch will abort request when this aborts
    });
    
    // Stream response...
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // Process chunk...
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('User cancelled operation');
    }
  }
}

// Cancel button handler
function handleCancel() {
  abortController.abort();  // This aborts the fetch, which aborts request.signal on server
}
```

## Error Handling

### AbortError Detection

When an operation is aborted, you'll typically see an error with `name === "AbortError"`:

```typescript
try {
  await agent.stream({ messages, signal });
} catch (error) {
  if (error.name === "AbortError") {
    // Handle cancellation
    console.log("Operation was cancelled");
  } else {
    // Handle other errors
    console.error("Unexpected error:", error);
  }
}
```

### Checking Abort Status

You can check if a signal is already aborted before starting work:

```typescript
if (signal?.aborted) {
  throw new Error("Operation was aborted before starting");
}

// Proceed with work...
```

### Async Iterator Behavior

When aborted, the async iterator will:
1. Stop producing new chunks
2. Complete any pending chunks in the buffer
3. Either throw AbortError or return `done: true`

```typescript
for await (const chunk of stdout) {
  // If aborted, loop will exit
  // Either by throwing or by iterator completing
}
```

## Best Practices

### 1. Always Pass Signal Through

When creating wrapper functions, always pass the signal through:

```typescript
async function myWrapper(input: Input, signal?: AbortSignal) {
  return agent.stream({
    ...input,
    signal  // Pass signal through
  });
}
```

### 2. Check Early Abort

### 2. Check Early Abort (Optional)

Checking if signal is already aborted is usually unnecessary in API routes:

```typescript
// ❌ Usually unnecessary in API routes
if (signal?.aborted) {
  return new Response("Aborted", { status: 499 });
  // Client already disconnected - won't receive this response
}

// ✅ Better - just pass signal through
// Let SandAgent and sandbox adapters handle the abort
await agent.stream({ messages, signal } 3. Clean Up Resources

A``

However, checking abort status can be useful in long-running synchronous operations:

```typescript
async function processLargeDataset(data: any[], signal?: AbortSignal) {
  const results = [];
  
  for (const item of data) {
    // Check periodically to stop early
    if (signal?.aborted) {
      console.log("Processing aborted");
      break;
    }
    
    results.push(await processItem(item));
  }
  
  return results;
}
```lways clean up event listeners and resources:

```typescript
try {
  signal?.addEventListener("abort", handler);
  // Do work...
} finally {
  signal?.removeEventListener("abort", handler);
}
```

### 4. Handle Gracefully

Treat cancellation as a normal flow, not an error:

```typescript
catch (error) {
  if (error.name === "AbortError") {
    // Normal cancellation - log for server-side tracking
    console.log("Operation cancelled by user");
    // Note: If this was triggered by client disconnect,
    // the client won't receive this response
    return new Response(null, { status: 499 });
  }
  // Actual error - rethrow
  throw error;
}
```

**Important**: When handling AbortError in API routes, remember that the client has likely already disconnected. The error handling is mainly for:
- Server-side logging
- Resource cleanup (which happens automatically via signal propagation)
- Preventing error logs for normal cancellations

### 5. Don't Create Unnecessary Controllers in API Routes

The Request object already has a signal - use it directly:

```typescript
// ✅ Good - use request.signal directly
export async function POST(request: Request) {
  await agent.stream({ signal: request.signal });
}

// ❌ Bad - creating unnecessary controller
export async function POST(request: Request) {
  const controller = new AbortController();  // Unnecessary!
  request.signal.addEventListener('abort', () => controller.abort());
  await agent.stream({ signal: controller.signal });
}
```

Note: You only need AbortController on the client side (for fetch):

```typescript
// Client side - AbortController needed here
const controller = new AbortController();
fetch('/api/ai', { signal: controller.signal });

// Server side - use request.signal directly
export async function POST(request: Request) {
  agent.stream({ signal: request.signal });
}
```

## Testing

### Testing Abort Behavior

```typescript
import { describe, it, expect } from "vitest";

describe("Abort Signal", () => {
  it("should cancel operation when aborted", async () => {
    // Create mock request with abortable signal
    const controller = new AbortController();
    const mockRequest = new Request("http://localhost", {
      signal: controller.signal
    });
    
    // Start operation
    const promise = agent.stream({
      messages: [{ role: "user", content: "test" }],
      signal: mockRequest.signal
    });
    
    // Abort after short delay
    setTimeout(() => controller.abort(), 100);
    
    // Should throw or complete with abort
    await expect(promise).rejects.toThrow("aborted");
  });
  
  it("should not start if already aborted", async () => {
    const controller = new AbortController();
    controller.abort();  // Abort before starting
    
    const mockRequest = new Request("http://localhost", {
      signal: controller.signal
    });
    
    await expect(
      agent.stream({
        messages: [{ role: "user", content: "test" }],
        signal: mockRequest.signal
      })
    ).rejects.toThrow("aborted");
  });
});
```

## Troubleshooting

### Signal Not Working

If cancellation isn't working:

1. **Check signal is passed through all layers**
   ```typescript
   // Verify signal is passed to agent.stream()
   await agent.stream({ messages, signal: request.signal });
   ```

2. **Check sandbox adapter supports signals**
   - E2B: ✅ Supported
   - Sandock: ✅ Supported
   - Custom: Implement `exec()` with signal support

3. **Check for signal listener cleanup**
   ```typescript
   // Always remove listeners in finally block
   finally {
     signal?.removeEventListener("abort", handler);
   }
   ```

4. **Verify client-side abort is working**
   ```typescript
   // Client side - make sure abort is called
   const controller = new AbortController();
   fetch('/api/ai', { signal: controller.signal });
   
   // Later...
   controller.abort();  // This should abort the request
   ```

### Process Not Terminating

If the remote process doesn't stop:

1. **Check PID file creation**
   - Look for logs: `[E2B] PID file: /tmp/sandagent-...`
   - Verify file is created in sandbox

2. **Check kill command execution**
   - Look for logs: `[E2B] Kill command output:`
   - Verify SIGTERM is sent

3. **Check runner-cli signal handlers**
   ```typescript
   // Verify handlers are registered
   process.on("SIGTERM", signalHandler);
   process.on("SIGINT", signalHandler);
   ```

### "Request was aborted" Errors

If you see errors about aborted requests:

1. **This is normal behavior** - it means the client cancelled the request
2. **Don't treat it as an error** - it's expected when users click cancel
3. **Log it for debugging** but don't alert or throw
   ```typescript
   catch (error) {
     if (error.name === "AbortError") {
       console.log("Request cancelled (normal)");
       return;  // Exit gracefully
     }
     // Only log/alert for real errors
     console.error("Unexpected error:", error);
   }
   ```

### Response Not Received After Abort

If you're returning a response after abort and client doesn't receive it:

**This is expected behavior!** When `signal.aborted` is true, the client has already disconnected. They cannot receive any response you send.

```typescript
// ❌ This response will never be received
if (signal.aborted) {
  return new Response("Aborted", { status: 499 });
  // Client already gone - this goes nowhere
}

// ✅ Better - just let the operation fail naturally
// The signal will propagate and clean up resources
await agent.stream({ messages, signal });
```

### Memory Leaks

If you see memory leaks with signals:

1. **Always clean up listeners**
   ```typescript
   signal.addEventListener("abort", handler);
   // Later...
   signal.removeEventListener("abort", handler);
   ```

2. **Use `finally` blocks**
   ```typescript
   try {
     // Work with signal
   } finally {
     // Always clean up
     signal?.removeEventListener("abort", handler);
   }
   ```

## Related Documentation

- [API Reference](../spec/API_REFERENCE.md) - Full API documentation
- [Sandbox Adapters](../spec/SANDBOX_ADAPTERS.md) - Sandbox implementation details
- [SDK Quick Start](./SDK_QUICK_START.md) - Getting started guide
- [SDK Development Guide](./SDK_DEVELOPMENT_GUIDE.md) - Complete integration guide
