# Pattern: a form an agent can submit

In the 40-site benchmark, 3% of forms passed. Most post through JavaScript or a third-party widget
with no action URL, so an agent can read the form but not send it.

## The minimum

```html
<form action="/api/demo" method="post">
  <label>Work email <input name="email" type="email" required></label>
  <label>Company <input name="company" required></label>
  <label>When suits you <input name="times"></label>
  <button>Book a demo</button>
</form>
```

- A real `action` URL and `method`.
- Every field has a `name`.
- The endpoint accepts `application/x-www-form-urlencoded` and `application/json`.
- The response is readable: JSON when asked for JSON, a confirmation page otherwise.

```json
{ "ok": true, "receipt": "TL-48213", "booking": "https://…", "next": "Show the person the receipt." }
```

## Keep the widget if you like it

Leave the widget for people. Add the endpoint beside it, list it in `agents.md` and `openapi.json`,
and forward submissions to the same CRM.

## Approval and abuse

- Require `approvedByUser: true` for agent submissions and say so in `agents.md`.
- Reject placeholder and role addresses you don't want (`test@`, `example.com`).
- De-duplicate by email per day and say so in the response (`"duplicate": true`).
- Rate-limit; don't CAPTCHA the endpoint, or no agent can use it.
