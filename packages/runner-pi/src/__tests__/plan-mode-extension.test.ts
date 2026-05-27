import { describe, expect, it } from "vitest";
import planModeExtension from "../extensions/plan-mode/index.js";
import { createFakeExtensionApi } from "./fake-extension-api.js";

function makeAssistantMessage(text: string) {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
  };
}

describe("planModeExtension", () => {
  it("registers --plan flag and /plan command", () => {
    const fake = createFakeExtensionApi();
    planModeExtension(fake.api);

    expect(fake.flags.has("plan")).toBe(true);
    expect(fake.flags.get("plan")).toMatchObject({
      type: "boolean",
      default: false,
    });
    expect(fake.commands.has("plan")).toBe(true);
  });

  it("subscribes to the expected lifecycle events", () => {
    const fake = createFakeExtensionApi();
    planModeExtension(fake.api);

    expect(fake.handlers.get("tool_call")).toHaveLength(1);
    expect(fake.handlers.get("tool_result")).toHaveLength(1);
    expect(fake.handlers.get("context")).toHaveLength(1);
    expect(fake.handlers.get("before_agent_start")).toHaveLength(1);
    expect(fake.handlers.get("turn_end")).toHaveLength(1);
    expect(fake.handlers.get("agent_end")).toHaveLength(1);
    expect(fake.handlers.get("session_start")).toHaveLength(1);
  });

  it("/plan toggles plan mode and switches the active tool whitelist", async () => {
    const fake = createFakeExtensionApi();
    planModeExtension(fake.api);
    const cmd = fake.commands.get("plan")!;

    await cmd.handler(undefined as never, fake.ctx() as never);
    expect(fake.activeTools).toEqual(["read", "bash", "grep", "find", "ls", "ask_user_question"]);
    expect(fake.appendedEntries.at(-1)).toMatchObject({
      customType: "plan-mode",
      data: { enabled: true, executing: false },
    });

    await cmd.handler(undefined as never, fake.ctx() as never);
    expect(fake.activeTools).toEqual(["read", "bash", "edit", "write"]);
    expect(fake.appendedEntries.at(-1)).toMatchObject({
      customType: "plan-mode",
      data: { enabled: false },
    });
  });

  it("blocks destructive bash while plan mode is active and lets safe bash through", async () => {
    const fake = createFakeExtensionApi();
    planModeExtension(fake.api);
    const cmd = fake.commands.get("plan")!;

    // Before enabling: hook should not interfere with any bash command.
    let res = await fake.fire("tool_call", {
      toolName: "bash",
      input: { command: "rm -rf /tmp/x" },
    });
    expect(res[0]).toBeUndefined();

    // Enable plan mode.
    await cmd.handler(undefined as never, fake.ctx() as never);

    // Unsafe bash now blocked.
    res = await fake.fire("tool_call", {
      toolName: "bash",
      input: { command: "rm -rf /tmp/x" },
    });
    expect(res[0]).toMatchObject({ block: true });
    expect((res[0] as { reason: string }).reason).toMatch(/Plan mode/);

    // Safe bash passes through (no block returned).
    res = await fake.fire("tool_call", {
      toolName: "bash",
      input: { command: "ls -la" },
    });
    expect(res[0]).toBeUndefined();

    // Non-bash tool calls are never affected.
    res = await fake.fire("tool_call", {
      toolName: "read",
      input: { path: "/etc/hosts" },
    });
    expect(res[0]).toBeUndefined();
  });

  it("before_agent_start injects plan context only while plan mode is on", async () => {
    const fake = createFakeExtensionApi();
    planModeExtension(fake.api);
    const cmd = fake.commands.get("plan")!;

    let results = await fake.fire("before_agent_start", {});
    expect(results[0]).toBeUndefined();

    await cmd.handler(undefined as never, fake.ctx() as never);

    results = await fake.fire("before_agent_start", {});
    expect(results[0]).toMatchObject({
      message: {
        customType: "plan-mode-context",
        display: false,
      },
    });
    expect(
      (
        results[0] as {
          message: { content: string };
        }
      ).message.content,
    ).toMatch(/PLAN MODE ACTIVE/);
  });

  it("agent_end emits plan-todo-list when the assistant produces a Plan: section", async () => {
    const fake = createFakeExtensionApi();
    planModeExtension(fake.api);
    const cmd = fake.commands.get("plan")!;
    await cmd.handler(undefined as never, fake.ctx() as never);

    const message = makeAssistantMessage(`Sounds good.

Plan:
1. Read the config file
2. Update the timeout value
3. Run the tests`);

    await fake.fire("agent_end", {
      messages: [message],
    });

    const planMsg = fake.sentMessages.find(
      (m) => m.message.customType === "plan-todo-list",
    );
    expect(planMsg).toBeDefined();
    expect(planMsg?.options).toMatchObject({ triggerTurn: false });
    expect((planMsg!.message.content as string)).toMatch(/Plan ready \(3 steps\)/);
    expect((planMsg!.message.content as string)).toMatch(/\/plan/);
  });

  it("after Plan: extracted, leaving plan mode enters execution mode and injects exec context", async () => {
    const fake = createFakeExtensionApi();
    planModeExtension(fake.api);
    const cmd = fake.commands.get("plan")!;

    // Enter plan mode + agent produces a plan.
    await cmd.handler(undefined as never, fake.ctx() as never);
    await fake.fire("agent_end", {
      messages: [
        makeAssistantMessage(`Plan:
1. Read the config file
2. Update the timeout value`),
      ],
    });

    // Leave plan mode -> should switch to execution mode (todos still pending).
    await cmd.handler(undefined as never, fake.ctx() as never);
    expect(fake.activeTools).toEqual(["read", "bash", "edit", "write"]);
    expect(fake.appendedEntries.at(-1)).toMatchObject({
      data: { enabled: false, executing: true },
    });

    const results = await fake.fire("before_agent_start", {});
    expect(results[0]).toMatchObject({
      message: { customType: "plan-execution-context" },
    });
    expect(
      (results[0] as { message: { content: string } }).message.content,
    ).toMatch(/EXECUTING PLAN/);
  });

  it("turn_end with [DONE:n] marks items completed and persists state", async () => {
    const fake = createFakeExtensionApi();
    planModeExtension(fake.api);
    const cmd = fake.commands.get("plan")!;

    // Enter plan mode + extract a 3-step plan.
    await cmd.handler(undefined as never, fake.ctx() as never);
    await fake.fire("agent_end", {
      messages: [
        makeAssistantMessage(`Plan:
1. Read the config file
2. Update the timeout value
3. Run the tests`),
      ],
    });
    // Leave plan mode to enter execution mode.
    await cmd.handler(undefined as never, fake.ctx() as never);

    fake.appendedEntries.length = 0;

    await fake.fire("turn_end", {
      message: makeAssistantMessage("Did step one. [DONE:1]"),
    });

    const persisted = fake.appendedEntries.at(-1);
    expect(persisted?.customType).toBe("plan-mode");
    expect(persisted?.data).toMatchObject({ executing: true });
    const todos = (persisted?.data as { todos: Array<{ completed: boolean }> })
      .todos;
    expect(todos[0].completed).toBe(true);
    expect(todos[1].completed).toBe(false);
    expect(todos[2].completed).toBe(false);
  });

  it("agent_end emits plan-complete and exits execution mode when every todo is done", async () => {
    const fake = createFakeExtensionApi();
    planModeExtension(fake.api);
    const cmd = fake.commands.get("plan")!;

    await cmd.handler(undefined as never, fake.ctx() as never);
    await fake.fire("agent_end", {
      messages: [
        makeAssistantMessage(`Plan:
1. Read the config file
2. Update the timeout value`),
      ],
    });
    await cmd.handler(undefined as never, fake.ctx() as never);

    // Mark both done via two turn_end events.
    await fake.fire("turn_end", {
      message: makeAssistantMessage("[DONE:1]"),
    });
    await fake.fire("turn_end", {
      message: makeAssistantMessage("[DONE:2]"),
    });

    fake.sentMessages.length = 0;

    await fake.fire("agent_end", { messages: [] });

    const completion = fake.sentMessages.find(
      (m) => m.message.customType === "plan-complete",
    );
    expect(completion).toBeDefined();
    expect((completion!.message.content as string)).toMatch(/Plan Complete/);
    // After completion we go back to the normal toolset.
    expect(fake.activeTools).toEqual(["read", "bash", "edit", "write"]);
  });

  it("context handler drops plan-mode-context messages when plan mode is off", async () => {
    const fake = createFakeExtensionApi();
    planModeExtension(fake.api);

    const messages = [
      { role: "user", content: "hi", customType: "plan-mode-context" },
      { role: "user", content: "real user message" },
      { role: "assistant", content: [{ type: "text", text: "ok" }] },
    ];

    const results = await fake.fire("context", { messages });
    const filtered = (
      results[0] as { messages: typeof messages } | undefined
    )?.messages;
    expect(filtered).toBeDefined();
    expect(filtered).toHaveLength(2);
    expect(filtered?.[0]).toMatchObject({ content: "real user message" });
  });

  it("session_start with --plan flag enters plan mode", async () => {
    const fake = createFakeExtensionApi();
    planModeExtension(fake.api);
    fake.setFlag("plan", true);

    await fake.fire("session_start", { type: "session_start" });

    expect(fake.activeTools).toEqual(["read", "bash", "grep", "find", "ls", "ask_user_question"]);
  });

  it("session_start restores persisted plan-mode state", async () => {
    const fake = createFakeExtensionApi();
    planModeExtension(fake.api);

    fake.setSessionEntries([
      {
        type: "custom",
        customType: "plan-mode",
        data: {
          enabled: true,
          executing: false,
          todos: [{ step: 1, text: "restored", completed: false }],
        },
      },
    ]);

    await fake.fire("session_start", { type: "session_start" });

    expect(fake.activeTools).toEqual(["read", "bash", "grep", "find", "ls", "ask_user_question"]);
  });

  describe("ask_user_question driven transition", () => {
    async function setupWithPlan() {
      const fake = createFakeExtensionApi();
      planModeExtension(fake.api);
      const cmd = fake.commands.get("plan")!;
      await cmd.handler(undefined as never, fake.ctx() as never);
      return { fake, cmd };
    }

    function executeAnswer() {
      return {
        toolName: "ask_user_question",
        content: [
          {
            type: "text",
            text: "User answered:\nQ: Plan ready. What next?\nA: Execute the plan",
          },
        ],
      };
    }

    function refineAnswer() {
      return {
        toolName: "ask_user_question",
        content: [
          {
            type: "text",
            text: "User answered:\nQ: Plan ready. What next?\nA: Refine",
          },
        ],
      };
    }

    function planMessage() {
      return makeAssistantMessage(`Plan:
1. Read the config file
2. Update the timeout value`);
    }

    it("Execute answer + agent_end leaves plan mode and triggers a new turn", async () => {
      const { fake } = await setupWithPlan();

      await fake.fire("tool_result", executeAnswer());
      await fake.fire("agent_end", { messages: [planMessage()] });

      // Transitioned: tools switched to NORMAL, executing flag persisted true.
      expect(fake.activeTools).toEqual(["read", "bash", "edit", "write"]);
      expect(fake.appendedEntries.at(-1)).toMatchObject({
        customType: "plan-mode",
        data: { enabled: false, executing: true },
      });

      // A new turn was triggered with the execute kickoff message.
      const exec = fake.sentMessages.find(
        (m) => m.message.customType === "plan-mode-execute",
      );
      expect(exec).toBeDefined();
      expect(exec?.options).toMatchObject({ triggerTurn: true });
      expect(exec?.message.content as string).toMatch(/Execute the plan/);
      // cleanStepText strips the leading "Read" verb, so the kickoff message
      // references the cleaned text ("Config file"), not the raw plan line.
      expect(exec?.message.content as string).toMatch(/Config file/);

      // The plan-todo-list "audit gate" message is suppressed when auto-executing.
      const todoList = fake.sentMessages.find(
        (m) => m.message.customType === "plan-todo-list",
      );
      expect(todoList).toBeUndefined();
    });

    it("Refine answer keeps plan mode and shows the audit-gate message", async () => {
      const { fake } = await setupWithPlan();

      await fake.fire("tool_result", refineAnswer());
      await fake.fire("agent_end", { messages: [planMessage()] });

      // Still in plan mode.
      expect(fake.activeTools).toEqual([
        "read",
        "bash",
        "grep",
        "find",
        "ls",
        "ask_user_question",
      ]);
      // No execute kickoff was sent.
      expect(
        fake.sentMessages.find(
          (m) => m.message.customType === "plan-mode-execute",
        ),
      ).toBeUndefined();
      // Audit-gate message present.
      expect(
        fake.sentMessages.find(
          (m) => m.message.customType === "plan-todo-list",
        ),
      ).toBeDefined();
    });

    it("ignores tool_result for non ask_user_question tools", async () => {
      const { fake } = await setupWithPlan();

      await fake.fire("tool_result", {
        toolName: "bash",
        content: [{ type: "text", text: "A: Execute the plan" }],
      });
      await fake.fire("agent_end", { messages: [planMessage()] });

      expect(fake.activeTools).toEqual([
        "read",
        "bash",
        "grep",
        "find",
        "ls",
        "ask_user_question",
      ]);
      expect(
        fake.sentMessages.find(
          (m) => m.message.customType === "plan-mode-execute",
        ),
      ).toBeUndefined();
    });

    it("ignores ask_user_question results when plan mode is off", async () => {
      const fake = createFakeExtensionApi();
      planModeExtension(fake.api);
      // Plan mode never enabled.

      await fake.fire("tool_result", executeAnswer());
      await fake.fire("agent_end", { messages: [planMessage()] });

      expect(fake.activeTools).toEqual([]);
      expect(fake.sentMessages).toHaveLength(0);
    });

    it("Execute answer without an extracted plan does not transition", async () => {
      const { fake } = await setupWithPlan();

      await fake.fire("tool_result", executeAnswer());
      await fake.fire("agent_end", {
        messages: [makeAssistantMessage("Just thinking out loud, no plan yet.")],
      });

      // No plan extracted -> still in plan mode, no execute kickoff.
      expect(fake.activeTools).toEqual([
        "read",
        "bash",
        "grep",
        "find",
        "ls",
        "ask_user_question",
      ]);
      expect(
        fake.sentMessages.find(
          (m) => m.message.customType === "plan-mode-execute",
        ),
      ).toBeUndefined();
    });

    it("/plan command still works as a manual fallback", async () => {
      const { fake, cmd } = await setupWithPlan();

      await fake.fire("agent_end", { messages: [planMessage()] });
      // User audits then toggles /plan instead of letting the LLM ask.
      await cmd.handler(undefined as never, fake.ctx() as never);

      expect(fake.activeTools).toEqual(["read", "bash", "edit", "write"]);
      expect(fake.appendedEntries.at(-1)).toMatchObject({
        data: { enabled: false, executing: true },
      });
    });
  });
});
