# Implementing AAI

The build order for a product team, cheapest points first. Each step names the dimension it moves
and what "done" looks like. Most teams get through steps 1 to 6 in a week; steps 7 to 9 are the
product work, and they are where agents start choosing you.

## Before you start: pick the core job

Write one sentence: "An agent acting for a new person should be able to ___ on our product."
Book a demo. Get a quote. Get a working login. Send a first email from a sandbox. Everything below
serves that one job. Do the others later.

## 1. Let agents in (cap removal)

Check `robots.txt` for `Disallow: /` under `GPTBot`, `ClaudeBot`, `PerplexityBot`,
`OAI-SearchBot` or `*`, and for a bot wall in front of every page. Either one caps the score at 10.
**Done:** `npx github:NetanelBaruch/aai yoursite.com` shows "AI crawlers are allowed".

## 2. Render the content in the HTML (Discover)

If the page is empty until JavaScript runs, most agents read nothing. Server-render the home page,
pricing, docs and the core-job page. **Done:** `curl yoursite.com | wc -c` shows your words.

## 3. Publish llms.txt (Discover)

[`templates/llms.txt`](../templates/llms.txt). What you do, for whom, the core job, and the links
an agent should read first (docs, pricing, agents.md, OpenAPI, MCP). Keep it under a few hundred
lines; agents skim.

## 4. Publish agents.md (Boundaries)

[`templates/agents.md`](../templates/agents.md) and
[patterns/boundaries.md](patterns/boundaries.md). A Permitted list, a Not permitted list, when to
ask the person first, and how to reach a human. This is the file that turns "I'm not sure I'm
allowed to" into an action.

## 5. Make the core form submittable (Act)

[patterns/agent-forms.md](patterns/agent-forms.md). A real `action` URL, a plain POST, named
fields, a readable response. If the form posts through a third-party widget, add a small endpoint
of your own beside it. This is the 3% check from the benchmark.

## 6. Describe what agents may call (Act)

Publish `/openapi.json` for the endpoints in agents.md, even if there is only one, and
`/.well-known/mcp.json` if you run an MCP server. Templates in [`templates/`](../templates).

## 7. Design one first value with no login (Value before the gate)

[patterns/mcp-first-value.md](patterns/mcp-first-value.md). One read-only or sandboxed tool that
gives the agent a real result before any account: a dev instance, a quote, a preview, a cart.
Rate-limit it, expire it, and keep it away from production data.

## 8. Let the agent sign the person up, last (Value before the gate)

[patterns/agent-sign-up.md](patterns/agent-sign-up.md). After the first value, the agent asks its
person "create your account as you@…?" and, on a yes, calls your sign-up endpoint with
`approvedByUser: true`. Verification still goes to the person's inbox.

## 9. Keep the work with a claim link (Value before the gate)

[patterns/claim-link.md](patterns/claim-link.md). The account takes over what the agent made, so
the person never redoes setup.

## 10. Test it the way you test the UI

Run the core job weekly from Claude, ChatGPT, Perplexity and a coding agent, with the same prompt.
Note where each one stops. Add the lint to CI with `--strict` so a deploy can't remove a file.

```yaml
# .github/workflows/aai.yml
on: { schedule: [{ cron: "0 6 * * 1" }], workflow_dispatch: {} }
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: npx -y github:NetanelBaruch/aai https://yoursite.com --strict
```
