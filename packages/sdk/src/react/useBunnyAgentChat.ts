"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ArtifactData,
  UseBunnyAgentChatOptions,
  UseBunnyAgentChatReturn,
} from "./types";

/**
 * useBunnyAgentChat - Core hook for BunnyAgent chat functionality
 *
 * Provides all the logic needed for a chat interface:
 * - Message management
 * - Artifact extraction
 * - Session management
 *
 * @example
 * ```tsx
 * import { useBunnyAgentChat } from "@bunny-agent/sdk/react";
 *
 * const {
 *   messages,
 *   sendMessage,
 *   status,
 *   artifacts,
 *   selectedArtifact,
 *   setSelectedArtifact,
 * } = useBunnyAgentChat({
 *   apiEndpoint: "/api/ai",
 *   body: { template: "default" },
 * });
 * ```
 */
export function useBunnyAgentChat({
  apiEndpoint = "/api/ai",
  body = {},
}: UseBunnyAgentChatOptions = {}): UseBunnyAgentChatReturn {
  // Artifact selection state
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactData | null>(
    null,
  );

  // Refs for accessing latest values in callbacks
  const bodyRef = useRef(body);
  const messagesRef = useRef<UIMessage[]>([]);

  useEffect(() => {
    bodyRef.current = body;
  }, [body]);

  // Helper to extract resume value (sessionId) from message parts' providerMetadata.
  const getResumeFromMessage = (
    message: UIMessage | undefined,
  ): string | undefined => {
    if (!message?.parts) return undefined;
    for (const part of message.parts) {
      if (part.type === "text") {
        const providerMetadata = (
          part as {
            providerMetadata?: { "bunny-agent"?: { sessionId?: string } };
          }
        ).providerMetadata;
        if (providerMetadata?.["bunny-agent"]?.sessionId) {
          return providerMetadata["bunny-agent"].sessionId;
        }
      }
    }
    return undefined;
  };

  // Core chat hook
  const {
    messages,
    sendMessage: sendMessageInternal,
    status,
    error,
    stop,
  } = useChat({
    transport: new DefaultChatTransport({
      api: apiEndpoint,
      body: () => {
        const lastMessage = messagesRef.current[messagesRef.current.length - 1];
        const resume = getResumeFromMessage(lastMessage);
        return {
          resume,
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
  const artifacts = useMemo(() => {
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

    // Memoization optimization
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
    if (artifacts.length > 0) {
      setSelectedArtifact((prev) => {
        if (!prev) return artifacts[0];

        const currentMatch = artifacts.find(
          (a) => a.artifactId === prev.artifactId,
        );

        if (!currentMatch) {
          return artifacts[0];
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
  }, [artifacts]);

  const isLoading = status === "streaming" || status === "submitted";
  const hasError = status === "error" && !!error;

  // Send message helper
  const sendMessage = useCallback(
    (text: string) => {
      if (!isLoading && text.trim()) {
        sendMessageInternal({
          role: "user",
          parts: [{ type: "text", text: text.trim() }],
        });
      }
    },
    [isLoading, sendMessageInternal],
  );

  // Handle submit for PromptInput compatibility
  const handleSubmit = useCallback(
    (message: { text: string; files?: import("ai").FileUIPart[] }) => {
      if (!isLoading) {
        const parts: import("ai").UIMessage["parts"] = [];
        if (message.text) {
          parts.push({ type: "text", text: message.text.trim() });
        }
        if (message.files && message.files.length > 0) {
          for (const file of message.files) {
            parts.push(file);
          }
        }
        if (parts.length > 0) {
          sendMessageInternal({
            role: "user",
            parts,
          });
        } else {
          sendMessageInternal();
        }
      }
    },
    [isLoading, sendMessageInternal],
  );

  return {
    messages,
    status,
    error,
    isLoading,
    hasError,
    artifacts,
    selectedArtifact,
    setSelectedArtifact,
    sendMessage,
    stop,
    handleSubmit,
  };
}
