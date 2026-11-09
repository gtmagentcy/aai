# Tracking the agent funnel: what agents send, what runs JS, and who measures it

Research date: 2026-11-09. Most AI traffic that reaches a site in 2026 is not a browser. Training crawlers, search indexers and user-triggered fetchers send a named user-agent token, fetch raw HTML, and do not run JavaScript. A server-side tap sees them. A browser pixel does not. Browser agents (ChatGPT's cloud browser, Claude's hosted browser, Google-Agent, Comet, Atlas) do run JavaScript. Most of them look like Chrome, so a pixel sees them but cannot name them. The ones that identify themselves do it in HTTP headers (a UA token, or a Web Bot Auth signature), and those are again only visible server-side. Referral signals from assistants exist but broke in October 2026 for ChatGPT. Every vendor we found (Cloudflare, Vercel, Known Agents, Profound, Scrunch, Knowatoa) measures crawls and, at best, referrals. None publishes an open-source funnel that follows an agent from first fetch to an action, first value and a signup. That is the gap for AAI. The server tap and the MCP/API tap matter most. The JS tag is for human referrals and the minority of browser agents.

---

## 1. Agent and crawler registry (as of 2026-11-09)

Purpose classes used below:

- **train**: crawls for model training.
- **index**: crawls to build an AI search index.
- **fetch**: fetches a page because a user asked a question right now.
- **browser**: a full browser that an agent drives (clicks, forms).
- **control**: a robots.txt token only. It never appears in a User-Agent header.

"Runs JS" means whether the client executes page JavaScript, so a browser tag would fire.

