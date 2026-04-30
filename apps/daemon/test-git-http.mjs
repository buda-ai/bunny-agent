import * as fs from "node:fs";
import * as git from "isomorphic-git";
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const httpNode = require('isomorphic-git/http/node');

async function main() {
  await git.init({ fs, dir: "test-repo2" });
  const log = await git.log({ fs, dir: "test-repo2", http: httpNode });
  console.log("Success", log.length);
}
main().catch(console.error);
