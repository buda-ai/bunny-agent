import { describe, expect, it } from "vitest";
import { goalForSession } from "../extensions/goal/goal-finder.js";
import {
  GoalStateMachine,
  NO_TOOL_CALLS,
} from "../extensions/goal/state-machine.js";
import type { GoalState } from "../extensions/goal/state.js";

describe("GoalStateMachine", () => {
  describe("start", () => {
    it("transitions idle -> ready and returns the continuation prompt", async () => {
      const gm = new GoalStateMachine({ phase: "idle" });
      const prompt = await gm.start("ship the migration", () => false);
      expect(gm.state.phase).toBe("ready");
      if (gm.state.phase === "ready") {
        expect(gm.state.objective).toBe("ship the migration");
        expect(typeof gm.state.startedAt).toBe("number");
        expect(gm.state.toolsUsed).toBeUndefined();
      }
      expect(prompt).toMatch(/Continue working toward the active thread goal/);
      expect(prompt).toMatch(/ship the migration/);
    });

    it("rejects when ready and override returns false", async () => {
      const gm = new GoalStateMachine({
        phase: "ready",
        objective: "first goal",
        startedAt: 100,
      });
      await expect(gm.start("second goal", () => false)).rejects.toThrow(
        /not idle/,
      );
      expect(gm.state.phase).toBe("ready");
    });

    it("rejects when paused and override returns false", async () => {
      const gm = new GoalStateMachine({
        phase: "paused",
        objective: "old goal",
      });
      await expect(gm.start("new goal", () => false)).rejects.toThrow(
        /not idle/,
      );
    });

    it("overrides paused goal when override returns true", async () => {
      const gm = new GoalStateMachine({
        phase: "paused",
        objective: "old goal",
      });
      const prompt = await gm.start("new goal", () => true);
      expect(gm.state.phase).toBe("ready");
      if (gm.state.phase === "ready") {
        expect(gm.state.objective).toBe("new goal");
      }
      expect(prompt).toMatch(/new goal/);
    });

    it("does not override paused goal when override returns false (ready phase)", async () => {
      const gm = new GoalStateMachine({
        phase: "ready",
        objective: "ready goal",
      });
      // Even if confirm returns true, we're not in paused, so it still throws.
      await expect(gm.start("new goal", () => true)).rejects.toThrow(
        /not idle/,
      );
    });
  });

  describe("registerToolCall", () => {
    it("increments toolsUsed in ready phase", () => {
      const gm = new GoalStateMachine({
        phase: "ready",
        objective: "x",
        startedAt: 1,
      });
      expect(gm.registerToolCall()).toBe(true);
      expect(gm.registerToolCall()).toBe(true);
      if (gm.state.phase === "ready") {
        expect(gm.state.toolsUsed).toBe(2);
      }
    });

    it("returns false outside ready phase", () => {
      const idle = new GoalStateMachine({ phase: "idle" });
      expect(idle.registerToolCall()).toBe(false);
      const paused = new GoalStateMachine({ phase: "paused", objective: "x" });
      expect(paused.registerToolCall()).toBe(false);
    });
  });

  describe("continue", () => {
    it("returns NO_TOOL_CALLS when ready but no tool calls were made", () => {
      const gm = new GoalStateMachine({
        phase: "ready",
        objective: "x",
        startedAt: 1,
      });
      expect(gm.continue()).toBe(NO_TOOL_CALLS);
    });

    it("returns continuation prompt when tools were used", () => {
      const gm = new GoalStateMachine({
        phase: "ready",
        objective: "ship feature",
        startedAt: 1,
        toolsUsed: 3,
      });
      const result = gm.continue();
      expect(typeof result).toBe("string");
      expect(result).toMatch(/ship feature/);
    });

    it("returns undefined outside ready phase", () => {
      const idle = new GoalStateMachine({ phase: "idle" });
      expect(idle.continue()).toBeUndefined();
      const paused = new GoalStateMachine({ phase: "paused", objective: "x" });
      expect(paused.continue()).toBeUndefined();
    });
  });

  describe("pause / resume / abort / complete / clear", () => {
    it("pause moves ready -> paused", () => {
      const gm = new GoalStateMachine({
        phase: "ready",
        objective: "x",
        startedAt: 1,
      });
      gm.pause();
      expect(gm.state).toEqual({ phase: "paused", objective: "x" });
    });

    it("pause throws outside ready", () => {
      expect(() => new GoalStateMachine({ phase: "idle" }).pause()).toThrow();
    });

    it("resume moves paused -> ready and refreshes startedAt", () => {
      const gm = new GoalStateMachine({ phase: "paused", objective: "x" });
      const before = Date.now() - 1000;
      const prompt = gm.resume();
      expect(gm.state.phase).toBe("ready");
      if (gm.state.phase === "ready") {
        expect(gm.state.startedAt).toBeGreaterThanOrEqual(before);
      }
      expect(prompt).toMatch(/x/);
    });

    it("resume throws when not paused", () => {
      expect(() => new GoalStateMachine({ phase: "idle" }).resume()).toThrow();
    });

    it("abort pauses an active goal and returns true", () => {
      const gm = new GoalStateMachine({
        phase: "ready",
        objective: "x",
        startedAt: 1,
      });
      expect(gm.abort()).toBe(true);
      expect(gm.state.phase).toBe("paused");
    });

    it("abort returns false when not ready", () => {
      const gm = new GoalStateMachine({ phase: "idle" });
      expect(gm.abort()).toBe(false);
    });

    it("complete clears state when ready", () => {
      const gm = new GoalStateMachine({
        phase: "ready",
        objective: "x",
        startedAt: 1,
      });
      gm.complete();
      expect(gm.state).toEqual({ phase: "idle" });
    });

    it("complete throws when not ready", () => {
      expect(() =>
        new GoalStateMachine({ phase: "paused", objective: "x" }).complete(),
      ).toThrow();
    });

    it("clear resets to idle from any phase", () => {
      const gm = new GoalStateMachine({
        phase: "paused",
        objective: "x",
      });
      gm.clear();
      expect(gm.state).toEqual({ phase: "idle" });
    });
  });

  describe("resetToolCalls", () => {
    it("zeros toolsUsed in ready phase", () => {
      const gm = new GoalStateMachine({
        phase: "ready",
        objective: "x",
        startedAt: 1,
        toolsUsed: 5,
      });
      gm.resetToolCalls();
      if (gm.state.phase === "ready") {
        expect(gm.state.toolsUsed).toBe(0);
      }
    });

    it("is a no-op outside ready", () => {
      const idle = new GoalStateMachine({ phase: "idle" });
      idle.resetToolCalls();
      expect(idle.state).toEqual({ phase: "idle" });
    });
  });
});

