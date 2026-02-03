# Abort Signal Guide

This guide explains how SandAgent propagates abort signals to cancel long-running work.

## Overview

SandAgent uses the standard [AbortController/AbortSignal API](https://developer.mozilla.org/en-US/docs/Web/API/AbortController). The signal flows from the API layer into the sandbox adapter and finally to the runner process.

## Signal Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. API Route                                                     │
│    const signal = request.signal                                │
│    agent.stream({ signal })                                     │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. SandAgent Manager                                             │
│    - Passes signal to sandbox.exec()                            │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. Sandbox Adapter                                               │
│    - Listens for abort                                           │
│    - Sends SIGTERM to remote process                            │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Runner CLI                                                    │
│    - Converts SIGTERM to AbortSignal                            │
│    - Stops agent execution                                      │
└─────────────────────────────────────────────────────────────────┘
```

## API Layer Usage

Use `request.signal` directly. Do not create a new controller on the server.

```typescript
export async function POST(request: Request) {
  const response = await agent.stream({
    messages: [...],
    signal: request.signal,
  });

  return response;
}
```

## Sandbox Adapter Behavior

Adapters listen to `signal.abort` and terminate the remote process. E2B/Sandock use PID capture to issue a `kill -TERM`.

```typescript
signal?.addEventListener("abort", abortHandler);
```

## Runner Behavior

The runner converts OS signals to an internal AbortSignal and stops iteration.

```typescript
process.on("SIGTERM", () => controller.abort());
for await (const chunk of runner.run(input, controller.signal)) {
  process.stdout.write(chunk);
}
```

## Best Practices

- **Always pass the signal through** your own wrappers
- **Clean up listeners** in `finally`
- **Treat AbortError as normal** cancellation, not a failure

```typescript
try {
  await agent.stream({ messages, signal });
} catch (error) {
  if (error.name === "AbortError") {
    // Normal cancellation
    return;
  }
  throw error;
}
```

## Common Pitfalls

- **Creating a new controller on the server**: use `request.signal` instead
- **Returning a response after abort**: clients already disconnected
- **Leaking listeners**: always remove them

## Related Docs

- `docs/SDK_QUICK_START.md`
- `docs/SDK_DEVELOPMENT_GUIDE.md`
- `spec/SANDBOX_ADAPTERS.md`
