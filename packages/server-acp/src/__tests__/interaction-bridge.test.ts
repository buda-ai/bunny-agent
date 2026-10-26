import type { AgentContext } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import {
  buildQuestionForm,
  createAcpToolInteraction,
} from "../interaction-bridge.js";
import { AcpInteractionRegistry } from "../interaction-registry.js";

describe("structured question answers", () => {
  it("retains native permission presentation and the exact selected option", async () => {
    const sent: unknown[] = [];
    const client = {
      request: async (_method: string, params: unknown) => {
        sent.push(params);
        return { outcome: { outcome: "selected", optionId: "native-always" } };
      },
    } as unknown as AgentContext;
    const permission = {
      toolCall: {
        toolCallId: "write1",
        title: "Edit document",
        kind: "edit",
        locations: [{ path: "/workspace/a" }],
        content: [{ type: "diff", path: "/workspace/a", newText: "new" }],
      },
      options: [
        {
          optionId: "native-always",
          name: "Allow for this session",
          kind: "allow_always",
        },
        { optionId: "native-no", name: "Reject", kind: "reject_once" },
      ],
      _meta: { origin: "native" },
    };
    const interact = createAcpToolInteraction({
      sessionId: "session1",
      client,
      registry: new AcpInteractionRegistry(),
      supportsForm: false,
      cwd: "/workspace",
    });
    await expect(
      interact({
        toolCallId: "write1",
        toolName: "Edit document",
        input: { path: "a" },
        permission,
      }),
    ).resolves.toEqual({
      behavior: "allow",
      updatedInput: { path: "a" },
      optionId: "native-always",
    });
    expect(sent[0]).toMatchObject({
      sessionId: "session1",
      toolCall: permission.toolCall,
      options: permission.options,
      _meta: { origin: "native" },
    });
  });

  it("unblocks a pending human interaction when the turn is cancelled", async () => {
    const controller = new AbortController();
    const client = {
      request: async () => new Promise(() => {}),
    } as unknown as AgentContext;
    const interact = createAcpToolInteraction({
      sessionId: "session1",
      client,
      registry: new AcpInteractionRegistry(),
      supportsForm: false,
      cwd: "/workspace",
    });
    const decision = interact({
      toolCallId: "write1",
      toolName: "write",
      input: {},
      signal: controller.signal,
    });
    controller.abort();
    await expect(decision).resolves.toMatchObject({ behavior: "deny" });
  });
  it("validates and decodes single choice, multiple choice and free text without approving a tool", () => {
    const form = buildQuestionForm([
      {
        question: "Strategy?",
        options: [{ label: "Careful" }, { label: "Fast" }],
      },
      {
        question: "Formats?",
        multiSelect: true,
        options: [{ label: "PDF" }, { label: "HTML" }],
      },
      { question: "Title?" },
    ]);
    expect(
      form.answers({
        question_0: "Careful",
        question_1: ["PDF", "Other"],
        question_1_other: "CSV",
        question_2: "Report",
      }),
    ).toEqual({
      "Strategy?": "Careful",
      "Formats?": "PDF, CSV",
      "Title?": "Report",
    });
    expect(() =>
      form.answers({
        question_0: "Unknown",
        question_1: ["PDF"],
        question_2: "Report",
      }),
    ).toThrow("Invalid answer");
    expect(() =>
      form.answers({
        question_0: "Other",
        question_1: ["PDF"],
        question_2: "Report",
      }),
    ).toThrow("custom answer");
    expect(() =>
      form.answers({
        question_0: "Fast",
        question_1: [],
        question_2: "Report",
      }),
    ).toThrow("Invalid answer");
  });
});
