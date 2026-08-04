import { describe, expect, it } from "vitest";
import {
  type AgentTurnInputV1,
  compileAgentTurnInput,
  parseAgentTurnInputV1,
} from "../agent-input.js";

const createImageTurn = (): AgentTurnInputV1 => ({
  version: 1,
  input: [
    {
      type: "asset",
      id: "asset-1",
      label: "[Image #1]",
      asset: { mediaType: "image/png", data: "Zmlyc3Q=" },
    },
    {
      type: "asset",
      id: "asset-2",
      label: "[Image #2]",
      asset: { mediaType: "image/jpeg", data: "c2Vjb25k" },
    },
    {
      type: "text",
      text: "Before [Image #1] between [Image #2] after",
    },
  ],
  capabilities: [],
  execution: {
    resolvedBy: "server",
    skills: [],
    integrations: [],
    references: [],
    capabilityKeys: [],
    extensionVersions: {},
  },
});

describe("AgentTurnInputV1", () => {
  it("preserves frozen image labels and first appearance order", () => {
    const compiled = compileAgentTurnInput(createImageTurn());
    expect(compiled.text).toBe("Before [Image #1] between [Image #2] after");
    expect(compiled.images.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "asset-1", label: "[Image #1]" },
      { id: "asset-2", label: "[Image #2]" },
    ]);
  });

  it("rejects forged skill and capability identifiers", () => {
    const turn = createImageTurn();
    turn.input.push({ type: "skill", id: "skill-1", name: "research" });
    expect(() => parseAgentTurnInputV1(turn)).toThrow(
      "Unresolved structured agent skill",
    );

    turn.input.pop();
    turn.capabilities.push({ key: "web-search", enabled: true });
    expect(() => parseAgentTurnInputV1(turn)).toThrow(
      "Unresolved structured agent capability",
    );
  });

  it("rejects duplicate assets and secret-bearing execution data", () => {
    const duplicate = createImageTurn();
    duplicate.input[1] = {
      type: "asset",
      id: "asset-1",
      label: "[Image #2]",
      asset: { mediaType: "image/jpeg", data: "c2Vjb25k" },
    };
    expect(() => parseAgentTurnInputV1(duplicate)).toThrow(
      "duplicate asset id",
    );

    const secret = createImageTurn();
    Object.assign(secret.execution, { accessToken: "do-not-forward" });
    expect(() => parseAgentTurnInputV1(secret)).toThrow(
      "execution must not contain secrets",
    );
  });

  it("rejects malformed execution entries and secret-bearing display snapshots", () => {
    const malformed = createImageTurn();
    malformed.execution.skills = [null as never];
    expect(() => parseAgentTurnInputV1(malformed)).toThrow(
      "execution.skills must be an object array",
    );

    const snapshot = createImageTurn();
    snapshot.displaySnapshot = {
      version: 1,
      document: { storageRef: "private/file" },
    };
    expect(() => parseAgentTurnInputV1(snapshot)).toThrow(
      "displaySnapshot must be version 1 and secret-free",
    );
  });

  it("rejects registered extensions until a runner adapter exists", () => {
    const turn = createImageTurn();
    turn.execution.extensionVersions = { "acme/chart": 1 };
    turn.input.push({
      type: "extension",
      id: "extension-1",
      namespace: "acme",
      name: "chart",
      version: 1,
      payload: { chartId: "chart-1" },
    });
    expect(() => compileAgentTurnInput(turn)).toThrow(
      "Runner adapter does not support extension",
    );
  });
});
