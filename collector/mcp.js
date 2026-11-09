/**
 * The dashboard as an MCP server (Streamable HTTP, stateless, read-only), so the owner's own
 * agent can ask about the agent funnel and fetch the fix. POST /mcp on the local app.
 *
 * Tools: list_sites, get_funnel, get_drop_offs, get_journey, get_fix_prompt, get_install_snippet
 */
import { FIXES } from "../lib/fixes.js";
import { STEP_IDS } from "../lib/agents.js";
import { snippets } from "./snippets.js";

const TOOLS = [
  { name: "list_sites", description: "Sites that have sent agent events to this collector, with event counts.", inputSchema: { type: "object", properties: {} } },
  { name: "get_funnel", description: "The agent funnel for a site: journeys per step (reach, understand, rules, act, first_value, account, activated), conversion between steps, per-agent breakdown and key metrics.", inputSchema: { type: "object", properties: { site: { type: "string" }, days: { type: "number", default: 30 } } } },
  { name: "get_drop_offs", description: "Where agent journeys stop, biggest loss first, with the agents that stopped there and the fix for each.", inputSchema: { type: "object", properties: { site: { type: "string" }, days: { type: "number", default: 30 } } } },
  { name: "get_journey", description: "One agent journey, event by event (from get_funnel's recent list).", inputSchema: { type: "object", properties: { key: { type: "string" } }, required: ["key"] } },
  { name: "get_fix_prompt", description: "A prompt for a coding agent that fixes the drop-off at a step.", inputSchema: { type: "object", properties: { step: { type: "string", enum: STEP_IDS } }, required: ["step"] } },
  { name: "get_install_snippet", description: "The code to install the AAI taps for a stack.", inputSchema: { type: "object", properties: { stack: { type: "string", enum: ["html", "express", "nextjs", "cloudflare", "vercel", "firebase", "mcp", "logs"] }, site: { type: "string" }, collector: { type: "string" } }, required: ["stack"] } },
];

export function mcpHandler({ store, origin }) {
  const call = (name, a = {}) => {
    switch (name) {
      case "list_sites": return store.sites();
      case "get_funnel": { const f = store.funnel({ site: a.site, days: a.days || 30 }); delete f.daily; return f; }
      case "get_drop_offs": return store.funnel({ site: a.site, days: a.days || 30 }).dropOffs.map((d) => ({ ...d, fix: FIXES[d.to] }));
      case "get_journey": { const j = store.journey(a.key); return j ? { ...j, steps: [...j.steps] } : { error: "No journey with that key." }; }
      case "get_fix_prompt": return FIXES[a.step] || { error: "Unknown step." };
      case "get_install_snippet": { const s = snippets({ site: a.site || "yoursite", collector: a.collector || origin })[a.stack]; return s || { error: "Unknown stack." }; }
      default: throw Object.assign(new Error("Unknown tool"), { code: -32602 });
    }
  };
  return function handle(msg) {
    const { id, method, params } = msg || {};
    const ok = (result) => ({ jsonrpc: "2.0", id, result });
    if (method === "initialize") return ok({ protocolVersion: params?.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "aai-local", version: "0.3.0" } });
    if (method === "notifications/initialized" || id === undefined) return null;
    if (method === "ping") return ok({});
    if (method === "tools/list") return ok({ tools: TOOLS });
    if (method === "tools/call") {
      try { return ok({ content: [{ type: "text", text: JSON.stringify(call(params?.name, params?.arguments), null, 2) }] }); }
      catch (e) { return { jsonrpc: "2.0", id, error: { code: e.code || -32603, message: e.message } }; }
    }
    return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } };
  };
}