describe("goalForSession", () => {
  function sm(entries: unknown[]) {
    return { getEntries: () => entries as never };
  }

  it("returns idle when there are no entries", () => {
    expect(goalForSession(sm([]))).toEqual({ phase: "idle" });
  });

  it("returns idle when no pi-goal entries are present", () => {
    expect(
      goalForSession(
        sm([
          { type: "message", message: { role: "user", content: "hi" } },
          { type: "custom", customType: "plan-mode", data: { enabled: true } },
        ]),
      ),
    ).toEqual({ phase: "idle" });
  });

  it("returns the most recent state when multiple pi-goal entries exist", () => {
    const entries = [
      {
        type: "custom",
        customType: "pi-goal",
        data: { phase: "ready", objective: "first", startedAt: 1 },
      },
      {
        type: "custom",
        customType: "pi-goal",
        data: { phase: "paused", objective: "first" },
      },
      {
        type: "custom",
        customType: "pi-goal",
        data: { phase: "ready", objective: "second", startedAt: 2 },
      },
    ];
    expect(goalForSession(sm(entries))).toEqual<GoalState>({
      phase: "ready",
      objective: "second",
      startedAt: 2,
    });
  });

  it("reads custom_message entries via the details field", () => {
    const entries = [
      {
        type: "custom_message",
        customType: "pi-goal",
        details: { phase: "ready", objective: "from msg", startedAt: 5 },
      },
    ];
    expect(goalForSession(sm(entries))).toEqual<GoalState>({
      phase: "ready",
      objective: "from msg",
      startedAt: 5,
    });
  });
});
