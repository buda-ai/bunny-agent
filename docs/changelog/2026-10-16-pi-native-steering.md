# Pi safe-boundary live steering

The Pi runner can expose its active session to a host through the optional
`liveControl` callback. A host can submit a stable-ID message through native
`AgentSession.steer()` while a tool is running. Pi finishes the current tool
calls before including that instruction in its next model request. This does
not abort tools or schedule a second follow-up run.

The controller installs before the initial prompt, because Pi snapshots the
provider function when starting a run. It reports readiness after the first
provider function successfully returns a stream, rather than on the earlier
`agent_start` event. Runs without `liveControl` keep their existing behavior.

## Delivery receipts

Queue acceptance and model-input consumption are separate observations. Pi's
extension context pipeline clones messages with `structuredClone`, so neither
object identity nor queue-length changes prove that a particular caller's
message reached the model input.

The controller tags each captured native user message with serializable
internal metadata containing its stable ID and a random controller nonce. It
checks that marker at the final provider-call boundary, after context
transforms and conversion to model messages. The provider receives a shallow
copy with that metadata removed. Retained and replayed markers are stripped
on later requests too, and the native context is not mutated. The marker
contains no control authentication token and does not alter message text.
Native session files may retain this opaque metadata.

A consumption callback requires a successful provider-function invocation,
a confirmed `queued` disposition, and exactly one native user message captured
for that dispatch. A provider call that races ahead of the disposition is
remembered until the disposition settles. Handled input and ambiguous
multi-message handler side effects are never reported as consumed. An
exception after native enqueue remains ambiguous for the host to reconcile.

Disposal restores the exact original functions if they are still this
controller's wrappers, restores the previous steering mode, and does not
write global Pi settings.

## Validation and limits

The focused controller tests and existing Pi runner tests pass: 23 controller
cases and 47 runner cases. They cover cloned contexts, transformed or dropped
messages, duplicate text, images, handled input, callback timing, failed
provider calls, retained metadata, and restoration. A separate real Pi run
using a local scripted HTTP provider and a slow shell tool confirmed that the
selected stable-ID instruction entered the next provider request once, after
the tool completed, without aborting or replacing the run. Scoped source type
checking also passed.

Consumption means inclusion in a provider-call input; it does not prove that
the model obeyed the instruction or that the provider processed it exactly
once. A transform that removes the marker or changes the message's role
leaves the outcome unconfirmed. The host control registry is responsible for
retaining receipts and reporting unresolved delivery as uncertain when a run
ends or the daemon restarts. This feature relies on the installed Pi pipeline
preserving ordinary metadata through cloning; the real-session regression
test protects that integration boundary.
