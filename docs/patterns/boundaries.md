# Pattern: boundaries in agents.md

Agents hesitate when they don't know whether they're allowed. A short, specific `agents.md` turns
hesitation into action, and keeps the actions you don't want off the table.

## Structure

1. **Who this is for.** One line: this file is for agents acting for a person.
2. **Permitted.** Concrete verbs with conditions: "Book a demo for your person, with their own
   email, after they approve the request."
3. **Not permitted.** Equally concrete: "Don't start a paid plan. Don't invite other people. Don't
   submit with a placeholder email."
4. **Ask your person first** for anything that costs money, shares data, or can't be undone.
5. **How to call it.** Endpoint, fields, an example request and response, or a link to
   `openapi.json` and `/.well-known/mcp.json`.
6. **When you hit a wall.** A human route: an email, a booking link.
7. **Facts.** The few facts agents get wrong about you (pricing model, regions, what you don't do).

Template: [`templates/agents.md`](../../templates/agents.md). A full example:
https://gtmagentcy.com/agents.md

## Back the file with the server

Words are not enforcement. Every rule that matters should also be a check in the endpoint: refuse
without approval, refuse production actions from a no-login instance, rate-limit, log the agent
name.
