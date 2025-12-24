import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @sandagent/core
vi.mock("@sandagent/core", () => ({
  SandAgent: vi.fn().mockImplementation(() => ({
    stream: vi.fn().mockResolvedValue(
      new Response("test stream", {
        headers: { "Content-Type": "text/event-stream" },
      })
    ),
  })),
}));

import { createAgentHandler } from "../handler.js";

describe("createAgentHandler", () => {
  const mockCreateAgent = vi.fn().mockImplementation(() => ({
    stream: vi.fn().mockResolvedValue(
      new Response("test stream", {
        headers: { "Content-Type": "text/event-stream" },
      })
    ),
  }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createMockRequest(body: object): Request {
    return new Request("http://localhost/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("should return 400 if sessionId is missing", async () => {
    const handler = createAgentHandler({ createAgent: mockCreateAgent });
    const req = createMockRequest({ messages: [] });

    const response = await handler(req);

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("sessionId is required");
  });

  it("should return 400 if messages is missing", async () => {
    const handler = createAgentHandler({ createAgent: mockCreateAgent });
    const req = createMockRequest({ sessionId: "test-session" });

    const response = await handler(req);

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("messages array is required");
  });

  it("should return 400 if messages is not an array", async () => {
    const handler = createAgentHandler({ createAgent: mockCreateAgent });
    const req = createMockRequest({ sessionId: "test-session", messages: "not an array" });

    const response = await handler(req);

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("messages array is required");
  });

  it("should create agent with correct sessionId", async () => {
    const handler = createAgentHandler({ createAgent: mockCreateAgent });
    const req = createMockRequest({
      sessionId: "my-session-123",
      messages: [{ role: "user", content: "Hello" }],
    });

    await handler(req);

    expect(mockCreateAgent).toHaveBeenCalledWith({ sessionId: "my-session-123" });
  });

  it("should call agent.stream with messages", async () => {
    const mockStream = vi.fn().mockResolvedValue(
      new Response("test", { headers: { "Content-Type": "text/event-stream" } })
    );
    const mockAgent = { stream: mockStream };
    const createAgent = vi.fn().mockReturnValue(mockAgent);

    const handler = createAgentHandler({ createAgent });
    const req = createMockRequest({
      sessionId: "test-session",
      messages: [{ role: "user", content: "Hello" }],
    });

    await handler(req);

    expect(mockStream).toHaveBeenCalledWith({
      messages: [{ role: "user", content: "Hello" }],
      workspace: undefined,
    });
  });

  it("should pass workspace configuration", async () => {
    const mockStream = vi.fn().mockResolvedValue(
      new Response("test", { headers: { "Content-Type": "text/event-stream" } })
    );
    const mockAgent = { stream: mockStream };
    const createAgent = vi.fn().mockReturnValue(mockAgent);

    const handler = createAgentHandler({ createAgent });
    const req = createMockRequest({
      sessionId: "test-session",
      messages: [{ role: "user", content: "Hello" }],
      workspace: { path: "/custom/path" },
    });

    await handler(req);

    expect(mockStream).toHaveBeenCalledWith({
      messages: [{ role: "user", content: "Hello" }],
      workspace: { path: "/custom/path" },
    });
  });

  it("should return the stream response directly", async () => {
    const expectedResponse = new Response("streamed data", {
      headers: { "Content-Type": "text/event-stream" },
    });
    const mockStream = vi.fn().mockResolvedValue(expectedResponse);
    const mockAgent = { stream: mockStream };
    const createAgent = vi.fn().mockReturnValue(mockAgent);

    const handler = createAgentHandler({ createAgent });
    const req = createMockRequest({
      sessionId: "test-session",
      messages: [{ role: "user", content: "Hello" }],
    });

    const response = await handler(req);

    expect(response).toBe(expectedResponse);
  });

  it("should return 500 on error", async () => {
    const createAgent = vi.fn().mockImplementation(() => {
      throw new Error("Agent creation failed");
    });

    const handler = createAgentHandler({ createAgent });
    const req = createMockRequest({
      sessionId: "test-session",
      messages: [{ role: "user", content: "Hello" }],
    });

    const response = await handler(req);

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("Agent creation failed");
  });
});
