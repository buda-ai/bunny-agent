"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useState, useMemo } from "react";
import { BotIcon, UserIcon, AlertCircleIcon } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "kui/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "kui/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
} from "kui/ai-elements/prompt-input";
import { Loader } from "kui/ai-elements/loader";

export default function Home() {
  const [sessionId] = useState(() => `session-${Date.now()}`);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai",
        body: { sessionId },
      }),
    [sessionId]
  );

  const { messages, sendMessage, status, error } = useChat({ transport });

  const isLoading = status === "streaming" || status === "submitted";
  const hasError = status === "error" && error;

  const handleSubmit = (message: { text: string }) => {
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
        <h1 className="text-lg font-semibold text-foreground">SandAgent Chat</h1>
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
            ) : null
          )}
        </MessageContent>
      </div>
    </Message>
  );
}
