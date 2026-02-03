# Sandbox Reuse and Persistence

This guide explains how reuse works across sandbox providers and how to keep filesystem state between sessions.

## Quick Summary

| Provider | Reuse Mechanism | Persistence | Best For |
|------|------|------|------|
| E2B | Name-based lookup | Platform-managed FS | Production, short tasks |
| Sandock | In-process cache | No cross-process persistence | Local dev |
| Daytona | Name + volume | Volume-backed | Long-lived projects |

## E2B

### How Reuse Works

- Provide a stable `name`
- `attach()` finds and resumes existing sandboxes by name
- If no sandbox exists, a new one is created

```typescript
const sandbox = new E2BSandbox({ name: "my-project", template: "base" });
const handle = await sandbox.attach();
```

### Notes

- Works across processes
- Idle sandboxes may be paused and auto-resumed

## Sandock

### How Reuse Works

- Uses an in-memory cache per process
- Reuse works only within the same Node.js process

```typescript
const sandbox = new SandockSandbox({ image: "sandockai/sandock-code:latest" });
const handle = await sandbox.attach();
```

### Notes

- Cache size: 50 instances
- TTL: 30 minutes
- Not shared across processes

## Daytona

### How Reuse Works

- Provide a stable `name`
- Optional `volumeName` keeps files across restarts

```typescript
const sandbox = new DaytonaSandbox({
  name: "my-project",
  volumeName: "my-project-volume",
  autoStopInterval: 15,
});
const handle = await sandbox.attach();
```

### Notes

- Volume persists even when sandbox stops
- Suitable for long-lived projects

## Naming Strategy

Pick a stable name tied to your use case:

- Template-based: `sandagent-${template}`
- User session: `user-${userId}-session-${sessionId}`
- Project: `project-${projectId}`

## Recommendations

- **Production, short tasks**: E2B with a stable `name`
- **Long-lived projects**: Daytona with `volumeName`
- **Local dev**: Sandock cache

## Related Docs

- `docs/SERVER_SANDBOX_GUIDE.md`
- `docs/DEPLOY_CUSTOM_TEMPLATE.md`
