import { createServer, type Server } from "node:http";

export interface FakeChatRequest {
  messages: Array<{
    role: string;
    content?: unknown;
    tool_call_id?: string;
  }>;
  tools?: Array<{ function: { name: string } }>;
}

export type FakeChatReply =
  | { text: string }
  | { toolCall: { name: string; arguments: Record<string, unknown> } };

export interface FakeOpenAiServer {
  baseUrl: string;
  requests: FakeChatRequest[];
  close(): Promise<void>;
}

/**
 * Minimal OpenAI chat-completions endpoint that streams scripted replies, so
 * tests can drive the real runner (pi session, tools, hooks) without a model.
 * Any other path answers `toolBody`, for HTTP tool refs.
 */
export async function startFakeOpenAiServer(
  reply: (request: FakeChatRequest, index: number) => FakeChatReply,
  options: { toolBody?: string } = {},
): Promise<FakeOpenAiServer> {
  const requests: FakeChatRequest[] = [];
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (!req.url?.endsWith("/chat/completions")) {
        res.end(options.toolBody ?? "");
        return;
      }
      const request = JSON.parse(body) as FakeChatRequest;
      requests.push(request);
      const answer = reply(request, requests.length - 1);
      const chunk = (delta: unknown, finishReason: string | null) =>
        `data: ${JSON.stringify({
          id: "chatcmpl-fake",
          object: "chat.completion.chunk",
          created: 0,
          model: "fake-model",
          choices: [{ index: 0, delta, finish_reason: finishReason }],
        })}\n\n`;
      res.writeHead(200, { "content-type": "text/event-stream" });
      if ("text" in answer) {
        res.write(chunk({ role: "assistant", content: answer.text }, null));
        res.write(chunk({}, "stop"));
      } else {
        res.write(
          chunk(
            {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: `call_${requests.length}`,
                  type: "function",
                  function: {
                    name: answer.toolCall.name,
                    arguments: JSON.stringify(answer.toolCall.arguments),
                  },
                },
              ],
            },
            null,
          ),
        );
        res.write(chunk({}, "tool_calls"));
      }
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("fake OpenAI server has no port");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** Text the model saw for the tool result of `toolCallId`, if any. */
export function toolResultText(
  request: FakeChatRequest,
  toolCallId: string,
): string | undefined {
  const message = request.messages.find(
    (m) => m.role === "tool" && m.tool_call_id === toolCallId,
  );
  if (!message) return undefined;
  if (typeof message.content === "string") return message.content;
  return JSON.stringify(message.content);
}
