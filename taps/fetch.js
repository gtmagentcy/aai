/**
 * Server tap for fetch-style runtimes: Next.js middleware, Vercel Routing Middleware and
 * Functions, Cloudflare Workers, Deno, Bun, Hono.
 *
 *   // Cloudflare Worker / any (request) => Response handler
 *   import { withAai } from "aai/taps/fetch.js";
 *   export default { fetch: withAai(handler, { site: "yoursite", collector: "https://..." }) };
 *
 *   // Next.js middleware.ts (status is not known in middleware; counted as 200)
 *   import { observe } from "aai/taps/fetch.js";
 *   export function middleware(req, ev) { ev.waitUntil(observe(req, { site: "yoursite" })); }
 */
import { createTap } from "./core.js";

const taps = new Map();
function tapFor(opts) {
  if (opts.tap) return opts.tap;
  const k = JSON.stringify([opts.collector, opts.site]);
  if (!taps.has(k)) taps.set(k, createTap(opts));
  return taps.get(k);
}

function ipOf(req) {
  const h = req.headers;
  return h.get("cf-connecting-ip") || h.get("x-real-ip") || (h.get("x-forwarded-for") || "").split(",")[0].trim() || "";
}

export function observe(req, opts = {}, status = 200) {
  const u = new URL(req.url);
  return tapFor(opts).request({ ua: req.headers.get("user-agent") || "", path: u.pathname, method: req.method, status, ip: ipOf(req), headers: req.headers, referrer: req.headers.get("referer") || "" }) || Promise.resolve();
}

export function withAai(handler, opts = {}) {
  return async function (req, env, ctx) {
    const res = await handler(req, env, ctx);
    const p = observe(req, opts, res.status);
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(p); else if (env && typeof env.waitUntil === "function") env.waitUntil(p);
    return res;
  };
}
