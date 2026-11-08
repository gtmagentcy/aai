/**
 * The AAI lint as a module: lint(url) -> { url, checked, meta, checks, passed, total, estimate }.
 * Reads public pages only (about a dozen requests). Used by the CLI and by the local app.
 */
const UA_DEFAULT = "aai-lint/0.2 (+https://github.com/NetanelBaruch/aai)";

export async function lint(target) {
  const base = new URL(/^https?:\/\//.test(target) ? target : `https://${target}`);
  const UA = UA_DEFAULT;
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
  if (!home.ok) throw new Error(`Could not fetch ${base.href}: ${home.error || "HTTP " + home.status}`);
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


  // ---- what the app needs to draw the site and pre-fill the builder
  const pick = (re, h = home.text) => { const m = h.match(re); return m ? decode(m[1].trim()) : ""; };
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const siteName = pick(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i) || title.split(/\s[|\-—–·:]\s/)[0];
  const description = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i) || pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i);
  const ogImage = abs(pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i), home.url);
  const icon = abs(pick(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)/i) || "/favicon.ico", home.url);
  const email = (allLinks.find((l) => /^mailto:/i.test(l.href)) || {}).href?.replace(/^mailto:/i, "").replace(/\?.*/, "") || "";
  const jobGuess = /book a demo|request a demo|get a demo|talk to sales/i.test(text) ? "demo"
    : /get a quote|request a quote|free quote/i.test(text) ? "quote"
    : /start (a |your )?(free )?trial|try (it )?free/i.test(text) ? "trial"
    : /sign up|get started|create (an |your )?account/i.test(text) ? "signup"
    : /\b(add to cart|buy now|shop now)\b/i.test(text) ? "buy" : "contact";
  const meta = {
    host: new URL(home.url).host, title, siteName: siteName || new URL(home.url).host, description, ogImage, icon, email,
    booking: booking ? booking.href : "", jobGuess,
    llms: llmsOk ? llms.text.slice(0, 4000) : "", agents: agentsOk ? agents.text.slice(0, 6000) : "",
    form: agentForms[0] || null, formsSeen: pages.reduce((n, p) => n + forms(p.text).length, 0), pagesChecked: pages.map((p) => p.url),
    openapi, mcp,
  };
  const passed = checks.filter((c) => c.pass).length;
  return { url: home.url, checked: new Date().toISOString(), meta, checks, passed, total: checks.length, estimate: estimate(checks) };
}

// Points per check for the public 75 (SPEC.md section 3). An estimate from the lint, not the AAI score.
const POINTS = {
  "html-content": 4, "ai-crawlers": 4, "llms-txt": 4, "structured-data": 4, sitemap: 4,
  "agent-form": 9, "booking-url": 6, openapi: 7.5, mcp: 7.5,
  "agents-md": 9, "human-route": 6,
  https: 5, "page-weight": 5,
};
export const DIMENSIONS = [
  { id: "Discover", points: 20 }, { id: "Act", points: 30 }, { id: "Value before the gate", points: 25 },
  { id: "Boundaries", points: 15 }, { id: "Trust", points: 10 },
];
export function estimate(checks) {
  const by = {};
  for (const d of DIMENSIONS) by[d.id] = { got: 0, of: d.id === "Value before the gate" ? 0 : d.points, untested: d.id === "Value before the gate" };
  for (const c of checks) if (POINTS[c.id] && c.pass) by[c.dim].got += POINTS[c.id];
  let total = Object.values(by).reduce((a, b) => a + b.got, 0);
  const capped = checks.some((c) => c.id === "ai-crawlers" && !c.pass);
  if (capped) total = Math.min(total, 10);
  total = Math.round(total);
  const band = total >= 90 ? "Designed" : total >= 70 ? "Operable" : total >= 40 ? "Readable" : "Closed";
  return { total, of: 75, capped, band, by };
}
function decode(s) { return s.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)); }
function abs(u, from) { try { return u ? new URL(u, from).href : ""; } catch { return ""; } }
