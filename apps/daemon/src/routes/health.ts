import type { AppState } from "../utils.js";
import { ok } from "../utils.js";

export function healthHandler(state: AppState) {
  return ok({ status: "ok", root: state.root, volumesRoot: state.volumesRoot });
}
