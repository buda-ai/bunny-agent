import { resolveSearchContractCapabilities } from "@bunny-agent/runner-harness";
import type { LiveRunRegistry } from "@bunny-agent/server-ai-sdk";
import type { AppState } from "../utils.js";
import { ok } from "../utils.js";

export async function healthHandler(
  state: AppState,
  controlRegistry?: LiveRunRegistry,
) {
  const supported = (await controlRegistry?.supportsDurableControl()) ?? false;
  return ok({
    status: "ok",
    root: state.root,
    volumesRoot: state.volumesRoot,
    capabilities: {
      codingControl: {
        version: 1,
        supportedPiSteer: supported,
        supportedPiSteerPreempt: supported,
      },
      searchContracts: {
        pi: resolveSearchContractCapabilities("pi", 1),
        codex: resolveSearchContractCapabilities("codex", 1),
      },
    },
  });
}
