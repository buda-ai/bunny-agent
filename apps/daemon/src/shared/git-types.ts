/**
 * Shared git API types for the bunny-agent daemon.
 *
 * These types define the HTTP API contract for `/api/git/*` endpoints.
 * Consumers (e.g. kapps/apps/buda) can import them via
 * `@bunny-agent/daemon/shared/git-types`.
 */

import type { ApiEnvelope } from "../utils.js";

// Re-export the envelope so consumers don't need a separate import
export type { ApiEnvelope } from "../utils.js";

// ---------------------------------------------------------------------------
// /api/git/status  (POST)
// ---------------------------------------------------------------------------

export interface GitStatusRequest {
  volume?: string;
  repo: string;
}

export interface GitCommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

export type GitStatusResponse = ApiEnvelope<GitCommandResult>;

// ---------------------------------------------------------------------------
// /api/git/exec  (POST)
// ---------------------------------------------------------------------------

export interface GitExecRequest {
  volume?: string;
  repo: string;
  args: string[];
}

export type GitExecResponse = ApiEnvelope<GitCommandResult>;

// ---------------------------------------------------------------------------
// /api/git/clone  (POST)
// ---------------------------------------------------------------------------

export interface GitCloneRequest {
  volume?: string;
  repo_parent: string;
  url: string;
  branch?: string;
  depth?: number;
  target_dir?: string;
  list_files_limit?: number;
}

export interface GitCloneResult {
  repo_path: string;
  tracked_files_count: number;
  tracked_files: string[];
  tracked_files_truncated: boolean;
  command: GitCommandResult;
}

export type GitCloneResponse = ApiEnvelope<GitCloneResult>;

// ---------------------------------------------------------------------------
// /api/git/init  (POST)
// ---------------------------------------------------------------------------

export interface GitInitRequest {
  volume?: string;
  repo: string;
  initial_branch?: string;
}

export type GitInitResponse = ApiEnvelope<GitCommandResult>;
