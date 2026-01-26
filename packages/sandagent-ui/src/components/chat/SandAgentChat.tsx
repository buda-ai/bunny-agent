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
import { Message, MessageContent } from "kui/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "kui/ai-elements/prompt-input";
import { AlertCircle, BotIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import type { ArtifactData } from "../artifacts/ArtifactItem";
import { ArtifactPanel } from "../artifacts/ArtifactPanel";
import { ChatMessage } from "./ChatMessage";

/**
 * Props for SandAgentChat component
 */
export interface SandAgentChatProps {
  /** API endpoint for chat (default: /api/ai) */
  apiEndpoint?: string;
  /** Additional body params to pass to API on each request */
  body?: Record<string, unknown>;
  /** Session ID (auto-generated if not provided) */
  sessionId?: string;
  /** Show artifact panel (default: true) */
  showArtifactPanel?: boolean;
  /** Empty state title */
  emptyStateTitle?: string;
  /** Empty state description */
  emptyStateDescription?: string;
  /** Placeholder text for input */
  placeholder?: string;
  /** Custom header content */
  header?: React.ReactNode;
  /** Custom class name */
  className?: string;
}

/**
 * SandAgentChat - Ready-to-use chat interface component
 *
 * A pure UI component for chat with message display, tool rendering,
 * and artifact panel. Business logic (template selection, settings)
 * should be handled by the parent component.
 */
export function SandAgentChat({
  apiEndpoint = "/api/ai",
  body = {},
  sessionId: providedSessionId,
  showArtifactPanel = true,
  emptyStateTitle = "Welcome to SandAgent",
  emptyStateDescription = "Ask the agent to help you with coding tasks",
  placeholder = "Ask the agent to do something...",
  header,
  className,
}: SandAgentChatProps) {
  const [sessionId] = useState(
    () => providedSessionId || `session-${Date.now()}`,
  );
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactData | null>(
    null,
  );

  // Refs for accessing latest values in callbacks
  const bodyRef = useRef(body);
  const messagesRef = useRef<UIMessage[]>([]);

  useEffect(() => {
    bodyRef.current = body;
  }, [body]);

  const { messages, sendMessage, status, error, stop } = useChat({
    transport: new DefaultChatTransport({
      api: apiEndpoint,
      body: () => {
        const lastMessage = messagesRef.current[messagesRef.current.length - 1];
        const metadata = lastMessage?.metadata as
          | { sessionId?: string }
          | undefined;
        return {
          sessionId,
          resume: metadata?.sessionId,
          ...bodyRef.current,
        };
      },
    }),
  });

  // Keep messagesRef in sync
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Extract artifacts from messages
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

  // Sync selectedArtifact when artifacts change
  useEffect(() => {
    if (extractedArtifacts.length > 0) {
      setSelectedArtifact((prev) => {
        if (!prev) return extractedArtifacts[0];

        const currentMatch = extractedArtifacts.find(
          (a) => a.artifactId === prev.artifactId,
        );

        if (!currentMatch) {
          return extractedArtifacts[0];
        }

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

  const showArtifacts = showArtifactPanel && extractedArtifacts.length > 0;

  return (
    <div className={cn("flex h-full flex-col bg-background", className)}>
      {/* Optional header */}
      {header && (
        <header className="border-b border-border px-4 py-3">{header}</header>
      )}

      <div className="flex flex-1 overflow-hidden relative border-b border-border">
        {/* Chat area */}
        <Conversation className="flex-1">
          <ConversationContent>
            {messages.length === 0 ? (
              <ConversationEmptyState
                title={emptyStateTitle}
                description={emptyStateDescription}
                icon={<BotIcon className="size-8" />}
              />
            ) : (
              messages.map((message: UIMessage) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  sessionId={sessionId}
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
                    <AlertCircle className="size-4 text-destructive" />
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
        {showArtifacts && (
          <div className="w-[400px] border-l border-border flex flex-col bg-muted/30">
            {/* Artifact tabs */}
            <div className="flex items-center gap-1 p-2 border-b border-border overflow-x-auto bg-background/50">
              {extractedArtifacts.map((artifact) => {
                const fileName =
                  artifact.artifactId.split("/").pop() || artifact.artifactId;
                return (
                  <button
                    key={artifact.artifactId}
                    type="button"
                    onClick={() => setSelectedArtifact(artifact)}
                    className={cn(
                      "px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors",
                      selectedArtifact?.artifactId === artifact.artifactId
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted text-muted-foreground",
                    )}
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

      {/* Input area */}
      <div className="p-4">
        <PromptInput onSubmit={handleSubmit} className="mx-auto max-w-3xl">
          <PromptInputTextarea placeholder={placeholder} />
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
  );
}
