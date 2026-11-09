/**
 * The local AAI app and collector. Binds to 127.0.0.1 unless --host is given.
 *
 * Dashboard (loopback only):
 *   GET  /api/report          the last lint result (null when started without a URL)
 *   POST /api/lint {url}      lint another URL (or re-run)
 *   GET  /api/config          { dir, canSave, data, origin }
 *   POST /api/save {files, overwrite}   writes the AAI files into --dir, nothing else
 *   GET  /api/sites           sites that sent events
 *   GET  /api/funnel?site&days          the agent funnel
 *   GET  /api/journey?key               one journey, in order
 *   GET  /api/stream                    live events (Server-Sent Events)
 *   GET  /api/snippets?site             install code per stack
 *   POST /mcp                           the dashboard as an MCP server (read-only)
 *
 * Collector (open to any client when --host is set, so deployed sites can report):
 *   POST /e                   one event (JSON, text/plain allowed so beacons skip preflight)
 *   GET  /aai.js              the browser tag
 */
import http from "node:http";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { lint } from "./lint.mjs";
import { openStore } from "../collector/store.js";
import { mcpHandler } from "../collector/mcp.js";
import { snippets } from "../collector/snippets.js";
import { FIXES } from "../lib/fixes.js";
import { agentById, STEP_IDS } from "../lib/agents.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATIC = { "/": "app/index.html", "/aai.js": "pixel/aai.js" };
const MOUNTS = [["/app/", "app/"], ["/chat-flow/", "components/chat-flow/"]];
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".webp": "image/webp", ".svg": "image/svg+xml", ".png": "image/png" };
const SAVABLE = new Set(["llms.txt", "agents.md", ".well-known/mcp.json", "openapi.json"]);
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export async function serve({ first = null, port = 4319, dir, data, host = "127.0.0.1", open = true, quiet = false } = {}) {
  let current = first;
  const outDir = dir ? path.resolve(dir) : null;
  const store = await openStore(data ? { dir: path.resolve(data) } : {});
  let origin = `http://localhost:${port}`;
  const mcp = mcpHandler({ store, get origin() { return origin; }, report: () => current });
  const hits = new Map(); // per-IP rate limit for /e, in memory only

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const send = (code, body, type = "application/json", extra = {}) => {
      res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra });
      res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    };
    const text = async (limit = 1e6) => { let s = ""; for await (const ch of req) { s += ch; if (s.length > limit) break; } return s; };
    const json = async () => JSON.parse((await text()) || "{}");
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, OPTIONS" };
    try {
      // ---- collector: open to the world when --host is set
      if (url.pathname === "/e") {
        if (req.method === "OPTIONS") return send(204, "", "text/plain", cors);
        if (req.method !== "POST") return send(405, { ok: false }, "application/json", cors);
        const ip = req.socket.remoteAddress || "";
        if (!LOOPBACK.has(ip)) { // a server tap batches from one IP, so the limit is generous
          const now = Date.now(), h = hits.get(ip) || { n: 0, t: now };
          if (now - h.t > 60_000) { h.n = 0; h.t = now; }
          if (++h.n > 6000) return send(429, { ok: false }, "application/json", cors);
          hits.set(ip, h);
        }
        let raw; try { raw = JSON.parse(await text(16_000)); } catch { return send(400, { ok: false, error: "Body must be JSON." }, "application/json", cors); }
        const list = Array.isArray(raw) ? raw.slice(0, 50) : [raw];
        const kept = list.map((r) => store.add({ ...r, ua: r.ua || req.headers["user-agent"] || "" }, r.source || "browser")).filter(Boolean).length;
        return send(200, { ok: true, kept }, "application/json", cors);
      }
      if (url.pathname === "/aai.js") return send(200, await readFile(path.join(ROOT, STATIC["/aai.js"])), TYPES[".js"], { "access-control-allow-origin": "*", "cache-control": "public, max-age=300" });

      // ---- everything else is the dashboard: loopback only
      if (!LOOPBACK.has(req.socket.remoteAddress)) return send(403, { error: "The dashboard answers on this machine only." });

      if (url.pathname === "/api/report") return send(200, current);
      if (url.pathname === "/api/config") return send(200, { dir: outDir, canSave: !!outDir, data: store.dir, origin });
      if (url.pathname === "/api/sites") return send(200, store.sites());
      if (url.pathname === "/api/fixes") return send(200, FIXES);
      if (url.pathname === "/api/funnel") return send(200, store.funnel({ site: url.searchParams.get("site") || undefined, days: +url.searchParams.get("days") || 30 }));
      if (url.pathname === "/api/journey") {
        const j = store.journey(url.searchParams.get("key"), { days: 365 });
        return j ? send(200, { ...j, steps: [...j.steps], reached: STEP_IDS.slice(0, STEP_IDS.indexOf(j.furthest) + 1), label: agentById(j.agent).label }) : send(404, { error: "No such journey." });
      }
      if (url.pathname === "/api/snippets") return send(200, snippets({ site: url.searchParams.get("site") || "yoursite", collector: url.searchParams.get("collector") || origin }));
      if (url.pathname === "/api/stream") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        res.write(": ok\n\n");
        const off = store.subscribe((e) => res.write(`data: ${JSON.stringify(e)}\n\n`));
        const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
        req.on("close", () => { off(); clearInterval(ping); });
        return;
      }
      if (url.pathname === "/mcp") {
        if (req.method !== "POST") return send(405, { error: "POST JSON-RPC to /mcp." });
        const body = await json();
        const out = Array.isArray(body) ? body.map(mcp).filter(Boolean) : mcp(body);
        if (!out || (Array.isArray(out) && !out.length)) return send(202, "", "text/plain");
        return send(200, out);
      }
      if (url.pathname === "/api/lint" && req.method === "POST") {
        const { url: target } = await json();
        if (!target && !current) return send(400, { error: "Enter a site to check." });
        current = await lint(String(target || current.url));
        return send(200, current);
      }
      if (url.pathname === "/api/save" && req.method === "POST") {
        if (!outDir) return send(400, { error: "Start the app with --dir <folder> to save files." });
        const { files = [], overwrite = false } = await json();
        const exists = [], saved = [];
        for (const f of files) {
          if (!SAVABLE.has(f.path)) return send(400, { error: `Not a file the app writes: ${f.path}` });
          const dest = path.join(outDir, f.path);
          if (!overwrite) { try { await access(dest); exists.push(f.path); continue; } catch {} }
        }
        if (exists.length) return send(409, { exists });
        for (const f of files) {
          const dest = path.join(outDir, f.path);
          await mkdir(path.dirname(dest), { recursive: true });
          await writeFile(dest, String(f.content));
          saved.push(f.path);
        }
        return send(200, { saved });
      }
      let rel = STATIC[url.pathname];
      if (!rel) for (const [m, d] of MOUNTS) if (url.pathname.startsWith(m)) rel = d + url.pathname.slice(m.length);
      if (!rel) return send(404, "Not found", "text/plain");
      const file = path.join(ROOT, path.normalize(rel));
      if (!file.startsWith(ROOT + path.sep)) return send(403, "Forbidden", "text/plain");
      return send(200, await readFile(file), TYPES[path.extname(file)] || "application/octet-stream");
    } catch (e) {
      return send(e.code === "ENOENT" ? 404 : 500, { error: e.message });
    }
  });

  const listen = (p) => new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(p, host, () => ok(p));
  });
  let p = port;
  for (;;) {
    try { await listen(p); break; }
    catch (e) { if (e.code !== "EADDRINUSE" || p > port + 20) throw e; p++; }
  }
  origin = `http://localhost:${p}`;
  const at = `${origin}/` + (current ? "" : "#funnel");
  if (!quiet) {
    console.log(`\n  AAI dashboard: \x1b[1m${at}\x1b[0m`);
    console.log(`  Collector:     ${origin}/e   ·   tag: ${origin}/aai.js   ·   MCP: ${origin}/mcp`);
    console.log(`  Events stored in ${store.dir}`);
    if (host !== "127.0.0.1") console.log(`  Listening on ${host}: other machines can send events; the dashboard stays local.`);
    if (outDir) console.log(`  Files you save go to ${outDir}`);
    console.log(`  Ctrl+C to stop.\n`);
  }
  if (open) {
    const cmd = process.platform === "darwin" ? ["open", [at]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", at]] : ["xdg-open", [at]];
    try { spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true }).unref(); } catch {}
  }
  server.store = store; server.origin = origin;
  return server;
}
