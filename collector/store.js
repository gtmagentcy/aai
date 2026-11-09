/**
 * The self-hosted event store and the funnel maths. No database: one JSONL file per site under the
 * data folder (default ~/.aai), loaded into memory on start. Fine to a few hundred thousand events;
 * beyond that, point the tag at a hosted collector.
 *
 *   const store = await openStore({ dir })
 *   store.add(raw, source)      classify and append; returns the stored event or null
 *   store.funnel({ site, days }) everything the Funnel page draws
 *   store.journey(key)          one journey, in order (for the session replay)
 *   store.subscribe(fn)         live events, for the dashboard's stream
 */
import { mkdir, readFile, appendFile, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { classify, STEPS, STEP_IDS, agentById } from "../lib/agents.js";

const ACTIVE_GAP = 15 * 60_000;

export async function openStore({ dir = path.join(os.homedir(), ".aai"), max = 500_000 } = {}) {
  await mkdir(dir, { recursive: true });
  const events = [];
  for (const f of (await readdir(dir)).filter((f) => f.endsWith(".jsonl"))) {
    for (const line of (await readFile(path.join(dir, f), "utf8")).split("\n")) {
      if (!line) continue;
      try { events.push(JSON.parse(line)); } catch {}
    }
  }
  events.sort((a, b) => (a.ts < b.ts ? -1 : 1));
  const seen = new Set(events.map((e) => e.id));
  const subs = new Set();
  const fileOf = (site) => path.join(dir, String(site).replace(/[^\w.-]/g, "_") + ".jsonl");

  let queue = Promise.resolve();
  function add(raw, source) {
    if (raw && raw.id && seen.has(String(raw.id).slice(0, 40))) return null; // already stored (a re-run pull or import)
    const e = classify({ ...raw, source: source || raw.source });
    if (!e) return null;
    seen.add(e.id);
    events.push(e);
    if (events.length > max) events.splice(0, events.length - max);
    queue = queue.then(() => appendFile(fileOf(e.site), JSON.stringify(e) + "\n")).catch(() => {});
    for (const fn of subs) { try { fn(e); } catch {} }
    return e;
  }

  function sites() {
    const m = {};
    for (const e of events) { if (e.event === "test") continue; const s = (m[e.site] ||= { site: e.site, events: 0, last: null }); s.events++; s.last = e.ts; }
    return Object.values(m).sort((a, b) => (a.last < b.last ? 1 : -1));
  }

  return { dir, add, sites, events: () => events, funnel: (o) => funnel(events, o), journey: (k, o) => journeys(filter(events, o)).get(k) || null, subscribe: (fn) => (subs.add(fn), () => subs.delete(fn)), flush: () => queue };
}

function filter(events, { site, days = 30, now = Date.now(), test = false } = {}) {
  const since = new Date(now - days * 86_400_000).toISOString();
  return events.filter((e) => e.ts >= since && (!site || e.site === site) && (test || e.event !== "test"));
}

/**
 * Journeys: events joined by session id and by claim id (cid). An MCP session that issues a cid,
 * and the signup that carries it, become one journey. Events with neither stand alone.
 */
export function journeys(events) {
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { for (const k of [a, b]) if (!parent.has(k)) parent.set(k, k); const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  const keyOf = (e) => (e.session ? "s:" + e.session : e.cid ? "c:" + e.cid : "e:" + e.id);
  for (const e of events) {
    const k = keyOf(e);
    if (!parent.has(k)) parent.set(k, k);
    if (e.session && e.cid) union("s:" + e.session, "c:" + e.cid);
  }
  const out = new Map();
  for (const e of events) {
    const root = find(keyOf(e));
    let j = out.get(root);
    if (!j) out.set(root, (j = { key: root, site: e.site, events: [], steps: new Set(), agent: null, kind: null }));
    j.events.push(e);
    if (e.step) j.steps.add(e.step);
    // The journey's agent is the most specific one seen (a named agent beats "unknown").
    if (!j.agent || (j.agent === "unknown" && e.agent !== "unknown")) { j.agent = e.agent; j.kind = e.kind; }
  }
  for (const j of out.values()) {
    j.events.sort((a, b) => (a.ts < b.ts ? -1 : 1));
    j.start = j.events[0].ts; j.end = j.events.at(-1).ts;
    j.furthest = STEP_IDS.filter((s) => j.steps.has(s)).at(-1) || null;
    j.ttfv = timeToFirstValue(j.events);
  }
  return out;
}

/** Active seconds from the first action to the first value; gaps over 15 minutes don't count. */
export function timeToFirstValue(list) {
  const start = list.findIndex((e) => e.step === "act");
  const fv = list.findIndex((e) => e.step === "first_value");
  if (start < 0 || fv < 0 || fv < start) return null;
  let active = 0;
  for (let i = start + 1; i <= fv; i++) {
    const gap = Date.parse(list[i].ts) - Date.parse(list[i - 1].ts);
    if (gap > 0 && gap < ACTIVE_GAP) active += gap;
  }
  return Math.round(active / 1000);
}

const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

/** Everything the Funnel page draws. A journey counts at a step if it reached that step or any later one. */
export function funnel(all, opts = {}) {
  const events = filter(all, opts);
  const js = [...journeys(events).values()];
  const idx = (s) => STEP_IDS.indexOf(s);
  const reached = (j, s) => j.furthest && idx(j.furthest) >= idx(s);

  const steps = STEPS.map((s) => ({ ...s, journeys: js.filter((j) => reached(j, s.id)).length, events: events.filter((e) => e.step === s.id).length }));
  steps.forEach((s, i) => { s.rate = i === 0 ? null : steps[i - 1].journeys ? Math.round((s.journeys / steps[i - 1].journeys) * 100) : null; });

  const byAgent = {};
  for (const j of js) {
    const a = (byAgent[j.agent] ||= { ...pick(agentById(j.agent)), kind: j.kind, journeys: 0, steps: Object.fromEntries(STEP_IDS.map((s) => [s, 0])) });
    a.journeys++;
    for (const s of STEP_IDS) if (reached(j, s)) a.steps[s]++;
  }
  const agents = Object.values(byAgent).sort((a, b) => b.journeys - a.journeys);

  // Where journeys stop: the step after a journey's furthest. Only journeys made for a person count:
  // crawlers and AI search only ever reach Reach by design, so they never "drop off".
  const forPerson = js.filter((j) => j.kind !== "crawler" && j.kind !== "search");
  const at = (s) => forPerson.filter((j) => reached(j, s)).length;
  const dropOffs = [];
  for (let i = 1; i < STEPS.length; i++) {
    const before = at(STEP_IDS[i - 1]), after = at(STEP_IDS[i]);
    if (!before || before === after) continue;
    if (STEP_IDS[i] === "activated" && !after) continue; // this site doesn't send activation yet: not a drop-off
    const lost = forPerson.filter((j) => j.furthest === STEP_IDS[i - 1]);
    const who = {};
    for (const j of lost) who[j.agent] = (who[j.agent] || 0) + 1;
    dropOffs.push({ from: STEP_IDS[i - 1], to: STEP_IDS[i], lost: before - after, rate: Math.round(((before - after) / before) * 100),
      agents: Object.entries(who).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, n]) => ({ id, label: agentById(id).label, n })) });
  }
  dropOffs.sort((a, b) => b.lost - a.lost);

  const ttfv = js.map((j) => j.ttfv).filter((x) => x != null);
  const count = (ev) => events.filter((e) => e.event === ev).length;
  const recent = js.filter((j) => j.steps.size > 1 || j.events.some((e) => e.step && idx(e.step) >= idx("act")))
    .sort((a, b) => (a.end < b.end ? 1 : -1)).slice(0, 25)
    .map((j) => ({ key: j.key, agent: j.agent, label: agentById(j.agent).label, kind: j.kind, start: j.start, end: j.end, furthest: j.furthest, events: j.events.length, ttfv: j.ttfv }));

  const days = {};
  for (const e of events) { const d = e.ts.slice(0, 10); (days[d] ||= { day: d, events: 0, act: 0 }).events++; if (e.step === "act") days[d].act++; }

  return {
    site: opts.site || null, days: opts.days || 30, total: events.length, journeys: js.length,
    steps, agents, dropOffs, recent, daily: Object.values(days).sort((a, b) => (a.day < b.day ? -1 : 1)),
    metrics: {
      agentJourneys: js.length,
      acted: steps.find((s) => s.id === "act").journeys,
      firstValue: steps.find((s) => s.id === "first_value").journeys,
      signups: count("signup_from_agent"),
      promptCopies: count("prompt_copy"),
      referrals: js.filter((j) => j.kind === "referral").length,
      medianTimeToFirstValueSec: median(ttfv),
      sources: [...new Set(events.map((e) => e.source))],
    },
  };
}

function pick(a) { return { id: a.id, label: a.label, vendor: a.vendor, confirmed: a.confirmed }; }
