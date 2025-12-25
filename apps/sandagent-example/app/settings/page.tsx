"use client";

import { ArrowLeft, Box, Bug, Check, Info, Key, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Environment variable configuration (client-side)
 * All values are stored in localStorage and passed to API via request body
 */
interface EnvConfig {
  name: string;
  key: string;
  description: string;
  required: boolean;
  category: "api" | "sandbox" | "debug";
  placeholder?: string;
  isSecret?: boolean;
}

const ENV_CONFIGS: EnvConfig[] = [
  {
    name: "Anthropic API Key",
    key: "ANTHROPIC_API_KEY",
    description:
      "Required for Claude Agent SDK. Get one at https://console.anthropic.com",
    required: true,
    category: "api",
    placeholder: "sk-ant-...",
    isSecret: true,
  },
  {
    name: "Anthropic Base URL",
    key: "ANTHROPIC_BASE_URL",
    description:
      "Optional. Custom base URL for Anthropic API (e.g., for proxy or alternative endpoints)",
    required: false,
    category: "api",
    placeholder: "https://api.anthropic.com",
  },
  {
    name: "E2B API Key",
    key: "E2B_API_KEY",
    description: "Required for E2B cloud sandbox. Get one at https://e2b.dev",
    required: true,
    category: "sandbox",
    placeholder: "e2b_...",
    isSecret: true,
  },
  {
    name: "Sandbox Provider",
    key: "SANDBOX_PROVIDER",
    description:
      "Choose sandbox: 'e2b' (cloud, recommended) or 'sandock' (local Docker). Default: e2b",
    required: false,
    category: "sandbox",
    placeholder: "e2b",
  },
  {
    name: "Docker Host",
    key: "DOCKER_HOST",
    description:
      "Docker host URL for Sandock adapter. Only needed if using 'sandock' provider",
    required: false,
    category: "sandbox",
    placeholder: "unix:///var/run/docker.sock",
  },
  {
    name: "Debug Mode",
    key: "DEBUG",
    description: "Enable debug logging (set to 'true' or '1')",
    required: false,
    category: "debug",
    placeholder: "true",
  },
];

export const STORAGE_KEY = "sandagent-config";

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
      window.dispatchEvent(new CustomEvent("sandagent-config-updated"));
    } catch {
      alert("Failed to save configuration");
    }
  };

  const handleClear = () => {
    if (confirm("Clear all configuration? This cannot be undone.")) {
      setConfig({});
      localStorage.removeItem(STORAGE_KEY);
      // Dispatch custom event to notify other components
      window.dispatchEvent(new CustomEvent("sandagent-config-updated"));
    }
  };

  // Check if all required fields are filled
  const requiredConfigs = ENV_CONFIGS.filter((c) => c.required);
  const allRequiredSet = requiredConfigs.every((c) => !!config[c.key]);
  const missingRequired = requiredConfigs.filter((c) => !config[c.key]);

  const categories = {
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
            href="/"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="size-4" />
            Back to Chat
          </Link>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-2">
            Configure your SandAgent environment. These values are stored in
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
                browser except when making requests to the SandAgent API.
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
                    </div>
                  );
                })}
              </div>
            </div>
          ),
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90"
          >
            {saved ? "✓ Saved!" : "Save Configuration"}
          </button>
          <button
            onClick={handleClear}
            className="px-4 py-2 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            Clear All
          </button>
        </div>

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
          </ul>
        </div>
      </div>
    </main>
  );
}
