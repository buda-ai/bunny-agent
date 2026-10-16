/**
 * `POST /api/coding/control` — capabilities/steer/status for the live Pi
 * steering channel (PUL-355). Talks to the exact same {@link LiveRunRegistry}
 * instance the `/api/coding/run` route registers runs into — see
 * {@link createAiSdkCodingServers}, which is the only supported way to get a
 * `run`+`control` pair that actually share state.
 *
 * Wire contract (`RunControlRequestBody` / responses), v1:
 *
 *   - `{version:1, operation:"capabilities"}` (no runId/token) → generic
 *     probe, always 200: `{version:1, supportedPiSteer:boolean}`.
 *     `supportedPiSteer` reflects whether this registry has a working
 *     durable journal — a registry with no durable journal (explicit
 *     `stateDir: null` or a real init failure) cannot safely support
 *     controlled runs at all (see `live-run-registry.ts`), so it reports
 *     `false` rather than `true` with registration doomed to 409 next.
 *   - `{version:1, operation:"capabilities", runId, token}` → authenticated,
 *     same shape as "status" (so callers can request fresh capabilities +
 *     receipts in one call).
 *   - `{version:1, operation:"status", runId, token}` →
 *     `{version:1, active:boolean, ready:boolean, epoch:number,
 *     receipts:RunControlReceipt[], runner?:string, model?:string}`.
 *     `runner`/`model` are the run's configured provider profile (passed
 *     through from the `/api/coding/run` request that registered it), only
 *     present once known; native model-switching extensions are outside
 *     this contract and never change what's reported here.
 *   - `{version:1, operation:"steer", runId, token, message}` → the single
 *     receipt for that message: `{version:1, receipt:{id, state, updatedAt,
 *     reason?}}`.
 *
 * All non-2xx error bodies are `{ok:false, data:null, error}` (matching the
 * existing daemon envelope). `error` never contains any part of the raw
 * request body under any circumstance — a `/api/coding/control` body may
 * carry `token`, and no regex/prefix-based redaction of attacker-controlled
 * JSON can be trusted to catch every encoding of that field (escaped keys,
 * unicode escapes, truncation mid-value, etc). A JSON parse failure
 * therefore reports a fixed, static message with zero body content, not a
 * "redacted preview". Status codes: 400 malformed, 404 unknown runId or
 * wrong token (identical body — never reveal which), 409 not_ready / closed
 * / unsupported / duplicate-id-different-payload.
 */

import type { RunControlRequestBody } from "@bunny-agent/runner-harness";
import { ControlError, type LiveRunRegistry } from "./live-run-registry.js";

const STATUS_BY_CODE: Record<string, number> = {
  malformed: 400,
  not_found: 404,
  not_ready: 409,
  closed: 409,
  unsupported: 409,
  conflict: 409,
};

interface ErrorEnvelope {
  ok: false;
  data: null;
  error: string;
}

function errorEnvelope(message: string): ErrorEnvelope {
  return { ok: false, data: null, error: message };
}

export type ParsedControlRequest =
  | { ok: true; body: RunControlRequestBody }
  | { ok: false; status: number; envelope: ErrorEnvelope };

const VALID_OPERATIONS = new Set(["capabilities", "steer", "status"]);

export function parseControlRequestBody(raw: string): ParsedControlRequest {
  const trimmed = (raw || "").trim();
  if (!trimmed) {
    return {
      ok: false,
      status: 400,
      envelope: errorEnvelope("Request body is required"),
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      ok: false,
      status: 400,
      envelope: errorEnvelope("Invalid JSON body"),
    };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return {
      ok: false,
      status: 400,
      envelope: errorEnvelope("Request body must be a JSON object"),
    };
  }
  const body = parsed as Record<string, unknown>;
  if (body.version !== 1) {
    return {
      ok: false,
      status: 400,
      envelope: errorEnvelope('Request body must set "version":1'),
    };
  }
  if (
    typeof body.operation !== "string" ||
    !VALID_OPERATIONS.has(body.operation)
  ) {
    return {
      ok: false,
      status: 400,
      envelope: errorEnvelope(
        'operation must be one of "capabilities", "steer", "status"',
      ),
    };
  }
  if (body.runId !== undefined && typeof body.runId !== "string") {
    return {
      ok: false,
      status: 400,
      envelope: errorEnvelope("runId must be a string"),
    };
  }
  if (body.token !== undefined && typeof body.token !== "string") {
    return {
      ok: false,
      status: 400,
      envelope: errorEnvelope("token must be a string"),
    };
  }
  return { ok: true, body: body as unknown as RunControlRequestBody };
}

export interface ControlResponse {
  status: number;
  body: unknown;
}

/**
 * Pure handler: validates + dispatches one `RunControlRequestBody` against
 * `registry`. Both the Node and Web adapters below are thin wrappers that
 * only differ in how they read the request body / write the response.
 */
export async function handleControlRequest(
  registry: LiveRunRegistry,
  body: RunControlRequestBody,
): Promise<ControlResponse> {
  try {
    switch (body.operation) {
      case "capabilities": {
        if (body.runId === undefined && body.token === undefined) {
          return {
            status: 200,
            body: {
              version: 1,
              supportedPiSteer: await registry.supportsDurableControl(),
            },
          };
        }
        const status = await registry.getStatus(body.runId, body.token);
        return {
          status: 200,
          body: { version: 1, ...status },
        };
      }
      case "status": {
        const status = await registry.getStatus(body.runId, body.token);
        return {
          status: 200,
          body: { version: 1, ...status },
        };
      }
      case "steer": {
        if (body.message === undefined) {
          return {
            status: 400,
            body: errorEnvelope('operation "steer" requires `message`'),
          };
        }
        const receipt = await registry.steer(
          body.runId,
          body.token,
          body.message,
        );
        return {
          status: 200,
          body: { version: 1, receipt },
        };
      }
      default:
        return {
          status: 400,
          body: errorEnvelope(`Unknown operation: ${String(body.operation)}`),
        };
    }
  } catch (error) {
    if (error instanceof ControlError) {
      return {
        status: STATUS_BY_CODE[error.code] ?? 400,
        body: errorEnvelope(error.message),
      };
    }
    return {
      status: 500,
      body: errorEnvelope(
        error instanceof Error ? error.message : String(error),
      ),
    };
  }
}
