# Pattern: the claim link

The agent made something before the account existed: a dev instance, a draft, a cart, a report.
The claim link moves it into the person's account, so nothing is redone.

## Rules

- Issued with the first value, returned to the agent in the same response.
- Single use, unguessable, expires (7 days is a sensible default).
- Opening it asks for the account (or signs in), then attaches the work.
- If the agent already signed the person up with approval, the claim happens on email
  verification and the link opens the dashboard instead.
- Unclaimed work is deleted at expiry, and the product says so up front.

## Copy that works

"Your login already works. Claim it with your email to keep it: passline.dev/claim/7c21. Same
keys, nothing to migrate."
