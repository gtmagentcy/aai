/**
 * Server tap for Node: Express, Connect, Fastify (via middie), plain http, Firebase Functions.
 *
 *   import { aai } from "aai/taps/node.js";
 *   app.use(aai({ site: "yoursite", collector: process.env.AAI_COLLECTOR, secret: process.env.AAI_SECRET }));
 *
 *   // plain http or a Firebase function
 *   export const api = onRequest(aai.wrap(handler, { site: "yoursite" }));
 */
import { createTap } from "./core.js";

function ipOf(req) {
  const xf = req.headers["x-forwarded-for"];
  return (Array.isArray(xf) ? xf[0] : String(xf || "")).split(",")[0].trim() || req.socket?.remoteAddress || "";
}

export function aai(opts = {}) {
  const tap = opts.tap || createTap(opts);
  const mw = function aaiMiddleware(req, res, next) {
    const started = { ua: String(req.headers["user-agent"] || ""), path: (req.originalUrl || req.url || "/").split("?")[0], method: req.method, headers: req.headers, ip: ipOf(req), referrer: String(req.headers.referer || "") };
    res.on("finish", () => { tap.request({ ...started, status: res.statusCode }); });
    if (next) next();
  };
  mw.tap = tap;
  return mw;
}

aai.wrap = function wrap(handler, opts = {}) {
  const mw = aai(opts);
  return function (req, res) { mw(req, res); return handler(req, res); };
};
