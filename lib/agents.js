/**
 * The agent registry and the event model. One file, shared by the collector, the taps, the log
 * importer and the dashboard.
 *
 *   AGENTS            who the agents are, how they identify, what they can do
 *   STEPS             the funnel, in order; the same six stations as the AAI score
 *   EVENTS            the event names the collector accepts
 *   identify(...)     user-agent / headers / referrer / utm  ->  { agent, kind, via }
 *   stepOf(event)     an event (+ path, method)              ->  a step, or null
 *   isAgentSurface(p) is this path one agents read (llms.txt, agents.md, openapi, MCP)?
 *   classify(raw)     a raw event in, the stored shape out (no IPs, no personal data)
 *
 * Tokens are matched case-sensitively inside the User-Agent string, as each vendor documents
 * them. Where a vendor's documentation could not be confirmed, `confirmed` is false and the
 * dashboard says so. Sources: docs/research/2026-11-09-agent-funnel-tracking.md.
 */

/** kind: crawler (training), search (index for answers), user (fetch on a person's request),
 *  browser (an agent driving a real browser, runs JavaScript), coding (coding agents),
 *  script (an HTTP library hitting an agent surface; often an agent, not always). */
export const AGENTS = [
  // Order matters: the first entry whose token appears in the User-Agent wins, so the more
  // specific strings (Claude Code's "Claude-User (claude-code/…)") come before the general ones.
  // js: does it run JavaScript (so the browser tag can see it)? true / false / null (unknown).
  // OpenAI
  { id: "chatgpt-agent", label: "ChatGPT agent", vendor: "OpenAI", kind: "browser", js: true, tokens: [], signatureAgent: /chatgpt\.com/, verify: "signature", confirmed: true },
  { id: "chatgpt-user", label: "ChatGPT", vendor: "OpenAI", kind: "user", js: false, tokens: ["ChatGPT-User"], referrer: /(^|[/.])chatgpt\.com|chat\.openai\.com/, utm: ["chatgpt.com", "chatgpt"], verify: "https://openai.com/chatgpt-user.json", confirmed: true },
  { id: "oai-searchbot", label: "OAI-SearchBot", vendor: "OpenAI", kind: "search", js: false, tokens: ["OAI-SearchBot"], verify: "https://openai.com/searchbot.json", confirmed: true },
  { id: "gptbot", label: "GPTBot", vendor: "OpenAI", kind: "crawler", js: false, tokens: ["GPTBot"], verify: "https://openai.com/gptbot.json", confirmed: true },
  // Anthropic
  { id: "claude-code", label: "Claude Code", vendor: "Anthropic", kind: "coding", js: null, tokens: ["claude-code/"], verify: "https://claude.com/crawling/bots.json", confirmed: true },
  { id: "claude-agent", label: "Claude (hosted browser)", vendor: "Anthropic", kind: "browser", js: true, tokens: ["Claude-Agent"], verify: "https://claude.com/.well-known/sail", confirmed: true },
  { id: "claude-user", label: "Claude", vendor: "Anthropic", kind: "user", js: null, tokens: ["Claude-User"], referrer: /(^|[/.])claude\.ai/, utm: ["claude.ai"], verify: "https://claude.com/crawling/bots.json", confirmed: true },
  { id: "claude-searchbot", label: "Claude-SearchBot", vendor: "Anthropic", kind: "search", js: null, tokens: ["Claude-SearchBot"], verify: "https://claude.com/crawling/bots.json", confirmed: true },
  { id: "claudebot", label: "ClaudeBot", vendor: "Anthropic", kind: "crawler", js: false, tokens: ["ClaudeBot"], verify: "https://claude.com/crawling/bots.json", confirmed: true },
  // Perplexity
  { id: "perplexity-user", label: "Perplexity", vendor: "Perplexity", kind: "user", js: null, tokens: ["Perplexity-User"], referrer: /(^|[/.])perplexity\.ai/, utm: ["perplexity", "perplexity.ai"], verify: "https://www.perplexity.ai/perplexity-user.json", confirmed: true },
  { id: "perplexitybot", label: "PerplexityBot", vendor: "Perplexity", kind: "search", js: false, tokens: ["PerplexityBot"], verify: "https://www.perplexity.ai/perplexitybot.json", confirmed: true },
  // Google
  { id: "google-agent", label: "Google agent (Mariner)", vendor: "Google", kind: "browser", js: true, tokens: ["Google-Agent"], signatureAgent: /agent\.bot\.goog/, verify: "https://developers.google.com/static/crawling/ipranges/user-triggered-agents.json", confirmed: true },
  { id: "gemini-notebook", label: "Gemini Notebook", vendor: "Google", kind: "user", js: null, tokens: ["Google-GeminiNotebook", "Google-NotebookLM"], confirmed: true },
  { id: "vertex-bot", label: "Vertex AI Agents", vendor: "Google", kind: "search", js: null, tokens: ["Google-CloudVertexBot"], confirmed: true },
  { id: "gemini", label: "Gemini", vendor: "Google", kind: "referral", js: true, tokens: [], referrer: /gemini\.google\.com|bard\.google\.com/, utm: ["gemini.google.com"], confirmed: true },
  // Microsoft: no documented Copilot user-agent; referrals only
  { id: "copilot", label: "Copilot", vendor: "Microsoft", kind: "referral", js: true, tokens: [], referrer: /copilot\.microsoft\.com|(^|[/.])bing\.com\/chat|edgeservices\.bing\.com/, utm: ["copilot.com", "copilot.microsoft.com"], confirmed: true },
  // Others
  { id: "mistral-user", label: "Le Chat (Mistral)", vendor: "Mistral", kind: "user", js: null, tokens: ["MistralAI-User"], referrer: /chat\.mistral\.ai/, verify: "https://mistral.ai/mistralai-user-ips.json", confirmed: true },
  { id: "duckassistbot", label: "DuckAssist", vendor: "DuckDuckGo", kind: "user", js: null, tokens: ["DuckAssistBot"], verify: "https://duckduckgo.com/duckassistbot.json", confirmed: true },
  { id: "meta-agent", label: "Meta AI", vendor: "Meta", kind: "user", js: null, tokens: ["meta-externalfetcher"], referrer: /(^|[/.])meta\.ai/, confirmed: true },
  { id: "meta-search", label: "Meta AI search", vendor: "Meta", kind: "search", js: null, tokens: ["meta-webindexer"], confirmed: true },
  { id: "meta-crawler", label: "Meta crawler", vendor: "Meta", kind: "crawler", js: false, tokens: ["meta-externalagent"], confirmed: true },
  { id: "amazon-user", label: "Alexa", vendor: "Amazon", kind: "user", js: null, tokens: ["Amzn-User"], verify: "https://developer.amazon.com/amazonbot/live-ip-addresses/", confirmed: true },
  { id: "amazon-search", label: "Amzn-SearchBot", vendor: "Amazon", kind: "search", js: null, tokens: ["Amzn-SearchBot"], confirmed: true },
  { id: "amazonbot", label: "Amazonbot", vendor: "Amazon", kind: "crawler", js: null, tokens: ["Amazonbot"], confirmed: true },
  { id: "applebot", label: "Applebot", vendor: "Apple", kind: "search", js: true, tokens: ["Applebot"], verify: "http://search.developer.apple.com/applebot.json", confirmed: true },
  { id: "ccbot", label: "CCBot", vendor: "Common Crawl", kind: "crawler", js: false, tokens: ["CCBot"], confirmed: true },
  { id: "bytespider", label: "Bytespider", vendor: "ByteDance", kind: "crawler", js: null, tokens: ["Bytespider"], confirmed: true },
  // Browsers people drive with an agent inside. No documented token: they look like Chrome.
  // Seen only through the browser tag's heuristic, or a referral from their assistant.
  { id: "comet", label: "Comet", vendor: "Perplexity", kind: "browser", js: true, tokens: [], confirmed: false },
  // Coding agents and scripts. These rarely verify; counted only on agent surfaces unless named.
  { id: "cursor", label: "Cursor", vendor: "Anysphere", kind: "coding", js: null, tokens: ["Cursor/"], referrer: /(^|[/.])cursor\.(com|sh)/, confirmed: false },
  { id: "codex", label: "Codex", vendor: "OpenAI", kind: "coding", js: null, tokens: ["Codex"], confirmed: false },
  { id: "devin", label: "Devin", vendor: "Cognition", kind: "coding", js: null, tokens: ["Devin"], confirmed: false },
  { id: "gemini-cli", label: "Gemini CLI", vendor: "Google", kind: "coding", js: null, tokens: ["Google-Gemini-CLI", "GeminiCLI"], confirmed: false },
  { id: "mcp-client", label: "MCP client", vendor: "", kind: "coding", js: false, tokens: ["mcp-remote", "MCP-Client", "modelcontextprotocol"], confirmed: false },
  { id: "script", label: "Script or unnamed agent", vendor: "", kind: "script", js: false, tokens: ["python-requests", "python-httpx", "aiohttp", "node-fetch", "undici", "axios/", "curl/", "Go-http-client", "okhttp"], confirmed: true },
];

