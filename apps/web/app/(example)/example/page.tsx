"use client";

import { useSandAgentChat } from "@sandagent/sdk/react";
import type { DynamicToolUIPart, UIMessage } from "ai";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  Loader,
  Message,
  MessageContent,
  MessageResponse,
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "kui/ai-elements";
import {
  AlertCircle,
  BookOpen,
  BotIcon,
  CheckCircle,
  Settings,
  UserIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { DEFAULT_RUNNER } from "@/lib/runner";
import { AskUserQuestionUI } from "./claude-tools/AskUserQuestionUI";
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
  {
    id: "shortsdrone-agent",
    name: "ShortsDrone Agent",
    description: "Video content creation and editing",
  },
  {
    id: "bazi-agent",
    name: "Bazi Agent",
    description: "Chinese Astrology and Bazi Analysis",
  },
  {
    id: "zodiacdrone-agent",
    name: "ZodiacDrone Agent",
    description: "Astrology-based Video Content Creation",
  },
  {
    id: "videodrone-agent",
    name: "VideoDrone Agent",
    description: "General Video Content Creation and Editing",
  },
];

function ChatMessage({
  message,
  messages,
  chatBody,
}: {
  message: UIMessage;
  messages: UIMessage[];
  chatBody?: Record<string, unknown>;
}) {
  const isUser = message.role === "user";

  return (
    <Message from={message.role}>
      <div className="flex items-start gap-3">
        <div
          className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
            isUser ? "bg-primary text-primary-foreground" : "bg-muted"
          }`}
        >
          {isUser ? (
            <UserIcon className="size-4" />
          ) : (
            <BotIcon className="size-4" />
          )}
        </div>
        <MessageContent>
          {message.parts.map((part, index) => {
            const key =
              part.type === "dynamic-tool"
                ? ((part as DynamicToolUIPart).toolCallId ?? `part-${index}`)
                : `part-${index}`;
            if (part.type === "text") {
              return <MessageResponse key={key}>{part.text}</MessageResponse>;
            }
            if (part.type === "dynamic-tool") {
              const toolPart = part as DynamicToolUIPart;
              if (toolPart.toolName === "AskUserQuestion") {
                return (
                  <AskUserQuestionUI
                    key={toolPart.toolCallId ?? key}
                    part={toolPart}
                    extraBody={chatBody}
                  />
                );
              }
              return (
                <div
                  key={key}
                  className="my-2 p-3 rounded-lg border border-border bg-muted/50"
                >
                  <div className="text-sm font-medium">{toolPart.toolName}</div>
                  <div className="text-xs text-muted-foreground">
                    {toolPart.state}
                  </div>
                </div>
              );
            }
            return null;
          })}
        </MessageContent>
      </div>
    </Message>
  );
}

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
      const hasClaudeAuth =
        !!config.ANTHROPIC_API_KEY ||
        !!config.AWS_BEARER_TOKEN_BEDROCK ||
        !!config.ANTHROPIC_AUTH_TOKEN ||
        !!config.LITELLM_MASTER_KEY ||
        (config.CLAUDE_CODE_USE_BEDROCK === "1" &&
          !!config.ANTHROPIC_BEDROCK_BASE_URL);
      const runner = (config.RUNNER ?? DEFAULT_RUNNER).toLowerCase();
      const hasPiAuth = runner === "pi" && !!config.OPENAI_API_KEY;
      const hasApiKey = hasClaudeAuth || hasPiAuth;
      const allRequiredSet =
        REQUIRED_KEYS.every((key) => !!config[key]) && hasApiKey;
      setConfigReady(allRequiredSet);
    } catch {
      setConfigReady(false);
    }
  }, []);

  const { messages, status, error, isLoading, hasError, handleSubmit, stop } =
    useSandAgentChat({
      apiEndpoint: "/api/ai",
      body: { template: selectedTemplate, ...clientConfig },
    });

  // Handle template change and update URL
  const handleTemplateChange = (newTemplate: string) => {
    setSelectedTemplate(newTemplate);
    const params = new URLSearchParams(searchParams.toString());
    if (newTemplate === "default") {
      params.delete("template");
    } else {
      params.set("template", newTemplate);
    }
    const newUrl = params.toString()
      ? `/example?${params.toString()}`
      : "/example";
    router.replace(newUrl, { scroll: false });
  };

  return (
    <div className="h-screen w-full flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-foreground">
            SandAgent Chat
          </h1>
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
          <Link
            href="/docs"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border hover:bg-muted text-sm text-muted-foreground hover:text-foreground"
          >
            <BookOpen className="size-4" />
            Docs
          </Link>
          <Link
            href="/example/settings"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border hover:bg-muted text-sm text-muted-foreground hover:text-foreground"
          >
            <Settings className="size-4" />
            Settings
          </Link>
        </div>
      </header>

      {/* Chat area */}
      <Conversation className="flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              title="How can I help you today?"
              description="Select a template and start chatting."
              icon={<BotIcon className="size-8" />}
            />
          ) : (
            messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                messages={messages}
                chatBody={{ template: selectedTemplate, ...clientConfig }}
              />
            ))
          )}
          {isLoading && (
            <Message from="assistant">
              <MessageContent>
                <Loader size={20} />
              </MessageContent>
            </Message>
          )}
          {hasError && (
            <Message from="assistant">
              <div className="flex items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                  <AlertCircle className="size-4 text-destructive" />
                </div>
                <MessageContent>
                  <div className="text-destructive">
                    <p className="font-medium">Error</p>
                    <p className="text-sm opacity-80">{error?.message}</p>
                  </div>
                </MessageContent>
              </div>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Input area */}
      <div className="p-4 bg-background border-t border-border">
        <div className="mx-auto max-w-3xl">
          <PromptInput
            onSubmit={handleSubmit}
            className="border shadow-sm rounded-xl overflow-hidden"
          >
            <PromptInputTextarea placeholder="Type a message..." />
            <PromptInputFooter className="px-3 pb-2">
              <PromptInputTools />
              <PromptInputSubmit
                status={status}
                onClick={(e) => {
                  if (status === "streaming") {
                    e.preventDefault();
                    stop();
                  }
                }}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
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
