# Request-scoped web search credentials

## Summary

Brave and Tavily credentials are now accepted only from the explicit coding-run request environment. Ambient daemon and runner process environments no longer influence web search provider selection.

## Changes

- Removed `process.env` fallback from Pi and harness web search provider resolution.
- Removed Brave and Tavily fallback and inheritance from `buildRunnerEnv`.
- Filtered Brave and Tavily keys out of the daemon environment before merging the coding-run request environment.
- Preserved explicit web search credentials in local sandbox and example web callers through dedicated parameters.
- Added regression coverage for local credentials being ignored and request credentials being preserved.

## Motivation

A Connector must use the provider credentials selected by Buda for that run. Credentials configured on the user's machine must not silently add or reorder web search providers.
