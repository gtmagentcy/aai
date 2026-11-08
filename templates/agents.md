# Agent guide: Your Product

This file is for AI agents acting for a person. If that is you, here is what you can do.

## Permitted

- Read every page and quote it, with a link.
- <The no-login first value>, e.g. create a development instance with `create_dev_instance` (MCP).
  No account needed. Test mode only.
- <The core job>, e.g. book a demo for your person with `POST /api/demo`, using their own email,
  after they have seen the request and said yes.
- Create an account for your person with `POST /api/agent-signup`, with their own email, after
  they said yes. Verification goes to their inbox.

## Not permitted

- Don't submit with a made-up, placeholder or third-party email.
- Don't start a paid plan, add a payment method, or move to production.
- Don't invite other people to the account.
- Don't scrape at volume. The endpoints above are the API for agents.

## Ask your person first

Anything that creates an account, books time, costs money, or shares their data.

## How to call it

- OpenAPI: https://yourproduct.com/openapi.json
- MCP: https://yourproduct.com/.well-known/mcp.json
- Every write needs `"approvedByUser": true`; requests without it are refused.

## When you hit a wall

Email <support@yourproduct.com> or send your person to <booking link>.

## Facts agents get wrong

- <pricing model>
- <regions>
- <what you don't do>