export const KINDS = {
  user: "Fetches for a person, in a chat",
  browser: "Drives a real browser for a person",
  coding: "Coding agent or MCP client",
  search: "Indexes for AI answers",
  crawler: "Collects training data",
  script: "HTTP library on an agent surface",
  unknown: "Acted on the agent path, unnamed",
  referral: "A person who came from an assistant's answer",
};

/** The funnel. Same stations as the journey map, so the funnel is the score, measured. */
export const STEPS = [
  { id: "reach", label: "Reach", q: "Agents find you", dim: "Discover" },
  { id: "understand", label: "Understand", q: "They read what you do", dim: "Discover" },
  { id: "rules", label: "Rules", q: "They read what they may do", dim: "Boundaries" },
  { id: "act", label: "Act", q: "They do the job: a form, an API call, an MCP tool", dim: "Act" },
  { id: "first_value", label: "First value", q: "Their person gets a result before any account", dim: "Value before the gate" },
  { id: "account", label: "Account", q: "The person signs up or claims what the agent made", dim: "Value before the gate" },
  { id: "activated", label: "Activated", q: "The account is used", dim: "Value before the gate" },
];
export const STEP_IDS = STEPS.map((s) => s.id);

export const EVENTS = {
  request: "An agent fetched a URL (server tap)",
  agent_visit: "A page view from an agent or from an assistant's answer (browser tag)",
  prompt_copy: "Someone copied a prompt meant for an agent",
  form_start: "An agent-path visitor started a form",
  form_submit: "An agent-path visitor submitted a form",
  api_call: "An agent called your API (action tap)",
  mcp_session: "An MCP client connected (action tap)",
  tool_call: "An MCP tool was called (action tap)",
  first_value: "The person got a result with no account",
  claim_click: "The person opened a claim link",
  signup_from_agent: "An account was created on the agent path",
  activated: "The account did the thing that counts",
  test: "A test event from the dashboard",
};

