/**
 * Install snippets per stack, filled in with the site key and the collector's origin. Shown on the
 * Install page and returned by the MCP tool get_install_snippet.
 */
export function snippets({ site = "yoursite", collector = "http://localhost:4319" } = {}) {
  const env = `AAI_COLLECTOR=${collector}\nAAI_SITE=${site}\nAAI_SECRET=<a long random string>`;
  const install = "npm i github:NetanelBaruch/aai";
  return {
    html: {
      title: "Browser tag", tap: "browser",
      note: "Sees people arriving from an assistant's answer, agents in a real browser, prompt copies and forms. Paste before </head>. Mark the form an agent should use with data-aai-form.",
      files: [{ name: "index.html", code: `<script src="${collector}/aai.js" data-site="${site}" defer></script>\n\n<!-- the form agents use for the core job -->\n<form data-aai-form="book-demo" method="post" action="/api/demo">…</form>\n\n<!-- a prompt people paste into their assistant -->\n<button data-agent-prompt-copy="Book a demo with ${site}">Copy prompt</button>\n\n<script>\n  // when the person gets a result before any account\n  aai.track("first_value", { tool: "quote" });\n  // on signup, send aai.cid() with the form so the signup joins the agent's journey\n</script>` }],
    },
    express: {
      title: "Node / Express", tap: "server",
      note: "Sees assistants that fetch without JavaScript (ChatGPT-User, Claude-User, Perplexity-User) and every read of llms.txt, agents.md, openapi.json and the MCP card.",
      files: [{ name: "shell", code: install }, { name: ".env", code: env }, { name: "server.js", code: `import { aai } from "aai/taps/node.js";\n\napp.use(aai({\n  site: process.env.AAI_SITE,\n  collector: process.env.AAI_COLLECTOR,\n  secret: process.env.AAI_SECRET,\n}));` }],
    },
    nextjs: {
      title: "Next.js", tap: "server",
      note: "Middleware runs before your pages, so the status is counted as 200. Exclude _next assets in the matcher.",
      files: [{ name: "shell", code: install }, { name: ".env", code: env }, { name: "middleware.ts", code: `import { observe } from "aai/taps/fetch.js";\nimport type { NextRequest, NextFetchEvent } from "next/server";\n\nexport function middleware(req: NextRequest, ev: NextFetchEvent) {\n  ev.waitUntil(observe(req, {\n    site: process.env.AAI_SITE!,\n    collector: process.env.AAI_COLLECTOR!,\n    secret: process.env.AAI_SECRET!,\n  }));\n}\n\nexport const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };` }],
    },
    vercel: {
      title: "Vercel (any framework)", tap: "server",
      note: "Routing Middleware runs before the cache on every request, for any framework on Vercel.",
      files: [{ name: "shell", code: install }, { name: "middleware.js", code: `import { observe } from "aai/taps/fetch.js";\nimport { waitUntil } from "@vercel/functions";\n\nexport default function middleware(req) {\n  waitUntil(observe(req, { site: "${site}", collector: process.env.AAI_COLLECTOR, secret: process.env.AAI_SECRET }));\n}` }],
    },
    cloudflare: {
      title: "Cloudflare Worker", tap: "server",
      note: "Wrap the Worker's fetch handler; reporting runs in waitUntil and never slows the response.",
      files: [{ name: "shell", code: install }, { name: "worker.js", code: `import { withAai } from "aai/taps/fetch.js";\n\nexport default {\n  fetch: withAai((req, env) => fetch(req), {\n    site: "${site}",\n    collector: "${collector}",\n  }),\n};` }],
    },
    firebase: {
      title: "Firebase Functions", tap: "server",
      note: "Static files on Firebase Hosting never reach a function; rewrite llms.txt and agents.md to a function, or import the Hosting logs with `aai import`.",
      files: [{ name: "shell", code: install }, { name: "index.js", code: `import { onRequest } from "firebase-functions/v2/https";\nimport { aai } from "aai/taps/node.js";\n\nexport const api = onRequest(aai.wrap(handler, {\n  site: "${site}",\n  collector: process.env.AAI_COLLECTOR,\n  secret: process.env.AAI_SECRET,\n}));` }],
    },
    mcp: {
      title: "MCP server or agent API", tap: "action",
      note: "Counts the steps only you can see: tool calls, the first value, and the signup that follows (joined by the claim id). Tool arguments are never sent.",
      files: [{ name: "shell", code: install }, { name: "mcp.js", code: `import { mcpTap } from "aai/taps/mcp.js";\n\nconst t = mcpTap({\n  site: "${site}", collector: process.env.AAI_COLLECTOR, secret: process.env.AAI_SECRET,\n  firstValue: ["get_quote"],          // tools that give the person a result with no account\n});\n\n// in the MCP HTTP handler, before answering\nconst { cid } = await t.observe(body, { mcpSession: req.headers["mcp-session-id"], ua: req.headers["user-agent"], ip });\n\n// in the first-value result, hand the person a claim link\nconst link = t.claimUrl("https://${site}/signup", cid);\n\n// in the signup route\nif (body.aai_cid) t.track("signup_from_agent", { cid: body.aai_cid });` }],
    },
    logs: {
      title: "Access logs", tap: "server",
      note: "No code on the site: import a Combined Log Format file (nginx, Apache, most CDNs). IPs are hashed and dropped.",
      files: [{ name: "shell", code: `npx github:NetanelBaruch/aai import access.log --site ${site}` }],
    },
  };
}
