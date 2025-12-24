"use client";

import { useChat } from "ai/react";
import { useState } from "react";

export default function Home() {
  const [sessionId] = useState(() => `session-${Date.now()}`);

  const { messages, input, handleInputChange, handleSubmit, isLoading } =
    useChat({
      api: "/api/ai",
      body: {
        sessionId,
      },
    });

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
              {message.content}
            </div>
          ))}
          {isLoading && (
            <div className="message assistant">Thinking...</div>
          )}
        </div>
        <form onSubmit={handleSubmit} className="input-form">
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
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
