---
"@bunny-agent/manager": patch
"@bunny-agent/runner-cli": patch
"@bunny-agent/daemon": patch
---

Bound external tool-ref text responses in the Pi and Claude runners to 50 KiB
or 2,000 lines. Save oversized responses in the OS temporary directory and
return a preview with a file path so large business tool results do not
overwhelm model context.
Successful responses, error bodies, and transport exceptions are covered.
