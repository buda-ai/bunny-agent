"use client";

import { SandAgentChat } from "@sandagent/ui";
import { Loader } from "kui/ai-elements/loader";
import { AlertCircle, CheckCircle, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { STORAGE_KEY } from "./settings/page";

const REQUIRED_KEYS = ["E2B_API_KEY"];

const templates = [
  { id: "default", name: "Default", description: "General-purpose assistant" },
  { id: "coder", name: "Coder", description: "Software development" },
  { id: "analyst", name: "Analyst", description: "Data analysis" },
  { id: "researcher", name: "Researcher", description: "Web research" },
  { id: "seo-agent", name: "SEO", description: "SEO Optimization" },
  {
    id: "gaia-agent",
    name: "GAIA Agent",
    description: "GAIA Benchmark Super Agent",
  },
  {
    id: "web-game-expert",
    name: "Web Game Expert",
    description: "3D web games & interactive experiences",
  },
];

function HomeContent() {
  const [configReady, setConfigReady] = useState<boolean | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedTemplate, setSelectedTemplate] = useState(() => {
    return searchParams.get("template") || "default";
  });
  const [clientConfig, setClientConfig] = useState<Record<string, string>>({});

  // Check configuration status from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const config = saved ? JSON.parse(saved) : {};
      setClientConfig(config);
      const hasApiKey =
        !!config.ANTHROPIC_API_KEY || !!config.AWS_BEARER_TOKEN_BEDROCK;
      const allRequiredSet =
        REQUIRED_KEYS.every((key) => !!config[key]) && hasApiKey;
      setConfigReady(allRequiredSet);
    } catch {
      setConfigReady(false);
    }
  }, []);

  // Handle template change and update URL
  const handleTemplateChange = (newTemplate: string) => {
    setSelectedTemplate(newTemplate);
    const params = new URLSearchParams(searchParams.toString());
    if (newTemplate === "default") {
      params.delete("template");
    } else {
      params.set("template", newTemplate);
    }
    const newUrl = params.toString() ? `?${params.toString()}` : "/";
    router.replace(newUrl, { scroll: false });
  };

  return (
    <SandAgentChat
      apiEndpoint="/api/ai"
      body={{ template: selectedTemplate, ...clientConfig }}
      header={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-foreground">
              SandAgent Chat
            </h1>
            {/* Template Selector */}
            <select
              value={selectedTemplate}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="px-3 py-1.5 rounded-md border border-border bg-background text-sm text-foreground"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} - {t.description}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            {/* Configuration Status Indicator */}
            {configReady !== null && (
              <div className="flex items-center gap-2">
                {configReady ? (
                  <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                    <CheckCircle className="size-4" />
                    Ready
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
                    <AlertCircle className="size-4" />
                    Config needed
                  </span>
                )}
              </div>
            )}

            {/* Settings Link */}
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border hover:bg-muted text-sm text-muted-foreground hover:text-foreground"
            >
              <Settings className="size-4" />
              Settings
            </Link>
          </div>
        </div>
      }
    />
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="h-screen w-screen flex items-center justify-center bg-background">
          <Loader className="size-8" />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
