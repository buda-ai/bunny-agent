"use client";

import {
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleDotIcon,
  CircleIcon,
  ListTodoIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { createContext, useContext } from "react";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { Shimmer } from "./shimmer";

/**
 * Todo item status types
 */
export type TodoStatus = "pending" | "in_progress" | "completed";

/**
 * Single todo item data structure
 */
export interface TodoItem {
  content: string;
  status: TodoStatus;
  activeForm?: string;
}

/**
 * TodoWrite tool input structure
 */
export interface TodoWriteInput {
  todos: TodoItem[];
}

type TodoContextValue = {
  isStreaming: boolean;
};

const TodoContext = createContext<TodoContextValue | null>(null);

const useTodo = () => {
  const context = useContext(TodoContext);
  if (!context) {
    throw new Error("Todo components must be used within Todo");
  }
  return context;
};

// ============ Root Component ============

export type TodoProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
};

export const Todo = ({
  className,
  isStreaming = false,
  defaultOpen = true,
  children,
  ...props
}: TodoProps) => (
  <TodoContext.Provider value={{ isStreaming }}>
    <Collapsible
      className={cn(
        "not-prose mb-4 w-full max-w-full rounded-md border bg-card",
        className,
      )}
      defaultOpen={defaultOpen}
      data-slot="todo"
      {...props}
    >
      {children}
    </Collapsible>
  </TodoContext.Provider>
);

// ============ Header Component ============

export type TodoHeaderProps = ComponentProps<typeof CollapsibleTrigger> & {
  title?: string;
  completedCount?: number;
  totalCount?: number;
};

export const TodoHeader = ({
  className,
  title = "Todo List",
  completedCount = 0,
  totalCount = 0,
  ...props
}: TodoHeaderProps) => {
  const { isStreaming } = useTodo();

  return (
    <CollapsibleTrigger
      className={cn(
        "group flex w-full items-center justify-between gap-4 p-3",
        className,
      )}
      data-slot="todo-header"
      {...props}
    >
      <div className="flex items-center gap-2">
        <ListTodoIcon className="size-4 text-muted-foreground" />
        <span className="font-medium text-sm">
          {isStreaming ? <Shimmer>{title}</Shimmer> : title}
        </span>
        <Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
          {completedCount}/{totalCount}
        </Badge>
      </div>
      <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
  );
};

// ============ Content Component ============

export type TodoContentProps = ComponentProps<typeof CollapsibleContent>;

export const TodoContent = ({ className, ...props }: TodoContentProps) => (
  <CollapsibleContent
    className={cn(
      "min-w-0 overflow-hidden data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className,
    )}
    data-slot="todo-content"
    {...props}
  />
);

// ============ List Component ============

export type TodoListProps = ComponentProps<"ul">;

export const TodoList = ({ className, ...props }: TodoListProps) => (
  <ul
    className={cn("space-y-1 px-3 pb-3", className)}
    data-slot="todo-list"
    {...props}
  />
);

// ============ Item Component ============

const getStatusIcon = (status: TodoStatus): ReactNode => {
  const icons: Record<TodoStatus, ReactNode> = {
    pending: <CircleIcon className="size-4 text-muted-foreground" />,
    in_progress: (
      <CircleDotIcon className="size-4 text-blue-500 animate-pulse" />
    ),
    completed: <CheckCircle2Icon className="size-4 text-green-500" />,
  };
  return icons[status];
};

export type TodoItemProps = ComponentProps<"li"> & {
  item: TodoItem;
};

export const TodoItemComponent = ({
  className,
  item,
  ...props
}: TodoItemProps) => {
  const { isStreaming } = useTodo();
  const displayText = item.activeForm || item.content;

  return (
    <li
      className={cn(
        "flex items-start gap-2 py-1.5 text-sm",
        item.status === "completed" && "text-muted-foreground",
        className,
      )}
      data-slot="todo-item"
      data-status={item.status}
      {...props}
    >
      <span className="mt-0.5 flex-shrink-0">{getStatusIcon(item.status)}</span>
      <span
        className={cn(
          "flex-1",
          item.status === "completed" && "line-through",
          item.status === "in_progress" && "font-medium text-foreground",
        )}
      >
        {isStreaming && item.status === "in_progress" ? (
          <Shimmer>{displayText}</Shimmer>
        ) : (
          displayText
        )}
      </span>
    </li>
  );
};

// ============ Composed Component ============

export type TodoViewProps = {
  todos: TodoItem[];
  title?: string;
  isStreaming?: boolean;
  defaultOpen?: boolean;
  className?: string;
};

/**
 * A composed Todo component that renders a complete todo list
 * from TodoWrite tool input
 */
export const TodoView = ({
  todos,
  title = "Todo List",
  isStreaming = false,
  defaultOpen = true,
  className,
}: TodoViewProps) => {
  const completedCount = todos.filter((t) => t.status === "completed").length;
  const totalCount = todos.length;

  return (
    <Todo
      isStreaming={isStreaming}
      defaultOpen={defaultOpen}
      className={className}
    >
      <TodoHeader
        title={title}
        completedCount={completedCount}
        totalCount={totalCount}
      />
      <TodoContent>
        <TodoList>
          {todos.map((item, index) => (
            <TodoItemComponent key={`${item.content}-${index}`} item={item} />
          ))}
        </TodoList>
      </TodoContent>
    </Todo>
  );
};

// ============ Helper Functions ============

/**
 * Check if the tool input is a TodoWrite input
 */
export function isTodoWriteInput(input: unknown): input is TodoWriteInput {
  if (!input || typeof input !== "object") return false;
  const obj = input as Record<string, unknown>;
  if (!Array.isArray(obj.todos)) return false;
  return obj.todos.every(
    (item: unknown) =>
      item &&
      typeof item === "object" &&
      "content" in item &&
      "status" in item &&
      typeof (item as TodoItem).content === "string" &&
      ["pending", "in_progress", "completed"].includes(
        (item as TodoItem).status,
      ),
  );
}
