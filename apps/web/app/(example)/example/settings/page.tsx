"use client";

import {
  ArrowLeft,
  Bot as BotIcon,
  Box,
  Bug,
  Check,
  Info,
  Key,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DEFAULT_RUNNER, RUNNER_OPTIONS } from "@/lib/runner";

/**
 * Environment variable configuration (client-side)
 * All values are stored in localStorage and passed to API via request body
 */
interface EnvConfig {
  name: string;
  key: string;
  description: string;
  required: boolean;
  category: "api" | "sandbox" | "debug" | "runner";
  placeholder?: string;
  isSecret?: boolean;
  /** If set, render a select instead of text input */
  options?: { value: string; label: string }[];
}

const ENV_CONFIGS: EnvConfig[] = [
  {
    name: "Anthropic API Key",
    key: "ANTHROPIC_API_KEY",
    description:
      "Optional. Claude API key from https://console.anthropic.com (use this OR AWS Bedrock token)",
    required: false,
    category: "api",
    placeholder: "sk-ant-...",
    isSecret: true,
  },
  {
    name: "Anthropic Base URL",
    key: "ANTHROPIC_BASE_URL",
    description:
      "Optional. Custom base URL. For LiteLLM unified endpoint (recommended): set to e.g. https://litellm-server:4000 and use ANTHROPIC_AUTH_TOKEN. See code.claude.com/docs/en/llm-gateway",
    required: false,
    category: "api",
    placeholder: "https://api.anthropic.com",
  },
  {
    name: "AWS Bedrock Bearer Token",
    key: "AWS_BEARER_TOKEN_BEDROCK",
    description:
      "Optional. AWS Bearer Token for accessing Claude via Amazon Bedrock (use this OR Anthropic API key)",
    required: false,
    category: "api",
    placeholder: "Bearer token for AWS Bedrock",
    isSecret: true,
  },
  {
    name: "Anthropic Auth Token (LiteLLM / gateway)",
    key: "ANTHROPIC_AUTH_TOKEN",
    description:
      "Optional. API key for LiteLLM/gateway. Unified: ANTHROPIC_BASE_URL + this. Bedrock: ANTHROPIC_BEDROCK_BASE_URL + CLAUDE_CODE_USE_BEDROCK=1 + this. Sent as Authorization header. See code.claude.com/docs/en/llm-gateway",
    required: false,
    category: "api",
    placeholder: "sk-litellm-...",
    isSecret: true,
  },
  {
    name: "LiteLLM Master Key",
    key: "LITELLM_MASTER_KEY",
    description:
      "Optional. Same as API key for LiteLLM. Use with ANTHROPIC_BEDROCK_BASE_URL or ANTHROPIC_BASE_URL when using proxy",
    required: false,
    category: "api",
    placeholder: "Your API Key",
    isSecret: true,
  },
  {
    name: "Anthropic Bedrock Base URL (LiteLLM Bedrock pass-through)",
    key: "ANTHROPIC_BEDROCK_BASE_URL",
    description:
      "Optional. For Bedrock via LiteLLM: set to e.g. https://litellm-server:4000/bedrock, CLAUDE_CODE_USE_BEDROCK=1, CLAUDE_CODE_SKIP_BEDROCK_AUTH=1, and ANTHROPIC_AUTH_TOKEN. See code.claude.com/docs/en/llm-gateway",
    required: false,
    category: "api",
    placeholder: "https://llm.bika.ltd/bedrock",
  },
  {
    name: "Use Bedrock",
    key: "CLAUDE_CODE_USE_BEDROCK",
    description:
      "Optional. Set to 1 for Bedrock pass-through (required when using ANTHROPIC_BEDROCK_BASE_URL)",
    required: false,
    category: "api",
    placeholder: "1",
  },
  {
    name: "Skip Bedrock Auth",
    key: "CLAUDE_CODE_SKIP_BEDROCK_AUTH",
    description:
      "Optional. Set to 1 to use API key instead of AWS auth when using Bedrock via LiteLLM",
    required: false,
    category: "api",
    placeholder: "1",
  },
  {
    name: "E2B API Key",
    key: "E2B_API_KEY",
    description: "Required for E2B cloud sandbox. Get one at https://e2b.dev",
    required: false,
    category: "sandbox",
    placeholder: "e2b_...",
    isSecret: true,
  },
  {
    name: "Sandock API Key",
    key: "SANDOCK_API_KEY",
    description:
      "Required for Sandock cloud sandbox. Get one at https://sandock.ai",
    required: false,
    category: "sandbox",
    placeholder: "sandock_...",
    isSecret: true,
  },
  {
    name: "Daytona API Key",
    key: "DAYTONA_API_KEY",
    description:
      "Required for Daytona cloud sandbox. Get one at https://daytona.io",
    required: false,
    category: "sandbox",
    placeholder: "daytona_...",
    isSecret: true,
  },
  {
    name: "Sandbox Provider",
    key: "SANDBOX_PROVIDER",
    description: "Choose sandbox: 'e2b', 'sandock', or 'daytona'. Default: e2b",
    required: false,
    category: "sandbox",
    placeholder: "e2b",
  },
  {
    name: "Runner",
    key: "RUNNER",
    description:
      "Agent runner: Claude (default), Pi, Codex, Gemini, or OpenCode. Pi uses OpenAI-compatible API (set OPENAI_API_KEY in API Keys).",
    required: false,
    category: "runner",
    placeholder: DEFAULT_RUNNER,
    options: RUNNER_OPTIONS,
  },
  {
    name: "Model ID",
    key: "MODEL_ID",
    description:
      "Optional. Override the default model (e.g. Claude: global.anthropic.claude-sonnet-4-20250514, Pi: glm-4.7). Leave empty to use default.",
    required: false,
    category: "runner",
    placeholder: "e.g. global.anthropic.claude-sonnet-4-20250514",
  },
  {
    name: "Debug Mode",
    key: "DEBUG",
    description: "Enable debug logging (set to 'true' or '1')",
    required: false,
    category: "debug",
    placeholder: "true",
  },
  {
    name: "OpenAI API Key (for Pi / Codex runner)",
    key: "OPENAI_API_KEY",
    description:
      "Optional. For Pi or Codex runner. Get one at https://platform.openai.com/api-keys",
    required: false,
    category: "api",
    placeholder: "sk-...",
    isSecret: true,
  },
  {
    name: "OpenAI Base URL",
    key: "OPENAI_BASE_URL",
    description:
      "Optional. Custom base URL for OpenAI-compatible API (Pi/Codex runner). Use with OPENAI_API_KEY for proxy or LiteLLM.",
    required: false,
    category: "api",
    placeholder: "https://api.openai.com/v1",
  },
  {
    name: "Google API Key",
    key: "GOOGLE_API_KEY",
    description:
      "Optional. For Google Custom Search API. Get one at https://console.cloud.google.com/",
    required: false,
    category: "api",
    placeholder: "AIza...",
    isSecret: true,
  },
  {
    name: "Gemini Base URL",
    key: "GEMINI_BASE_URL",
    description:
      "Optional. Custom base URL for Google Gemini API (Pi runner). Use for proxy or custom endpoint.",
    required: false,
    category: "api",
    placeholder: "https://generativelanguage.googleapis.com",
  },
  {
    name: "Gemini API Key (Pi runner)",
    key: "GEMINI_API_KEY",
    description:
      "Optional. Google AI Studio / Gemini API key for Pi when using google:gemini-* models. Get one at https://aistudio.google.com/app/apikey",
    required: false,
    category: "api",
    placeholder: "AIza...",
    isSecret: true,
  },
  {
    name: "Google Search Engine ID",
    key: "GOOGLE_SEARCH_ENGINE_ID",
    description:
      "Optional. Custom Search Engine ID from https://programmablesearchengine.google.com/",
    required: false,
    category: "api",
    placeholder: "012345678901234567890:abc...",
  },
  {
    name: "Brave Search API Key",
    key: "BRAVE_API_KEY",
    description:
      "Optional. Brave Search API key for web_search tool. Free tier: 2000 queries/month. Get one at https://api-dashboard.search.brave.com/",
    required: false,
    category: "api",
    placeholder: "BSA...",
    isSecret: true,
  },
  {
    name: "Tavily API Key",
    key: "TAVILY_API_KEY",
    description:
      "Optional. Tavily search API key for web_search tool. Get one at https://tavily.com/",
    required: false,
    category: "api",
    placeholder: "tvly-...",
    isSecret: true,
  },
  {
    name: "Use BunnyAgent daemon",
    key: "USE_BUNNY_AGENT_DAEMON",
    description:
      "When On, the example probes in-sandbox http://127.0.0.1:3080/healthz and streams coding runs through bunny-agent-daemon (HTTP) when healthy; otherwise the CLI runner is used. Matches SDK useSandagentDaemon / server BUNNY_AGENT_USE_DAEMON=1.",
    required: false,
    category: "api",
    placeholder: "Off — CLI runner in sandbox",
    options: [{ value: "1", label: "On — daemon HTTP (in-sandbox)" }],
  },
];

