/**
 * Todo extension for runner-pi (headless variant).
 *
 * Adapted from pi-mono/coding-agent/examples/extensions/todo.ts.
 * Differences vs upstream:
 *   - No /todos slash command (no TUI to render the overlay).
 *   - No renderCall/renderResult (interactive-only).
 *   - State is rebuilt from session entries on session_start/session_tree,
 *     so resumed Bunny sessions still see the correct todo list.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

interface TodoDetails {
  action: "list" | "add" | "toggle" | "clear";
  todos: Todo[];
  nextId: number;
  error?: string;
}

const TodoParams = Type.Object({
  action: Type.Union(
    [
      Type.Literal("list"),
      Type.Literal("add"),
      Type.Literal("toggle"),
      Type.Literal("clear"),
    ],
    { description: "Operation to perform on the todo list" },
  ),
  text: Type.Optional(Type.String({ description: "Todo text (for add)" })),
  id: Type.Optional(Type.Number({ description: "Todo ID (for toggle)" })),
});

export default function todoExtension(pi: ExtensionAPI): void {
  let todos: Todo[] = [];
  let nextId = 1;

  const reconstructState = (ctx: ExtensionContext) => {
    todos = [];
    nextId = 1;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "message") continue;
      const msg = entry.message;
      if (msg.role !== "toolResult" || msg.toolName !== "todo") continue;
      const details = msg.details as TodoDetails | undefined;
      if (details) {
        todos = details.todos;
        nextId = details.nextId;
      }
    }
  };

  pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
  pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

  pi.registerTool({
    name: "todo",
    label: "Todo",
    description:
      "Manage a todo list across the conversation. Actions: list, add (text), toggle (id), clear. State is persisted in the session and survives resume.",
    parameters: TodoParams,

    async execute(_toolCallId, params) {
      switch (params.action) {
        case "list":
          return {
            content: [
              {
                type: "text",
                text: todos.length
                  ? todos
                      .map((t) => `[${t.done ? "x" : " "}] #${t.id}: ${t.text}`)
                      .join("\n")
                  : "No todos",
              },
            ],
            details: {
              action: "list",
              todos: [...todos],
              nextId,
            } as TodoDetails,
          };

        case "add": {
          if (!params.text) {
            return {
              content: [{ type: "text", text: "Error: text required for add" }],
              details: {
                action: "add",
                todos: [...todos],
                nextId,
                error: "text required",
              } as TodoDetails,
            };
          }
          const newTodo: Todo = {
            id: nextId++,
            text: params.text,
            done: false,
          };
          todos.push(newTodo);
          return {
            content: [
              {
                type: "text",
                text: `Added todo #${newTodo.id}: ${newTodo.text}`,
              },
            ],
            details: {
              action: "add",
              todos: [...todos],
              nextId,
            } as TodoDetails,
          };
        }

        case "toggle": {
          if (params.id === undefined) {
            return {
              content: [
                { type: "text", text: "Error: id required for toggle" },
              ],
              details: {
                action: "toggle",
                todos: [...todos],
                nextId,
                error: "id required",
              } as TodoDetails,
            };
          }
          const todo = todos.find((t) => t.id === params.id);
          if (!todo) {
            return {
              content: [
                { type: "text", text: `Todo #${params.id} not found` },
              ],
              details: {
                action: "toggle",
                todos: [...todos],
                nextId,
                error: `#${params.id} not found`,
              } as TodoDetails,
            };
          }
          todo.done = !todo.done;
          return {
            content: [
              {
                type: "text",
                text: `Todo #${todo.id} ${todo.done ? "completed" : "uncompleted"}`,
              },
            ],
            details: {
              action: "toggle",
              todos: [...todos],
              nextId,
            } as TodoDetails,
          };
        }

        case "clear": {
          const count = todos.length;
          todos = [];
          nextId = 1;
          return {
            content: [{ type: "text", text: `Cleared ${count} todos` }],
            details: {
              action: "clear",
              todos: [],
              nextId: 1,
            } as TodoDetails,
          };
        }

        default:
          return {
            content: [
              { type: "text", text: `Unknown action: ${params.action}` },
            ],
            details: {
              action: "list",
              todos: [...todos],
              nextId,
              error: `unknown action: ${params.action}`,
            } as TodoDetails,
          };
      }
    },
  });
}
