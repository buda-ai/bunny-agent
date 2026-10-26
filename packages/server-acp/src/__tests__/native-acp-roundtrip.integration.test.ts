import type { SessionUpdate } from "@agentclientprotocol/sdk";
import { createAcpProcessRunner } from "@bunny-agent/runner-acp";
import { parseRunnerStream } from "@bunny-agent/runner-harness";
import { describe, expect, it } from "vitest";
import { AcpSessionUpdateSerializer } from "../session-update-serializer.js";

const nativeUpdates: SessionUpdate[] = [
  {
    sessionUpdate: "agent_message_chunk",
    messageId: "answer",
    content: { type: "text", text: "Native progress" },
  },
  {
    sessionUpdate: "plan",
    entries: [
      { content: "Inspect file", priority: "high", status: "completed" },
    ],
  },
  {
    sessionUpdate: "tool_call",
    toolCallId: "tool1",
    title: "Edit file",
    kind: "edit",
    status: "completed",
    rawInput: { path: "/workspace/a.ts" },
    rawOutput: { result: false },
    locations: [{ path: "/workspace/a.ts", line: 2 }],
    content: [
      { type: "diff", path: "/workspace/a.ts", oldText: "old", newText: "new" },
      {
        type: "content",
        content: { type: "image", data: "aW1hZ2U=", mimeType: "image/png" },
      },
    ],
    _meta: { parentToolCallId: "parent", future: { retained: true } },
  },
  {
    sessionUpdate: "agent_message_chunk",
    messageId: "answer",
    content: {
      type: "resource_link",
      uri: "https://example.org/report.pdf",
      name: "report.pdf",
      mimeType: "application/pdf",
    },
  },
];

/** A real stdio subprocess intentionally speaks only JSON-RPC, not SSE. */
function fixtureScript(updates: SessionUpdate[], permission = false): string {
  return `
    import readline from 'node:readline';
    const updates = ${JSON.stringify(updates)};
    let promptId;
    const send = (value) => process.stdout.write(JSON.stringify({jsonrpc:'2.0',...value})+'\\n');
    const finish = (result) => {
      for (const update of updates) send({method:'session/update',params:{sessionId:'native1',update}});
      if (result) send({method:'session/update',params:{sessionId:'native1',update:{sessionUpdate:'tool_call_update',toolCallId:'permission',status:'failed',rawOutput:result}}});
      send({id:promptId,result:{stopReason:'end_turn',usage:{inputTokens:3,outputTokens:2,totalTokens:5}}});
    };
    readline.createInterface({input:process.stdin}).on('line',(line)=>{
      const message=JSON.parse(line);
      if (message.method==='initialize') send({id:message.id,result:{protocolVersion:1,agentCapabilities:{loadSession:false}}});
      else if(message.method==='session/new') send({id:message.id,result:{sessionId:'native1'}});
      else if(message.method==='session/prompt') {
        promptId=message.id;
        if (${JSON.stringify(permission)}) send({id:100,method:'session/request_permission',params:{sessionId:'native1',toolCall:{toolCallId:'permission',title:'Write file',rawInput:{path:'/workspace/file'}},options:[{optionId:'yes',name:'Allow',kind:'allow_once'},{optionId:'no',name:'Reject',kind:'reject_once'}]}});
        else finish();
      } else if(message.id===100) finish(message.result);
    });
  `;
}

describe("native ACP to Bunny ACP round-trip", () => {
  it("preserves plans, diffs, media, locations and metadata across a real child process", async () => {
    const runner = createAcpProcessRunner({
      displayName: "Fixture",
      command: process.execPath,
      args: ["--input-type=module", "-e", fixtureScript(nativeUpdates)],
      yolo: true,
    });
    const serializer = new AcpSessionUpdateSerializer();
    const updates: SessionUpdate[] = [];
    for await (const update of serializer.serialize(
      parseRunnerStream(runner.run("Inspect")),
    ))
      updates.push(update);
    // One additional metadata-only update carries the original prompt usage.
    expect(
      updates.filter(
        (update) =>
          !(
            update.sessionUpdate === "agent_message_chunk" &&
            update.content.type === "text" &&
            update.content.text === ""
          ),
      ),
    ).toEqual(nativeUpdates);
    expect(serializer.usage).toMatchObject({
      inputTokens: 3,
      outputTokens: 2,
      totalTokens: 5,
    });
  });

  it("passes a real native permission request through the pre-execution host gate", async () => {
    const calls: unknown[] = [];
    const runner = createAcpProcessRunner({
      displayName: "Fixture",
      command: process.execPath,
      args: ["--input-type=module", "-e", fixtureScript([], true)],
      yolo: false,
      toolInteraction: async (request) => {
        calls.push(request);
        return { behavior: "deny", message: "Rejected by user" };
      },
    });
    const serializer = new AcpSessionUpdateSerializer();
    const updates: SessionUpdate[] = [];
    for await (const update of serializer.serialize(
      parseRunnerStream(runner.run("Write")),
    ))
      updates.push(update);
    expect(calls).toMatchObject([
      {
        toolCallId: "permission",
        toolName: "Write file",
        input: { path: "/workspace/file" },
      },
    ]);
    expect(updates).toContainEqual({
      sessionUpdate: "tool_call_update",
      toolCallId: "permission",
      status: "failed",
      rawOutput: { outcome: { outcome: "selected", optionId: "no" } },
    });
  });
});
