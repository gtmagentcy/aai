/**
 * The shared core of the server and action taps. Runs anywhere with fetch and Web Crypto: Node 20+,
 * Vercel and Next.js (Node or edge), Cloudflare Workers, Deno, Bun.
 *
 *   const tap = createTap({ collector: "http://localhost:4319", site: "yoursite", secret })
 *   tap.request({ ua, path, method, status, ip, headers })   report a request if it's an agent's
 *   tap.track(event, { cid, session, tool, ua })             report an action (api_call, first_value, signup_from_agent, ...)
 *
 * Privacy: the IP never leaves your server. It is hashed with your secret and the date into a
 * session id that changes every day, so one agent's requests join up without storing who it was.
 * Reporting is fire-and-forget and never throws into your request path.
 */
import { AGENT_UA, isAgentSurface } from "../lib/agents.js";

export function createTap({ collector = "http://localhost:4319", site = "default", secret = "", fetch: f = globalThis.fetch, debug = false } = {}) {
  const endpoint = collector.replace(/\/$/, "") + "/e";
  if (!secret) secret = "aai-" + site; // set a real secret in production so session ids can't be recomputed

  async function sessionId(ip = "", ua = "") {
    const day = new Date().toISOString().slice(0, 10);
    const data = new TextEncoder().encode(`${secret}|${day}|${ip}|${ua}`);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function post(body) {
    const p = f(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ site, ...body }) })
      .then((r) => { if (debug) console.log("[aai]", body.event, body.path || body.tool || "", r.status); })
      .catch((e) => { if (debug) console.warn("[aai] collector unreachable:", e.message); });
    return p;
  }

  /** Should this request be reported? Agent user-agents, signed agents, and anything on an agent surface. */
  function wants({ ua = "", path = "/", headers = {} }) {
    return AGENT_UA.test(ua) || !!header(headers, "signature-agent") || isAgentSurface(path);
  }

  async function request({ ua = "", path = "/", method = "GET", status = 200, ip = "", headers = {}, referrer = "" } = {}) {
    if (!wants({ ua, path, headers })) return null;
    const signatureAgent = header(headers, "signature-agent") || "";
    return post({ event: "request", source: "server", ua, path, method, status, referrer, signatureAgent,
      session: await sessionId(ip, ua), ts: new Date().toISOString() });
  }

  async function track(event, { cid, session, tool, ua = "", ip = "", path } = {}) {
    return post({ event, source: "action", cid, tool, ua, path, session: session || (ip ? await sessionId(ip, ua) : undefined), ts: new Date().toISOString() });
  }

  return { request, track, sessionId, wants, endpoint };
}

export function header(h, name) {
  if (!h) return undefined;
  if (typeof h.get === "function") return h.get(name) ?? undefined;
  const v = h[name] ?? h[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

/** A claim id: anonymous, random, joins an agent's session to the signup that follows. */
export function newCid() {
  return "c_" + [...crypto.getRandomValues(new Uint8Array(9))].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 14);
}

/** The claim link you hand the person: your signup URL with the cid on it. */
export function claimUrl(base, cid) {
  const u = new URL(base);
  u.searchParams.set("aai_cid", cid);
  u.searchParams.set("via", "agent");
  return u.toString();
}
