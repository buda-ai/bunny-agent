# Native Video Generation Tool via Provider Pattern

We have added a new native tool `generate_video` to the `runner-pi` package, enabling seamless video generation directly within the agent workflow.

## Features
- **Provider Pattern Architecture:** Video generation is decoupled into a provider-based architecture, making it easy to swap or add new models (like OpenAI Sora, Runway, Kling) in the future.
- **BytePlus Ark Integration:** Native support for the Seedance 2.0 (and Fast) video generation API.
- **Zero-Config Fallback:** Automatically detects `ARK_API_KEY` and injects the video generation tool into the LLM context. No need to install external scripts or dependencies.
- **Long-Polling Support:** Handles BytePlus's asynchronous task submission and polling automatically.

## Usage
The tool `generate_video(prompt)` will automatically be available to agents if `ARK_API_KEY` is set in the environment variables.
