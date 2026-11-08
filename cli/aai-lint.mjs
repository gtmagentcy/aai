#!/usr/bin/env node
/**
 * aai-lint: checks the public half of a site's AAI (Agent Application Interface).
 *
 *   npx aai-lint https://example.com          human-readable report
 *   npx aai-lint example.com --json           machine-readable
 *   npx aai-lint example.com --strict         exit 1 if any check fails
 *
 * It reads public pages only, at most ~12 requests, like an agent would. It is a lint, not the
 * AAI score: it tells you which artefacts are present and which are missing, with a fix for each.
 * "Value before the gate" lives inside the product and needs a walk-through; the lint only looks
 * for the signs of it. No dependencies; Node 18+.
 */
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const target = args.find((a) => !a.startsWith("--"));
if (!target || flags.has("--help")) {
  console.log("usage: aai-lint <url> [--json] [--strict]");
  process.exit(target ? 0 : 2);
}
const base = new URL(/^https?:\/\//.test(target) ? target : `https://${target}`);
const UA = "aai-lint/0.1 (+https://github.com/NetanelBaruch/aai)";
const AI_BOTS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "OAI-SearchBot"];
const BOOKING = /(calendly\.com|cal\.com|calendar\.app\.google|savvycal\.com|meetings\.hubspot\.com|zcal\.co|tidycal\.com|chilipiper\.com)/i;

async function get(path, { method = "GET", headers = {}, body } = {}) {
  const url = new URL(path, base);
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10000);
    const res = await fetch(url, { method, headers: { "user-agent": UA, ...headers }, body, redirect: "follow", signal: ctl.signal });
    clearTimeout(t);
    const text = (await res.text()).slice(0, 2_000_000);
    return { url: res.url, status: res.status, ok: res.ok, type: res.headers.get("content-type") || "", text };
  } catch (e) {
    return { url: url.href, status: 0, ok: false, type: "", text: "", error: e.name === "AbortError" ? "timeout" : e.message };
  }
}
const isHtml = (r) => /<html|<!doctype html/i.test(r.text.slice(0, 600));
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
function links(html, from) {
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try { out.push({ href: new URL(m[1], from).href, text: strip(m[2]).slice(0, 80) }); } catch {}
  }
  return out;
}
function forms(html) {
  return [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map((m) => {
    const attrs = m[1];
    const action = (attrs.match(/\baction=["']([^"']*)["']/i) || [])[1];
    const method = ((attrs.match(/\bmethod=["']([^"']*)["']/i) || [])[1] || "get").toLowerCase();
    const named = (m[2].match(/<(input|select|textarea)\b[^>]*\bname=/gi) || []).length;
    const search = /type=["']search|name=["'](q|s|query|search)["']/i.test(m[2]);
    return { action, method, named, search };
  });
}
function robotsBlocks(txt, bot) {
  // Returns true if the robots.txt disallows "/" for this bot (or for * with no bot-specific group).
  const groups = [];
  let cur = null;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^(user-agent|disallow|allow)\s*:\s*(.*)$/i);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") { if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); }
    else if (cur) cur.rules.push([k, v]);
  }
  const g = groups.find((x) => x.agents.includes(bot.toLowerCase())) || groups.find((x) => x.agents.includes("*"));
  if (!g) return false;
  const root = g.rules.filter(([, v]) => v === "/");
  return root.some(([k]) => k === "disallow") && !root.some(([k]) => k === "allow");
}

const checks = [];
function check(dim, id, label, pass, detail, fix) { checks.push({ dim, id, label, pass: !!pass, detail, fix: pass ? undefined : fix }); }

const home = await get(base.href);
if (!home.ok) {
  console.error(`Could not fetch ${base.href}: ${home.error || "HTTP " + home.status}`);
  process.exit(2);
}
const robots = await get("/robots.txt");
const llms = await get("/llms.txt");
const agents = await get("/agents.md");
const sitemap = await get("/sitemap.xml");

