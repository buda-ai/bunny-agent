/** Versioned display events that supplement stable ACP v1 session updates. */
export interface BunnyAcpLifecycleEvent {
  version: 1;
  type:
    | "turn_started"
    | "step_started"
    | "step_finished"
    | "turn_finished"
    | "resource_update"
    | "job_update";
  turnId: string;
  at: string;
  stepId?: string;
  label?: string;
  stopReason?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cachedReadTokens?: number;
    cachedWriteTokens?: number;
    thoughtTokens?: number;
  };
  resource?: {
    id: string;
    uri: string;
    name: string;
    mimeType?: string;
    description?: string;
    size?: number;
    previewUri?: string;
    status?: string;
    _meta?: Record<string, unknown>;
  };
  job?: {
    id: string;
    title: string;
    status: string;
    resourceIds?: string[];
    message?: string;
  };
}

export const BUNNY_ACP_EVENT_METHOD = "_bunny-agent/session_event";