const SURFACES = [
  [/^\/robots\.txt$|^\/sitemap[^/]*\.xml$/, "reach"],
  [/^\/llms(-full)?\.txt$|^\/\.well-known\/(mcp|ai-plugin|mcp\.json|agent)|^\/openapi(\.json|\.ya?ml)?$|^\/\.well-known\/openapi/, "understand"],
  [/^\/agents\.md$|^\/AGENTS\.md$|^\/\.well-known\/agents/, "rules"],
  [/^\/(api\/)?mcp(\/|$)/, "act"],
];
const ACCOUNT_PATH = /^\/(sign-?up|register|claim|join|start|get-started)(\/|$)/i;

export function isAgentSurface(path = "") {
  return SURFACES.some(([re]) => re.test(path));
}

/** Which agent is this? Strongest signal first: a signed agent, the UA token, then referral signals. */
export function identify({ ua = "", referrer = "", utm = "", via = "", signatureAgent = "" } = {}) {
  if (signatureAgent) {
    const a = AGENTS.find((x) => x.signatureAgent && x.signatureAgent.test(signatureAgent));
    if (a) return { agent: a.id, kind: a.kind, via: "signature" };
  }
  for (const a of AGENTS) if (a.tokens.some((t) => ua.includes(t))) return { agent: a.id, kind: a.kind, via: "user-agent" };
  const u = String(utm || "").toLowerCase();
  if (u) for (const a of AGENTS) if (a.utm && a.utm.includes(u)) return { agent: a.id, kind: "referral", via: "utm" };
  if (referrer) for (const a of AGENTS) if (a.referrer && a.referrer.test(referrer)) return { agent: a.id, kind: "referral", via: "referrer" };
  if (via === "agent") return { agent: "unknown", kind: "referral", via: "link" };
  if (via === "browser-agent") return { agent: "browser-agent", kind: "browser", via: "heuristic" };
  return { agent: null, kind: null, via: null };
}

