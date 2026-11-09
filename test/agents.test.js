import { test } from "node:test";
import assert from "node:assert/strict";
import { identify, classify, stepOf, AGENT_UA, AGENTS, isAgentSurface } from "../lib/agents.js";
import { logEvents, parseClfDate } from "../lib/logs.js";

test("identifies agents by user-agent, most specific first", () => {
  assert.equal(identify({ ua: "Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)" }).agent, "chatgpt-user");
  assert.equal(identify({ ua: "Claude-User (claude-code/2.1.90)" }).agent, "claude-code");
  assert.equal(identify({ ua: "Mozilla/5.0 Claude-User/1.0" }).agent, "claude-user");
  assert.equal(identify({ ua: "Mozilla/5.0 (compatible; GPTBot/1.2)" }).kind, "crawler");
});

test("a signed agent beats its user-agent", () => {
  assert.deepEqual(identify({ ua: "Mozilla/5.0 Chrome/140", signatureAgent: '"https://chatgpt.com"' }), { agent: "chatgpt-agent", kind: "browser", via: "signature" });
});

test("referrals: full URLs and utm_source, no false positives", () => {
  assert.equal(identify({ referrer: "https://chatgpt.com/" }).agent, "chatgpt-user");
  assert.equal(identify({ referrer: "https://www.perplexity.ai/search/x" }).kind, "referral");
  assert.equal(identify({ utm: "chatgpt.com" }).via, "utm");
  assert.equal(identify({ referrer: "https://notchatgpt.com/" }).agent, null);
  assert.equal(identify({ referrer: "https://www.google.com/" }).agent, null);
});

test("every token is in the fast regex", () => {
  for (const a of AGENTS) for (const t of a.tokens) assert.ok(AGENT_UA.test(`x ${t} y`), t);
  assert.ok(!AGENT_UA.test("Mozilla/5.0 (Macintosh) Safari/605.1.15"));
});

test("steps: crawlers only reach; agent surfaces map to their step", () => {
  assert.equal(stepOf({ event: "request", path: "/llms.txt", kind: "crawler" }), "reach");
  assert.equal(stepOf({ event: "request", path: "/llms.txt", kind: "user" }), "understand");
  assert.equal(stepOf({ event: "request", path: "/agents.md", kind: "user" }), "rules");
  assert.equal(stepOf({ event: "request", path: "/mcp", method: "POST", kind: "user" }), "act");
  assert.equal(stepOf({ event: "request", path: "/x", status: 404, kind: "user" }), null);
  assert.equal(stepOf({ event: "first_value" }), "first_value");
  assert.equal(stepOf({ event: "signup_from_agent" }), "account");
});

test("classify keeps no human page views and no personal fields", () => {
  assert.equal(classify({ event: "request", ua: "Mozilla/5.0 Safari", path: "/pricing" }), null);
  assert.equal(classify({ event: "agent_visit", ua: "Mozilla/5.0 Safari", referrer: "https://google.com/" }), null);
  const e = classify({ event: "request", ua: "curl/8", path: "/llms.txt", ip: "1.2.3.4", email: "a@b.c" });
  assert.equal(e.agent, "script");
  assert.ok(!("ip" in e) && !("email" in e) && !("ua" in e));
  assert.ok(isAgentSurface("/.well-known/mcp.json"));
});

test("access logs: CLF dates, agent lines only", () => {
  assert.equal(parseClfDate("10/Nov/2026:13:55:36 +0200"), "2026-11-10T11:55:36.000Z");
  const log = [
    '1.1.1.1 - - [10/Nov/2026:13:55:36 +0000] "GET /llms.txt HTTP/1.1" 200 512 "-" "Mozilla/5.0 Claude-User/1.0"',
    '2.2.2.2 - - [10/Nov/2026:13:55:37 +0000] "GET /pricing HTTP/1.1" 200 512 "https://www.google.com/" "Mozilla/5.0 Safari"',
    '3.3.3.3 - - [10/Nov/2026:13:55:38 +0000] "GET /?utm_source=chatgpt.com HTTP/1.1" 200 512 "-" "Mozilla/5.0 Safari"',
  ].join("\n");
  const out = [...logEvents(log, { site: "t" })];
  assert.equal(out.length, 2);
  assert.ok(out.every((e) => !("ip" in e) && e.session.length === 16));
});

test("Cloud Logging entries: agents only, insertId as the event id", async () => {
  const { cloudLoggingEvents } = await import("../lib/logs.js");
  const entries = [
    { insertId: "a1", timestamp: "2026-11-09T10:00:00Z", httpRequest: { requestUrl: "https://gtmagentcy.com/llms.txt", requestMethod: "GET", status: 200, userAgent: "Mozilla/5.0 Claude-User/1.0", remoteIp: "1.2.3.4" } },
    { insertId: "a2", timestamp: "2026-11-09T10:00:01Z", httpRequest: { requestUrl: "https://gtmagentcy.com/pricing", requestMethod: "GET", status: 200, userAgent: "Mozilla/5.0 Safari", remoteIp: "5.6.7.8" } },
    { insertId: "a3", timestamp: "2026-11-09T10:00:02Z", httpRequest: { requestUrl: "https://gtmagentcy.com/?utm_source=chatgpt.com", status: 200, userAgent: "Mozilla/5.0 Safari", remoteIp: "9.9.9.9" } },
  ];
  const out = [...cloudLoggingEvents(entries, { site: "t" })];
  assert.deepEqual(out.map((e) => e.id), ["gcl-a1", "gcl-a3"]);
  assert.ok(out.every((e) => !("remoteIp" in e) && !("ip" in e)));
});

test("the store never stores the same event id twice", async () => {
  const { mkdtemp } = await import("node:fs/promises");
  const os = await import("node:os"), path = await import("node:path");
  const { openStore } = await import("../collector/store.js");
  const s = await openStore({ dir: await mkdtemp(path.join(os.tmpdir(), "aai-dd-")) });
  const e = { id: "x1", site: "t", event: "request", ua: "GPTBot/1.2", path: "/" };
  assert.ok(s.add(e, "log"));
  assert.equal(s.add(e, "log"), null);
});

test("classified events have no undefined fields (Firestore rejects them)", () => {
  const e = classify({ event: "tool_call", ua: "Claude-User/1.0", tool: "x" });
  assert.ok(Object.values(e).every((v) => v !== undefined), JSON.stringify(e));
});
