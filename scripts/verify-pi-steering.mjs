import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

assert.ok(process.argv[2], "Usage: node scripts/verify-pi-steering.mjs <daemon bundle.mjs>");
const artifact = resolve(process.argv[2]);

const testRoot = await mkdtemp(join(tmpdir(), "bunny-cli-preemption-"));
const requests = [];
const sockets = new Set();
let firstClosed = false;
const model = createServer(async (request, response) => {
  sockets.add(response);
  response.on("close", () => sockets.delete(response));
  try {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    requests.push(body);
    response.writeHead(200, { "content-type": "text/event-stream" });
    const emit = (delta, finishReason = null) =>
      response.write(
        `data: ${JSON.stringify({
          id: `fixture-${requests.length}`,
          object: "chat.completion.chunk",
          created: 1,
          model: body.model,
          choices: [{ index: 0, delta, finish_reason: finishReason }],
        })}\n\n`,
      );
    emit({ role: "assistant", content: requests.length === 1 ? "OLD_PARTIAL" : "STEER_OK" });
    if (requests.length === 1)
      response.on("close", () => {
        firstClosed = true;
      });
    else {
      emit({}, "stop");
      response.end("data: [DONE]\n\n");
    }
  } catch (error) {
    response.writeHead(500);
    response.end(String(error));
  }
});
await new Promise((resolve) => model.listen(0, "127.0.0.1", resolve));
const modelPort = model.address().port;
const portReservation = createServer();
await new Promise((resolve) => portReservation.listen(0, "127.0.0.1", resolve));
const port = portReservation.address().port;
await new Promise((resolve) => portReservation.close(resolve));
const workdir = join(testRoot, "agent");
await mkdir(workdir);
const daemon = spawn(process.execPath, [artifact], {
  cwd: workdir,
  env: {
    ...process.env,
    BUNNY_AGENT_DAEMON_HOST: "127.0.0.1",
    BUNNY_AGENT_DAEMON_PORT: String(port),
    BUNNY_AGENT_ROOT: workdir,
    PI_CODING_AGENT_DIR: join(testRoot, "pi"),
    BUNNY_CODING_CONTROL_STATE_DIR: join(testRoot, "control"),
    OPENAI_API_KEY: "local-fixture-key",
    OPENAI_BASE_URL: `http://127.0.0.1:${modelPort}/v1`,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
let streamError;
let streamCompleted = false;
let output = "";
daemon.on("exit", (code, signal) => {
  logs += `\nCHILD_EXIT code=${code} signal=${signal}`;
});
daemon.stdout.on("data", (chunk) => {
  logs += chunk;
});
daemon.stderr.on("data", (chunk) => {
  logs += chunk;
});
const base = `http://127.0.0.1:${port}`;
const control = { version: 1, runId: randomUUID(), token: randomBytes(32).toString("base64url") };
const post = (path, body) =>
  fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
async function until(predicate, label, timeout = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (streamError) throw new Error(`Run stream failed: ${streamError}\n${logs}`);
    if (await predicate()) return;
    if (daemon.exitCode !== null) throw new Error(`Daemon exited: ${logs}`);
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`Timed out: ${label}\n${logs}`);
}
try {
  await until(async () => {
    try {
      return (await fetch(`${base}/healthz`)).ok;
    } catch {
      return false;
    }
  }, "CLI startup");
  const health = await (await fetch(`${base}/healthz`)).json();
  assert.equal(health.data.capabilities.codingControl.supportedPiSteerPreempt, true);
  const run = await post("/api/coding/run", {
    runner: "pi",
    model: "steer-smoke:fixture-model",
    userInput: "write a long answer",
    cwd: workdir,
    yolo: true,
    effort: "off",
    allowedTools: [],
    control,
    env: {
      STEER_SMOKE_API_KEY: "local-fixture-key",
      STEER_SMOKE_BASE_URL: `http://127.0.0.1:${modelPort}/v1`,
    },
  });
  assert.equal(run.status, 200);
  const completed = (async () => {
    for await (const chunk of run.body) output += Buffer.from(chunk).toString();
    streamCompleted = true;
  })().catch((error) => {
    streamError = error;
  });
  await until(() => output.includes("OLD_PARTIAL"), "first unfinished completion");
  const before = await (
    await post("/api/coding/control", { ...control, operation: "status" })
  ).json();
  assert.equal(before.active, true);
  assert.equal(before.ready, true);
  assert.equal(before.supportedPiSteerPreempt, true);
  const sentAt = performance.now();
  const receipt = await (
    await post("/api/coding/control", {
      ...control,
      operation: "steer",
      message: { id: "smoke-steer", text: "change direction immediately" },
    })
  ).json();
  assert.ok(["accepted", "consumed"].includes(receipt.receipt.state));
  await until(() => output.includes("STEER_OK"), "preempted continuation");
  await until(() => streamCompleted, "logical run completion");
  await completed;
  const after = await (
    await post("/api/coding/control", { ...control, operation: "status" })
  ).json();
  assert.equal(requests.length, 2);
  assert.ok(JSON.stringify(requests[1].messages).includes("change direction immediately"));
  assert.ok(
    requests[1].messages.some(
      (message) =>
        message.role === "assistant" && JSON.stringify(message.content).includes("OLD_PARTIAL"),
    ),
    "The provider must receive the real partial assistant before the steering input",
  );
  assert.equal(after.receipts.find((item) => item.id === "smoke-steer").state, "consumed");
  assert.equal(after.active, false);
  assert.equal(firstClosed, true);
  assert.equal((output.match(/"type":"finish"/g) ?? []).length, 1);
  assert.ok(!output.includes('"finishReason":"error"'));
  console.log(
    JSON.stringify({
      status: "pass",
      artifact,
      requests: requests.length,
      steeringLatencyMs: Math.round(performance.now() - sentAt),
      receipt: after.receipts[0].state,
      firstTransportClosed: firstClosed,
      oneOuterFinish: true,
    }),
  );
} catch (error) {
  console.error(
    `CLI_SMOKE_FAILURE ${error}\n${logs}\nRUN_OUTPUT ${output}\nREQUESTS ${requests.length}`,
  );
  throw error;
} finally {
  // Only terminate the child this script created, never an existing daemon.
  if (daemon.exitCode === null) {
    daemon.kill("SIGTERM");
    await new Promise((resolve) => daemon.once("exit", resolve));
  }
  for (const response of sockets) response.destroy();
  model.closeAllConnections();
  await new Promise((resolve) => model.close(resolve));
  await rm(testRoot, { recursive: true, force: true });
}
