# Native Video Generation Tool via Provider Pattern

We have added a new native tool `generate_video` to the `runner-pi` package, enabling seamless video generation directly within the agent workflow.

## Features
- **Provider Pattern Architecture:** Video generation is decoupled into a provider-based architecture, making it easy to swap or add new models (like OpenAI Sora, Runway, Kling) in the future.
- **Explicit Task Lifecycle:** Each provider exposes `create` / `poll` / `cancel` methods. The shared polling loop, abortable sleep, and progress reporting live in the tool runner, so new providers only need three thin HTTP calls.
- **BytePlus Ark Integration:** Native support for the Seedance 2.0 (and Fast) video generation API, including `DELETE /contents/generations/tasks/{id}` for task cancellation.
- **Abort-Aware:** When the caller aborts mid-generation, the poll sleep is interrupted immediately and a best-effort cancel is sent to the provider (Ark honors cancellation only while the task is still `queued`).
- **Zero-Config Fallback:** Automatically detects `ARK_API_KEY` and injects the video generation tool into the LLM context. No need to install external scripts or dependencies.

## Usage
The tool `generate_video(prompt)` will automatically be available to agents if `ARK_API_KEY` is set in the environment variables.
