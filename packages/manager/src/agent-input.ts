export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface ResolvedAsset {
  mediaType: string;
  data: string;
  filename?: string;
}

export type AgentUserInput =
  | { type: "text"; text: string }
  | {
      type: "asset";
      id: string;
      label: string;
      asset: ResolvedAsset;
    }
  | { type: "skill"; id: string; name: string }
  | { type: "integration"; id: string; providerKey: string }
  | {
      type: "reference";
      id: string;
      referenceKind: string;
      targetId: string;
      label?: string;
    }
  | {
      type: "extension";
      id: string;
      namespace: string;
      name: string;
      version: number;
      payload: Record<string, JsonValue>;
    };

export interface TurnCapabilitySelection {
  key: string;
  enabled: boolean;
  sourceTokenId?: string;
  configurationRef?: string;
}

export interface ResolvedExecutionContext {
  resolvedBy?: "server";
  skills?: Array<{ id: string; name: string }>;
  integrations?: Array<{ id: string; providerKey: string }>;
  references?: Array<{
    id: string;
    referenceKind: string;
    targetId: string;
  }>;
  capabilityKeys?: string[];
  extensionVersions?: Record<string, number>;
}

export interface SentComposerSnapshotV1 {
  version: 1;
  document: JsonValue;
}

export interface AgentTurnInputV1 {
  version: 1;
  input: AgentUserInput[];
  capabilities: TurnCapabilitySelection[];
  execution: ResolvedExecutionContext;
  displaySnapshot?: SentComposerSnapshotV1;
}

export interface RunnerImageInput {
  id: string;
  label: string;
  mediaType: string;
  data: string;
  filename?: string;
}

export interface CompiledRunnerInput {
  text: string;
  images: RunnerImageInput[];
}

const assertString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `Invalid structured agent input: ${field} must be a non-empty string`,
    );
  }
  return value;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasForbiddenSecretKey = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasForbiddenSecretKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) => {
    const normalized = key.toLowerCase();
    return (
      new Set([
        "apikey",
        "api_key",
        "authorization",
        "cookie",
        "credential",
        "credentials",
        "password",
        "secret",
        "token",
        "accesstoken",
        "refreshtoken",
        "signedurl",
        "storageref",
      ]).has(normalized) || hasForbiddenSecretKey(child)
    );
  });
};

