"use client";

import type { DynamicToolUIPart, UIMessage } from "ai";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "kui/ai-elements/message";
import { BotIcon, UserIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import type { ArtifactData } from "../artifacts/ArtifactItem";
import { ArtifactItem } from "../artifacts/ArtifactItem";
import { DynamicToolUI } from "../tools/DynamicToolUI";

/**
 * Props for ChatMessage component
 */
export interface ChatMessageProps {
  /** The UI message to render */
  message: UIMessage;
  /** Session ID for tool interactions */
  sessionId: string;
  /** Additional config to pass to tools */
  config?: Record<string, string>;
  /** Callback when an artifact is selected */
  onSelectArtifact?: (artifact: ArtifactData) => void;
  /** Custom avatar for user messages */
  userAvatar?: React.ReactNode;
  /** Custom avatar for assistant messages */
  assistantAvatar?: React.ReactNode;
  /** Custom tool renderers */
  customToolRenderers?: Record<
    string,
    (props: {
      part: DynamicToolUIPart;
      sessionId: string;
      config?: Record<string, string>;
    }) => React.ReactNode
  >;
  /** Custom class name */
  className?: string;
}

/**
 * ChatMessage - Renders a single chat message with support for
 * text, tools, and artifacts.
 */
export function ChatMessage({
  message,
  sessionId,
  config,
  onSelectArtifact,
  userAvatar,
  assistantAvatar,
  customToolRenderers,
  className,
}: ChatMessageProps) {
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
    <Message from={message.role} className={className}>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            isUser ? "bg-primary text-primary-foreground" : "bg-muted",
          )}
        >
          {isUser
            ? userAvatar || <UserIcon className="size-4" />
            : assistantAvatar || <BotIcon className="size-4" />}
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
                  customRenderers={customToolRenderers}
                />
              );
            }
            return null;
          })}
          {/* Compact Artifacts List in Chat Bubble */}
          {artifacts.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {artifacts.map((artifact) => (
                <ArtifactItem
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
