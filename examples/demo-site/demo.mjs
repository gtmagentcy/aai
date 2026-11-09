/**
 * `aai demo`: a small product site ("Roomly", invented) with all three taps installed, and a crowd
 * of simulated agents walking it, so the dashboard has a real funnel to show and every tap is
 * exercised end to end over HTTP.
 *
 *   site       http://localhost:4400   server tap (taps/node.js) on every request
 *   MCP        POST /mcp               action tap (taps/mcp.js): get_quote is the first value
 *   signup     /signup?aai_cid=…       browser tag (pixel/aai.js) + signup_from_agent on POST /api/signup
 *
 * The agents are simulated by the user-agents their vendors document; no model is called.
 */
import http from "node:http";
import { aai } from "../../taps/node.js";
import { mcpTap } from "../../taps/mcp.js";
import { createTap } from "../../taps/core.js";

const SITE = "roomly-demo";

export function demoSite({ collector, port = 4400 }) {
  const tap = createTap({ collector, site: SITE, secret: "demo-secret" });
  const mw = aai({ tap });
  const mcp = mcpTap({ tap, firstValue: ["get_quote"] });
  const origin = `http://localhost:${port}`;
  const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title} · Roomly</title><script src="${collector}/aai.js" data-site="${SITE}" defer></script></head><body><h1>${title}</h1>${body}</body></html>`;
  const FILES = {
    "/": ["text/html", page("Meeting rooms by the hour", `<p>Roomly books meeting rooms in 40 cities.</p><button data-agent-prompt-copy="Book a Roomly room for 6 people tomorrow">Copy prompt for your assistant</button>`)],
    "/pricing": ["text/html", page("Pricing", "<p>Fixed price per hour, no seat fees.</p>")],
    "/robots.txt": ["text/plain", "User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n"],
    "/sitemap.xml": ["application/xml", `<?xml version="1.0"?><urlset><url><loc>${origin}/</loc></url></urlset>`],
    "/llms.txt": ["text/plain", `# Roomly\n\n> Meeting rooms by the hour in 40 cities.\n\nThe core job: get a quote and hold a room.\n\n- [agents.md](${origin}/agents.md)\n- [MCP](${origin}/.well-known/mcp.json)\n`],
    "/agents.md": ["text/markdown", "# Agents\n\n## Permitted\n- Get a quote with `get_quote` (no account).\n\n## Ask your person first\n- Holding a room.\n"],
    "/openapi.json": ["application/json", JSON.stringify({ openapi: "3.1.0", info: { title: "Roomly", version: "1" }, paths: { "/api/signup": { post: {} } } })],
    "/.well-known/mcp.json": ["application/json", JSON.stringify({ name: "roomly", url: `${origin}/mcp` })],
  };
  const server = http.createServer(async (req, res) => {
    mw(req, res);
    const url = new URL(req.url, origin);
    const body = async () => { let s = ""; for await (const c of req) s += c; try { return JSON.parse(s || "{}"); } catch { return {}; } };
    const ip = String(req.headers["x-forwarded-for"] || "");
    const ua = String(req.headers["user-agent"] || "");
    if (url.pathname === "/mcp" && req.method === "POST") {
      const msg = await body();
      const { cid } = await mcp.observe(msg, { mcpSession: req.headers["mcp-session-id"], ua, ip });
      let result = {};
      if (msg.method === "initialize") result = { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "roomly", version: "1" } };
      if (msg.method === "tools/call") result = { content: [{ type: "text", text: `Quote: €42/hour for 6 people in Lisbon. Hold it: ${mcp.claimUrl(origin + "/signup", cid)}` }], _meta: { aai_cid: cid } };
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }));
    }
    if (url.pathname === "/api/signup" && req.method === "POST") {
      const b = await body();
      if (b.aai_cid) await tap.track("signup_from_agent", { cid: b.aai_cid, ua, ip });
      res.writeHead(201, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (url.pathname === "/api/activate" && req.method === "POST") {
      const b = await body();
      if (b.aai_cid) await tap.track("activated", { cid: b.aai_cid, ua, ip });
      res.writeHead(200); return res.end("{}");
    }
    if (url.pathname === "/signup") { res.writeHead(200, { "content-type": "text/html" }); return res.end(page("Create your account", `<form data-aai-form="signup" method="post" action="/api/signup"><input name="email"><button>Sign up</button></form>`)); }
    const f = FILES[url.pathname];
    if (!f) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "content-type": f[0] });
    res.end(f[1]);
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok({ server, origin })));
}

const UA = {
  chatgpt: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
  claude: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)",
  perplexity: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)",
  gptbot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot",
  claudebot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  oai: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot",
  script: "python-httpx/0.27.0",
  human: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
};

