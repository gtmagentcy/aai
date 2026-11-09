import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { serve } from "../cli/serve.mjs";
import { demoSite, simulate } from "../examples/demo-site/demo.mjs";

test("demo site → three taps → collector → funnel, journey, MCP", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "aai-e2e-"));
  const dash = await serve({ port: 4491, data: dir, open: false, quiet: true });
  const { server, origin } = await demoSite({ collector: dash.origin, port: 4492 });
  try {
    await simulate({ origin, collector: dash.origin });
    await new Promise((r) => setTimeout(r, 300));
    const f = await (await fetch(dash.origin + "/api/funnel?site=roomly-demo")).json();
    const n = Object.fromEntries(f.steps.map((s) => [s.id, s.journeys]));
    assert.ok(n.reach > n.understand && n.understand > n.rules && n.rules > n.act && n.act > n.first_value && n.first_value > n.account && n.account > 0, JSON.stringify(n));
    assert.equal(f.metrics.signups, 12);
    assert.equal(n.activated, 4);
    assert.deepEqual(f.metrics.sources.sort(), ["action", "browser", "server"]);
    const key = f.recent.find((r) => r.furthest === "activated").key;
    const j = await (await fetch(dash.origin + "/api/journey?key=" + encodeURIComponent(key))).json();
    assert.deepEqual([...new Set(j.events.map((e) => e.step))], ["understand", "rules", "act", "first_value", "account", "activated"]);
    const tag = await fetch(dash.origin + "/aai.js");
    assert.equal(tag.headers.get("access-control-allow-origin"), "*");
    const m = await (await fetch(dash.origin + "/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_fix_prompt", arguments: { step: "rules" } } }) })).json();
    assert.match(m.result.content[0].text, /agents\.md/);
  } finally {
    server.close(); dash.close();
  }
});
