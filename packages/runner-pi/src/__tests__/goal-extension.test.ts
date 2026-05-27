import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import goalExtension from "../extensions/goal/index.js";
import { CUSTOM_TYPE } from "../extensions/goal/goal-finder.js";
import { createFakeExtensionApi, type FakeApi } from "./fake-extension-api.js";

interface GoalToolResult {
  content: Array<{ type: string; text: string }>;
  details: Record<string, unknown>;
}

async function runTool(
  fake: FakeApi,
  name: "get_goal" | "update_goal",
  params: Record<string, unknown> = {},
  ctxOverrides: Record<string, unknown> = {},
): Promise<GoalToolResult> {
  const tool = fake.tools.get(name);
  if (!tool) throw new Error(`tool ${name} not registered`);
  const ctx = { ...fake.ctx(), ...ctxOverrides };
  return (await tool.execute(
    "call-id",
    params,
    new AbortController().signal,
    () => {},
    ctx,
  )) as GoalToolResult;
}

function lastGoalEntry(fake: FakeApi): unknown {
  const entry = [...fake.appendedEntries]
    .reverse()
    .find((e) => e.customType === CUSTOM_TYPE);
  return entry?.data;
}

describe("goalExtension", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers /goal command, get_goal, and update_goal tools", () => {
    const fake = createFakeExtensionApi();
    goalExtension(fake.api);
    expect(fake.commands.has("goal")).toBe(true);
    expect(fake.tools.has("get_goal")).toBe(true);
    expect(fake.tools.has("update_goal")).toBe(true);
  });

  it("subscribes to session_start, tool_call, turn_end, agent_end", () => {
    const fake = createFakeExtensionApi();
    goalExtension(fake.api);
    expect(fake.handlers.get("session_start")).toHaveLength(1);
    expect(fake.handlers.get("tool_call")).toHaveLength(1);
    expect(fake.handlers.get("turn_end")).toHaveLength(1);
    expect(fake.handlers.get("agent_end")).toHaveLength(1);
  });

  describe("/goal <objective>", () => {
    it("starts a goal, activates goal tools, and triggers a turn after the deferral", async () => {
      const fake = createFakeExtensionApi();
      goalExtension(fake.api);
      const cmd = fake.commands.get("goal")!;

      await cmd.handler("ship the migration", fake.ctx() as never);

      // Tools added before the timer runs (sendGoalMessage syncs state up front).
      expect(fake.activeTools).toEqual(
        expect.arrayContaining(["get_goal", "update_goal"]),
      );

      // Nothing sent yet.
      expect(fake.sentMessages).toHaveLength(0);

      vi.runAllTimers();

      const sent = fake.sentMessages.find(
        (m) => m.message.customType === CUSTOM_TYPE,
      );
      expect(sent).toBeDefined();
      expect(sent?.options).toMatchObject({ triggerTurn: true });
      expect(sent?.message.content as string).toMatch(/ship the migration/);
      expect(sent?.message.content as string).toMatch(/<untrusted_objective>/);
    });

    it("rejects a new goal when one is already active", async () => {
      const fake = createFakeExtensionApi();
      goalExtension(fake.api);
      fake.setSessionEntries([
        {
          type: "custom",
          customType: CUSTOM_TYPE,
          data: { phase: "ready", objective: "first", startedAt: 1 },
        },
      ]);

      await fake.commands
        .get("goal")!
        .handler("second", fake.ctx() as never);

      // No appendEntry / no sendMessage — only an info notify went out.
      expect(fake.appendedEntries).toHaveLength(0);
      vi.runAllTimers();
      expect(
        fake.sentMessages.find((m) => m.message.customType === CUSTOM_TYPE),
      ).toBeUndefined();
      const notify = fake.sentMessages.find(
        (m) => m.message.customType === "pi-goal-info",
      );
      expect(notify).toBeDefined();
      expect(notify?.message.content as string).toMatch(/already active/);
    });

    it("pauses instead of triggering a turn when the runtime is busy", async () => {
      const fake = createFakeExtensionApi();
      goalExtension(fake.api);

      // Make the runtime appear busy when the timer fires.
      const busyCtx = {
        ...fake.ctx(),
        hasPendingMessages: () => true,
        isIdle: () => true,
      };

      await fake.commands.get("goal")!.handler("ship it", busyCtx as never);
      vi.runAllTimers();

      // No triggerTurn message; goal got paused.
      expect(
        fake.sentMessages.find(
          (m) =>
            m.message.customType === CUSTOM_TYPE &&
            (m.options?.triggerTurn ?? false) === true,
        ),
      ).toBeUndefined();
      expect(lastGoalEntry(fake)).toMatchObject({
        phase: "paused",
        objective: "ship it",
      });
    });
  });

  describe("/goal pause / resume / clear / show", () => {
    it("pause: ready -> paused without triggering a turn", async () => {
      const fake = createFakeExtensionApi();
      goalExtension(fake.api);
      fake.setSessionEntries([
        {
          type: "custom",
          customType: CUSTOM_TYPE,
          data: { phase: "ready", objective: "x", startedAt: 1 },
        },
      ]);

      await fake.commands.get("goal")!.handler("pause", fake.ctx() as never);
      vi.runAllTimers();

      expect(lastGoalEntry(fake)).toMatchObject({
        phase: "paused",
        objective: "x",
      });
      // goal tools removed from active set.
      expect(fake.activeTools).not.toContain("get_goal");
      expect(fake.activeTools).not.toContain("update_goal");
      // No turn triggered.
      expect(
        fake.sentMessages.find((m) => m.options?.triggerTurn === true),
      ).toBeUndefined();
    });

    it("pause: warns when no active goal", async () => {
      const fake = createFakeExtensionApi();
      goalExtension(fake.api);

      await fake.commands.get("goal")!.handler("pause", fake.ctx() as never);

      const notify = fake.sentMessages.find(
        (m) => m.message.customType === "pi-goal-info",
      );
      expect(notify?.message.content as string).toMatch(/No active goal/);
      expect(fake.appendedEntries).toHaveLength(0);
    });

    it("resume: paused -> ready and triggers a turn", async () => {
      const fake = createFakeExtensionApi();
      goalExtension(fake.api);
      fake.setSessionEntries([
        {
          type: "custom",
          customType: CUSTOM_TYPE,
          data: { phase: "paused", objective: "x" },
        },
      ]);

      await fake.commands.get("goal")!.handler("resume", fake.ctx() as never);
      vi.runAllTimers();

      const sent = fake.sentMessages.find(
        (m) =>
          m.message.customType === CUSTOM_TYPE && m.options?.triggerTurn,
      );
      expect(sent).toBeDefined();
      expect(sent?.message.content as string).toMatch(/x/);
    });

    it("resume: warns when no paused goal", async () => {
      const fake = createFakeExtensionApi();
      goalExtension(fake.api);
      await fake.commands.get("goal")!.handler("resume", fake.ctx() as never);
      const notify = fake.sentMessages.find(
        (m) => m.message.customType === "pi-goal-info",
      );
      expect(notify?.message.content as string).toMatch(/No paused goal/);
    });

    it("clear: resets state and removes goal tools", async () => {
      const fake = createFakeExtensionApi();
      goalExtension(fake.api);
      fake.setSessionEntries([
        {
          type: "custom",
          customType: CUSTOM_TYPE,
          data: { phase: "ready", objective: "x", startedAt: 1 },
        },
      ]);
      // Pretend goal tools were already active before clear.
      fake.api.setActiveTools(["read", "get_goal", "update_goal"]);

      await fake.commands.get("goal")!.handler("clear", fake.ctx() as never);

      expect(lastGoalEntry(fake)).toEqual({ phase: "idle" });
      expect(fake.activeTools).toEqual(["read"]);
    });

    it("empty args reports current state", async () => {
      const fake = createFakeExtensionApi();
      goalExtension(fake.api);
      fake.setSessionEntries([
        {
          type: "custom",
          customType: CUSTOM_TYPE,
          data: { phase: "ready", objective: "x", startedAt: 1 },
        },
      ]);
      await fake.commands.get("goal")!.handler("", fake.ctx() as never);
      const notify = fake.sentMessages.find(
        (m) => m.message.customType === "pi-goal-info",
      );
      expect(notify?.message.content as string).toMatch(/"phase":"ready"/);
    });
  });

  describe("event handlers", () => {
    it("session_start syncs goal tools when a ready goal is restored", async () => {
      const fake = createFakeExtensionApi();
      goalExtension(fake.api);
      fake.setSessionEntries([
        {
          type: "custom",
          customType: CUSTOM_TYPE,
          data: { phase: "ready", objective: "x", startedAt: 1 },
        },
      ]);
      await fake.fire("session_start", { type: "session_start" });
      expect(fake.activeTools).toEqual(
        expect.arrayContaining(["get_goal", "update_goal"]),
      );
    });

    it("tool_call increments toolsUsed and appends a new state entry", async () => {
      const fake = createFakeExtensionApi();
      goalExtension(fake.api);
      fake.setSessionEntries([
        {
          type: "custom",
          customType: CUSTOM_TYPE,
          data: { phase: "ready", objective: "x", startedAt: 1 },
        },
      ]);
      await fake.fire("tool_call", { toolName: "bash" });
      expect(lastGoalEntry(fake)).toMatchObject({
        phase: "ready",
        objective: "x",
        toolsUsed: 1,
      });
    });

    it("tool_call is a no-op when goal is idle/paused", async () => {
      const fake = createFakeExtensionApi();
      goalExtension(fake.api);
      // No goal entries -> idle.
      await fake.fire("tool_call", { toolName: "bash" });
      expect(fake.appendedEntries).toHaveLength(0);
    });

    it("turn_end with signal.aborted pauses an active goal", async () => {
      const fake = createFakeExtensionApi();
      goalExtension(fake.api);
      fake.setSessionEntries([
        {
          type: "custom",
          customType: CUSTOM_TYPE,
          data: { phase: "ready", objective: "x", startedAt: 1, toolsUsed: 2 },
        },
      ]);

      const ctrl = new AbortController();
      ctrl.abort();
      await fake.fire("turn_end", {}, { signal: ctrl.signal });

      expect(lastGoalEntry(fake)).toMatchObject({
        phase: "paused",
        objective: "x",
      });
      const warn = fake.sentMessages.find(
        (m) => m.message.customType === "pi-goal-info",
      );
      expect(warn?.message.content as string).toMatch(/aborted/);
    });

    it("turn_end without abort is a no-op", async () => {
      const fake = createFakeExtensionApi();
      goalExtension(fake.api);
      fake.setSessionEntries([
        {
          type: "custom",
          customType: CUSTOM_TYPE,
          data: { phase: "ready", objective: "x", startedAt: 1, toolsUsed: 1 },
        },
      ]);
      await fake.fire("turn_end", {}, { signal: new AbortController().signal });
      expect(fake.appendedEntries).toHaveLength(0);
    });

    it("agent_end with toolsUsed=0 pauses (NO_TOOL_CALLS guard)", async () => {
      const fake = createFakeExtensionApi();
      goalExtension(fake.api);
      fake.setSessionEntries([
        {
          type: "custom",
          customType: CUSTOM_TYPE,
          data: { phase: "ready", objective: "x", startedAt: 1 },
        },
      ]);

      await fake.fire("agent_end", {});
      vi.runAllTimers();

      expect(lastGoalEntry(fake)).toMatchObject({
        phase: "paused",
        objective: "x",
      });
      // No continuation turn fired.
      expect(
        fake.sentMessages.find(
          (m) =>
            m.message.customType === CUSTOM_TYPE &&
            m.options?.triggerTurn === true,
        ),
      ).toBeUndefined();
      const warn = fake.sentMessages.find(
        (m) => m.message.customType === "pi-goal-info",
      );
      expect(warn?.message.content as string).toMatch(/no tool calls/i);
    });

    it("agent_end with toolsUsed>0 fires the continuation turn", async () => {
      const fake = createFakeExtensionApi();
      goalExtension(fake.api);
      fake.setSessionEntries([
        {
          type: "custom",
          customType: CUSTOM_TYPE,
          data: { phase: "ready", objective: "x", startedAt: 1, toolsUsed: 3 },
        },
      ]);

      await fake.fire("agent_end", {});
      vi.runAllTimers();

      const sent = fake.sentMessages.find(
        (m) =>
          m.message.customType === CUSTOM_TYPE &&
          m.options?.triggerTurn === true,
      );
      expect(sent).toBeDefined();
      expect(sent?.message.content as string).toMatch(/x/);
    });

    it("agent_end is a no-op when goal is idle", async () => {
      const fake = createFakeExtensionApi();
      goalExtension(fake.api);
      await fake.fire("agent_end", {});
      vi.runAllTimers();
      expect(fake.sentMessages).toHaveLength(0);
    });
  });

  describe("get_goal / update_goal tools", () => {
    it("get_goal returns 'No active goal' when idle", async () => {
      const fake = createFakeExtensionApi();
      goalExtension(fake.api);
      const r = await runTool(fake, "get_goal");
      expect(r.content[0].text).toBe("No active goal.");
    });

    it("get_goal reports objective and phase when ready", async () => {
      const fake = createFakeExtensionApi();
      goalExtension(fake.api);
      fake.setSessionEntries([
        {
          type: "custom",
          customType: CUSTOM_TYPE,
          data: { phase: "ready", objective: "ship it", startedAt: 1 },
        },
      ]);
      const r = await runTool(fake, "get_goal");
      expect(r.content[0].text).toMatch(/Objective: ship it/);
      expect(r.content[0].text).toMatch(/Status: ready/);
      expect(r.details).toMatchObject({ objective: "ship it", phase: "ready" });
    });

    it("update_goal complete clears state and removes goal tools", async () => {
      const fake = createFakeExtensionApi();
      goalExtension(fake.api);
      fake.setSessionEntries([
        {
          type: "custom",
          customType: CUSTOM_TYPE,
          data: { phase: "ready", objective: "ship it", startedAt: 1 },
        },
      ]);
      fake.api.setActiveTools(["read", "get_goal", "update_goal"]);

      const r = await runTool(fake, "update_goal", { status: "complete" });
      expect(r.content[0].text).toMatch(/marked complete/);
      expect(lastGoalEntry(fake)).toEqual({ phase: "idle" });
      expect(fake.activeTools).toEqual(["read"]);
    });

    it("update_goal is a no-op when no goal is active", async () => {
      const fake = createFakeExtensionApi();
      goalExtension(fake.api);
      const r = await runTool(fake, "update_goal", { status: "complete" });
      expect(r.content[0].text).toMatch(/No active goal/);
      expect(fake.appendedEntries).toHaveLength(0);
    });
  });
});
