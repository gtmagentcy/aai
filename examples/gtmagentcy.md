# Dogfooding: gtmagentcy.com's own AAI

We define AAI, so our own site goes first. This is the running record: what gtmagentcy.com exposes
to agents, what the lint and the score say, what we changed, and what is still open. Updated
8 November 2026.

## The core job

An agent acting for a founder or a marketing lead should be able to find out what GTMagentcy does,
judge whether it fits their company, and request a meeting for them, without anyone filling in a
form by hand.

## What we expose

| Piece | Where | Dimension |
|---|---|---|
| llms.txt, the offer brief | https://gtmagentcy.com/llms.txt | Discover |
| agents.md: permitted, not permitted, facts | https://gtmagentcy.com/agents.md | Boundaries |
| `request_meeting`: `POST /api/lead`, `approvedByUser: true` required | https://gtmagentcy.com/agents.md | Act |
| OpenAPI for that call | https://gtmagentcy.com/openapi.json | Act |
| MCP server (model chooser, read-only, no auth) | https://gtmagentcy.com/api/mcp | Act, Value before the gate |
| MCP server card | https://gtmagentcy.com/.well-known/mcp.json | Act |
| A copy prompt that has your own agent score the fit and send the request | https://gtmagentcy.com/live/ | Value before the gate |
| The free AAI scan, no signup | https://gtmagentcy.com/aai/ | Value before the gate |
| Booking link in the HTML, email on every page | https://calendar.app.google/7zY1nTEAh1uwyrjU6 | Act, Boundaries |

## Score history

| Date | AAI (public 75) | Discover | Act | Boundaries | Trust | Note |
|---|---|---|---|---|---|---|
| 2026-11-08 | 56 | 19 | 15 | 13 | 9 | Form and booking pass; no OpenAPI; the scanner didn't find the MCP server at `/api/mcp` |

## What we changed

- **2026-11-08:** published `/openapi.json` for `POST /api/lead` and `/.well-known/mcp.json`
  pointing at `/api/mcp`. Both were the lint's two failing checks. On the local branch every lint check
  passes except HTTPS, which fails only because localhost is plain http. The score is re-run after deploy.

Live site the same day, before that deploy: `npx github:gtmagentcy/aai gtmagentcy.com` → 12 of 14,
  failing exactly those two checks.

## The agent funnel, measured locally (2026-11-09)

All three AAI taps run on gtmagentcy's local dev server, switched on by one environment variable,
with production code untouched. This is `dev-server.mjs` in the gtmagentcy repo:

- **Server tap** on every request, static files included (llms.txt, agents.md, openapi.json, the MCP card).
- **Action tap** on `/api/mcp`. `choose_model` and `get_recommendation` count as first value: the
  person gets an answer with no account.
- On `/api/lead`, a `request_meeting` counts as Account. For an agency, the meeting is the signup.
- **Browser tag** injected into every page. `data-forms="all"`, so the scan box counts.

```sh
cd ~/projects/aai && node cli/aai.mjs http://localhost:8112 --no-open      # lint + dashboard + collector on :4319
cd ~/projects/gtmagentcy && AAI_COLLECTOR=http://localhost:4319 PORT=8112 node dev-server.mjs
node scripts/aai-dogfood-walk.mjs http://localhost:8112                    # 67 documented agents, local only
```

The walk sends real requests to the real endpoints. Only the user-agents are simulated, with the
strings each vendor documents. Meeting requests use `live-test+…@example.com`; locally, nothing is
stored and nothing goes to Slack.

**First run:** Reach 68 → Understand 45 → Rules 28 → Act 19 → First value 13 → Account 4. One real
browser visit arrived with `?utm_source=chatgpt.com`, counted as a ChatGPT referral, and started
the scan form. The lint scored the local site 13/14 (70/75, Operable).

**Found by the dogfood:** `agents.md` names "agent readiness" as a service and tells agents the
pages are at `/services/<slug>.html`, but `/services/agent-readiness.html` doesn't exist. An agent
following our own instructions gets a 404. Either add the page or point agents.md at `/aai/` or `/agent-ready/`.

**What the dashboard changed because of it:** a drop-off now reads the lint first.
- When the file exists (we have agents.md, OpenAPI and MCP), the advice is about agents reaching
  it, not "publish agents.md".
- Crawlers no longer count as dropping off.
- Activation isn't listed as a loss on a site that doesn't send activation events.

## Still open

- Value before the gate is scored by walk-through, not by the scan. Ours has not been walked yet.
- `request_meeting` is our one write. A second no-login first value (a fit score an agent can
  fetch for its person) would let an agent bring a result back before asking for a meeting.
- Measure it in production: put the same taps on the Firebase functions and the tag on the pages
  (milestone M2), then compare against the local walk.
- Hand a claim link in `choose_model` results (`aai_cid`) so a meeting joins the MCP session even
  when the agent's IP or user-agent changes between calls.
