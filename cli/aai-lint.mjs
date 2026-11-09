#!/usr/bin/env node
/**
 * aai-lint: checks the public half of a site's AAI (Agent Application Interface), then opens a
 * local app that shows the agent's journey on that site and builds the missing files with you.
 *
 *   npx aai-lint example.com                 report, then the app at http://localhost:4319
 *   npx aai-lint example.com --dir ./public  the app can save the files it builds into ./public
 *   npx aai-lint example.com --no-open       report only
 *   npx aai-lint example.com --json          machine-readable, no app
 *   npx aai-lint example.com --strict        exit 1 if any check fails, no app (for CI)
 *
 * Reads public pages only, about a dozen requests. It is a lint, not the AAI score: "Value before
 * the gate" lives inside the product and needs a walk-through. No dependencies; Node 18+.
 */
import { lint } from "./lint.mjs";

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const target = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--dir" && argv[i - 1] !== "--port");
if (!target || flags.has("--help")) {
  console.log("usage: aai-lint <url> [--dir <folder>] [--port 4319] [--no-open] [--json] [--strict]");
  process.exit(target ? 0 : 2);
}

let result;
try { result = await lint(target); }
catch (e) { console.error(e.message); process.exit(2); }

if (flags.has("--json")) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const tty = process.stdout.isTTY;
const c = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const g = c(32), r = c(33), d = c(2), b = c(1);
console.log(`\n${b("AAI lint")} · ${result.url}\n`);
let dim = "";
for (const k of result.checks) {
  if (k.dim !== dim) { dim = k.dim; console.log(`  ${dim}`); }
  console.log(`    ${k.pass ? g("✓") : r("✗")} ${k.label}  ${d(k.detail)}`);
  if (k.fix) console.log(`      ${d("fix:")} ${k.fix}`);
}
const e = result.estimate;
console.log(`\n  ${result.passed}/${result.total} checks pass · public estimate ${b(e.total + "/75")} (${e.band})${e.capped ? " · capped at 10: agents are blocked" : ""}`);
console.log(d(`  A lint of the public site, not the AAI score. Value before the gate needs a walk-through.`));

if (flags.has("--strict")) process.exit(result.passed < result.total ? 1 : 0);
if (flags.has("--no-open") || process.env.CI) { console.log(""); process.exit(0); }

const { serve } = await import("./serve.mjs");
await serve({ first: result, port: +(opt("--port") || 4319), dir: opt("--dir"), data: opt("--data"), open: !flags.has("--no-browser") });