export const parseAgentTurnInputV1 = (value: unknown): AgentTurnInputV1 => {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.input)) {
    throw new Error(
      "Invalid structured agent input: expected AgentTurnInputV1",
    );
  }
  if (!Array.isArray(value.capabilities) || !isRecord(value.execution)) {
    throw new Error(
      "Invalid structured agent input: capabilities and execution are required",
    );
  }

  if (hasForbiddenSecretKey(value.execution)) {
    throw new Error(
      "Invalid structured agent input: execution must not contain secrets",
    );
  }
  if (value.displaySnapshot !== undefined) {
    if (
      !isRecord(value.displaySnapshot) ||
      value.displaySnapshot.version !== 1 ||
      !("document" in value.displaySnapshot) ||
      hasForbiddenSecretKey(value.displaySnapshot)
    ) {
      throw new Error(
        "Invalid structured agent input: displaySnapshot must be version 1 and secret-free",
      );
    }
  }

  const requireRecordArray = (
    candidate: unknown,
    field: string,
  ): Record<string, unknown>[] => {
    if (candidate === undefined) return [];
    if (!Array.isArray(candidate) || !candidate.every(isRecord)) {
      throw new Error(
        `Invalid structured agent input: execution.${field} must be an object array`,
      );
    }
    return candidate;
  };

  const resolvedSkills = requireRecordArray(value.execution.skills, "skills");
  const resolvedIntegrations = requireRecordArray(
    value.execution.integrations,
    "integrations",
  );
  const resolvedReferences = requireRecordArray(
    value.execution.references,
    "references",
  );
  const resolvedCapabilityKeys = value.execution.capabilityKeys ?? [];
  if (
    !Array.isArray(resolvedCapabilityKeys) ||
    !resolvedCapabilityKeys.every(
      (key): key is string => typeof key === "string",
    )
  ) {
    throw new Error(
      "Invalid structured agent input: execution.capabilityKeys must be a string array",
    );
  }
  const assetIds = new Set<string>();

  for (const [index, item] of value.input.entries()) {
    if (!isRecord(item)) {
      throw new Error(
        `Invalid structured agent input: input[${index}] must be an object`,
      );
    }
    switch (item.type) {
      case "text":
        if (typeof item.text !== "string") {
          throw new Error(
            `Invalid structured agent input: input[${index}].text must be a string`,
          );
        }
        break;
      case "asset": {
        const id = assertString(item.id, `input[${index}].id`);
        if (assetIds.has(id)) {
          throw new Error(
            `Invalid structured agent input: duplicate asset id ${id}`,
          );
        }
        assetIds.add(id);
        assertString(item.label, `input[${index}].label`);
        if (!isRecord(item.asset)) {
          throw new Error(
            `Invalid structured agent input: input[${index}].asset is required`,
          );
        }
        const mediaType = assertString(
          item.asset.mediaType,
          `input[${index}].asset.mediaType`,
        );
        assertString(item.asset.data, `input[${index}].asset.data`);
        if (!mediaType.startsWith("image/")) {
          throw new Error(
            `Unsupported structured agent input asset type: ${mediaType}`,
          );
        }
        break;
      }
      case "skill": {
        const id = assertString(item.id, `input[${index}].id`);
        const name = assertString(item.name, `input[${index}].name`);
        if (
          !resolvedSkills.some(
            (skill) => skill.id === id && skill.name === name,
          )
        ) {
          throw new Error(`Unresolved structured agent skill: ${id}`);
        }
        break;
      }
      case "integration": {
        const id = assertString(item.id, `input[${index}].id`);
        const providerKey = assertString(
          item.providerKey,
          `input[${index}].providerKey`,
        );
        if (
          !resolvedIntegrations.some(
            (integration) =>
              integration.id === id && integration.providerKey === providerKey,
          )
        ) {
          throw new Error(`Unresolved structured agent integration: ${id}`);
        }
        break;
      }
      case "reference":
        if (
          !resolvedReferences.some(
            (reference) =>
              reference.id === assertString(item.id, `input[${index}].id`) &&
              reference.referenceKind ===
                assertString(
                  item.referenceKind,
                  `input[${index}].referenceKind`,
                ) &&
              reference.targetId ===
                assertString(item.targetId, `input[${index}].targetId`),
          )
        ) {
          throw new Error(
            `Unresolved structured agent reference: ${String(item.id)}`,
          );
        }
        break;
      case "extension": {
        assertString(item.id, `input[${index}].id`);
        const key = `${assertString(item.namespace, `input[${index}].namespace`)}/${assertString(item.name, `input[${index}].name`)}`;
        if (!Number.isSafeInteger(item.version) || Number(item.version) < 1) {
          throw new Error(
            `Invalid structured agent input: input[${index}].version must be a positive integer`,
          );
        }
        if (!isRecord(item.payload) || hasForbiddenSecretKey(item.payload)) {
          throw new Error(
            `Invalid structured agent input: input[${index}].payload must be secret-free JSON`,
          );
        }
        const versions = value.execution.extensionVersions;
        if (!isRecord(versions) || versions[key] !== item.version) {
          throw new Error(
            `Unsupported structured agent input extension: ${key}@${String(item.version)}`,
          );
        }
        break;
      }
      default:
        throw new Error(
          `Unsupported structured agent input type: ${String(item.type)}`,
        );
    }
  }

  for (const [index, capability] of value.capabilities.entries()) {
    if (!isRecord(capability)) {
      throw new Error(
        `Invalid structured agent input: capabilities[${index}] must be an object`,
      );
    }
    const key = assertString(capability.key, `capabilities[${index}].key`);
    if (typeof capability.enabled !== "boolean") {
      throw new Error(
        `Invalid structured agent input: capabilities[${index}].enabled must be boolean`,
      );
    }
    if (capability.enabled && !resolvedCapabilityKeys.includes(key)) {
      throw new Error(`Unresolved structured agent capability: ${key}`);
    }
  }

  const hasSemanticInput = value.input.some(
    (item) => isRecord(item) && item.type !== "text",
  );
  if (
    (hasSemanticInput || value.capabilities.length > 0) &&
    value.execution.resolvedBy !== "server"
  ) {
    throw new Error(
      "Invalid structured agent input: semantic inputs require server-resolved execution",
    );
  }

  return value as unknown as AgentTurnInputV1;
};

export const compileAgentTurnInput = (
  turn: AgentTurnInputV1,
): CompiledRunnerInput => {
  const parsed = parseAgentTurnInputV1(turn);
  const text: string[] = [];
  const images: RunnerImageInput[] = [];

  for (const item of parsed.input) {
    switch (item.type) {
      case "text":
        text.push(item.text);
        break;
      case "asset":
        images.push({
          id: item.id,
          label: item.label,
          mediaType: item.asset.mediaType,
          data: item.asset.data,
          filename: item.asset.filename,
        });
        break;
      case "skill":
      case "integration":
        break;
      case "reference":
        text.push(item.label ?? `[${item.referenceKind}: ${item.targetId}]`);
        break;
      case "extension":
        throw new Error(
          `Runner adapter does not support extension ${item.namespace}/${item.name}@${item.version}`,
        );
    }
  }

  return { text: text.join(""), images };
};

export const createLegacyAgentTurnInput = (
  userInput: string,
): AgentTurnInputV1 => ({
  version: 1,
  input: [{ type: "text", text: userInput }],
  capabilities: [],
  execution: {},
});

export const isSemanticAgentTurnInput = (turn: AgentTurnInputV1): boolean =>
  turn.input.some((item) => item.type !== "text") ||
  turn.capabilities.length > 0;
