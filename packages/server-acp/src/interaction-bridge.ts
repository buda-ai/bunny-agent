import type {
  AgentContext,
  CreateElicitationRequest,
  CreateElicitationResponse,
  ElicitationSchema,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from "@agentclientprotocol/sdk";
import type {
  ToolInteractionHandler,
  ToolInteractionRequest,
} from "@bunny-agent/manager";
import type {
  AcpInteractionRegistry,
  InteractionReply,
} from "./interaction-registry.js";
import { recordOf, toolDisplay } from "./tool-display.js";

export const BUNNY_INTERACTION_RESPOND_METHOD =
  "_bunny-agent/interaction/respond";
export const INTERACTIVE_RUNNERS = [
  "claude",
  "pi",
  "gemini",
  "opencode",
  "copilot",
];

interface Question {
  question: string;
  header?: string;
  multiSelect?: boolean;
  allowFreeform?: boolean;
  options?: Array<{ label: string; description?: string }>;
}

/** The same real runner gate drives both standard requests and retryable replies. */
export function createAcpToolInteraction(input: {
  sessionId: string;
  client: AgentContext;
  registry: AcpInteractionRegistry;
  supportsForm: boolean;
  cwd: string;
}): ToolInteractionHandler {
  return async (request) => {
    if (request.signal?.aborted)
      return { behavior: "deny", message: "The run was cancelled." };
    const isQuestion = /^(ask_user_question|AskUserQuestion)$/.test(
      request.toolName,
    );
    const questions = isQuestion ? parseQuestions(request.input) : undefined;
    if (isQuestion && !input.supportsForm) {
      return {
        behavior: "deny",
        message:
          "The connected ACP client does not support structured questions.",
      };
    }
    const form = questions ? buildQuestionForm(questions) : undefined;
    const options = request.permission?.options ?? [
      { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
      { optionId: "reject-once", name: "Reject", kind: "reject_once" },
    ];
    const interaction = input.registry.create(input.sessionId, (reply) => {
      if (!["accept", "decline", "cancel"].includes(reply.action))
        throw new Error("Invalid interaction action.");
      if (form && reply.action === "accept") form.answers(reply.content ?? {});
      if (
        !form &&
        reply.action !== "cancel" &&
        !options.some((option) => option.optionId === reply.optionId)
      ) {
        throw new Error(
          "A permission reply must select a reported permission option.",
        );
      }
    });
    const controller = new AbortController();
    const cancel = () => {
      void input.registry
        .respond(input.sessionId, interaction.id, { action: "cancel" })
        .catch(() => undefined);
      controller.abort();
    };
    request.signal?.addEventListener("abort", cancel, { once: true });
    if (request.signal?.aborted) cancel();
    const timer =
      request.timeoutMs === undefined
        ? undefined
        : setTimeout(cancel, Math.max(0, request.timeoutMs));
    timer?.unref?.();
    const meta = {
      "bunny-agent": {
        interactionId: interaction.id,
        toolCallId: request.toolCallId,
      },
    };
    const remoteReply = form
      ? input.client
          .request<CreateElicitationResponse, CreateElicitationRequest>(
            "elicitation/create",
            {
              sessionId: input.sessionId,
              toolCallId: request.toolCallId,
              mode: "form",
              message: "The agent needs your answer to continue.",
              requestedSchema: form.schema,
              _meta: { ...meta, "bunny-agent/questions": questions },
            },
            { cancellationSignal: controller.signal },
          )
          .then(
            (reply): InteractionReply => ({
              action: reply.action as InteractionReply["action"],
              ...(reply.action === "accept" && reply.content
                ? { content: reply.content as Record<string, unknown> }
                : {}),
            }),
          )
      : permissionRequest(input, request, options, meta, controller.signal);
    void remoteReply
      .then((reply) =>
        input.registry.respond(input.sessionId, interaction.id, reply),
      )
      .catch(() =>
        input.registry
          .respond(input.sessionId, interaction.id, { action: "cancel" })
          .catch(() => undefined),
      );
    try {
      const reply = await interaction.promise;
      if (form) {
        return reply.action === "accept"
          ? {
              behavior: "allow",
              updatedInput: {
                questions,
                answers: form.answers(reply.content ?? {}),
              },
            }
          : {
              behavior: "deny",
              message:
                reply.action === "decline"
                  ? "The user declined to answer."
                  : "The question was cancelled or expired.",
            };
      }
      const selected = options.find(
        (option) => option.optionId === reply.optionId,
      );
      return selected &&
        ["allow_once", "allow_always"].includes(selected.kind) &&
        reply.action === "accept"
        ? {
            behavior: "allow",
            updatedInput: recordOf(request.input),
            optionId: selected.optionId,
          }
        : {
            behavior: "deny",
            message: "The user did not authorize this tool.",
            ...(selected ? { optionId: selected.optionId } : {}),
          };
    } finally {
      input.registry.acknowledge(interaction.id);
      if (timer) clearTimeout(timer);
      request.signal?.removeEventListener("abort", cancel);
      controller.abort();
    }
  };
}

async function permissionRequest(
  input: { sessionId: string; client: AgentContext; cwd: string },
  request: ToolInteractionRequest,
  options: Array<{ optionId: string; name: string; kind: string }>,
  meta: Record<string, unknown>,
  signal: AbortSignal,
): Promise<InteractionReply> {
  const reply = await input.client.request<
    RequestPermissionResponse,
    RequestPermissionRequest
  >(
    "session/request_permission",
    {
      sessionId: input.sessionId,
      toolCall: (request.permission?.toolCall ?? {
        toolCallId: request.toolCallId,
        ...toolDisplay(request.toolName, request.input, input.cwd),
        status: "pending",
        rawInput: request.input,
      }) as RequestPermissionRequest["toolCall"],
      options: options as RequestPermissionRequest["options"],
      _meta: { ...request.permission?._meta, ...meta },
    },
    { cancellationSignal: signal },
  );
  if (reply.outcome.outcome !== "selected") return { action: "cancel" };
  const optionId = reply.outcome.optionId;
  return {
    // ACP's selected outcome confirms a choice, including a rejection. Tool
    // disposition is derived from the selected option's kind by the gate.
    action: "accept",
    optionId,
  };
}

function parseQuestions(input: unknown): Question[] {
  const raw = recordOf(input)?.questions;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 8)
    throw new Error("A survey must contain 1 to 8 questions.");
  return raw.map((item) => {
    const question = recordOf(item);
    if (typeof question?.question !== "string" || !question.question.trim())
      throw new Error("A survey question must have text.");
    const options = Array.isArray(question.options)
      ? question.options.map((option) => {
          const value = recordOf(option);
          if (typeof value?.label !== "string" || !value.label)
            throw new Error("Question options must have labels.");
          return {
            label: value.label,
            ...(typeof value.description === "string"
              ? { description: value.description }
              : {}),
          };
        })
      : undefined;
    return {
      question: question.question,
      ...(typeof question.header === "string"
        ? { header: question.header }
        : {}),
      multiSelect: question.multiSelect === true,
      ...(question.allowFreeform === false ? { allowFreeform: false } : {}),
      ...(options ? { options } : {}),
    };
  });
}

export function buildQuestionForm(questions: Question[]): {
  schema: ElicitationSchema;
  answers: (content: Record<string, unknown>) => Record<string, string>;
} {
  const properties: Record<string, unknown> = {};
  questions.forEach((question, index) => {
    const key = `question_${index}`;
    const title = question.header
      ? `${question.header}: ${question.question}`
      : question.question;
    const choices = question.options?.map((option) => option.label);
    const selectable =
      choices && question.allowFreeform !== false
        ? [...choices, "Other"]
        : choices;
    properties[key] = choices?.length
      ? question.multiSelect
        ? {
            type: "array",
            title,
            items: { type: "string", enum: selectable },
            minItems: 1,
          }
        : { type: "string", title, enum: selectable }
      : { type: "string", title, minLength: 1 };
    if (choices?.length && question.allowFreeform !== false)
      properties[`${key}_other`] = {
        type: "string",
        title: `Other answer: ${question.question}`,
      };
  });
  return {
    schema: {
      type: "object",
      properties,
      required: questions.map((_, index) => `question_${index}`),
    } as ElicitationSchema,
    answers: (content) =>
      Object.fromEntries(
        questions.map((question, index) => {
          const key = `question_${index}`;
          const supplied = content[key];
          const choices = question.options?.map((option) => option.label);
          const values =
            question.multiSelect && choices?.length
              ? Array.isArray(supplied) &&
                supplied.every((item) => typeof item === "string")
                ? (supplied as string[])
                : []
              : typeof supplied === "string" && supplied.trim()
                ? [supplied]
                : [];
          if (
            values.length === 0 ||
            (choices?.length &&
              values.some(
                (item) =>
                  !choices.includes(item) &&
                  !(item === "Other" && question.allowFreeform !== false),
              ))
          ) {
            throw new Error(`Invalid answer for ${question.question}`);
          }
          const answer = values
            .map((value) => {
              if (value !== "Other" || !choices?.length) return value;
              const other = content[`${key}_other`];
              if (typeof other !== "string" || !other.trim())
                throw new Error(
                  `A custom answer is required for ${question.question}`,
                );
              return other;
            })
            .join(", ");
          return [question.question, answer];
        }),
      ),
  };
}
