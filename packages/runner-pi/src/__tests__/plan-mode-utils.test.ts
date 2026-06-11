import { describe, expect, it } from "vitest";
import {
  cleanStepText,
  extractDoneSteps,
  extractTodoItems,
  isSafeCommand,
  markCompletedSteps,
  type TodoItem,
} from "../extensions/plan-mode/utils.js";

describe("isSafeCommand", () => {
  it.each([
    "ls -la",
    "cat README.md",
    "grep foo src/",
    "git status",
    "git log --oneline -n 5",
    "rg pattern",
    "head -n 10 file.txt",
    "find . -name '*.ts'",
    "node --version",
    "npm list",
  ])("allows read-only command: %s", (cmd) => {
    expect(isSafeCommand(cmd)).toBe(true);
  });

  it.each([
    "rm file.txt",
    "rm -rf /tmp/x",
    "echo hi > out.txt",
    "echo hi >> out.txt",
    "git commit -m 'x'",
    "git push",
    "npm install foo",
    "pnpm add foo",
    "pip install requests",
    "sudo ls",
    "kill -9 1234",
    "vim file.txt",
  ])("blocks destructive command: %s", (cmd) => {
    expect(isSafeCommand(cmd)).toBe(false);
  });

  it("blocks commands not on the allowlist", () => {
    expect(isSafeCommand("totally-unknown-binary --do-stuff")).toBe(false);
  });

  it("treats destructive patterns as priority over safe-looking prefix", () => {
    // ls is safe, but the redirection makes it destructive.
    expect(isSafeCommand("ls > out.txt")).toBe(false);
  });
});

describe("cleanStepText", () => {
  it("strips bold/italic and code formatting", () => {
    expect(cleanStepText("**Update** the `config.json` file")).toBe(
      "Config.json file",
    );
  });

  it("removes leading imperative verbs", () => {
    expect(cleanStepText("Run the migration script")).toBe("Migration script");
    expect(cleanStepText("Delete temp files")).toBe("Temp files");
  });

  it("capitalises the first character", () => {
    expect(cleanStepText("finalise output")).toBe("Finalise output");
  });

  it("truncates long text to 50 characters", () => {
    const long =
      "Audit each module for unused exports and consolidate them somewhere central";
    const out = cleanStepText(long);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith("...")).toBe(true);
  });
});

describe("extractTodoItems", () => {
  it("returns empty array when no Plan: header is present", () => {
    expect(extractTodoItems("Just some text without a plan section.")).toEqual(
      [],
    );
  });

  it("extracts numbered items under Plan: header", () => {
    const message = `Here is what I would do.

Plan:
1. Read the config file
2. Update the timeout value
3. Run the test suite
`;
    const items = extractTodoItems(message);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ step: 1, completed: false });
    expect(items[1]).toMatchObject({ step: 2, completed: false });
    expect(items[2]).toMatchObject({ step: 3, completed: false });
  });

  it("supports bold Plan: header", () => {
    const message = `**Plan:**
1. Read the config file
2. Update the timeout value
`;
    const items = extractTodoItems(message);
    expect(items).toHaveLength(2);
    expect(items[0].text).toMatch(/config file/i);
  });

  it("ignores items shorter than 6 characters or that look like paths/code", () => {
    const message = `Plan:
1. ok
2. \`code block\`
3. /absolute/path
4. - bullet
5. Real meaningful step text
`;
    const items = extractTodoItems(message);
    expect(items).toHaveLength(1);
    expect(items[0].text).toMatch(/meaningful/i);
  });
});

describe("extractDoneSteps", () => {
  it("extracts numbers from [DONE:n] markers", () => {
    expect(extractDoneSteps("did stuff [DONE:1] and more [DONE:3]")).toEqual([
      1, 3,
    ]);
  });

  it("returns empty array when no markers present", () => {
    expect(extractDoneSteps("nothing to see here")).toEqual([]);
  });

  it("ignores invalid numbers", () => {
    expect(extractDoneSteps("[DONE:abc] [DONE:2]")).toEqual([2]);
  });
});

describe("markCompletedSteps", () => {
  it("marks matching items as completed and returns count", () => {
    const items: TodoItem[] = [
      { step: 1, text: "a", completed: false },
      { step: 2, text: "b", completed: false },
      { step: 3, text: "c", completed: false },
    ];
    const count = markCompletedSteps("[DONE:1] [DONE:3]", items);
    expect(count).toBe(2);
    expect(items[0].completed).toBe(true);
    expect(items[1].completed).toBe(false);
    expect(items[2].completed).toBe(true);
  });

  it("ignores DONE markers for unknown step numbers", () => {
    const items: TodoItem[] = [{ step: 1, text: "a", completed: false }];
    const count = markCompletedSteps("[DONE:99]", items);
    expect(count).toBe(1); // count reflects markers found, not items mutated
    expect(items[0].completed).toBe(false);
  });
});
