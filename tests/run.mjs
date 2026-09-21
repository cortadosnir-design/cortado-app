#!/usr/bin/env node
// מריץ את כל הבדיקות: מרים שרת סטטי, בונה את ה-harness, מריץ, מנקה.
//   node tests/run.mjs
import { spawn } from "child_process";
import { build, clean } from "./harness.mjs";

const PORT = process.env.PORT || 8899;
const ROOT = new URL("..", import.meta.url).pathname;
const run = (cmd, args, env) => new Promise(res =>
  spawn(cmd, args, { stdio: "inherit", cwd: ROOT, env: { ...process.env, ...env } }).on("close", res));

build();
const server = spawn("npx", ["--yes", "http-server", ROOT, "-p", String(PORT), "-s"],
  { cwd: ROOT, stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));

let code = 0;
code |= await run("node", ["tests/ui.mjs"], { PORT });
code |= await run("node", ["tests/worker.mjs"]);
code |= await run("node", ["tests/version.mjs"]);
code |= await run("node", ["tests/table.mjs"]);

server.kill();
clean();
process.exit(code ? 1 : 0);
