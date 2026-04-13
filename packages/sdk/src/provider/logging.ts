import type { Logger, BunnyAgentProviderSettings } from "./types";

/** Shared logger factory for provider and language model. */
export function getProviderLogger(
  settings: Partial<BunnyAgentProviderSettings>,
): Logger {
  if (settings.logger === false) {
    return {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };
  }

  if (settings.logger) {
    return settings.logger;
  }

  const isVerbose = settings.verbose ?? false;
  return {
    debug: (msg) => isVerbose && console.debug(msg),
    info: (msg) => isVerbose && console.info(msg),
    warn: (msg) => console.warn(msg),
    error: (msg) => console.error(msg),
  };
}
