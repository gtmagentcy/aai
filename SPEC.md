# AAI specification, v0.2 (draft)

AAI, the Agent Application Interface, is the interface a product exposes to AI agents. This
document defines the term, its five dimensions, the artefacts that make each one up, how an AAI is
scored, and what a conforming implementation does. It is a working draft dated 8 November 2026; v0.2 (9 November 2026) adds §6, measuring the agent funnel.
The key words MUST, SHOULD and MAY are used as in RFC 2119.

## 1. Definition

**AAI (Agent Application Interface):** the interface a product exposes to AI agents: everything an
agent needs to find the product, act on it for its person, know what it may and may not do, and
reach the first useful result before anyone is asked to sign up.

- **Agent:** software acting for a person (an assistant, an answer engine, a coding agent, a
  browser agent).
- **Person:** the human the agent acts for. The person approves; the agent proposes.
- **Core job:** the one thing a new person comes to the product to get done (book a demo, get a
  quote, start a trial, get a working login).
- **First value:** the first useful result of the core job.
- **The gate:** the point where the product asks for an account, payment or identity.

An AAI is judged by one question: **can an agent finish the core job for its person, from first
visit to first value, inside the product's rules?**

### What it is not

- Not a file. `llms.txt` and `agents.md` are parts of an AAI.
- Not MCP. MCP is transport: whether an agent can connect. AAI is whether the job gets done.
- Not SEO, AEO or GEO. Those get a product considered; AAI gets it chosen.
- Not a chatbot on the website.

## 2. The five dimensions

### 2.1 Discover (20 points)

An agent can learn what the product does, for whom, and where to go next, without running a
browser and without a person reading the page.

- Key pages MUST render their content in the HTML response.
- `robots.txt` SHOULD NOT block the AI user agents the product wants to be found by.
- The site SHOULD publish `/llms.txt`: what the product does, for whom, and the links to read first.
- The home page SHOULD carry Organization and Product or Service JSON-LD.
- The site SHOULD publish `/sitemap.xml`.

### 2.2 Act (30 points)

An agent can complete the core job without a screen.

- The core form (demo, quote, sign-up, contact) SHOULD have a real `action` URL that accepts a
  plain `POST` (or `GET`) without JavaScript, and SHOULD return a machine-readable result.
- A booking link SHOULD be present in the HTML, not only inside a widget.
- Endpoints an agent may call SHOULD be described in OpenAPI at `/openapi.json`.
- Tools SHOULD be exposed over MCP and announced at `/.well-known/mcp.json`.

### 2.3 Value before the gate (25 points)

The account is asked for after the product moment, not before it.

- The product SHOULD offer one first result an agent can reach with no login: a sandbox, a
  development instance, a quote, a preview, a cart.
- When the person wants to keep it, the account SHOULD be created after an explicit yes, with the
  person's own email, and the result SHOULD carry over (a claim link). See
  [docs/patterns/agent-sign-up.md](docs/patterns/agent-sign-up.md).
- The product MAY offer a copy prompt a person pastes into their own agent to start the flow.
- No-login capabilities MUST be read-only, sandboxed, or reversible, and SHOULD be rate-limited.

### 2.4 Boundaries (15 points)

The product says what agents may and may not do, and how to recover.

- The site SHOULD publish `/agents.md` with a **Permitted** list and a **Not permitted** list.
- `agents.md` SHOULD say when the agent must ask its person first (anything that costs money,
  shares data, or cannot be undone).
- There MUST be a route to a person (an email address, a contact page) in the HTML.
- Endpoints SHOULD refuse requests that skip a required approval (for example `approvedByUser`
  missing) with a readable error.

### 2.5 Trust (10 points)

- The site MUST be served over HTTPS.
- The organisation SHOULD be verifiable (consistent name, domain, contact, structured data).
- Responses SHOULD be well-formed and cheap to read (key HTML under ~500 KB).

## 3. The AAI score (v1)

A score from 0 to 100.

| Dimension | Points | Inputs |
|---|---|---|
| Discover | 20 | HTML content, crawler access, llms.txt, structured data, metadata, sitemap, semantic structure, extractable facts |
| Act | 30 | submittable form 30%, booking URL 20%, OpenAPI 25%, MCP endpoint 25% |
| Value before the gate | 25 | copy prompt 20%, first result with no login 60%, account last via a claim link 20% |
| Boundaries | 15 | agents.md with permitted and not permitted 60%, a route to a person 40% |
| Trust | 10 | HTTPS, verifiable identity, response hygiene, page weight |

**Cap.** If an agent is blocked outright (for example `Disallow: /` for AI user agents, or a bot
wall on every page), the score is capped at 10.

