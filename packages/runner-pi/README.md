# @bunny-agent/runner-pi

Pi agent runner for Bunny Agent.

## Installation

```bash
npm install @bunny-agent/runner-pi
```

## Usage

```ts
import { createPiRunner } from "@bunny-agent/runner-pi";

const runner = createPiRunner({
  model: "google:gemini-2.5-pro",
  cwd: process.cwd(),
});

for await (const chunk of runner.run("Create a hello world script")) {
  process.stdout.write(chunk);
}
```

## Options

- `model`: model id in `<provider>:<model>` format, for example `google:gemini-2.5-pro`
- `systemPrompt`: custom system prompt
- `cwd`: working directory for coding tools
- `env`: environment overrides (used for runtime configuration such as base URLs)
- `abortController`: signal-driven cancellation
- `effort`: optional Bunny reasoning effort (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`), mapped to Pi's native `thinkingLevel`

## Output

Produces AI SDK UI data stream (SSE) chunks.

## AI Integration Test

The default test suite is offline. To run the guarded real-model integration
test, export API credentials first and opt in explicitly. For the default
`openai:gpt-5.4` model, `OPENAI_API_KEY` and `OPENAI_BASE_URL` must both be
present in `apps/bunny-bench/.env`.

```bash
# From the repository root:
set -a
source apps/bunny-bench/.env
set +a

RUN_AI_INTEGRATION=1 \
BUNNY_AI_INTEGRATION_PI_MODEL="${BUNNY_AI_INTEGRATION_PI_MODEL:-openai:gpt-5.4}" \
pnpm --filter @bunny-agent/runner-pi exec vitest run src/__tests__/pi-runner.integration.test.ts
```

The test verifies a real Pi runner call with `effort: "medium"` and checks that
the stream contains `pong` and a finish event. It never prints API keys.

To run the full Pi runner suite with real-model integration and coverage:

```bash
RUN_AI_INTEGRATION=1 \
BUNNY_AI_INTEGRATION_PI_MODEL="${BUNNY_AI_INTEGRATION_PI_MODEL:-openai:gpt-5.4}" \
pnpm --filter @bunny-agent/runner-pi exec vitest run --coverage
```

Coverage is checked against 80% global thresholds for the runner core. Bundled
extension source, barrel exports, tool metadata types, and the optional image
tool are excluded from the runner core coverage target.