export const STORAGE_KEY = "bunny-agent-config";

export default function SettingsPage() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  // Load config from localStorage on mount
  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem(STORAGE_KEY);
      if (savedConfig) {
        setConfig(JSON.parse(savedConfig));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const handleChange = (key: string, value: string) => {
    const newConfig = { ...config, [key]: value };
    if (!value) {
      delete newConfig[key];
    }
    setConfig(newConfig);
    setSaved(false);
  };

  const handleSave = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      // Dispatch custom event to notify other components
      window.dispatchEvent(new CustomEvent("bunny-agent-config-updated"));
    } catch {
      alert("Failed to save configuration");
    }
  };

  const handleClear = () => {
    if (confirm("Clear all configuration? This cannot be undone.")) {
      setConfig({});
      localStorage.removeItem(STORAGE_KEY);
      // Dispatch custom event to notify other components
      window.dispatchEvent(new CustomEvent("bunny-agent-config-updated"));
    }
  };

  // Check if all required fields are filled
  const requiredConfigs = ENV_CONFIGS.filter((c) => c.required);
  const allRequiredSet = requiredConfigs.every((c) => !!config[c.key]);
  const missingRequired = requiredConfigs.filter((c) => !config[c.key]);

  const categories = {
    runner: {
      title: "Runner",
      icon: <BotIcon className="size-5" />,
      configs: ENV_CONFIGS.filter((c) => c.category === "runner"),
    },
    api: {
      title: "API Keys",
      icon: <Key className="size-5" />,
      configs: ENV_CONFIGS.filter((c) => c.category === "api"),
    },
    sandbox: {
      title: "Sandbox Configuration",
      icon: <Box className="size-5" />,
      configs: ENV_CONFIGS.filter((c) => c.category === "sandbox"),
    },
    debug: {
      title: "Debug Options",
      icon: <Bug className="size-5" />,
      configs: ENV_CONFIGS.filter((c) => c.category === "debug"),
    },
  };

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/example"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="size-4" />
            Back to Chat
          </Link>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-2">
            Configure your BunnyAgent environment. These values are stored in
            your browser and passed to the API.
          </p>
        </div>

        {/* Status Banner */}
        <div
          className={`mb-8 rounded-lg p-4 ${
            allRequiredSet
              ? "bg-green-500/10 border border-green-500/20"
              : "bg-yellow-500/10 border border-yellow-500/20"
          }`}
        >
          {allRequiredSet ? (
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <Check className="size-5" />
              <span className="font-medium">
                Ready to go! All required fields are configured.
              </span>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                <X className="size-5" />
                <span className="font-medium">
                  Missing required configuration
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Please fill in: {missingRequired.map((c) => c.name).join(", ")}
              </p>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="mb-8 rounded-lg bg-blue-500/10 border border-blue-500/20 p-4">
          <div className="flex items-start gap-2">
            <Info className="size-5 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">How it works</p>
              <p className="text-sm text-muted-foreground mt-1">
                Configuration is stored in your browser&apos;s localStorage and
                sent with each API request. Your API keys never leave your
                browser except when making requests to the BunnyAgent API.
              </p>
            </div>
          </div>
        </div>

        {/* Environment Variables by Category */}
        {Object.entries(categories).map(
          ([key, { title, icon, configs: categoryConfigs }]) => (
            <div key={key} className="mb-8">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground mb-4">
                {icon}
                {title}
              </h2>
              <div className="space-y-4">
                {categoryConfigs.map((envConfig) => {
                  const hasValue = !!config[envConfig.key];
                  return (
                    <div
                      key={envConfig.key}
                      className="rounded-lg border border-border bg-card p-4"
                    >
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">
                              {envConfig.name}
                            </span>
                            {envConfig.required ? (
                              hasValue ? (
                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-600 dark:text-green-400">
                                  <Check className="size-3" /> Set
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-600 dark:text-red-400">
                                  Required
                                </span>
                              )
                            ) : hasValue ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-600 dark:text-green-400">
                                <Check className="size-3" /> Set
                              </span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                                Optional
                              </span>
                            )}
                          </div>
                          <code className="text-sm text-muted-foreground">
                            {envConfig.key}
                          </code>
                          <p className="text-sm text-muted-foreground mt-1">
                            {envConfig.description}
                          </p>
                        </div>
                      </div>

                      {envConfig.options ? (
                        <select
                          value={
                            config[envConfig.key] ||
                            (envConfig.key === "RUNNER" ? DEFAULT_RUNNER : "")
                          }
                          onChange={(e) =>
                            handleChange(envConfig.key, e.target.value)
                          }
                          className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          {envConfig.key === "RUNNER" ? null : (
                            <option value="">
                              {envConfig.placeholder ||
                                `Select ${envConfig.name}`}
                            </option>
                          )}
                          {envConfig.options.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={envConfig.isSecret ? "password" : "text"}
                          placeholder={
                            envConfig.placeholder || `Enter ${envConfig.name}`
                          }
                          value={config[envConfig.key] || ""}
                          onChange={(e) =>
                            handleChange(envConfig.key, e.target.value)
                          }
                          className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ),
        )}

        {/* Spacer for floating button (avoid content hidden behind it) */}
        <div className="h-20" aria-hidden="true" />

        {/* Links */}
        <div className="border-t border-border pt-8">
          <h3 className="font-medium text-foreground mb-4">Get API Keys</h3>
          <ul className="space-y-2 text-sm">
            <li>
              <a
                href="https://console.anthropic.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Anthropic Console → Get Claude API Key
              </a>
            </li>
            <li>
              <a
                href="https://e2b.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                E2B Dashboard → Get E2B API Key
              </a>
            </li>
            <li>
              <a
                href="https://sandock.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Sandock Console → Get Sandock API Key
              </a>
            </li>
            <li>
              <a
                href="https://daytona.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Daytona Console → Get Daytona API Key
              </a>
            </li>
          </ul>
        </div>
      </div>

      {/* Floating Save Configuration bar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full border border-border bg-card/95 backdrop-blur-sm px-4 py-2 shadow-lg">
        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-2 rounded-full bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
        >
          {saved ? "✓ Saved!" : "Save Configuration"}
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="px-4 py-2 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          Clear All
        </button>
      </div>
    </main>
  );
}