/** One simulated agent: a list of steps it takes before it stops. */
async function walk(origin, collector, who, ip, depth) {
  const h = { "user-agent": UA[who], "x-forwarded-for": ip };
  const get = (p) => fetch(origin + p, { headers: h }).then((r) => r.text());
  const rpc = (m) => fetch(origin + "/mcp", { method: "POST", headers: { ...h, "content-type": "application/json", "mcp-session-id": ip }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...m }) }).then((r) => r.json());
  if (who === "gptbot" || who === "claudebot" || who === "oai") { await get("/robots.txt"); await get("/"); if (depth > 1) await get("/sitemap.xml"); return; }
  await get("/");
  if (depth < 2) return;
  await get("/llms.txt");
  if (depth < 3) return;
  await get("/agents.md");
  if (depth < 4) return;
  await rpc({ method: "initialize", params: { protocolVersion: "2025-06-18", clientInfo: { name: who + "-mcp" } } });
  if (depth < 5) { await rpc({ method: "tools/list" }); return; }
  const r = await rpc({ method: "tools/call", params: { name: "get_quote", arguments: { people: 6 } } });
  if (depth < 6) return;
  const cid = r.result?._meta?.aai_cid;
  // The person opens the claim link in their browser (the tag's events, sent as a browser would)...
  await fetch(collector + "/e", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ site: SITE, event: "claim_click", path: "/signup", ua: UA.human, referrer: "https://chatgpt.com/", cid, session: "b" + ip, source: "browser" }) });
  // ...and signs up with it.
  await fetch(origin + "/api/signup", { method: "POST", headers: { "content-type": "application/json", "user-agent": UA.human, "x-forwarded-for": ip }, body: JSON.stringify({ email: "x", aai_cid: cid }) });
  if (depth < 7) return;
  await fetch(origin + "/api/activate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ aai_cid: cid }) });
}

/** Referral visitors and prompt copies, as the browser tag would send them. */
async function browserEvents(collector, n) {
  for (let i = 0; i < n; i++) {
    const ref = ["https://chatgpt.com/", "https://www.perplexity.ai/", "https://claude.ai/", "https://gemini.google.com/"][i % 4];
    const session = "ref" + i;
    await fetch(collector + "/e", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ site: SITE, event: "agent_visit", path: "/", ua: UA.human, referrer: ref, utm: i % 4 === 0 ? "chatgpt.com" : "", session, source: "browser" }) });
    if (i % 3 === 0) await fetch(collector + "/e", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ site: SITE, event: "form_start", path: "/signup", ua: UA.human, referrer: ref, session, tool: "signup", source: "browser" }) });
  }
}

// [agent, how many, depth distribution]: the deeper the number, the further it gets.
const CROWD = [["chatgpt", 26, [1, 2, 2, 3, 4, 5, 5, 6, 6, 7]], ["claude", 18, [1, 2, 3, 3, 4, 5, 6, 6, 7]], ["perplexity", 14, [1, 1, 2, 2, 3]],
  ["script", 9, [2, 4, 5, 5]], ["gptbot", 12, [1, 2]], ["claudebot", 8, [1, 2]], ["oai", 6, [1]]];

export async function simulate({ origin, collector }) {
  let n = 0;
  const runs = [];
  for (const [who, count, depths] of CROWD) {
    for (let i = 0; i < count; i++) {
      const ip = `10.${n % 250}.${Math.floor(n / 250)}.${(n * 7) % 250}`; n++;
      runs.push(walk(origin, collector, who, ip, depths[i % depths.length]));
    }
  }
  await Promise.all(runs);
  await browserEvents(collector, 15);
  return n;
}

export async function runDemo(common) {
  const { serve } = await import("../../cli/serve.mjs");
  const dash = await serve({ ...common, open: false });
  const { origin } = await demoSite({ collector: dash.origin, port: 4400 });
  console.log(`  Demo site (Roomly, invented): ${origin}  ·  server, action and browser taps installed`);
  const n = await simulate({ origin, collector: dash.origin });
  await new Promise((r) => setTimeout(r, 400));
  const f = dash.store.funnel({ site: SITE });
  console.log(`  Sent ${n} simulated agents. Funnel for ${SITE}: ` + f.steps.map((s) => `${s.label} ${s.journeys}`).join(" → "));
  if (common.open) {
    const { spawn } = await import("node:child_process");
    const at = `${dash.origin}/#funnel/${SITE}`;
    const c = process.platform === "darwin" ? ["open", [at]] : ["xdg-open", [at]];
    try { spawn(c[0], c[1], { stdio: "ignore", detached: true }).unref(); } catch {}
  }
  console.log(`  Open ${dash.origin}/#funnel/${SITE}. Run a real agent at the demo site too; Ctrl+C to stop.\n`);
}
