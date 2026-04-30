import { createGitProxy } from "./src/shared/git-types.js";

async function main() {
  const url = "http://localhost:3080/api/git/rpc";

  // First ensure volume exists
  await fetch("http://localhost:3080/api/volumes/ensure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ volume: "proxy-test-vol" }),
  });

  const git = createGitProxy(url, fetch, {
    volume: "proxy-test-vol",
    repo: "proxy-repo",
  });

  console.log("1. init");
  await git.init({ defaultBranch: "main" });

  console.log("2. write file via fs api");
  await fetch("http://localhost:3080/api/fs/write", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      volume: "proxy-test-vol",
      path: "proxy-repo/README.md",
      content: "Hello from proxy!",
    }),
  });

  console.log("3. add");
  await git.add({ filepath: "README.md" });

  console.log("4. commit");
  const sha = await git.commit({
    message: "Initial proxy commit",
    author: { name: "Test", email: "test@example.com" },
  });
  console.log("Commit SHA:", sha);

  console.log("5. log");
  const log = await git.log({});
  console.log(log.map((l) => l.commit.message));

  console.log("6. statusMatrix");
  const matrix = await git.statusMatrix({});
  console.log("Matrix:", matrix);

  console.log("Cleanup");
  await fetch("http://localhost:3080/api/volumes/remove", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ volume: "proxy-test-vol" }),
  });
}

main().catch(console.error);
