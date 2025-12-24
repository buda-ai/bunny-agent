"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useMemo } from "react";

export default function Home() {
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const [inputValue, setInputValue] = useState("");

  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/ai",
    body: { sessionId },
  }), [sessionId]);

  const { messages, sendMessage, status } = useChat({ transport });

  const isLoading = status === "streaming" || status === "submitted";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isLoading) {
      sendMessage({ role: "user", parts: [{ type: "text", text: inputValue }] });
      setInputValue("");
    }
  };

  return (
    <main>
      <h1>SandAgent Example</h1>
      <div className="chat-container">
        <div className="messages">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`message ${message.role}`}
            >
              {message.parts.map((part, i) => 
                part.type === "text" ? <span key={i}>{part.text}</span> : null
              )}
            </div>
          ))}
          {isLoading && (
            <div className="message assistant">Thinking...</div>
          )}
        </div>
        <form onSubmit={handleSubmit} className="input-form">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask the agent to do something..."
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading}>
            Send
          </button>
        </form>
      </div>
    </main>
  );
}
