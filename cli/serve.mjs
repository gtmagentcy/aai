/**
 * The local AAI app. Binds to 127.0.0.1 only. Serves app/ and the chat-flow component, plus:
 *   GET  /api/report          the last lint result
 *   POST /api/lint {url}      lint another URL (or re-run)
 *   GET  /api/config          { dir, canSave }
 *   POST /api/save {files, overwrite}
 *        writes llms.txt, agents.md, .well-known/mcp.json, openapi.json into --dir, nothing else
 */
import http from "node:http";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { lint } from "./lint.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATIC = { "/": "app/index.html" };
const MOUNTS = [["/app/", "app/"], ["/chat-flow/", "components/chat-flow/"]];
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".webp": "image/webp", ".svg": "image/svg+xml", ".png": "image/png" };
const SAVABLE = new Set(["llms.txt", "agents.md", ".well-known/mcp.json", "openapi.json"]);

export async function serve({ first, port = 4319, dir, open = true }) {
  let current = first;
  const outDir = dir ? path.resolve(dir) : null;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const send = (code, body, type = "application/json") => {
      res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
      res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    };
    const json = async () => { let s = ""; for await (const ch of req) { s += ch; if (s.length > 1e6) break; } return JSON.parse(s || "{}"); };
    try {
      if (url.pathname === "/api/report") return send(200, current);
      if (url.pathname === "/api/config") return send(200, { dir: outDir, canSave: !!outDir });
      if (url.pathname === "/api/lint" && req.method === "POST") {
        const { url: target } = await json();
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
    server.listen(p, "127.0.0.1", () => ok(p));
  });
  let p = port;
  for (;;) {
    try { await listen(p); break; }
    catch (e) { if (e.code !== "EADDRINUSE" || p > port + 20) throw e; p++; }
  }
  const at = `http://localhost:${p}/`;
  console.log(`\n  Open the agent's view and build your AAI: \x1b[1m${at}\x1b[0m`);
  if (outDir) console.log(`  Files you save go to ${outDir}`);
  console.log(`  Ctrl+C to stop.\n`);
  if (open) {
    const cmd = process.platform === "darwin" ? ["open", [at]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", at]] : ["xdg-open", [at]];
    try { spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true }).unref(); } catch {}
  }
  return server;
}
