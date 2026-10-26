#!/usr/bin/env node
/**
 * Deterministic model-only HTTP endpoint for source-backed ACP acceptance.
 * Runner dispatch, session persistence, tool authorization, tools and ACP stay
 * real. This server emits OpenAI chat-completion SSE, never ACP notifications.
 */
import { createServer } from "node:http";

const port = Number(process.env.BUNNY_ACP_MODEL_PORT ?? "33918");
let scenario = process.env.BUNNY_ACP_MODEL_SCENARIO ?? "full";
let marker = process.env.BUNNY_ACP_MODEL_MARKER ?? "SOURCE_BACKED_BUNNY_OK";
let revision = 0;
const stages = new Map();
const requests = [];
const toolRequests = [];
const json = (response, value, status = 200) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
};
const textOf = (content) => typeof content === "string" ? content
  : Array.isArray(content) ? content.map((part) => part.text ?? "").join("\n") : "";

function available(request, candidates) {
  const tools = request.tools ?? [];
  for (const candidate of candidates) {
    const found = tools.find((tool) => tool.function?.name === candidate);
    if (found) return found.function;
  }
  return undefined;
}

function fileArgs(tool, path, content) {
  const properties = tool.parameters?.properties ?? {};
  const pathKey = ["path", "file_path", "filePath", "storageKey"].find((key) => key in properties) ?? "path";
  return { [pathKey]: path, ...(content === undefined ? {} : { content }) };
}

function plan(request) {
  const actions = [];
  const planning = available(request, ["update_plan", "TodoWrite", "todo_write"]);
  if (planning) actions.push({ tool: planning, args: planning.name === "update_plan"
    ? { plan: [{ step: "Create and inspect report", status: "in_progress" }, { step: "Collect user input", status: "pending" }] }
    : { todos: [{ content: "Create and inspect report", status: "in_progress", activeForm: "Inspecting report" }] } });
  const write = available(request, ["write", "Write", "write_file"]);
  const read = available(request, ["read", "Read", "read_file"]);
  const edit = available(request, ["edit", "Edit", "edit_file"]);
  const question = available(request, ["ask_user_question", "AskUserQuestion"]);
  const bash = available(request, ["bash", "Bash", "shell"]);
  if (!write || !read || !edit || !question || !bash) {
    return { unavailable: [!write && "write", !read && "read", !edit && "edit", !question && "ask_user_question", !bash && "bash"].filter(Boolean) };
  }
  actions.push({ tool: write, args: fileArgs(write, "report.md", `# Draft\n\n${marker}\n`) });
  actions.push({ tool: read, args: fileArgs(read, "report.md") });
  const editProperties = edit.parameters?.properties ?? {};
  actions.push({ tool: edit, args: {
    ...fileArgs(edit, "report.md"),
    ["old_string" in editProperties ? "old_string" : "oldText"]: "# Draft",
    ["new_string" in editProperties ? "new_string" : "newText"]: "# Verified",
  } });
  actions.push({ tool: question, args: { questions: [
    { header: "Format", question: "Choose the report format", options: [{ label: "PDF" }, { label: "Markdown" }] },
    { header: "Sections", question: "Choose report sections", multiSelect: true, options: [{ label: "Summary" }, { label: "Details" }] },
    { header: "Title", question: "Enter the report title" },
  ] } });
  actions.push({ tool: bash, args: { command: "printf 'SOURCE_CHAIN_TOOL_DONE\\n'" } });
  if (planning) actions.push({ tool: planning, args: planning.name === "update_plan"
    ? { plan: [{ step: "Create and inspect report", status: "completed" }, { step: "Collect user input", status: "completed" }] }
    : { todos: [{ content: "Create and inspect report", status: "completed", activeForm: "Inspected report" }] } });
  return { actions };
}

