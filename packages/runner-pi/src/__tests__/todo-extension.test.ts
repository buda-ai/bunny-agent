import { describe, expect, it } from "vitest";
import todoExtension from "../extensions/todo.js";
import { createFakeExtensionApi } from "./fake-extension-api.js";

interface TodoExecuteResult {
  content: Array<{ type: string; text: string }>;
  details: {
    action: string;
    todos: Array<{ id: number; text: string; done: boolean }>;
    nextId: number;
    error?: string;
  };
}

async function execTodo(
  tool: { execute: (...args: unknown[]) => unknown },
  params: Record<string, unknown>,
): Promise<TodoExecuteResult> {
  return (await tool.execute(
    "call-id",
    params,
    new AbortController().signal,
    () => {},
    {},
  )) as TodoExecuteResult;
}

describe("todoExtension", () => {
  it("registers a todo tool with the expected schema fields", () => {
    const fake = createFakeExtensionApi();
    todoExtension(fake.api);

    const todo = fake.tools.get("todo");
    expect(todo).toBeDefined();
    expect(todo?.label).toBe("Todo");
    expect(todo?.description).toMatch(/todo/i);
    expect(todo?.parameters).toBeDefined();
  });

  it("subscribes to session_start and session_tree for state reconstruction", () => {
    const fake = createFakeExtensionApi();
    todoExtension(fake.api);
    expect(fake.handlers.get("session_start")).toHaveLength(1);
    expect(fake.handlers.get("session_tree")).toHaveLength(1);
  });

  it("add appends a todo and returns the new id", async () => {
    const fake = createFakeExtensionApi();
    todoExtension(fake.api);
    const tool = fake.tools.get("todo");
    expect(tool).toBeDefined();
    if (!tool) return;

    const r1 = await execTodo(tool as never, {
      action: "add",
      text: "first item",
    });
    expect(r1.content[0].text).toMatch(/Added todo #1/);
    expect(r1.details.todos).toHaveLength(1);
    expect(r1.details.todos[0]).toMatchObject({
      id: 1,
      text: "first item",
      done: false,
    });

    const r2 = await execTodo(tool as never, {
      action: "add",
      text: "second item",
    });
    expect(r2.details.todos).toHaveLength(2);
    expect(r2.details.todos[1].id).toBe(2);
    expect(r2.details.nextId).toBe(3);
  });

  it("add without text returns an error result without mutating state", async () => {
    const fake = createFakeExtensionApi();
    todoExtension(fake.api);
    const tool = fake.tools.get("todo")!;

    const r = await execTodo(tool as never, { action: "add" });
    expect(r.details.error).toBe("text required");
    expect(r.details.todos).toHaveLength(0);
  });

  it("toggle flips done; missing id returns error", async () => {
    const fake = createFakeExtensionApi();
    todoExtension(fake.api);
    const tool = fake.tools.get("todo")!;

    await execTodo(tool as never, { action: "add", text: "item one" });

    const r1 = await execTodo(tool as never, { action: "toggle", id: 1 });
    expect(r1.content[0].text).toMatch(/completed/);
    expect(r1.details.todos[0].done).toBe(true);

    const r2 = await execTodo(tool as never, { action: "toggle", id: 1 });
    expect(r2.content[0].text).toMatch(/uncompleted/);
    expect(r2.details.todos[0].done).toBe(false);

    const rNoId = await execTodo(tool as never, { action: "toggle" });
    expect(rNoId.details.error).toBe("id required");

    const rUnknown = await execTodo(tool as never, {
      action: "toggle",
      id: 999,
    });
    expect(rUnknown.details.error).toMatch(/not found/);
  });

  it("list reflects current todos and clear resets state", async () => {
    const fake = createFakeExtensionApi();
    todoExtension(fake.api);
    const tool = fake.tools.get("todo")!;

    await execTodo(tool as never, { action: "add", text: "a" });
    await execTodo(tool as never, { action: "add", text: "b" });

    const list = await execTodo(tool as never, { action: "list" });
    expect(list.details.todos).toHaveLength(2);
    expect(list.content[0].text).toMatch(/#1: a/);
    expect(list.content[0].text).toMatch(/#2: b/);

    const cleared = await execTodo(tool as never, { action: "clear" });
    expect(cleared.details.todos).toHaveLength(0);
    expect(cleared.details.nextId).toBe(1);

    // After clear, listing returns "No todos".
    const listAfter = await execTodo(tool as never, { action: "list" });
    expect(listAfter.content[0].text).toBe("No todos");
  });

  it("session_start rebuilds state from prior toolResult entries on the branch", async () => {
    const fake = createFakeExtensionApi();
    todoExtension(fake.api);

    fake.setSessionEntries([
      {
        type: "message",
        message: {
          role: "toolResult",
          toolName: "todo",
          details: {
            action: "add",
            todos: [
              { id: 1, text: "restored A", done: false },
              { id: 2, text: "restored B", done: true },
            ],
            nextId: 3,
          },
        },
      },
    ]);

    await fake.fire("session_start", { type: "session_start" });

    const tool = fake.tools.get("todo")!;
    // Adding a new todo should pick up nextId=3 from the reconstructed state.
    const r = await execTodo(tool as never, { action: "add", text: "C" });
    expect(r.details.todos).toHaveLength(3);
    expect(r.details.todos[2]).toMatchObject({ id: 3, text: "C" });
  });

  it("ignores non-todo toolResult entries during reconstruction", async () => {
    const fake = createFakeExtensionApi();
    todoExtension(fake.api);

    fake.setSessionEntries([
      {
        type: "message",
        message: {
          role: "toolResult",
          toolName: "bash",
          details: { foo: "bar" },
        },
      },
      { type: "custom", customType: "plan-mode", data: { enabled: true } },
    ]);

    await fake.fire("session_start", { type: "session_start" });

    const tool = fake.tools.get("todo")!;
    const r = await execTodo(tool as never, { action: "list" });
    expect(r.details.todos).toHaveLength(0);
  });
});