**Public and private halves.** Discover, Act, Boundaries and Trust can be measured from the public
site: 75 points. Value before the gate needs a walk-through of the product.

**Outside the score: recommended.** Whether agents name the product when asked for its category's
job is the outcome the score predicts. Report it beside the score, never inside it.

## 4. Conformance bands

| Score | Band | What an agent says |
|---|---|---|
| 90–100 | Designed | "I set it up. Here is the result. Claim it with your email." |
| 70–89 | Operable | It does most of the job, then a login wall or a missing rule stops it. |
| 40–69 | Readable | "Here are three options. You'll have to sign up and try them." |
| 0–39 | Closed | Blocked, unreadable, or nothing to do. |

## 5. The person stays in charge

Every AAI flow MUST keep these:

1. The agent shows its person what it will send before it sends anything that creates an
   account, books time, spends money, or shares personal data.
2. The person's own contact details only. Never a guessed, placeholder or third-party address.
3. Payment, identity checks and irreversible actions stay with the person unless they have
   explicitly delegated them.
4. The product tells the agent the result in a form it can relay: a receipt, a reference, a link.

## 6. Measuring the agent funnel (AAI Events, v0.1)

The score says what an AAI should let an agent do. Events say what agents actually did. A site
that implements AAI SHOULD measure its agent funnel with the same stations the score uses, so a
fix can be checked against real traffic.

### 6.1 Steps

| Step | An agent journey reaches it when | Dimension |
|---|---|---|
| `reach` | Any agent fetches anything (crawlers and AI search only ever count here) | Discover |
| `understand` | An agent fetching for a person reads a page, `llms.txt`, OpenAPI or the MCP card | Discover |
| `rules` | It reads `agents.md` | Boundaries |
| `act` | It submits a form, calls an API, connects to MCP or calls a tool | Act |
| `first_value` | The person gets a result with no account | Value before the gate |
| `account` | The person opens a claim link or signs up from the agent's work | Value before the gate |
| `activated` | That account does the thing that counts | Value before the gate |

A journey counts at a step if it reached that step or any later one (agents skip steps).

### 6.2 Where events come from

Most assistants fetch HTML without running JavaScript, so a browser script alone undercounts.
Three taps feed one stream:

1. **Server tap**: requests whose User-Agent names an agent, requests with a `Signature-Agent`
   header (Web Bot Auth), and any request to an agent surface.
2. **Action tap**: MCP sessions, tool calls, API calls, first value, signup, activation.
3. **Browser tag**: people arriving from an assistant's answer (referrer or `utm_source`), visits
   by an agent link (`?via=agent`), agents driving a browser (heuristic), prompt copies, forms.

### 6.3 Event shape

```json
{ "site": "yoursite", "event": "tool_call", "ts": "2026-11-09T10:00:00Z",
  "ua": "…", "path": "/mcp", "method": "POST", "status": 200,
  "session": "9f2c…", "cid": "c_k3j…", "tool": "get_quote", "source": "action" }
```

Events: `request`, `agent_visit`, `prompt_copy`, `form_start`, `form_submit`, `api_call`,
`mcp_session`, `tool_call`, `first_value`, `claim_click`, `signup_from_agent`, `activated`.
The collector classifies each into `agent`, `kind` (user, browser, coding, search, crawler,
script, referral) and `step`.

### 6.4 Joining a journey

- `session`: a hash of a site secret, the date, the client IP and the User-Agent, computed on the
  site's server. It changes daily and the IP never leaves the server.
- `cid` (claim id): issued by the action tap when an agent acts, carried in the claim link
  (`?aai_cid=`) and sent with the signup. Events sharing a session or a cid are one journey.
  This keeps attribution working when an assistant drops the referrer.

### 6.5 Privacy (MUST)

- Do not store IP addresses, form values, tool arguments or tool results.
- Do not set cookies; the browser tag MAY use sessionStorage for one visit.
- Send nothing for a human visit with no agent signal.

## 7. Versioning

This spec uses `MAJOR.MINOR`. A change to the weights or to a MUST is a minor version while the
spec is below 1.0. Proposals go through an issue labelled `spec` and a pull request against this
file; see [CONTRIBUTING.md](CONTRIBUTING.md).

## 8. Evidence

AgentReady benchmark of 40 well-known SaaS sites, 7 September 2026: 83% had an llms.txt, 3% had a
form an agent could submit, 15% had an agent policy file, 5% exposed an MCP endpoint; median
readable score 99, median actionable 47. Method and limits:
https://gtmagentcy.com/agent-ready/benchmark.html