// ---- Discover
const text = strip(home.text);
check("Discover", "html-content", "Content is in the HTML", text.length > 400,
  `${text.length} characters of text without running JavaScript`, "Render the page server-side so an agent can read it without a browser.");
const blocked = robots.ok ? AI_BOTS.filter((b) => robotsBlocks(robots.text, b)) : [];
check("Discover", "ai-crawlers", "AI crawlers are allowed", blocked.length === 0,
  blocked.length ? `robots.txt blocks ${blocked.join(", ")}` : "No AI crawler is blocked from /", "Remove the Disallow: / rules for the AI user agents you want to be found by.");
const llmsOk = llms.ok && !isHtml(llms) && llms.text.trim().length > 50;
check("Discover", "llms-txt", "llms.txt", llmsOk, llmsOk ? `${llms.text.length} bytes at /llms.txt` : "No llms.txt at /llms.txt",
  "Publish /llms.txt: what you do, for whom, and the links an agent should read first. Template: templates/llms.txt");
check("Discover", "structured-data", "Structured data", /application\/ld\+json/i.test(home.text),
  /application\/ld\+json/i.test(home.text) ? "JSON-LD on the home page" : "No JSON-LD on the home page", "Add Organization (and Product or Service) JSON-LD to the home page.");
check("Discover", "sitemap", "Sitemap", sitemap.ok && /<urlset|<sitemapindex/i.test(sitemap.text), sitemap.ok ? "/sitemap.xml" : "No /sitemap.xml", "Publish /sitemap.xml.");

// ---- Act: look at the home page plus up to 5 same-site pages that sound like the core flow
const homeLinks = links(home.text, home.url);
const flowLinks = homeLinks.filter((l) => new URL(l.href).host === new URL(home.url).host &&
  /(contact|demo|book|quote|sign-?up|get-?started|trial|pricing|start)/i.test(l.href + " " + l.text));
const seen = new Set([home.url]);
const pages = [home];
for (const l of flowLinks) {
  if (pages.length >= 6) break;
  const u = l.href.split("#")[0];
  if (seen.has(u)) continue;
  seen.add(u);
  const r = await get(u);
  if (r.ok && isHtml(r)) pages.push(r);
}
const agentForms = pages.flatMap((p) => forms(p.text).filter((f) => !f.search && f.named >= 2 && f.action && !/^javascript:/i.test(f.action)).map((f) => ({ ...f, page: p.url })));
check("Act", "agent-form", "A form an agent can submit", agentForms.length > 0,
  agentForms.length ? `${agentForms[0].method.toUpperCase()} ${agentForms[0].action} on ${agentForms[0].page}` : `No form with a real action target on ${pages.length} page(s) checked`,
  "Give your core form (demo, quote, sign-up) a real action URL that accepts a plain POST, and say so in agents.md. See docs/patterns/agent-forms.md");
const booking = pages.flatMap((p) => links(p.text, p.url)).find((l) => BOOKING.test(l.href));
check("Act", "booking-url", "A booking link in the HTML", !!booking, booking ? booking.href : "No scheduling link found",
  "Put the booking link in the HTML (not only inside a widget) so an agent can hand it to its person.");