| Token | Vendor | Purpose | Runs JS? | Official doc | IP ranges |
|---|---|---|---|---|---|
| `GPTBot` | OpenAI | train | No ([Vercel, 2024-12-17](https://vercel.com/blog/the-rise-of-the-ai-crawler)) | [OpenAI bots](https://developers.openai.com/api/docs/bots) | https://openai.com/gptbot.json |
| `OAI-SearchBot` | OpenAI | index | No ([Vercel](https://vercel.com/blog/the-rise-of-the-ai-crawler)) | [OpenAI bots](https://developers.openai.com/api/docs/bots) | https://openai.com/searchbot.json |
| `ChatGPT-User` | OpenAI | fetch (also GPT Actions) | No ([Vercel](https://vercel.com/blog/the-rise-of-the-ai-crawler)) | [OpenAI bots](https://developers.openai.com/api/docs/bots) | https://openai.com/chatgpt-user.json |
| `OAI-AdsBot` | OpenAI | checks ad landing pages | Unknown | [OpenAI bots](https://developers.openai.com/api/docs/bots) | https://openai.com/adsbot.json |
| ChatGPT agent / "Cloud browser" (no UA token; `Signature-Agent: "https://chatgpt.com"`) | OpenAI | browser | Yes, it is browser automation ([Willison, 2025-08-04](https://simonwillison.net/2025/Aug/4/chatgpt-agents-user-agent/)) | [Allowlisting](https://help.openai.com/en/articles/11845367-chatgpt-agent-allowlisting) | Keys: https://chatgpt.com/.well-known/http-message-signatures-directory |
| ChatGPT Atlas (no documented token; Chrome UA) | OpenAI | browser (user's own) | Yes, Chromium ([Plausible forum](https://plausible.nolt.io/674)) | none found | none |
| `ClaudeBot` | Anthropic | train | No ([Vercel](https://vercel.com/blog/the-rise-of-the-ai-crawler)) | [Anthropic crawlers](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler) | https://claude.com/crawling/bots.json |
| `Claude-SearchBot` | Anthropic | index | Unknown | same | same |
| `Claude-User` | Anthropic | fetch (claude.ai and Claude Code WebFetch) | Unknown | same; [Claude Code changelog 2.1.83](https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md) | same |
| `Claude-Agent` (token added to a normal browser UA) | Anthropic | browser (Anthropic-hosted, e.g. Claude Duet) | Yes, "a real browser" | [Hosted browsers](https://support.claude.com/en/articles/18234133-how-do-anthropic-hosted-browsers-identify-themselves-when-they-browse-the-web-on-a-user-s-behalf) | https://claude.com/.well-known/sail |
| Claude in Chrome (no documented token) | Anthropic | browser (user's own Chrome, extension) | Yes, runs inside the user's Chrome ([Anthropic](https://support.claude.com/en/collections/18031491-claude-in-chrome)) | not covered by the hosted-browser doc | none |
| `PerplexityBot` | Perplexity | index (says not used for model training) | No ([Vercel](https://vercel.com/blog/the-rise-of-the-ai-crawler)) | [Perplexity bots](https://docs.perplexity.ai/guides/bots) | https://www.perplexity.ai/perplexitybot.json |
| `Perplexity-User` | Perplexity | fetch | Unknown | same | https://www.perplexity.ai/perplexity-user.json |
| Comet (no documented token; Chrome UA) | Perplexity | browser (user's own) | Yes, Chromium ([MIT AI Agent Index](https://aiagentindex.mit.edu/2025/comet)) | none found | none |
| `Google-Extended` | Google | control (Gemini training and grounding) | n/a | [Google common crawlers](https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers) | n/a |
| `Googlebot` (feeds Gemini) | Google | index | Yes, renders JS ([Vercel](https://vercel.com/blog/the-rise-of-the-ai-crawler)) | same | common-crawlers.json (same page) |
| `Google-CloudVertexBot` | Google | crawls for Vertex AI Agents, on owner request | Unknown | same | https://developers.google.com/static/crawling/ipranges/common-crawlers.json |
| `Google-Agent` | Google | browser (Project Mariner and other Google-hosted agents) | Yes (browses and takes actions; UA includes `Chrome/`) | [Google user-triggered fetchers](https://developers.google.com/crawling/docs/crawlers-fetchers/google-agent) | https://developers.google.com/static/crawling/ipranges/user-triggered-agents.json |
| `Google-GeminiNotebook` (was `Google-NotebookLM`, kept until 2026-08) | Google | fetch | Unknown | same | user-triggered list |
| `bingbot` (feeds Copilot) | Microsoft | index | Unknown | No Copilot-specific UA found ([Hartzer, 2026-08](https://hartzer.it.com/microsoft-copilot/)) | via Bing verification |
| `meta-externalagent` | Meta | train / index | No ([Vercel](https://vercel.com/blog/the-rise-of-the-ai-crawler)) | [Meta crawlers](https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/) | not listed on the page |
| `meta-externalfetcher` | Meta | fetch | Unknown | same | not listed |
| `meta-webindexer` | Meta | index (Meta AI search) | Unknown | same | not listed |
| `Applebot` | Apple | index (Siri, Spotlight; may train) | Yes, "may render" ([Apple](https://support.apple.com/en-us/119829)) | [Apple](https://support.apple.com/en-us/119829) | http://search.developer.apple.com/applebot.json |
| `Applebot-Extended` | Apple | control (training opt-out) | n/a | same | n/a |
| `Amazonbot` | Amazon | train / product | Unknown | [Amazon](https://developer.amazon.com/amazonbot) | https://developer.amazon.com/amazonbot/ip-addresses/ |
| `Amzn-SearchBot` | Amazon | index (Alexa) | Unknown | same | https://developer.amazon.com/amazonbot/searchbot-ip-addresses/ |
| `Amzn-User` | Amazon | fetch | Unknown | same | https://developer.amazon.com/amazonbot/live-ip-addresses/ |
| `MistralAI-User` | Mistral | fetch | Unknown | [Mistral](https://docs.mistral.ai/robots) | https://mistral.ai/mistralai-user-ips.json |
| `DuckAssistBot` | DuckDuckGo | fetch (real time, not for training) | Unknown | [DuckDuckGo](https://duckduckgo.com/duckduckgo-help-pages/results/duckassistbot) | https://duckduckgo.com/duckassistbot.json |
| `Cursor/<ver>` in an Electron UA | Anysphere | coding agent fetch | Unknown | none; listed by [Known Agents](https://api.darkvisitors.com/agents/cursor), "no verification method" | none |
| `Claude-User (claude-code/<ver>; ...)` | Anthropic | coding agent fetch | Unknown | [changelog 2.1.83](https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md); sample string from [Known Agents](https://knownagents.com/agents/claude-code) | claude.com/crawling/bots.json (assumed, not stated) |
| `Codex`, `Devin`, `Google-Gemini-CLI` | OpenAI, Cognition, Google | coding agents | Unknown | none official; listed in [ai.robots.txt robots.json](https://github.com/ai-robots-txt/ai.robots.txt) with operator "Unclear" for Codex | none |

Notes on the table:

- OpenAI says `ChatGPT-User` is for user-initiated fetches and "robots.txt rules may not apply" ([OpenAI](https://developers.openai.com/api/docs/bots)). Perplexity says `Perplexity-User` "generally ignores robots.txt" ([Perplexity](https://docs.perplexity.ai/guides/bots)). Google says user-triggered fetchers "generally ignore robots.txt rules" ([Google](https://developers.google.com/crawling/docs/crawlers-fetchers/google-agent)).
- Anthropic tells site owners to match the `Claude-Agent` token, not the full string, and to check the source IP, because "anyone can send the same User-Agent header" ([Anthropic](https://support.claude.com/en/articles/18234133-how-do-anthropic-hosted-browsers-identify-themselves-when-they-browse-the-web-on-a-user-s-behalf)). Its IP file follows the draft `draft-kelley-webbotauth-sail-00`, which "is not yet a standard" (same source).
- Claude Code 2.1.83 changed WebFetch to "identify as `Claude-User` so site operators can recognize and allowlist Claude Code traffic via `robots.txt`" ([changelog](https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md)). A sample string with a `claude-code/<version>` suffix is reported by [Known Agents](https://knownagents.com/agents/claude-code). That suffix lets us split Claude Code from claude.ai fetches, but it is a third-party observation.
- OpenAI's help center now calls the agent browser "Cloud browser" in ChatGPT Work, and says ChatGPT agent as a product is no longer available ([OpenAI search snippets of help.openai.com/en/articles/11752874 and 11845367](https://help.openai.com/en/articles/11845367-chatgpt-agent-allowlisting); the page itself returned 403 to our fetcher).
- Microsoft: Vercel excluded Copilot from its 2024 study because "it lacks a unique user agent" ([Vercel](https://vercel.com/blog/the-rise-of-the-ai-crawler)). A 2026-08 write-up found no Microsoft doc for a consumer Copilot UA, IP file or robots token ([Hartzer](https://hartzer.it.com/microsoft-copilot/)).
- The open [ai.robots.txt](https://github.com/ai-robots-txt/ai.robots.txt) list (MIT) has 204 entries in `robots.json` on 2026-11-09, each with `operator`, `respect`, `function`, `frequency` and `description`. Its `function` field includes "AI Coding Agents" and "AI Agents". It also includes the new policy token `__usage_ai-training` from `draft-kelley-aipref-training-preference-signal` (checked by us from the raw file).

## 2. Who runs JavaScript, and can a page detect a browser agent?

**Crawlers and fetchers: no JS.** Vercel's study of its network found "none of the major AI crawlers currently render JavaScript", naming GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Meta-ExternalAgent, Bytespider and PerplexityBot. They do download JS files (ChatGPT 11.50% of requests, Claude 23.84%) but do not execute them. Gemini (through Googlebot) and AppleBot do render ([Vercel, 2024-12-17](https://vercel.com/blog/the-rise-of-the-ai-crawler)). This study is almost two years old. We found no newer public measurement. Treat "no JS" as the default for any `*-User`, `*Bot` and `*SearchBot` token until a vendor says otherwise.

**Browser agents: yes JS.** These drive a real Chromium:

- ChatGPT's agent sends a plain Chrome-on-Mac UA with `Sec-Ch-Ua-Platform: "Linux"` ([Willison](https://simonwillison.net/2025/Aug/4/chatgpt-agents-user-agent/)).
- Anthropic's hosted browser is "a real browser" with `Claude-Agent` appended ([Anthropic](https://support.claude.com/en/articles/18234133-how-do-anthropic-hosted-browsers-identify-themselves-when-they-browse-the-web-on-a-user-s-behalf)).
- Google-Agent's UA contains a `Chrome/` version ([Google](https://developers.google.com/crawling/docs/crawlers-fetchers/google-agent)).
- Atlas and Comet are Chromium browsers that analytics tools record as Chrome ([Plausible forum](https://plausible.nolt.io/674); [MIT AI Agent Index](https://aiagentindex.mit.edu/2025/chatgpt-atlas)).

**Client-side detection is weak.**

- `navigator.webdriver` must be `true` under WebDriver, but stealth tools override it, so a `false` proves nothing ([cside](https://cside.com/blog/detect-ai-agents-stealth-browsers)).
- CDP side effects (for example from `Runtime.enable`) are the strongest in-page signal against stock Playwright and Puppeteer. One 2026 paper finds "the primary detection signal arises ... from low-level execution artifacts introduced by browser automation APIs" ([arXiv 2607.26935](https://arxiv.org/pdf/2607.26935)). Frameworks can avoid those CDP domains or drop CDP (same source).
- Atlas and Comet run in the user's own browser profile. Vendors say simple UA checks "will not reliably differentiate Atlas or Comet from Chrome" ([HUMAN](https://humansecurity.com/learn/blog/chatgpt-atlas-vs-perplexity-comet-agentic-browsers/)). HUMAN reports one leak: Atlas fetches `favicon.ico` with a UA containing "ChatGPT Atlas" ([HUMAN](https://www.humansecurity.com/ai-agent/chatgpt-atlas/)). That is a background request, not the page view.
- Claude-Agent's token is in the HTTP UA, so `navigator.userAgent` probably exposes it too. Anthropic does not say so. We should test it.

**Takeaway.** The JS tag can label a browser agent only when (a) the server tap already saw a signed or tokened request and passes a flag into the page, or (b) the UA string carries a token. Everything else is a probability score, not a fact.

## 3. Web Bot Auth (HTTP Message Signatures for bots)

**What it is.** A bot signs each request under RFC 9421. It sends `Signature`, `Signature-Input` (with `tag="web-bot-auth"`, a `keyid` that is a JWK thumbprint, `created`, `expires`) and `Signature-Agent`. `Signature-Agent` is a double-quoted `https://` URL. It must be one of the signed components. Keys sit at `/.well-known/http-message-signatures-directory` as a JWK Set with content type `application/http-message-signatures-directory+json`. Ed25519 is used ([Cloudflare docs](https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/)).

**Standard status.** The IETF `webbotauth` working group is active. Its milestones were standards-track specs to the IESG by 2026-04-30 and a BCP by 2026-08-31 ([IETF WG](https://datatracker.ietf.org/wg/webbotauth/about/)). On 2026-11-09 the only WG document is `draft-ietf-webbotauth-httpsig-protocol-01` (2026-10-29). Related individual drafts include `draft-meunier-webbotauth-registry-04` (signature agent card), `draft-kelley-webbotauth-sail-00` (IP lists), `draft-illyes-webbotauth-jafar-01` (JSON IP ranges) and `draft-vilgalys-webbotauth-signed-agent-metadata-00` ([IETF documents](https://datatracker.ietf.org/wg/webbotauth/documents/)). So it is still a draft, and the milestones have slipped.

**Who signs.**

| Signer | `Signature-Agent` | Key directory | Source |
|---|---|---|---|
| ChatGPT agent / Cloud browser | `"https://chatgpt.com"` | https://chatgpt.com/.well-known/http-message-signatures-directory | [OpenAI help](https://help.openai.com/en/articles/11845367-chatgpt-agent-allowlisting), [Willison](https://simonwillison.net/2025/Aug/4/chatgpt-agents-user-agent/) |
| Google-Agent | identity `https://agent.bot.goog` ("experimenting") | under that host | [Google](https://developers.google.com/crawling/docs/crawlers-fetchers/google-agent) |
| Early Cloudflare cohort: Goose (Block), Browserbase, Anchor Browser | per vendor | per vendor | [Cloudflare blog](https://blog.cloudflare.com/signed-agents/) |
| Anthropic `Claude-Agent` | not signed; IP list instead | https://claude.com/.well-known/sail | [Anthropic](https://support.claude.com/en/articles/18234133-how-do-anthropic-hosted-browsers-identify-themselves-when-they-browse-the-web-on-a-user-s-behalf) |

**Cloudflare naming.** Cloudflare retired the "signed agent" class on 2026-07-01. Those agents are now verified bots labelled **intermediary** (many end users can operate them). Single-operator bots are labelled **direct** ([Cloudflare glossary](https://developers.cloudflare.com/bots/glossary/)). OpenAI lists Cloudflare bot tag `chatgpt-agent`, detection ID `129220581`. It says Akamai verifies the signatures automatically and Vercel recognises the traffic ([OpenAI help](https://help.openai.com/en/articles/11845367-chatgpt-agent-allowlisting)).

**How to verify server-side (no CDN).** This follows OpenAI's own steps ([OpenAI help](https://help.openai.com/en/articles/11845367-chatgpt-agent-allowlisting)) and Cloudflare's format rules ([Cloudflare](https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/)):

1. Read `Signature-Agent`. Match it exactly against an allowlist of known directories, quotes included.
2. Fetch the key directory over HTTPS and cache it, keyed by `keyid`.
3. Rebuild the signature base from the components in `Signature-Input` (usually `@authority`, `@method`, `@path`, `signature-agent`). Check `tag="web-bot-auth"` and the `created`/`expires` window.
4. Verify the Ed25519 signature. Record `verified=true|false|absent`.
5. Make sure any proxy passes all three headers through (OpenAI troubleshooting note, same source).

Cloudflare publishes a test endpoint (`https://crawltest.com/cdn-cgi/web-bot-auth`) and a `http-signature-directory` CLI. Its docs say it does not support some RFC 9421 parameters, such as `@query-params` ([Cloudflare](https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/)).

## 4. Referral signals from assistants

| Assistant | What arrives | Source |
|---|---|---|
| ChatGPT | Citation links usually carried `utm_source=chatgpt.com` plus a `chatgpt.com` referrer. Search-result clicks can land as Direct. | [Seer Interactive, updated 2026-06-22](https://www.seerinteractive.com/insights/are-ai-sites-like-chatgpt-sending-your-website-traffic) |
| ChatGPT ("More" links) | `utm_source=chatgpt` added from 2025-06-13 | [PPC Land](https://ppc.land/chatgpt-adds-utm-parameters-to-more-links-for-better-analytics-tracking/) |
| ChatGPT (since about 2026-10-07) | Reports say GPT-6 opens links with `noopener,noreferrer` and drops the UTM, so clicks look Direct. OpenAI has not confirmed it, and we found no report of a fix. | [Relevant Audience, 2026-10-15](https://www.relevantaudience.com/analytics/chatgpt-gpt-6-utm-referrer-dropped-direct-traffic/) |
| Claude | Referrer `claude.ai`; no UTMs by default | [Seer](https://www.seerinteractive.com/insights/are-ai-sites-like-chatgpt-sending-your-website-traffic) |
| Perplexity (and Comet clicks) | Referrer `perplexity.ai` (also `www.perplexity.ai`); no UTMs. Comet click-throughs look the same. | [Seer](https://www.seerinteractive.com/insights/are-ai-sites-like-chatgpt-sending-your-website-traffic); [Hitches](https://lawrencehitches.pages.dev/perplexity-referral-traffic/) |
| Gemini | Referrer `gemini.google.com`; it varies by surface (web, Workspace, mobile) | [Seer](https://www.seerinteractive.com/insights/are-ai-sites-like-chatgpt-sending-your-website-traffic); [MO Agency](https://www.mo.agency/blog/how-to-track-ai-traffic-and-referrals-in-google-analytics-4) |
| Copilot | `copilot.microsoft.com`; older `bing.com/chat` (path-based) and `edgeservices.bing.com` for the Edge sidebar | [MO Agency](https://www.mo.agency/blog/how-to-track-ai-traffic-and-referrals-in-google-analytics-4) |

Caveats:

- Native apps often send no Referer, so Cloudflare warns its crawl-to-refer ratios may be overstated ([Cloudflare](https://blog.cloudflare.com/ai-search-crawl-refer-ratio-on-radar/)).
- Most referrer lists come from agency blogs. Referrer data is a floor, not a count.
- The October 2026 ChatGPT change shows that one vendor's front-end change can wipe out the main attribution signal overnight. An owned signal (a claim id in the link or the agent session) is sturdier.

## 5. Competitors and adjacent tools

| Product | What it measures | Crawl only, or actions/conversions? | Open source | Price (public) |
|---|---|---|---|---|
| **Cloudflare AI Crawl Control** (was AI Audit) | Which AI services crawl, request patterns, robots.txt compliance, allow/block rules, pay per crawl (private beta) | Crawl and control | No | "Available on all plans" ([docs](https://developers.cloudflare.com/ai-crawl-control/)) |
| **Cloudflare Radar / BotBase** | Public bot directory with API; crawl-to-refer ratio by platform; Enterprise crawl-to-referral dashboard | Crawl vs referral | Directory data is public via API | Radar free; Enterprise Bot Management not public ([changelog](https://developers.cloudflare.com/changelog/post/2026-07-01-botbase-attribution-business-insights/), [Radar bots](https://developers.cloudflare.com/changelog/post/2025-07-01-radar-bots-insights/)) |
| **Vercel Observability, AI Traffic** | Requests per verified AI bot, most-crawled pages, "assistant retrievals", markdown requests, errors; verified, spoofed or unverifiable | Crawl and fetch | No | Querying needs Observability Plus ([changelog](https://vercel.com/changelog/ai-traffic-insights-now-available-in-vercel-observability), [bot verification](https://vercel.com/changelog/view-and-query-bot-verification-data-in-vercel-observability)) |
| **Known Agents** (formerly Dark Visitors; darkvisitors.com redirects there) | Agent analytics, AI chat referral tracking, auto robots.txt, bad-bot blocking, "agent readiness", agent identification API | Crawl plus referrals | No | Free (100K events), $29 (1M), $299 (10M), Enterprise custom ([pricing](https://knownagents.com/pricing)) |
| **Profound Agent Analytics** | CDN or log-drain ingestion (Vercel, Cloudflare, Akamai, Fastly, Netlify...); UA plus IP verification; AI citations, AI training, human referrals. Conversions come through its GA4 integration. | Crawl plus referrals; conversions only via GA4 | No | Trial and Enterprise (custom) on the pricing page ([pricing](https://www.tryprofound.com/pricing), [blog](https://www.tryprofound.com/blog/introducing-agent-analytics), [Akamai](https://product.tryprofound.com/changelog/track-all-bot-traffic-with-profound-and-akamai)) |
| **Scrunch AXP** (Scrunch is now part of Sitecore) | Serves a parallel, compressed version of the site to detected AI crawlers | Content delivery, not a funnel | No | Core $250/mo; AXP on Enterprise, custom ([Scrunch FAQ](https://ai-cdn.scrunchai.com/faqs/what-is-the-pricing-for-scrunch-plans), [Scrunch](https://scrunch.com/aeo-tools/scrunch/)) |
| **Knowatoa** | AI visibility; checks whether AI crawlers can reach a site | Reachability, not traffic | No | Reported $59 and $199/mo; we did not find Knowatoa's own price page ([Industry Lens](https://industry-lens.com/reports/signal-spotlight-knowatoa/md)) |
| **Akamai** | Bot reports (AI bot traffic "up more than 300%" in 2025); verifies ChatGPT agent signatures | Security and crawl | No | Not public ([Akamai](https://www.akamai.com/blog/security/2026/jan/ai-pulse-how-ai-bots-agents-will-shape-2026), [OpenAI help](https://help.openai.com/en/articles/11845367-chatgpt-agent-allowlisting)) |
| **Netlify** | No native AI-agent analytics found. It appears as a log source for Profound. | n/a | n/a | ([Profound changelog](https://product.tryprofound.com/changelog/track-all-bot-traffic-with-profound-and-akamai)) |
| **Upstash agent-analytics** | Next.js middleware; records ChatGPT, Claude, Perplexity "citations" into Redis | Fetch and referral | Yes, MIT | Free library ([GitHub](https://github.com/upstash/agent-analytics)) |
| **@apideck/agent-analytics** | Next.js middleware; 20+ crawlers plus generic clients (axios, curl) into PostHog | Crawl | Yes (npm) | Free ([Socket](https://socket.dev/npm/package/@apideck/agent-analytics)) |
| **@infrasity/agent-tracker** | Coding agents (Claude Code, Codex, Cursor) and crawlers on docs sites | Crawl; hosted dashboard is paid | Partly | ([pkgstats](https://www.pkgstats.com/pkg:@infrasity/agent-tracker)) |
| **ai.robots.txt** | Registry of 204 AI agents, plus generated blocklists for nginx, Apache, Caddy, HAProxy | Registry only | Yes, MIT | Free ([GitHub](https://github.com/ai-robots-txt/ai.robots.txt)) |

**The gap.** Every tool above answers "who crawled what" and, at most, "which human clicked through from an assistant". Profound joins crawls to conversions only by pulling GA4 into the same view, which counts human sessions ([Profound blog](https://www.tryprofound.com/blog/introducing-agent-analytics)). None of the tools we found measures:

- an agent **acting**: a form post, an API call, or an MCP tool call by an agent;
- an agent reaching **first value** in the product;
- the join between an agent session and the **account** it created or brought in;
- one event stream across the server, the browser and the MCP/API surface.

The open-source options are single-tap middlewares for Next.js. An open-source, self-hosted, multi-tap funnel with a claim id is not on the market, as far as this search found.

## 6. Implications for the AAI design

**Agent registry.** One versioned JSON file. Seed it from ai.robots.txt (MIT) and the vendor docs above. Each entry gets:

- `token`, `match` (substring or regex on UA), `vendor`, `purpose` (`train|index|fetch|browser|control|coding`), and `runsJs` (`yes|no|unknown`, plus a source URL).
- `verify`: one of `ip` (the IP JSON URL), `webbotauth` (the `Signature-Agent` value and key directory), `rdns` (Apple), or `none`.
- `robots`: whether the vendor says it honours robots.txt.
- `docs`: the official URL.
- `lastChecked`: a date.

Keep `Claude-User` with a `claude-code/` sub-match as its own row. Keep `Google-Extended` and `Applebot-Extended` as `control` rows that never match traffic. Refresh the IP files on a schedule and never hard-code ranges. Anthropic and Google both say the ranges change.

**Which taps matter most.**

1. **Server tap first.** About every named agent in section 1 is visible only here: crawlers, fetchers, coding agents, `Claude-Agent`, `Google-Agent`, and signed requests. Record `verified` (`ip`, `signature`, `none`) next to `claimed`, the way Vercel splits verified, spoofed and unverifiable. Log `Accept: text/markdown` and `llms.txt` hits too. Vercel counts "markdown requests" as a metric.
2. **MCP/API tap second.** This is where Act, First value and Account happen, and no competitor measures it. Put the claim id here: issue it when the agent first calls a tool, return it in the tool result, and accept it at signup. This does not depend on referrers that a vendor can drop (the ChatGPT case in October 2026).
3. **JS tag third.** It covers human referral clicks (referrer and UTM parsing for the hosts in section 4) and the browser agents. Do not try to fingerprint agents in the browser and call it fact. Report `navigator.webdriver` and the UA token as weak hints with a confidence field. Let the server tap hand a server-side verdict to the page, for example a signed, short-lived cookie or a header-to-page flag, so the browser event inherits a verified label.

**Funnel mapping.**

- **Reach**: any registry hit on the server tap.
- **Understand**: fetches of docs, `llms.txt`, markdown or OpenAPI.
- **Rules**: robots.txt, terms and `AGENTS.md` fetches.
- **Act**: a POST or an MCP tool call.
- **First value**: a tool result that returned data, or a signed-up user's first meaningful event.
- **Account**: signup with a claim id.
- **Activated**: the product's own activation event, sent to the collector with the same claim id.

**Privacy and GDPR.**

- Do not store raw IPs. Use the IP only in memory to verify against vendor ranges, then store `vendor`, `verified` and a coarse ASN or country if needed. Under EU law a dynamic IP address can be personal data ([CJEU C-582/14, Breyer](https://curia.europa.eu/juris/liste.jsf?num=C-582/14)).
- Bot traffic from published vendor ranges is not a person. But `fetch` and `browser` agents act for a person, and Atlas, Comet and Claude in Chrome run in that person's own browser. Treat those events as personal data.
- The JS tag should work without cookies by default. Storing or reading an identifier on the device falls under ePrivacy Art. 5(3) ([EDPB Guidelines 2/2023](https://www.edpb.europa.eu/our-work-tools/documents/public-consultations/2023/guidelines-22023-technical-scope-art-53-eprivacy_en)). Make the claim id first-party and visible, and tie it to signup, not to tracking across sites.
- Never log signature headers or request bodies wholesale. Keep `keyid`, `Signature-Agent` and the verification result. Strip query strings except whitelisted UTM keys.
- Self-hosted by default means the site owner is the controller. Ship a short data map (what each tap stores, retention default) so they can add it to their privacy notice.

**Open questions to test ourselves.**

- Does `navigator.userAgent` inside Anthropic's hosted browser carry `Claude-Agent`? Does Google-Agent's?
- Does Claude in Chrome add any header or token? We found no documentation.
- Did ChatGPT restore `utm_source` after the October 2026 change?
- Does Microsoft Copilot (Actions in Edge) identify at all?
- What do Codex, Devin and Cursor fetchers send today? Capture real logs before writing those registry rows.