function responseFor(request) {
  const messages = request.messages ?? [];
  let lastUser = -1;
  for (let index = 0; index < messages.length; index++) if (messages[index].role === "user") lastUser = index;
  const key = `${revision}:${lastUser}:${textOf(messages[lastUser]?.content)}`;
  const stage = stages.get(key) ?? 0;
  stages.set(key, stage + 1);
  if (scenario === "plain") return { text: marker };
  if (scenario === "cancel") return { slow: true };
  if (scenario === "reject") {
    const write = available(request, ["write", "Write", "write_file"]);
    if (!write) return { text: "Required real write tool is unavailable." };
    return stage === 0 ? { tool: write, args: fileArgs(write, "rejected.txt", "This file must not be created after rejection.") }
      : { text: `${marker}: permission response observed.` };
  }
  if (scenario === "question") {
    const tool = available(request, ["ask_user_question", "AskUserQuestion"]);
    return stage === 0 && tool ? { tool, args: { questions: [{ question: "Which output?", options: [{ label: "Report" }, { label: "Summary" }] }] } }
      : { text: `${marker}: user input observed.` };
  }
  const chosen = plan(request);
  if (chosen.unavailable) return { text: `Required real tools are unavailable: ${chosen.unavailable.join(", ")}` };
  return chosen.actions[stage] ?? { text: `${marker}\n\nThe report was written, read, and edited by the real runner. User input and the real shell tool completed.\n\n[send:report.md]` };
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/health") return json(response, { ok: true, scenario, marker, requests: requests.length });
    if (request.method === "GET" && request.url === "/requests") return json(response, { scenario, requests, toolRequests });
    let raw = "";
    for await (const chunk of request) {
      raw += chunk;
      if (raw.length > 8 * 1024 * 1024) return json(response, { error: "Request exceeds fixture limit" }, 413);
    }
    const body = raw ? JSON.parse(raw) : {};
    if (request.method === "POST" && request.url === "/tool/update_plan") {
      toolRequests.push(body);
      return json(response, { ok: true, plan: body.plan ?? body.todos });
    }
    if (request.method === "POST" && request.url === "/control/scenario") {
      if (!["full", "plain", "reject", "question", "cancel"].includes(body.scenario)) return json(response, { error: "Unknown scenario" }, 400);
      scenario = body.scenario;
      if (typeof body.marker === "string") marker = body.marker;
      revision += 1;
      stages.clear();
      if (body.clearRequests) { requests.splice(0); toolRequests.splice(0); }
      return json(response, { ok: true, scenario, marker });
    }
    if (!request.url?.endsWith("/chat/completions")) return json(response, { error: "Expected /v1/chat/completions" }, 404);
    requests.push(body);
    const reply = responseFor(body);
    const id = `chatcmpl-source-${requests.length}`;
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    const chunk = (delta, finishReason = null, usage) => response.write(`data: ${JSON.stringify({
      id, object: "chat.completion.chunk", created: 0, model: body.model ?? "fake-model",
      choices: [{ index: 0, delta, finish_reason: finishReason }], ...(usage ? { usage } : {}),
    })}\n\n`);
    const finish = (reason) => {
      chunk({}, reason, { prompt_tokens: 40, completion_tokens: 12, total_tokens: 52 });
      response.end("data: [DONE]\n\n");
    };
    if (reply.slow) {
      let count = 0;
      const timer = setInterval(() => {
        chunk({ role: "assistant", content: `Working ${++count}… ` });
        if (count >= 200) { clearInterval(timer); finish("stop"); }
      }, 100);
      response.once("close", () => clearInterval(timer));
    } else if (reply.tool) {
      chunk({ role: "assistant", tool_calls: [{ index: 0, id: `call_${requests.length}`, type: "function",
        function: { name: reply.tool.name, arguments: JSON.stringify(reply.args) } }] });
      finish("tool_calls");
    } else {
      for (const part of reply.text.match(/.{1,32}|\n/g) ?? []) chunk({ role: "assistant", content: part });
      finish("stop");
    }
  } catch (error) {
    if (!response.headersSent) return json(response, { error: error instanceof Error ? error.message : String(error) }, 500);
    response.destroy();
  }
});
server.listen(port, "127.0.0.1", () => console.log(`ACP model fixture listening on http://127.0.0.1:${port}/v1 (${scenario})`));
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => {
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
