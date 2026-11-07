# Pi generation preemption for live steering

## Request

Make live steering interrupt an unfinished provider response inside the same
logical run, retaining stable message receipts and the native session. Follow
the separation used by Codex between stopping a whole turn and preempting a
single generation.

## Changes

- Queue input through the native `AgentSession.steer()` path before aborting
  only its current provider generation. Pi 1.3's existing prompt supervisor
  continues with the queued input; steering never calls `session.abort()`.
- Fence asynchronous provider startup and stream events. A provider which
  ignores cancellation cannot hold the logical run open or emit late deltas
  into a successor. Close the old source stream to release its iterator and
  retain a snapshot of the real partial completion.
- Request preemption once per dispatch, including inputs accepted between
  generations. Context transformations that remove a message do not cause an
  endless preemption loop or a false consumed receipt.
- Preserve native partial transcript data, but send only partial text from
  aborted assistant messages to subsequent providers. Unexecuted tool calls
  and incomplete reasoning signatures never become orphan provider items;
  no synthetic tool results are created. Mark only the nonempty text-only
  outbound copy replayable so Pi's serializers retain its real assistant
  boundary; the native completion keeps its aborted status. Already executing tools finish at
  their existing safe boundary and keep their real result.
- Advertise `supportedPiSteerPreempt` in generic control capabilities, daemon
  health, and authenticated status. Per-run status only advertises it for a
  ready controller which implements generation preemption.
- Accumulate reported usage across all completions in a prompt, including
  interrupted generations, and base final success/error on the final assistant
  completion instead of an earlier intentionally interrupted generation.

## Validation

- Scoped Pi runner typecheck and full daemon dependency-ordered build pass.
- Focused runner/live-control/usage tests: 76 pass. A real offline Pi session
  preempts two provider generations which never naturally complete, consumes
  both steering IDs once, and finishes a third request in the same prompt and
  session. A partial tool call is never executed, is retained in the native
  transcript, and is omitted from the next provider request.
  The real Pi OpenAI serializer and SDK HTTP path retain the actual partial
  text as an assistant boundary. Empty partial text never creates a boundary.
- Regressions cover an asynchronous provider startup which ignores abort,
  a transformed context dropping accepted input, late source mutation, and
  independent parent cancellation.
- Control route and durable live-run registry tests: 55 pass.
- Daemon health and coding HTTP tests: 39 pass, using an isolated temporary control journal
  because the execution environment makes the default home directory read-only.
- Standalone daemon verification is repeatable after the build with
  `node scripts/verify-pi-steering.mjs apps/daemon/dist/bundle.mjs`.
  A local HTTP model keeps the first response open indefinitely. The real CLI
  daemon must close it, preserve its partial text in the second request, consume
  the steering receipt, and emit exactly one outer finish. The script uses an
  isolated working directory and control journal, cleans up only its own child,
  and times out if the continuation never finishes.

## Consumer acceptance

- A browser consumer connected to the built daemon over localhost and passed
  the full story: start a reply that never naturally finishes, queue another
  input, select steering, continue in the same run, and complete an ordinary
  follow-up. Stable input identity, preserved partial text and one logical
  completion were asserted. Screenshots and a recording were captured.
- A separate browser run against the existing published daemon correctly
  explained that generation preemption requires an upgrade and kept queued
  input intact.
- The first external-daemon attempt encountered a local HTTP proxy returning
  502. Explicit loopback NO_PROXY and localhost fixed the test environment;
  no application-code changes were required.
- The source daemon was packed and installed normally through npm. Its bundle
  hash matched the source build. Root, Next.js and shared-type imports, two
  HTTP health surfaces, and installed CLI streaming passed. A consumer package
  installed the candidate as its ordinary daemon dependency, without modifying
  the consumer CLI or vendoring a runtime. Its signed Relay browser story
  passed with the same active stream and run epoch, preserved partial context,
  one consumed input, and an ordinary follow-up rendered without a reload.
- A local production-entrypoint container installed the same tarball through
  npm and ran supervisor, watchdog and daemon as uid 1001. The existing OS and
  other toolchain layers were reused, not fully rebuilt. Authenticated HTTP
  steering, wrong-token rejection and duplicate receipt handling passed.
  Unfinished text preempted in 75 ms. A real three-second bash tool completed
  exactly once before continuation; steering neither cancelled nor duplicated
  it, and its real result reached the next provider request.
- Real gateway-backed Haiku Chat Completions and Luna Responses each passed
  two HTTP 200 requests, old transport cancellation, preserved partial context,
  stable run/session identity, one consumed input and one outer finish.
  Reported usage matched provider totals; missing interrupted-generation usage
  remained unknown. Observed completion after steering was 1.306 seconds and
  8.648 seconds respectively, not a latency guarantee. An exploratory imperative
  prompt was refused by Haiku; the normal coding requirement-change story
  passed. Provider semantic compliance is independent of transport preemption.
- Source, installed consumer and container bundle SHA256 matched:
  `9a8d313d78b35e38ceb7cfd8a0d7023abc7c32524f1739cec18839975e208959`.
  The candidate tarball SHA256 was
  `6063ac8d61402e8a9e82e0320b67b8d19f2cca31ad54df3f9b388ea0dd3d9e95`.
- Full acceptance evidence, including structured results and the browser story,
  is attached to the PR. [Sanitized acceptance record](https://pub-5d59c786708441b3a80620d87e7dee2b.r2.dev/tmp/2026-11-02/bunny-agent-steering/acceptance.json).

## Release requirements

The runtime changes must be included in the daemon's library and CLI bundles and in sandbox images;
updating only an SDK dependency does not change a remotely running daemon.
Provider usage that has not been reported before interruption remains unknown.
Official package/image publishing and upgrading deployed runtimes remain normal
release steps. No cloud provisioning, remote image publishing or production
deployment was performed by this verification.
