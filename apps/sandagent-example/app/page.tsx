"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "kui/ai-elements/conversation";
import { Loader } from "kui/ai-elements/loader";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "kui/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "kui/ai-elements/prompt-input";
import { AlertCircleIcon } from "lucide-react";
import {
  AlertCircle,
  BotIcon,
  CheckCircle,
  Settings,
  UserIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { STORAGE_KEY } from "./settings/page";

const REQUIRED_KEYS = ["ANTHROPIC_API_KEY", "E2B_API_KEY"];

export default function Home() {
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const [configReady, setConfigReady] = useState<boolean | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState("default");
  const [clientConfig, setClientConfig] = useState<Record<string, string>>({});

  // Check configuration status from localStorage on mount and when config changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const config = saved ? JSON.parse(saved) : {};
      setClientConfig(config);
      const allRequiredSet = REQUIRED_KEYS.every((key) => !!config[key]);
      setConfigReady(allRequiredSet);
    } catch {
      setConfigReady(false);
    }
  }, []);

  const templates = [
    {
      id: "default",
      name: "Default",
      description: "General-purpose assistant",
    },
    { id: "coder", name: "Coder", description: "Software development" },
    { id: "analyst", name: "Analyst", description: "Data analysis" },
    { id: "researcher", name: "Researcher", description: "Web research" },
    {
      id: "seo-agent",
      name: "SEO",
      description: "SEO Optimization",
    },
  ];
  // Use a ref to always get the latest clientConfig
  const clientConfigRef = useRef(clientConfig);
  useEffect(() => {
    clientConfigRef.current = clientConfig;
  }, [clientConfig]);

  // Use a ref to always get the latest selectedTemplate
  const selectedTemplateRef = useRef(selectedTemplate);
  useEffect(() => {
    selectedTemplateRef.current = selectedTemplate;
  }, [selectedTemplate]);

  // Use a ref to track messages for accessing in body callback
  const messagesRef = useRef<UIMessage[]>([]);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/ai",
      body: () => {
        const lastMessage = messagesRef.current[messagesRef.current.length - 1];
        const metadata = lastMessage?.metadata as
          | { sessionId?: string }
          | undefined;
        return {
          sessionId,
          resume: metadata?.sessionId,
          template: selectedTemplateRef.current,
          ...(clientConfigRef.current || {}),
        };
      },
    }),
  });

  // Keep messagesRef in sync with messages
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const isLoading = status === "streaming" || status === "submitted";
  const hasError = status === "error" && error;

  const handleSubmit = async (message: { text: string }) => {
    if (message.text.trim() && !isLoading) {
      sendMessage({
        role: "user",
        parts: [{ type: "text", text: message.text }],
      });
    }
  };

  return (
    <main className="flex h-screen flex-col bg-background">
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-foreground">
              SandAgent Chat
            </h1>

            {/* Template Selector */}
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
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
      </header>

      <Conversation className="flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              title="Welcome to SandAgent"
              description="Ask the agent to help you with coding tasks"
              icon={<BotIcon className="size-8" />}
            />
          ) : (
            messages.map((message: UIMessage) => (
              <ChatMessage key={message.id} message={message} />
            ))
          )}
          {isLoading && messages[messages.length - 1]?.role === "user" && (
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
                  <AlertCircleIcon className="size-4 text-destructive" />
                </div>
                <MessageContent>
                  <div className="text-destructive">
                    <p className="font-medium">Error</p>
                    <p className="text-sm opacity-80">{error.message}</p>
                  </div>
                </MessageContent>
              </div>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t border-border p-4">
        <PromptInput onSubmit={handleSubmit} className="mx-auto max-w-3xl">
          <PromptInputTextarea placeholder="Ask the agent to do something..." />
          <PromptInputFooter>
            <PromptInputTools />
            <PromptInputSubmit status={status} disabled={isLoading} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </main>
  );
}

function ChatMessage({ message }: { message: UIMessage }) {
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
          {message.parts.map((part, i) =>
            part.type === "text" ? (
              <MessageResponse key={i}>{part.text}</MessageResponse>
            ) : null,
          )}
        </MessageContent>
      </div>
    </Message>
  );
}
