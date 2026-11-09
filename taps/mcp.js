/**
 * Action tap for MCP servers and agent APIs. Counts the part of the funnel only you can see:
 * the agent acting, the person getting a first value, and the signup that follows.
 *
 *   import { mcpTap } from "aai/taps/mcp.js";
 *   const t = mcpTap({ site: "yoursite", collector, firstValue: ["get_quote", "create_sandbox"] });
 *
 *   // in your MCP HTTP handler, before you answer:
 *   const { cid } = await t.observe(jsonRpcBody, { mcpSession: req.headers["mcp-session-id"], ua, ip });
 *   // put the claim link in a tool result the person will see:
 *   t.claimUrl("https://you.com/signup", cid)
 *
 *   // in your signup route, when the request carries aai_cid:
 *   t.track("signup_from_agent", { cid: body.aai_cid });
 *   // later, when the account does the thing that counts:
 *   t.track("activated", { cid });
 *
 * Tool arguments and results are never sent, only the tool's name.
 */
import { createTap, newCid, claimUrl } from "./core.js";

export function mcpTap(opts = {}) {
  const tap = opts.tap || createTap(opts);
  const firstValue = new Set(opts.firstValue || []);
  const cids = new Map(); // MCP session id -> cid, for the life of the process

  async function observe(body, { mcpSession, ua = "", ip = "" } = {}) {
    // The journey id comes from ip + user-agent (hashed), the same as the server tap's, so reading
    // llms.txt and calling a tool join up. The MCP session id only keeps the cid stable.
    const session = undefined;
    const msgs = Array.isArray(body) ? body : [body];
    let cid = mcpSession ? cids.get(mcpSession) : undefined;
    for (const m of msgs) {
      if (!m || typeof m !== "object") continue;
      if (m.method === "initialize") {
        cid = cid || newCid();
        if (mcpSession) cids.set(mcpSession, cid);
        await tap.track("mcp_session", { cid, session, ua, ip, tool: m.params?.clientInfo?.name, path: "/mcp" });
      } else if (m.method === "tools/call") {
        const name = String(m.params?.name || "").slice(0, 80);
        cid = cid || newCid();
        if (mcpSession) cids.set(mcpSession, cid);
        await tap.track("tool_call", { cid, session, ua, ip, tool: name, path: "/mcp" });
        if (firstValue.has(name)) await tap.track("first_value", { cid, session, ua, ip, tool: name, path: "/mcp" });
      }
    }
    return { cid };
  }

  return { observe, track: tap.track, claimUrl, newCid };
}

/** For a plain API route an agent calls: count it, and hand back a cid for the claim link. */
export function apiTap(opts = {}) {
  const tap = opts.tap || createTap(opts);
  return {
    async call(name, { cid, ua = "", ip = "", firstValue = false, path } = {}) {
      cid = cid || newCid();
      await tap.track("api_call", { cid, ua, ip, tool: name, path });
      if (firstValue) await tap.track("first_value", { cid, ua, ip, tool: name, path });
      return { cid };
    },
    track: tap.track, claimUrl,
  };
}
