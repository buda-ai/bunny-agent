"use client";

import { useSandAgentChat } from "@sandagent/sdk/react";
import { useState } from "react";

export default function Home() {
  const [input, setInput] = useState("");
  const {
    messages,
    isLoading,
    error,
    sendMessage,
    stop,
    artifacts,
    selectedArtifact,
    setSelectedArtifact,
  } = useSandAgentChat({
    apiEndpoint: "/api/ai",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput("");
  };

  return (
    <div className="h-screen flex bg-gray-50">
      {/* 左侧：聊天区 */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="px-6 py-4 bg-white border-b">
          <h1 className="text-lg font-semibold">SandAgent Quickstart</h1>
          <p className="text-sm text-gray-500">Local Sandbox</p>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 mt-20">
              <p className="text-xl mb-2">👋 How can I help you today?</p>
              <p className="text-sm">Your local AI agent is ready.</p>
              <p className="text-xs mt-4 text-gray-400">
                💡 Try: "Create a simple data analysis report"
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-white border shadow-sm"
                }`}
              >
                {msg.parts.map((part, i) =>
                  part.type === "text" ? (
                    <span key={i} className="whitespace-pre-wrap">
                      {part.text}
                    </span>
                  ) : null,
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border rounded-2xl px-4 py-3 shadow-sm">
                <span className="text-gray-400">Thinking...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="flex justify-start">
              <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-4 py-3">
                Error: {error.message}
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-4 bg-white border-t">
          <div className="flex gap-3 max-w-4xl mx-auto">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {isLoading ? (
              <button
                type="button"
                onClick={stop}
                className="px-6 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="px-6 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-50"
              >
                Send
              </button>
            )}
          </div>
        </form>
      </div>

      {/* 右侧：Artifacts 面板 */}
      {artifacts.length > 0 && (
        <div className="w-[500px] border-l bg-white flex flex-col">
          {/* Artifacts 标签页 */}
          <div className="border-b p-2 overflow-x-auto">
            <div className="flex gap-1">
              {artifacts.map((artifact) => (
                <button
                  key={artifact.artifactId}
                  onClick={() => setSelectedArtifact(artifact)}
                  className={`px-3 py-2 rounded text-sm whitespace-nowrap transition-colors ${
                    selectedArtifact?.artifactId === artifact.artifactId
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 hover:bg-gray-200"
                  }`}
                  title={artifact.artifactId}
                >
                  📄 {artifact.artifactId.split("/").pop()}
                </button>
              ))}
            </div>
          </div>

          {/* Artifact 内容展示 */}
          {selectedArtifact && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* 工具栏 */}
              <div className="flex items-center justify-between p-3 border-b bg-gray-50">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">
                    {selectedArtifact.artifactId.split("/").pop()}
                  </span>
                  <span className="text-xs text-gray-400">
                    {selectedArtifact.mimeType}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        selectedArtifact.content,
                      );
                      alert("Copied to clipboard!");
                    }}
                    className="px-3 py-1 text-sm bg-white border rounded hover:bg-gray-50"
                  >
                    📋 Copy
                  </button>
                  <button
                    onClick={() => {
                      const blob = new Blob([selectedArtifact.content], {
                        type: selectedArtifact.mimeType,
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download =
                        selectedArtifact.artifactId.split("/").pop() ||
                        "download.txt";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="px-3 py-1 text-sm bg-white border rounded hover:bg-gray-50"
                  >
                    ⬇️ Download
                  </button>
                </div>
              </div>

              {/* 内容区域 */}
              <div className="flex-1 overflow-auto p-4">
                {selectedArtifact.mimeType === "text/markdown" ? (
                  // Markdown 渲染（简单版本，可以用 react-markdown 增强）
                  <div className="prose max-w-none">
                    <pre className="whitespace-pre-wrap font-sans text-sm">
                      {selectedArtifact.content}
                    </pre>
                  </div>
                ) : selectedArtifact.mimeType === "text/html" ? (
                  // HTML 预览
                  <iframe
                    srcDoc={selectedArtifact.content}
                    className="w-full h-full border-0"
                    sandbox="allow-scripts"
                    title={selectedArtifact.artifactId}
                  />
                ) : (
                  // 其他格式：纯文本
                  <pre className="text-sm bg-gray-50 p-4 rounded overflow-auto">
                    {selectedArtifact.content}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