/** The step an event counts toward. */
export function stepOf({ event, path = "", method = "GET", status = 200, kind = null }) {
  switch (event) {
    case "request": {
      if (status >= 400) return null;
      // Crawlers and search indexers read for later; whatever they fetch, they only count as reach.
      if (kind === "crawler" || kind === "search") return "reach";
      const hit = SURFACES.find(([re]) => re.test(path));
      if (hit) return hit[1];
      if (method !== "GET" && method !== "HEAD") return "act";
      if (ACCOUNT_PATH.test(path)) return "account";
      return "understand";
    }
    case "agent_visit": case "prompt_copy": return "reach";
    case "form_start": return "act";
    case "form_submit": case "api_call": case "mcp_session": case "tool_call": return "act";
    case "first_value": return "first_value";
    case "claim_click": case "signup_from_agent": return "account";
    case "activated": return "activated";
    default: return null;
  }
}

const cut = (v, n) => (v == null || v === "" ? null : String(v).slice(0, n));

/**
 * A raw event (from the tag, a tap, or a log line) to the stored shape. Returns null for events
 * that are not about agents (a plain human page view), so nothing else is kept.
 */
export function classify(raw, { now = Date.now() } = {}) {
  if (!raw || !EVENTS[raw.event]) return null;
  // Our own tools never count: the lint and the dashboard's test button.
  if (/aai-lint\/|aai-test/.test(raw.ua || "") && raw.event !== "test") return null;
  const who = identify({ ua: raw.ua || "", referrer: raw.referrer || "", utm: raw.utm || "", via: raw.via || "", signatureAgent: raw.signatureAgent || "" });
  const path = cut(raw.path, 300) || "/";
  // A server request with no agent signal counts only on agent surfaces (an unnamed client reading llms.txt).
  if (!who.agent) {
    if (raw.event === "request" && !isAgentSurface(path)) return null;
    if (raw.event === "agent_visit" || raw.event === "form_start" || raw.event === "form_submit") return null;
    who.agent = "unknown"; who.kind = raw.event === "request" ? "script" : "unknown"; who.via = "surface";
    if (raw.event !== "request") who.via = "action";
  }
  const ts = raw.ts && !isNaN(Date.parse(raw.ts)) ? Math.min(Date.parse(raw.ts), now + 60_000) : now;
  return {
    id: cut(raw.id, 40) || Math.random().toString(36).slice(2, 12),
    ts: new Date(ts).toISOString(),
    site: cut(raw.site, 80) || "default",
    event: raw.event,
    step: stepOf({ event: raw.event, path, method: raw.method || "GET", status: +raw.status || 200, kind: who.kind }),
    agent: who.agent, kind: who.kind, via: who.via,
    path, method: cut(raw.method, 8),
    status: raw.status ? +raw.status : null,
    session: cut(raw.session, 64), cid: cut(raw.cid, 64),
    tool: cut(raw.tool, 80), source: cut(raw.source, 16) || "unknown",
    ...(raw.verified === true ? { verified: true } : {}), // no undefined fields: stores like Firestore reject them
  };
}

export function agentById(id) {
  return AGENTS.find((a) => a.id === id) || { id, label: id === "unknown" ? "Unnamed agent" : id === "browser-agent" ? "Browser agent (heuristic)" : id, kind: "unknown", vendor: "" };
}

/** One regex of every UA token, for taps that must decide fast whether to report a request. */
export const AGENT_UA = new RegExp(AGENTS.flatMap((a) => a.tokens).map((t) => t.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("|"));
