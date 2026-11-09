# Taps: how the agent funnel gets measured

Most assistants never run JavaScript. ChatGPT, Claude and Perplexity fetch your HTML from their
servers, so a browser pixel alone sees almost none of them. AAI measures with three taps that feed
one collector and one funnel (SPEC.md §6).

| Tap | File | Sees | Install where |
|---|---|---|---|
| Server | `node.js`, `fetch.js` | Agents by User-Agent or `Signature-Agent`; every read of llms.txt, agents.md, OpenAPI, the MCP card | Your web server, middleware or edge |
| Action | `mcp.js` (`mcpTap`, `apiTap`) | MCP sessions, tool calls, API calls, first value, signup, activation | Your MCP server and the routes agents call |
| Browser | `../pixel/aai.js` | People from an assistant's answer, agent links, browser agents (heuristic), prompt copies, forms | Your pages, one script tag |

All three share `core.js`: fire-and-forget, never throws into your request path, runs on Node 20+,
Vercel, Next.js, Cloudflare Workers, Deno and Bun.

## Install

```sh
npm i github:NetanelBaruch/aai
```

```js
// Express / Connect / Firebase Functions
import { aai } from "aai/taps/node.js";
app.use(aai({ site: "yoursite", collector: process.env.AAI_COLLECTOR, secret: process.env.AAI_SECRET }));

// Cloudflare Worker, Vercel, any (request) => Response
import { withAai, observe } from "aai/taps/fetch.js";
export default { fetch: withAai(handler, { site: "yoursite", collector }) };

// MCP server: count tool calls, mark first value, hand a claim link
import { mcpTap } from "aai/taps/mcp.js";
const t = mcpTap({ site: "yoursite", collector, firstValue: ["get_quote"] });
const { cid } = await t.observe(body, { mcpSession, ua, ip });
t.claimUrl("https://you.com/signup", cid);   // in the tool result
t.track("signup_from_agent", { cid });       // in your signup route
```

```html
<script src="https://<collector>/aai.js" data-site="yoursite" defer></script>
```

The dashboard (`aai serve`, Install page) prints these filled in for your site and stack, and
has a "Send a test event" button.

## Where events go

`collector` is any AAI collector: `aai serve` on your machine for testing, `aai serve --host
0.0.0.0` on a server your site can reach, or a hosted one. The dashboard always answers on its
own machine only; only `POST /e` and `/aai.js` are open to other clients.

## Privacy

- The IP is hashed on your server with your `secret` and the date into a session id, then dropped.
- No cookies. The browser tag keeps one random id in sessionStorage, and sends nothing for a
  visit with no agent signal.
- Tool arguments, results and form values are never sent; only names.
