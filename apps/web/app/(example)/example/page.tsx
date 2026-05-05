"use client";

import { useBunnyAgentChat } from "@bunny-agent/sdk/react";
import type { DynamicToolUIPart, ToolUIPart, UIMessage } from "ai";
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
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
} from "kui/ai-elements/prompt-input";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "kui/ai-elements/tool";
import {
  AlertCircle,
  BookOpen,
  BotIcon,
  CheckCircle,
  PlusIcon,
  Settings,
  UserIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AskUserQuestionUI } from "./claude-tools/AskUserQuestionUI";
import { STORAGE_KEY } from "./settings/page";

const REQUIRED_KEYS = ["E2B_API_KEY"];

/** Matches /api/ai: in development the server defaults to local daemon unless opted out. */
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
  chatBody,
}: {
  message: UIMessage;
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
            if (part.type === "file") {
              const filePart = part as import("ai").FileUIPart;
              if (filePart.mediaType?.startsWith("image/")) {
                return (
                  // biome-ignore lint/performance/noImgElement: User attachments may be blob or data URLs that Next Image cannot optimize reliably.
                  <img
                    key={key}
                    src={filePart.url}
                    alt="User attachment"
                    className="max-w-xs rounded-lg"
                  />
                );
              }
              return (
                <div key={key} className="text-xs text-muted-foreground">
                  📎 {filePart.filename || "Attachment"}
                </div>
              );
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
                <Tool key={key}>
                  <ToolHeader
                    title={toolPart.toolName}
                    type={"tool-call" as ToolUIPart["type"]}
                    state={toolPart.state as ToolUIPart["state"]}
                  />
                  <ToolContent>
                    <ToolInput input={toolPart.input} />
                    <ToolOutput
                      output={toolPart.output}
                      errorText={toolPart.errorText}
                    />
                  </ToolContent>
                </Tool>
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
  const [clientConfig] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    const allRequiredSet = REQUIRED_KEYS.every((key) => !!clientConfig[key]);
    setConfigReady(allRequiredSet);
  }, [clientConfig]);

  const { messages, status, error, isLoading, hasError, handleSubmit, stop } =
    useBunnyAgentChat({
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
            BunnyAgent Chat
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
            accept="image/*"
            multiple
            maxFiles={5}
            maxFileSize={10 * 1024 * 1024}
            className="border shadow-sm rounded-xl overflow-hidden"
          >
            <PromptInputAttachments>
              {(file) => <PromptInputAttachment key={file.id} data={file} />}
            </PromptInputAttachments>
            <PromptInputTextarea placeholder="Type a message..." />
            <PromptInputFooter className="px-3 pb-2">
              <div className="flex items-center gap-1">
                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger>
                    <PlusIcon className="size-4" />
                  </PromptInputActionMenuTrigger>
                  <PromptInputActionMenuContent>
                    <PromptInputActionAddAttachments label="Upload image" />
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu>
                <PromptInputTools />
              </div>
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
