"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  type DynamicToolUIPart,
  type UIMessage,
} from "ai";
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
import { TodoView, isTodoWriteInput } from "kui/ai-elements/todo";
import { AlertCircleIcon } from "lucide-react";
import {
  AlertCircle,
  BotIcon,
  CheckCircle,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Settings,
  UserIcon,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AskUserQuestionUI } from "./claude-tools/AskUserQuestionUI";
import { STORAGE_KEY } from "./settings/page";

const REQUIRED_KEYS = ["E2B_API_KEY"];

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
      // Either ANTHROPIC_API_KEY or AWS_BEARER_TOKEN_BEDROCK is required
      const hasApiKey =
        !!config.ANTHROPIC_API_KEY || !!config.AWS_BEARER_TOKEN_BEDROCK;
      const allRequiredSet =
        REQUIRED_KEYS.every((key) => !!config[key]) && hasApiKey;
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
    {
      id: "gaia-agent",
      name: "GAIA Agent",
      description: "GAIA Benchmark Super Agent",
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

  const { messages, sendMessage, status, error, stop } = useChat({
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
    if (!isLoading) {
      if (message.text) {
        sendMessage({
          role: "user",
          parts: [{ type: "text", text: message.text.trim() }],
        });
      } else {
        sendMessage();
      }
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
              <ChatMessage
                key={message.id}
                message={message}
                sessionId={sessionId}
                config={{ ...clientConfig, template: selectedTemplate }}
              />
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
    </main>
  );
}

function ChatMessage({
  message,
  sessionId,
  config,
}: {
  message: UIMessage;
  sessionId: string;
  config: Record<string, string>;
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
          {message.parts.map((part, i) => {
            if (part.type === "text") {
              return <MessageResponse key={i}>{part.text}</MessageResponse>;
            }
            if (part.type === "dynamic-tool") {
              return (
                <DynamicToolUI
                  key={i}
                  part={part}
                  sessionId={sessionId}
                  config={config}
                />
              );
            }
            return null;
          })}
        </MessageContent>
      </div>
    </Message>
  );
}

function DynamicToolUI({
  part,
  sessionId,
  config,
}: {
  part: DynamicToolUIPart;
  sessionId: string;
  config: Record<string, string>;
}) {
  const toolName = part.toolName;
  const state = part.state;
  const input = part.input as Record<string, unknown> | undefined;
  const output = part.output as string | Record<string, unknown> | undefined;
  const errorText = part.errorText;

  // Handle TodoWrite tool specially
  if (toolName === "TodoWrite" && input && isTodoWriteInput(input)) {
    return (
      <TodoView
        todos={input.todos}
        title="任务列表"
        isStreaming={state === "input-streaming"}
      />
    );
  }

  // Handle AskUserQuestion tool specially
  if (toolName === "AskUserQuestion" && part.state !== "input-streaming") {
    return (
      <AskUserQuestionUI part={part} sessionId={sessionId} config={config} />
    );
  }

  // Handle Write tool specially - expandable markdown preview
  if (toolName === "Write" && input) {
    return (
      <WriteToolCard
        filePath={input.file_path as string}
        content={input.content as string}
        state={state}
        output={output}
        errorText={errorText}
      />
    );
  }

  // Generic tool display
  return (
    <div className="my-2 rounded-lg border border-border bg-muted/50 p-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium text-foreground">{toolName}</span>
        <span
          className={`text-xs ${
            state === "output-error"
              ? "text-destructive"
              : state === "output-available"
                ? "text-green-500"
                : "text-muted-foreground"
          }`}
        >
          {state === "input-streaming" && "输入中..."}
          {state === "input-available" && "准备执行..."}
          {state === "output-available" && "✓ 完成"}
          {state === "output-error" && "✗ 错误"}
        </span>
      </div>
      {input && (
        <pre className="mt-2 overflow-auto text-xs text-muted-foreground">
          {JSON.stringify(input, null, 2)}
        </pre>
      )}
      {errorText && (
        <div className="mt-2 text-sm text-destructive">{String(errorText)}</div>
      )}
      {output && (
        <div className="mt-2 border-t border-border pt-2">
          <pre className="overflow-auto text-xs text-muted-foreground">
            {typeof output === "string"
              ? output
              : JSON.stringify(output, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// Write tool card with expandable markdown preview
function WriteToolCard({
  filePath,
  content,
  state,
  output,
  errorText,
}: {
  filePath: string;
  content: string;
  state: string;
  output?: string | Record<string, unknown>;
  errorText?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isMarkdown = filePath?.endsWith(".md");
  const fileName = filePath?.split("/").pop() || filePath;

  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
  };

  return (
    <div className="my-2 rounded-lg border border-border bg-muted/50 overflow-hidden">
      {/* Header - always visible */}
      <div
        className="flex items-center justify-between p-3 hover:bg-muted/80 transition-colors cursor-pointer"
        onClick={() => setIsOpen(true)}
        onKeyDown={(e) => e.key === "Enter" && setIsOpen(true)}
        role="button"
        tabIndex={0}
      >
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-md bg-blue-500/10">
            <FileText className="size-4 text-blue-500" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground text-sm">
                写入文件
              </span>
              <span
                className={`text-xs ${
                  state === "output-error"
                    ? "text-destructive"
                    : state === "output-available"
                      ? "text-green-500"
                      : "text-muted-foreground"
                }`}
              >
                {state === "input-streaming" && "输入中..."}
                {state === "input-available" && "准备执行..."}
                {state === "output-available" && "✓ 完成"}
                {state === "output-error" && "✗ 错误"}
              </span>
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              {filePath}
            </div>
          </div>
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </div>

      {/* Side Panel Overlay */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsOpen(false)}
            onKeyDown={(e) => e.key === "Escape" && setIsOpen(false)}
            role="button"
            tabIndex={-1}
            aria-label="Close panel"
          />
          {/* Side Panel */}
          <div className="fixed top-0 right-0 h-full w-[600px] max-w-[90vw] bg-background border-l border-border shadow-xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
            {/* Panel Header */}
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-md bg-blue-500/10">
                  <FileText className="size-4 text-blue-500" />
                </div>
                <div>
                  <div className="font-medium text-foreground text-sm">
                    {fileName}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {filePath}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownload}
                  className="p-2 rounded-md hover:bg-muted transition-colors"
                  title="下载文件"
                >
                  <Download className="size-4 text-muted-foreground" />
                </button>
                <button
                  onClick={handleCopy}
                  className="p-2 rounded-md hover:bg-muted transition-colors"
                  title="复制内容"
                >
                  <Copy className="size-4 text-muted-foreground" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-md hover:bg-muted transition-colors"
                  title="收起"
                >
                  <X className="size-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Panel Content */}
            <div className="flex-1 overflow-auto p-4">
              <div className="mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {isMarkdown ? "Markdown 预览" : "文件内容"}
                </span>
              </div>
              {isMarkdown ? (
                <div className="rounded-md border border-border bg-background p-4 prose prose-sm dark:prose-invert max-w-none">
                  <MessageResponse>{content}</MessageResponse>
                </div>
              ) : (
                <pre className="rounded-md border border-border bg-background p-3 overflow-auto text-xs text-foreground font-mono">
                  {content}
                </pre>
              )}

              {/* Error display */}
              {errorText && (
                <div className="mt-4">
                  <div className="text-sm text-destructive bg-destructive/10 rounded-md p-2">
                    {String(errorText)}
                  </div>
                </div>
              )}

              {/* Output display */}
              {output && (
                <div className="mt-4">
                  <div className="text-xs text-green-600 dark:text-green-400 bg-green-500/10 rounded-md p-2">
                    {typeof output === "string"
                      ? output
                      : JSON.stringify(output, null, 2)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
