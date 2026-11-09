/**
 * Access logs to AAI events, for sites that can't run a tap yet. Combined Log Format (nginx,
 * Apache, most CDNs' raw logs). Lines with no agent signal are skipped; the IP is hashed with the
 * day into a session id and then dropped, the same as the server tap.
 */
import { createHash } from "node:crypto";
import { AGENT_UA, isAgentSurface } from "./agents.js";

const LINE = /^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+)[^"]*" (\d{3}) \S+(?: "([^"]*)" "([^"]*)")?/;
const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

export function parseClfDate(s) {
  const m = /^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/.exec(s);
  if (!m) return null;
  const utc = Date.UTC(+m[3], MON[m[2]], +m[1], +m[4], +m[5], +m[6]);
  const off = (+m[8] * 60 + +m[9]) * 60_000 * (m[7] === "+" ? 1 : -1);
  return new Date(utc - off).toISOString();
}

export function* logEvents(text, { site = "default", secret = "aai-log" } = {}) {
  for (const line of String(text).split("\n")) {
    const m = LINE.exec(line);
    if (!m) continue;
    const [, ip, date, method, rawPath, status, referrer = "", ua = ""] = m;
    const path = rawPath.split("?")[0];
    const utm = (/[?&]utm_source=([^&]+)/.exec(rawPath) || [])[1] || "";
    const fromAssistant = /chatgpt\.com|claude\.ai|perplexity\.ai|gemini\.google\.com|copilot\.microsoft\.com/.test(referrer) || utm;
    if (!AGENT_UA.test(ua) && !isAgentSurface(path) && !fromAssistant) continue;
    const ts = parseClfDate(date);
    const session = createHash("sha256").update(`${secret}|${(ts || "").slice(0, 10)}|${ip}|${ua}`).digest("hex").slice(0, 16);
    yield { site, event: AGENT_UA.test(ua) || isAgentSurface(path) ? "request" : "agent_visit", source: "log", ua, path, method, status: +status, referrer, utm: decodeURIComponent(utm), session, ts };
  }
}

/**
 * Google Cloud Logging entries with an httpRequest (Firebase Hosting with Cloud Logging on, Cloud
 * Run, Cloud Load Balancing) to AAI events. The server tap for static hosting: no code in the
 * request path. The entry's insertId becomes the event id, so pulling twice stores nothing twice.
 */
export function* cloudLoggingEvents(entries, { site = "default", secret = "aai-log" } = {}) {
  for (const en of entries) {
    const h = en && en.httpRequest;
    if (!h || !h.requestUrl) continue;
    let u; try { u = new URL(h.requestUrl); } catch { continue; }
    const ua = h.userAgent || "", path = u.pathname, referrer = h.referer || "";
    const utm = u.searchParams.get("utm_source") || "";
    const fromAssistant = /chatgpt\.com|claude\.ai|perplexity\.ai|gemini\.google\.com|copilot\.microsoft\.com/.test(referrer) || utm;
    if (!AGENT_UA.test(ua) && !isAgentSurface(path) && !fromAssistant) continue;
    const ts = en.timestamp || en.receiveTimestamp;
    const session = createHash("sha256").update(`${secret}|${String(ts).slice(0, 10)}|${h.remoteIp || ""}|${ua}`).digest("hex").slice(0, 16);
    yield { id: "gcl-" + String(en.insertId || "").slice(0, 34), site, event: AGENT_UA.test(ua) || isAgentSurface(path) ? "request" : "agent_visit",
      source: "log", ua, path, method: h.requestMethod || "GET", status: +h.status || 200, referrer, utm, session, ts };
  }
}
