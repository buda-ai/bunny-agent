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

// ---------------------------------------------------------------------------
// TRPC-like Proxy API (POST /api/git/rpc)
// ---------------------------------------------------------------------------

import type * as git from "isomorphic-git";

export type GitCommands = typeof git;

export type FunctionKeys<T> = {
  [K in keyof T]: T[K] extends (...args: infer _Args) => unknown ? K : never;
}[keyof T];

export type GitCommandKeys = Exclude<
  FunctionKeys<GitCommands>,
  "STAGE" | "TREE" | "WORKDIR"
>;

export type OmittedOptions = "fs" | "http" | "dir" | "core";

export type GitRpcOptions<K extends GitCommandKeys> = Parameters<
  GitCommands[K]
>[0] extends undefined
  ? undefined
  : Omit<Parameters<GitCommands[K]>[0], OmittedOptions>;

export interface GitRpcRequest<K extends GitCommandKeys> {
  volume?: string;
  repo: string;
  command: K;
  options?: GitRpcOptions<K>;
}

export type GitRpcResponse<K extends GitCommandKeys> = ApiEnvelope<
  Awaited<ReturnType<GitCommands[K]>>
>;

/**
 * Creates a typesafe proxy client for isomorphic-git that sends commands
 * over HTTP to the daemon's `/api/git/rpc` endpoint.
 */
export function createGitProxy(
  endpoint: string,
  fetchFn: typeof fetch,
  defaultPayload: { volume?: string; repo: string },
) {
  type Client = {
    [K in GitCommandKeys]: GitRpcOptions<K> extends undefined
      ? () => Promise<Awaited<ReturnType<GitCommands[K]>>>
      : (
          options: GitRpcOptions<K>,
        ) => Promise<Awaited<ReturnType<GitCommands[K]>>>;
  };

  return new Proxy({} as Client, {
    get(_target, command: string) {
      return async (options?: unknown) => {
        const res = await fetchFn(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...defaultPayload,
            command,
            options: options || {},
          }),
        });
        const envelope = (await res.json()) as ApiEnvelope<unknown>;
        if (!envelope.ok) throw new Error(envelope.error ?? "Unknown error");
        return envelope.data;
      };
    },
  });
}
