import type * as git from "isomorphic-git";

export type GitCommands = typeof git;

export type FunctionKeys<T> = {
  [K in keyof T]: T[K] extends (...args: any) => any ? K : never;
}[keyof T];

export type GitCommandKeys = FunctionKeys<GitCommands>;

export type OmittedOptions = 'fs' | 'http' | 'dir' | 'core';

export type GitRpcOptions<K extends GitCommandKeys> =
  Parameters<GitCommands[K]>[0] extends undefined
    ? undefined
    : Omit<Parameters<GitCommands[K]>[0], OmittedOptions>;

export interface GitRpcRequest<K extends GitCommandKeys> {
  volume?: string;
  repo: string;
  command: K;
  options: GitRpcOptions<K>;
}

export type GitRpcResponse<K extends GitCommandKeys> = ReturnType<GitCommands[K]>;

