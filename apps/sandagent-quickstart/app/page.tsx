"use client";

import { useSandAgentChat } from "@sandagent/sdk/react";
import type { UIMessage, DynamicToolUIPart } from "ai";
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
import { AlertCircle, BotIcon, UserIcon } from "lucide-react";
import { Suspense } from "react";

/**
 * ChatMessage - Renders a single chat message
 */
function ChatMessage({
  message,
}: {
  message: UIMessage;
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
            if (part.type === "text") {
              return <MessageResponse key={index}>{part.text}</MessageResponse>;
            }
            if (part.type === "dynamic-tool") {
              // Simple tool display
              const toolPart = part as DynamicToolUIPart;
              return (
                <div key={index} className="my-2 p-3 rounded-lg border border-border bg-muted/50">
                  <div className="text-sm font-medium">{toolPart.toolName}</div>
                  <div className="text-xs text-muted-foreground">{toolPart.state}</div>
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
  const {
    messages,
    status,
    error,
    isLoading,
    hasError,
    handleSubmit,
    stop,
  } = useSandAgentChat({
    apiEndpoint: "/api/ai",
    body: { template: "default" },
  });

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50/30">
      <div className="w-full max-w-4xl h-[90vh] bg-background shadow-xl rounded-2xl border border-border flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div className="flex-1">
            <h1 className="text-sm font-semibold tracking-tight">SandAgent</h1>
            <p className="text-[10px] text-muted-foreground uppercase font-medium tracking-wider">
              Local Sandbox
            </p>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/10 text-green-600 border border-green-200">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
            <span className="text-[10px] font-bold">LIVE</span>
          </div>
        </header>

        {/* Main content area */}
        <Conversation className="flex-1">
          <ConversationContent>
            {messages.length === 0 ? (
              <ConversationEmptyState
                title="How can I help you today?"
                description="Your local AI agent is ready to help with coding and more."
                icon={<BotIcon className="size-8" />}
              />
            ) : (
              messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
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
