# Pattern: agent sign-up, account last

The flow most products should build first. The agent reaches a working first result with no
account, then signs its person up with their own email after a yes, and the account keeps what the
agent made.

```
person ──"add sign-in with Passline"──▶ agent
agent ──read /llms.txt, /agents.md──────▶ product
agent ──create_dev_instance (no login)──▶ product ──▶ test keys, instance id, claim URL
agent ──wires the code, tests it────────▶ works
agent ──"create your account as dana@…?"▶ person ──"yes"
agent ──POST /api/agent-signup──────────▶ product ──▶ 201, verification email to the person
person ──clicks the link─────────────────▶ product ──▶ account owns the instance
```

## What the product exposes

**1. A no-login first value.** Over MCP or a keyless endpoint:

```json
// MCP tool: create_dev_instance
{ "name": "create_dev_instance",
  "description": "Creates a development instance with test keys. No account needed. Test mode only; expires in 7 days unless claimed.",
  "inputSchema": { "type": "object", "properties": { "project": { "type": "string" } }, "required": ["project"] } }
```

Returns:

```json
{ "instance": "ins_7c21", "publishableKey": "pk_test_…", "secretKey": "sk_test_…",
  "mode": "test", "expires": "2026-11-15T00:00:00Z", "claim": "https://passline.dev/claim/7c21" }
```

**2. An agent sign-up endpoint.**

```http
POST /api/agent-signup
Content-Type: application/json

{ "email": "dana@brightwellpay.com",
  "name": "Dana",
  "instance": "ins_7c21",
  "approvedByUser": true,
  "agent": "Claude Code" }
```

```json
201 { "ok": true, "account": "acc_93f1", "verify": "sent",
      "claim": "https://passline.dev/claim/7c21",
      "next": "Tell the person to verify their email; the instance is already attached." }
```

## Rules

- Refuse without `approvedByUser: true`, with a message the agent can relay.
- The email MUST be the person's own. Send verification to it; the account is not live until the
  person clicks.
- The no-login instance is test mode only: no production data, no real sends, no billing.
- Rate-limit by IP and by instance; expire unclaimed instances.
- Say all of this in `agents.md` so the agent knows it may do it.

## What to measure

Instances created by agents, instances claimed, time from first call to claim, and the share of
sign-ups that arrive with a working integration.
