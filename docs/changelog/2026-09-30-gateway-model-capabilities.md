# Gateway Model Capabilities

- Resolve dynamically registered gateway model capabilities from Pi's native
  provider catalog for recognized Claude, Gemini, DeepSeek, and OpenAI model IDs.
- Preserve the gateway transport and credentials while reusing context limits,
  output limits, reasoning levels, and supported input types.
- Preserve the explicit Gemini 3.7/3.8 Flash profiles and their 65,536-token limits.
- Increase the unknown dynamic-model output default from 8,192 to 16,384 tokens,
  matching Pi's custom-model default.
- Document capability resolution and update regression coverage.
- Verify gateway registration preserves the OpenAI-compatible transport while
  applying the native Claude catalog limits. All 200 runner tests passed.