let openapi = null;
for (const p of ["/openapi.json", "/openapi.yaml", "/.well-known/openapi.json", "/swagger.json"]) {
  const r = await get(p);
  if (r.ok && /["']?openapi["']?\s*:|["']swagger["']/i.test(r.text.slice(0, 2000))) { openapi = p; break; }
}
check("Act", "openapi", "An OpenAPI description", !!openapi, openapi ? `Found at ${openapi}` : "No OpenAPI at the usual paths",
  "Publish /openapi.json for the endpoints an agent may call, even if it is only one. Template: templates/openapi.json");
let mcp = null;
const mcpCard = await get("/.well-known/mcp.json");
if (mcpCard.ok && /mcpServers|serverInfo|streamable-http/i.test(mcpCard.text)) mcp = "/.well-known/mcp.json";
if (!mcp) {
  const init = await get("/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "aai-lint", version: "0.1" } } }) });
  if (/"serverInfo"|"protocolVersion"/.test(init.text)) mcp = "/mcp";
}
check("Act", "mcp", "An MCP server an agent can find", !!mcp, mcp ? `Found via ${mcp}` : "No /.well-known/mcp.json and no MCP server at /mcp",
  "Expose your agent tools over MCP and point to them from /.well-known/mcp.json. Template: templates/.well-known/mcp.json");

// ---- Boundaries
const agentsOk = agents.ok && !isHtml(agents) && agents.text.trim().length > 20;
const hasMay = agentsOk && /(may|permitted|allowed|you can)/i.test(agents.text);
const hasMayNot = agentsOk && /(may not|not permitted|never|do not|don't|must not)/i.test(agents.text);
check("Boundaries", "agents-md", "agents.md with what agents may and may not do", agentsOk && hasMay && hasMayNot,
  !agentsOk ? "No agents.md at /agents.md" : hasMay && hasMayNot ? "Says what is permitted and what is not" : "agents.md found, but it doesn't list both permitted and not-permitted actions",
  "Publish /agents.md with a Permitted and a Not permitted list, and how to reach a person. Template: templates/agents.md");
const allLinks = pages.flatMap((p) => links(p.text, p.url));
const human = allLinks.find((l) => /^mailto:|^tel:/i.test(l.href)) || allLinks.find((l) => /\/contact/i.test(l.href));
check("Boundaries", "human-route", "A route to a person", !!human, human ? human.href.replace(/\?.*/, "") : "No mailto, tel or contact link",
  "Link an email address or a contact page in the HTML, so an agent that hits a wall can hand over to a person.");

// ---- Value before the gate (signs only; the real test is a walk-through)
const corpus = (agentsOk ? agents.text : "") + "\n" + (llmsOk ? llms.text : "");
const noLogin = /(no (account|login|sign-?up)|without (an )?(account|login|signing up)|sandbox|claim (link|it|the))/i.test(corpus);
check("Value before the gate", "first-value-signs", "Says what an agent can do before an account", noLogin,
  noLogin ? "agents.md or llms.txt describes a no-login path or a claim link" : "Nothing says what an agent can reach before sign-up",
  "Design one first result an agent can reach with no login, then ask for the account with a claim link. See docs/patterns/agent-sign-up.md");

// ---- Trust
check("Trust", "https", "HTTPS", new URL(home.url).protocol === "https:", new URL(home.url).protocol, "Serve the site over HTTPS.");
check("Trust", "page-weight", "Cheap to read", home.text.length < 500_000, `${Math.round(home.text.length / 1024)} KB of HTML`, "Keep the HTML of key pages under ~500 KB.");

// ---- report
const passed = checks.filter((c) => c.pass).length;
if (flags.has("--json")) {
  console.log(JSON.stringify({ url: home.url, checked: new Date().toISOString(), passed, total: checks.length, checks }, null, 2));
} else {
  const g = (s) => `\x1b[32m${s}\x1b[0m`, r = (s) => `\x1b[33m${s}\x1b[0m`, d = (s) => `\x1b[2m${s}\x1b[0m`;
  console.log(`\nAAI lint · ${home.url}\n`);
  let dim = "";
  for (const c of checks) {
    if (c.dim !== dim) { dim = c.dim; console.log(`  ${dim}`); }
    console.log(`    ${c.pass ? g("✓") : r("✗")} ${c.label}  ${d(c.detail)}`);
    if (c.fix) console.log(`      ${d("fix:")} ${c.fix}`);
  }
  console.log(`\n  ${passed}/${checks.length} checks pass. This is a lint of the public site, not the AAI score.`);
  console.log(`  Value before the gate needs a walk-through of the product. Score: https://gtmagentcy.com/aai/\n`);
}
if (flags.has("--strict") && passed < checks.length) process.exit(1);
