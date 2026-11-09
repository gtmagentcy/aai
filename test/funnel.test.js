import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { openStore, journeys, timeToFirstValue, funnel } from "../collector/store.js";
import { classify } from "../lib/agents.js";

const t0 = Date.parse("2026-11-09T10:00:00Z");
const at = (s) => new Date(t0 + s * 1000).toISOString();
const ev = (o) => classify({ site: "t", ...o }, { now: t0 + 86_400_000 });

test("a session and a claim id join into one journey", () => {
  const list = [
    ev({ event: "request", ua: "ChatGPT-User/1.0", path: "/llms.txt", session: "s1", ts: at(0) }),
    ev({ event: "tool_call", ua: "ChatGPT-User/1.0", tool: "quote", session: "s1", cid: "c1", ts: at(5) }),
    ev({ event: "signup_from_agent", cid: "c1", ts: at(600) }),
    ev({ event: "request", ua: "GPTBot/1.2", path: "/", session: "s2", ts: at(1) }),
  ];
  const js = [...journeys(list).values()];
  assert.equal(js.length, 2);
  const j = js.find((x) => x.agent === "chatgpt-user");
  assert.equal(j.events.length, 3);
  assert.equal(j.furthest, "account");
});

test("time to first value counts active gaps only", () => {
  const list = [{ step: "act", ts: at(0) }, { step: "act", ts: at(30) }, { step: "act", ts: at(30 + 3600) }, { step: "first_value", ts: at(30 + 3600 + 20) }];
  assert.equal(timeToFirstValue(list), 50);
  assert.equal(timeToFirstValue([{ step: "first_value", ts: at(0) }]), null);
});

test("funnel is cumulative and drop-offs name the agents", () => {
  const list = [];
  for (let i = 0; i < 10; i++) list.push(ev({ event: "request", ua: "Claude-User/1.0", path: "/", session: "a" + i, ts: at(i) }));
  for (let i = 0; i < 4; i++) list.push(ev({ event: "request", ua: "Claude-User/1.0", path: "/agents.md", session: "a" + i, ts: at(20 + i) }));
  list.push(ev({ event: "first_value", ua: "Claude-User/1.0", tool: "q", session: "a0", ts: at(40) })); // skipped act: still counts at act
  const f = funnel(list, { days: 30, now: t0 + 86_400_000 });
  const n = Object.fromEntries(f.steps.map((s) => [s.id, s.journeys]));
  assert.deepEqual([n.reach, n.understand, n.rules, n.act, n.first_value, n.account], [10, 10, 4, 1, 1, 0]);
  assert.equal(f.dropOffs[0].from, "understand");
  assert.equal(f.dropOffs[0].agents[0].id, "claude-user");
});

test("the store persists to JSONL and reloads", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "aai-"));
  const s1 = await openStore({ dir });
  assert.ok(s1.add({ site: "t", event: "request", ua: "PerplexityBot/1.0", path: "/" }, "server"));
  assert.equal(s1.add({ site: "t", event: "request", ua: "Safari", path: "/" }, "server"), null);
  await s1.flush();
  const s2 = await openStore({ dir });
  assert.equal(s2.events().length, 1);
  assert.equal(s2.sites()[0].site, "t");
});
