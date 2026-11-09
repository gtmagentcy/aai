# Agent guide: the AAI repo

For coding agents working in this repository, or for an owner's agent using the local dashboard.

## Run it

- `node cli/aai.mjs serve`: the dashboard and collector at http://localhost:4319 (Funnel, Install, Ask).
- `node cli/aai.mjs <url>`: lint a site, then the dashboard with the agent's view and the builder.
- `node cli/aai.mjs demo`: a demo site with all three taps and about a hundred simulated agents.
- `node --test test/`: unit and end-to-end tests. Run them before any commit.

No dependencies. Node 20+. Keep it that way: no npm packages in `lib/`, `collector/`, `taps/`, `pixel/`.

## The dashboard's MCP server

`POST http://localhost:4319/mcp` (Streamable HTTP, read-only). Tools: `list_sites`, `get_funnel`,
`get_drop_offs`, `get_journey`, `get_fix_prompt`, `get_install_snippet`. Connect with
`claude mcp add --transport http aai-local http://localhost:4319/mcp`.

## Where things are

- `lib/agents.js`: the agent registry and the event model. One file; add agents here, with a
  source in docs/research. Order matters: specific tokens before general ones.
- `collector/`: the JSONL store, the funnel maths, the MCP server, install snippets.
- `taps/`: server, action and fetch taps. `pixel/aai.js`: the browser tag.
- `app/`: the dashboard (no framework). `measure.js` is the Measure half.
- `SPEC.md` §6: the event model, normative.

## Rules

- Never store IPs, form values, tool arguments or results. Tests check this.
- A human visit with no agent signal sends nothing.
- Don't add a vendor's token to the registry without a source; mark unconfirmed ones `confirmed: false`.
