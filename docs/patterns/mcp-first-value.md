# Pattern: first value over MCP

One tool that gives an agent a real result with no account. It is the single biggest input to
"Value before the gate" (60% of it).

## Pick the result

| Product | No-login first value |
|---|---|
| Auth, email, payments APIs | A test-mode instance with keys |
| B2B SaaS with a demo | Available slots and a booked demo |
| Services | A quote request with a reference and a reply date |
| E-commerce | Search, fit notes, and a cart with a checkout link |
| Analytics, data | A sample report on public or uploaded data |

## Shape

- Read-only or sandboxed. Nothing touches production or another customer.
- Small inputs, structured outputs, a `next` field telling the agent what to tell its person.
- Expiry and a claim link for anything it creates.
- Announce it: `/.well-known/mcp.json`, `llms.txt`, and a line in `agents.md`.

```json
{
  "mcpServers": {
    "yourproduct": { "url": "https://yourproduct.com/mcp", "transport": "streamable-http", "auth": "none" }
  },
  "serverInfo": { "name": "yourproduct", "title": "Your product" },
  "rules": "https://yourproduct.com/agents.md"
}
```

## Abuse controls

Rate-limit per IP and per instance, cap resources per sandbox, expire unclaimed work, and keep an
allowlist of what the sandbox can reach.
