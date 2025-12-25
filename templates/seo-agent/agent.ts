import "dotenv/config";
import { query } from "@anthropic-ai/claude-agent-sdk";
import process from "node:process";
import fs from "node:fs";
import path from "node:path";

// Generate timestamp: YYMMDD-HHMM
const now = new Date();
const timestamp = now.getFullYear().toString().slice(-2) +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') + "-" +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0');

const outputDir = path.join(process.cwd(), "output");
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const fullLogPath = path.join(outputDir, `${timestamp}-full.log`);
const readableLogPath = path.join(outputDir, `${timestamp}-readable.log`);

function logFull(message: any) {
    fs.appendFileSync(fullLogPath, JSON.stringify(message, null, 2) + "\n\n---\n\n");
}

function logReadable(text: string) {
    console.log(text);
    fs.appendFileSync(readableLogPath, text + "\n");
}

// Agentic loop: streams messages as Claude works
for await (const message of query({
    //prompt: "What Skills are available?",
    prompt: "Analyze keywords for 'automate twitter posts' and identify high-value opportunities",
    options: {
        model: "claude-sonnet-4-5-20250929",
        settingSources: ["project"],
        allowedTools: ["Skill", "Read", "Write", "Bash", "Glob", "Grep", "WebSearch", "WebFetch"],  // Tools Claude can use
        permissionMode: "acceptEdits"  // Auto-approve file edits
    }
})) {
    // 1. Always write the "full" message to the full log
    logFull(message);

    // 2. Extract and print human-readable output to console and readable log
    if (message.type === "assistant" && message.message?.content) {
        for (const block of message.message.content) {
            if ("text" in block) {
                logReadable(block.text);             // Claude's reasoning
            } else if ("name" in block) {
                logReadable(`Tool: ${block.name}`);  // Tool being called
            }
        }
    } else if (message.type === "result") {
        logReadable(`Done: ${message.subtype}`); // Final result
    }
}