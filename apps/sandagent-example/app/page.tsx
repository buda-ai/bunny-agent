"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  type DynamicToolUIPart,
  type UIDataTypes,
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
  Code,
  Copy,
  Download,
  Eye,
  FileCode,
  FileText,
  Maximize2,
  Minimize2,
  RefreshCw,
  Settings,
  UserIcon,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AskUserQuestionUI } from "./claude-tools/AskUserQuestionUI";
import { STORAGE_KEY } from "./settings/page";

const REQUIRED_KEYS = ["E2B_API_KEY"];

// Artifact data type
interface ArtifactData {
  artifactId: string;
  content: string;
  mimeType: string;
}

export default function Home() {
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const [configReady, setConfigReady] = useState<boolean | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedTemplate, setSelectedTemplate] = useState(() => {
    // Initialize from URL or default to "default"
    return searchParams.get("template") || "default";
  });
  const [clientConfig, setClientConfig] = useState<Record<string, string>>({});
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactData | null>(
    null,
  );

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
    {
      id: "web-game-expert",
      name: "Web Game Expert",
      description: "3D web games & interactive experiences",
    },
  ];

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

  // Extract artifacts from messages using useMemo to avoid unnecessary state updates
  // Use a ref to cache previous result and only update if content actually changed
  const prevArtifactsRef = useRef<ArtifactData[]>([]);
  const extractedArtifacts = useMemo(() => {
    const results: ArtifactData[] = [];
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type === "data-artifact") {
          const data = part.data as ArtifactData;
          if (!results.some((a) => a.artifactId === data.artifactId)) {
            results.push(data);
          }
        }
      }
    }

    // Compare with previous result - if content is identical, return previous reference
    const prev = prevArtifactsRef.current;
    if (
      prev.length === results.length &&
      prev.every((prevArt, idx) => {
        const currArt = results[idx];
        return (
          prevArt.artifactId === currArt.artifactId &&
          prevArt.content === currArt.content &&
          prevArt.mimeType === currArt.mimeType
        );
      })
    ) {
      return prev;
    }

    prevArtifactsRef.current = results;
    return results;
  }, [messages]);

  // Sync selectedArtifact when artifacts change, but only if needed
  useEffect(() => {
    if (extractedArtifacts.length > 0) {
      setSelectedArtifact((prev) => {
        if (!prev) return extractedArtifacts[0];

        // Find the matching artifact in the new list
        const currentMatch = extractedArtifacts.find(
          (a) => a.artifactId === prev.artifactId,
        );

        if (!currentMatch) {
          // If previous selection is gone, select first one
          return extractedArtifacts[0];
        }

        // IMPORTANT: If content is identical, keep the PREVIOUS reference
        // to avoid triggering dependent effects/re-renders
        if (
          currentMatch.content === prev.content &&
          currentMatch.mimeType === prev.mimeType
        ) {
          return prev;
        }

        return currentMatch;
      });
    } else {
      setSelectedArtifact((prev) => (prev === null ? prev : null));
    }
  }, [extractedArtifacts]);

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
      </header>

      <div className="flex flex-1 overflow-hidden relative border-b border-border">
        {/* Chat area */}
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
                  onSelectArtifact={setSelectedArtifact}
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

        {/* Artifact panel - right side */}
        {extractedArtifacts.length > 0 && (
          <div className="w-100 border-l border-border flex flex-col bg-muted/30">
            {/* Artifact tabs */}
            <div className="flex items-center gap-1 p-2 border-b border-border overflow-x-auto bg-background/50">
              {extractedArtifacts.map((artifact) => {
                const fileName =
                  artifact.artifactId.split("/").pop() || artifact.artifactId;
                return (
                  <button
                    key={artifact.artifactId}
                    onClick={() => setSelectedArtifact(artifact)}
                    className={`px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors ${
                      selectedArtifact?.artifactId === artifact.artifactId
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    {fileName}
                  </button>
                );
              })}
            </div>
            {/* Selected artifact content */}
            {selectedArtifact && (
              <div className="flex-1 overflow-auto">
                <ArtifactPanel artifact={selectedArtifact} />
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        {/* Input area */}
        <div className="p-4">
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
      </div>
    </main>
  );
}

function ChatMessage({
  message,
  sessionId,
  config,
  onSelectArtifact,
}: {
  message: UIMessage;
  sessionId: string;
  config: Record<string, string>;
  onSelectArtifact?: (artifact: ArtifactData) => void;
}) {
  const isUser = message.role === "user";

  // Collect all artifacts from message parts
  const artifacts: ArtifactData[] = [];
  const otherParts: Array<{ part: UIMessage["parts"][number]; index: number }> =
    [];

  message.parts.forEach((part, i) => {
    if (part.type === "data-artifact") {
      const data = part.data as ArtifactData;
      artifacts.push(data);
    } else {
      otherParts.push({ part, index: i });
    }
  });

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
          {/* Render non-artifact parts */}
          {otherParts.map(({ part, index }) => {
            if (part.type === "text") {
              return <MessageResponse key={index}>{part.text}</MessageResponse>;
            }
            if (part.type === "dynamic-tool") {
              return (
                <DynamicToolUI
                  key={index}
                  part={part}
                  sessionId={sessionId}
                  config={config}
                />
              );
            }
            return null;
          })}
          {/* Compact Artifacts List in Chat Bubble */}
          {artifacts.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {artifacts.map((artifact) => (
                <CompactArtifactItem
                  key={artifact.artifactId}
                  artifact={artifact}
                  onSelect={onSelectArtifact}
                />
              ))}
            </div>
          )}
        </MessageContent>
      </div>
    </Message>
  );
}

/**
 * Get file extension from MIME type
 */
function getFileExtensionFromMimeType(mimeType: string): string {
  if (mimeType.includes("html")) return "html";
  if (mimeType.includes("javascript")) return "js";
  if (mimeType.includes("typescript")) return "ts";
  if (mimeType.includes("json")) return "json";
  if (mimeType.includes("markdown")) return "md";
  if (mimeType.includes("css")) return "css";
  if (mimeType.includes("python")) return "py";
  if (mimeType.includes("java")) return "java";
  if (mimeType.includes("xml")) return "xml";
  if (mimeType.includes("yaml")) return "yaml";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("svg")) return "svg";
  if (mimeType.includes("pdf")) return "pdf";
  return "txt"; // default fallback
}

/**
 * CompactArtifactItem - A small and beautiful artifact list item for chat bubbles
 */
function CompactArtifactItem({
  artifact,
  onSelect,
}: {
  artifact: ArtifactData;
  onSelect?: (artifact: ArtifactData) => void;
}) {
  const [copied, setCopied] = useState(false);
  const fileName = artifact.artifactId.split("/").pop() || artifact.artifactId;
  const isMarkdown = artifact.mimeType.includes("markdown");

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const blob = new Blob([artifact.content], { type: artifact.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const extension = getFileExtensionFromMimeType(artifact.mimeType);
    a.download = `${fileName}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClick = () => {
    if (onSelect) {
      onSelect(artifact);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      className="group flex items-center justify-between p-2 rounded-lg border border-border bg-background/50 hover:bg-accent/50 transition-colors cursor-pointer max-w-2xl"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex size-7 items-center justify-center rounded bg-blue-500/10 shrink-0">
          <FileCode className="size-3.5 text-blue-500" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium text-foreground truncate">
            {fileName}
          </span>
          <span className="text-[10px] text-muted-foreground truncate">
            {artifact.mimeType}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleCopy}
          className="p-1 rounded hover:bg-muted transition-colors"
          title="复制"
        >
          {copied ? (
            <CheckCircle className="size-3 text-green-600" />
          ) : (
            <Copy className="size-3 text-muted-foreground" />
          )}
        </button>
        <button
          onClick={handleDownload}
          className="p-1 rounded hover:bg-muted transition-colors"
          title="下载"
        >
          <Download className="size-3 text-muted-foreground" />
        </button>
        <div className="p-1">
          <ChevronRight className="size-3 text-muted-foreground" />
        </div>
      </div>
    </div>
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
const WriteToolCard = memo(
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

    const handleDownload = (e: React.MouseEvent) => {
      e.stopPropagation();
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

    const handleCopy = async (e: React.MouseEvent) => {
      e.stopPropagation();
      await navigator.clipboard.writeText(content);
    };

    return (
      <div className="my-2 rounded-lg border border-border bg-muted/50 overflow-hidden">
        {/* Header - always visible */}
        <div
          className="flex items-center justify-between p-3 hover:bg-muted/80 transition-colors cursor-pointer"
          onClick={() => setIsOpen(!isOpen)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setIsOpen(!isOpen);
            }
          }}
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
          <ChevronRight
            className={`size-4 text-muted-foreground transition-transform ${
              isOpen ? "rotate-90" : ""
            }`}
          />
        </div>

        {/* Expandable Content */}
        {isOpen && (
          <div className="border-t border-border">
            {/* Content Header with Actions */}
            <div className="flex items-center justify-between p-3 bg-muted/30 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {isMarkdown ? "Markdown 预览" : "文件内容"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownload}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors"
                  title="下载文件"
                >
                  <Download className="size-4 text-muted-foreground" />
                </button>
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors"
                  title="复制内容"
                >
                  <Copy className="size-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-4">
              {isMarkdown ? (
                <div
                  className="rounded-md border border-border bg-background p-4 prose prose-sm dark:prose-invert max-w-none scrollable-content overflow-y-auto"
                  style={{ maxHeight: "400px" }}
                >
                  <MessageResponse>{content}</MessageResponse>
                </div>
              ) : (
                <div
                  className="rounded-md border border-border bg-[#0d0d0d] scrollable-content overflow-auto"
                  style={{ height: "400px", minHeight: "200px" }}
                >
                  <pre className="p-3 text-xs text-[#e6e6e6] font-mono whitespace-pre m-0 block">
                    {content}
                  </pre>
                </div>
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
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Return true if props are equal (skip re-render), false if different (re-render)
    return (
      prevProps.filePath === nextProps.filePath &&
      prevProps.content === nextProps.content &&
      prevProps.state === nextProps.state &&
      prevProps.output === nextProps.output &&
      prevProps.errorText === nextProps.errorText
    );
  },
);

/**
 * ArtifactPanel - Full artifact content in right panel
 */
function ArtifactPanel({ artifact }: { artifact: ArtifactData }) {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [previewScale, setPreviewScale] = useState(0.5);
  const previewWrapperRef = useRef<HTMLDivElement>(null);

  // Handle iframe scaling to fit container
  useEffect(() => {
    const wrapper = previewWrapperRef.current;
    if (!wrapper) return;

    const updateScale = () => {
      const wrapperWidth = wrapper.clientWidth;
      const wrapperHeight = wrapper.clientHeight;
      // Calculate scale to fit 800x600 content in available space with some padding
      const scaleX = (wrapperWidth - 32) / 800; // 32px for padding
      const scaleY = (wrapperHeight - 32) / 600;
      const scale = Math.min(scaleX, scaleY, 1);
      setPreviewScale(Math.max(scale, 0.2)); // Minimum scale of 0.2
    };

    updateScale();
    const resizeObserver = new ResizeObserver(updateScale);
    resizeObserver.observe(wrapper);

    return () => {
      resizeObserver.disconnect();
    };
  });

  const handleCopy = async () => {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([artifact.content], { type: artifact.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const extension = getFileExtensionFromMimeType(artifact.mimeType);
    a.download = `${artifact.artifactId}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRefresh = () => {
    setIframeKey((prev) => prev + 1);
  };

  const handleFullscreen = () => {
    setIsFullscreen(true);
  };

  const handleCloseFullscreen = () => {
    setIsFullscreen(false);
  };

  // ESC key to close fullscreen
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isFullscreen]);

  const isHtml = artifact.mimeType.includes("html");
  const isMarkdown = artifact.mimeType.includes("markdown");

  return (
    <>
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2 min-w-0">
            <FileCode className="size-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium truncate">
              {artifact.artifactId}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* View mode toggle for HTML files */}
            {isHtml && (
              <>
                <button
                  onClick={() => setViewMode("preview")}
                  className={`p-1.5 rounded transition-colors ${
                    viewMode === "preview"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                  title="预览"
                >
                  <Eye className="size-4" />
                </button>
                <button
                  onClick={() => setViewMode("code")}
                  className={`p-1.5 rounded transition-colors ${
                    viewMode === "code"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                  title="代码"
                >
                  <Code className="size-4" />
                </button>
                {viewMode === "preview" && (
                  <>
                    <button
                      onClick={handleRefresh}
                      className="p-1.5 hover:bg-muted rounded transition-colors"
                      title="刷新"
                    >
                      <RefreshCw className="size-4 text-muted-foreground" />
                    </button>
                    <button
                      onClick={handleFullscreen}
                      className="p-1.5 hover:bg-muted rounded transition-colors"
                      title="全屏游玩"
                    >
                      <Maximize2 className="size-4 text-muted-foreground" />
                    </button>
                  </>
                )}
                <div className="w-px h-4 bg-border" />
              </>
            )}
            <button
              onClick={handleCopy}
              className="p-1.5 hover:bg-muted rounded transition-colors"
              title="复制"
            >
              {copied ? (
                <CheckCircle className="size-4 text-green-600" />
              ) : (
                <Copy className="size-4 text-muted-foreground" />
              )}
            </button>
            <button
              onClick={handleDownload}
              className="p-1.5 hover:bg-muted rounded transition-colors"
              title="下载"
            >
              <Download className="size-4 text-muted-foreground" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col">
          {isHtml && viewMode === "preview" ? (
            <>
              {/* Iframe preview - scaled to fit container */}
              <div
                ref={previewWrapperRef}
                className="flex-1 overflow-hidden flex items-center justify-center p-4"
              >
                <div
                  className="relative bg-white rounded-lg border border-border shadow-sm overflow-hidden"
                  style={{
                    width: `${800 * previewScale}px`,
                    height: `${600 * previewScale}px`,
                  }}
                >
                  <iframe
                    key={iframeKey}
                    srcDoc={artifact.content}
                    className="absolute top-0 left-0 origin-top-left"
                    style={{
                      width: "800px",
                      height: "600px",
                      transform: `scale(${previewScale})`,
                    }}
                    title={artifact.artifactId}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
                  />
                </div>
              </div>
              {/* Fullscreen button at bottom */}
              <div className="p-3 text-center border-t border-border bg-muted/30">
                <button
                  onClick={handleFullscreen}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2 px-4 py-2 rounded-md hover:bg-muted"
                >
                  <Maximize2 className="size-4" />
                  点击展开全屏游玩
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-auto p-4">
              {isMarkdown ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-sm">
                    {artifact.content}
                  </pre>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-sm">
                  {artifact.content}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Modal */}
      {isFullscreen && isHtml && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 bg-black/50 border-b border-white/10">
            <div className="flex items-center gap-3">
              <FileCode className="size-5 text-white" />
              <span className="text-white font-medium">
                {artifact.artifactId}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                className="p-2 hover:bg-white/10 rounded transition-colors"
                title="刷新"
              >
                <RefreshCw className="size-5 text-white" />
              </button>
              <button
                onClick={handleCloseFullscreen}
                className="p-2 hover:bg-white/10 rounded transition-colors"
                title="退出全屏 (ESC)"
              >
                <X className="size-5 text-white" />
              </button>
            </div>
          </div>

          {/* Iframe container */}
          <div className="flex-1 p-4 overflow-hidden">
            <iframe
              key={iframeKey}
              srcDoc={artifact.content}
              className="w-full h-full bg-white rounded-lg"
              title={artifact.artifactId}
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
            />
          </div>

          {/* Footer hint */}
          <div className="p-3 text-center text-sm text-white/60 bg-black/50 border-t border-white/10">
            按 ESC 键退出全屏
          </div>
        </div>
      )}
    </>
  );
}
