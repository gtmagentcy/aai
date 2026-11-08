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

Live site the same day, before that deploy: `npx github:NetanelBaruch/aai gtmagentcy.com` → 12 of 14,
  failing exactly those two checks.

## Still open

- Value before the gate is scored by walk-through, not by the scan. Ours has not been walked yet.
- `request_meeting` is our one write. A second no-login first value (a fit score an agent can
  fetch for its person) would let an agent bring a result back before asking for a meeting.
- Measure it: agent requests received, how many came with `approvedByUser`, how many booked.
