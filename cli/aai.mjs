#!/usr/bin/env node
/**
 * aai: check a site's AAI, build the files, and measure the agent funnel. No dependencies; Node 20+.
 *
 *   aai example.com                    lint the site, then open the dashboard at http://localhost:4319
 *   aai serve                          the dashboard and collector, no lint (Funnel, Install, Ask)
 *   aai serve --host 0.0.0.0           also accept events from other machines (the dashboard stays local)
 *   aai import access.log --site you   load agent traffic from an access log
 *   aai demo                           run a demo site with all three taps and send it agent traffic
 *
 * Shared flags: --port 4319, --data <folder> (default ~/.aai), --dir <folder> (where the builder saves), --no-open
 */
import { readFile } from "node:fs/promises";
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const VALUED = new Set(["--dir", "--port", "--data", "--host", "--site"]);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const pos = argv.filter((a, i) => !a.startsWith("--") && !VALUED.has(argv[i - 1]));
const cmd = pos[0];

if (!cmd || flags.has("--help")) {
  console.log(`usage:
  aai <url> [--dir <folder>]        lint a site, then open the dashboard
  aai serve [--host 0.0.0.0]        dashboard + collector
  aai import <access.log> --site <key>
  aai demo                          demo site + simulated agents
  shared: --port 4319 --data ~/.aai --no-open`);
  process.exit(cmd ? 0 : 2);
}

const common = { port: +(opt("--port") || 4319), data: opt("--data"), dir: opt("--dir"), host: opt("--host") || "127.0.0.1", open: !flags.has("--no-open") && !process.env.CI };

if (cmd === "serve") {
  const { serve } = await import("./serve.mjs");
  await serve(common);
} else if (cmd === "import") {
  const file = pos[1];
  if (!file) { console.error("usage: aai import <access.log> --site <key>"); process.exit(2); }
  const { openStore } = await import("../collector/store.js");
  const { logEvents } = await import("../lib/logs.js");
  const store = await openStore(common.data ? { dir: common.data } : {});
  let seen = 0, kept = 0;
  for (const e of logEvents(await readFile(file, "utf8"), { site: opt("--site") || "default" })) { seen++; if (store.add(e, "log")) kept++; }
  await store.flush();
  console.log(`Read ${seen} agent lines, kept ${kept} events for ${opt("--site") || "default"} in ${store.dir}. Open the dashboard with: aai serve`);
} else if (cmd === "demo") {
  const { runDemo } = await import("../examples/demo-site/demo.mjs");
  await runDemo(common);
} else {
  const { lint } = await import("./lint.mjs");
  let result;
  try { result = await lint(cmd); } catch (e) { console.error(e.message); process.exit(2); }
  console.log(`\nAAI lint · ${result.url}: ${result.passed}/${result.total} checks pass · public estimate ${result.estimate.total}/75 (${result.estimate.band})`);
  const { serve } = await import("./serve.mjs");
  await serve({ ...common, first: result });
}
