#!/usr/bin/env node
// מריץ את כל הבדיקות: השרת (worker), בחירת המודל, רשימת המייסדים, ודף העגלה עם השעות.
//   node tests/run.mjs
import { spawn } from "child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const run = (file) => new Promise(res => spawn("node", [file], { stdio: "inherit", cwd: ROOT }).on("close", res));

let code = 0;
for (const f of ["tests/worker.mjs", "tests/admins.mjs", "tests/hours.mjs"]) code |= await run(f);
process.exit(code ? 1 : 0);
