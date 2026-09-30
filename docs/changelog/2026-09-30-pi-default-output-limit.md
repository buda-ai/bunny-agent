# Pi Default Output Limit

- Increase the unknown dynamic-model output default from 8,192 to 16,384 tokens,
  matching Pi's custom-model default.
- Update the existing default-profile test expectation.
- Keep the 128,000-token context default and Gemini 3.7/3.8 Flash profiles unchanged.
- Defer native model capability lookup; remove the implementation and tests
  previously proposed in this session from the final PR.
- Verify all 21 model-profile tests, package typecheck, and whitespace checks.
