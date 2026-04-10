/**
 * OAuth login flow for sandagent-tui.
 * Uses pi-ai OAuth providers + pi-coding-agent AuthStorage.
 * Credentials stored in ~/.pi/auth.json (shared with pi coding agent).
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { AuthStorage, FileAuthStorageBackend } from "@mariozechner/pi-coding-agent";
import { getOAuthProviders } from "@mariozechner/pi-ai/oauth";
import type { OAuthProviderInterface } from "@mariozechner/pi-ai";
import type { Container, TUI } from "@mariozechner/pi-tui";
import { Input, Spacer, Text } from "@mariozechner/pi-tui";
import open from "open";
import { t } from "./theme.js";

const AUTH_PATH = join(homedir(), ".pi", "auth.json");

export function getAuthStorage(): AuthStorage {
  return new AuthStorage(new FileAuthStorageBackend(AUTH_PATH));
}

export function getProviders(): OAuthProviderInterface[] {
  return getOAuthProviders();
}

export function getLoggedInProviders(): string[] {
  const storage = getAuthStorage();
  return getProviders()
    .filter((p) => storage.get(p.id)?.type === "oauth")
    .map((p) => p.id);
}

/**
 * Run OAuth login for a provider, using TUI Input for prompts.
 * Returns error message or null on success.
 */
export async function loginProvider(
  providerId: string,
  tui: TUI,
  statusContainer: Container,
): Promise<string | null> {
  const provider = getProviders().find((p) => p.id === providerId);
  if (!provider) return `Unknown provider: ${providerId}`;

  const storage = getAuthStorage();
  const statusText = new Text(t.dim(`Logging in to ${provider.name}…`), 1, 0);
  statusContainer.addChild(statusText);
  tui.requestRender();

  try {
    const credentials = await provider.login({
      onAuth: ({ url, instructions }) => {
        statusText.setText(
          t.accent(`Opening browser for ${provider.name}…\n`) +
            t.dim(instructions ?? "") +
            (instructions ? "\n" : "") +
            t.dim(`URL: ${url}`),
        );
        tui.requestRender();
        open(url).catch(() => {
          statusText.setText(t.dim(`Open this URL to login:\n${url}`));
          tui.requestRender();
        });
      },
      onProgress: (msg) => {
        statusText.setText(t.dim(msg));
        tui.requestRender();
      },
      onPrompt: (prompt) =>
        new Promise((resolve) => {
          statusText.setText(t.dim(prompt.message));
          const input = new Input();
          statusContainer.addChild(new Spacer(1));
          statusContainer.addChild(input);
          tui.setFocus(input);
          tui.requestRender();
          input.onSubmit = (val: string) => {
            statusContainer.removeChild(input);
            tui.requestRender();
            resolve(val);
          };
          input.onEscape = () => {
            statusContainer.removeChild(input);
            tui.requestRender();
            resolve("");
          };
        }),
    });

    storage.set(providerId, credentials);
    statusText.setText(t.toolOk(`✓ Logged in to ${provider.name}`));
    tui.requestRender();
    setTimeout(() => {
      statusContainer.removeChild(statusText);
      tui.requestRender();
    }, 2000);
    return null;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    statusContainer.removeChild(statusText);
    tui.requestRender();
    return msg;
  }
}

/** Map OAuth provider id → pi runner model string */
export function providerToModel(providerId: string): string {
  switch (providerId) {
    case "github-copilot":   return "github-copilot:gpt-4o";
    case "anthropic":        return "anthropic:claude-sonnet-4-5";
    case "google-gemini-cli":return "google:gemini-2.5-flash";
    case "google-antigravity":return "google:gemini-2.5-pro";
    case "openai-codex":     return "openai-codex:codex-mini-latest";
    default:                 return providerId;
  }
}
