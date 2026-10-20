---
"@bunny-agent/manager": minor
"@bunny-agent/daemon": minor
"@bunny-agent/sdk": minor
"@bunny-agent/runner-pi": minor
---

Add independent document citation v1 contracts and trusted structured MCP read
receipts. Bind original document versions and exact line excerpts to actual
tool calls, preserve native AI SDK source-document parts, and restore only
reachable session evidence across continuation and branching.

Automatically negotiate daemon support before forwarding documentReadTools.
Keep existing web citation v1 behavior and remove the new field for healthy
older runtimes. Reject unacknowledged or malformed document metadata.

Use a shared streaming marker scanner for mixed web/document answers. Keep
temporary URL resolvers excluded from model execution; product backends own
current authorization, click resolution, and document preview.
