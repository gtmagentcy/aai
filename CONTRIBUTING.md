# Contributing to AAI

Thanks for helping. AAI is young; the spec gets better from people who build it and report back.

## Ways to help

| You have | Open |
|---|---|
| Built part of an AAI and have results | An issue with the **Implementation report** template, or a PR adding `examples/<your-product>.md` |
| A pattern we haven't written | A PR adding `docs/patterns/<name>.md`, using an existing pattern as the shape |
| A lint check | A PR to `cli/aai-lint.mjs`: one check, one detail line, one fix an engineer can act on |
| A flow for the chat component | A PR adding a block to `components/chat-flow/demo.html` |
| An objection to the spec or the weights | An issue with the **Spec proposal** template, with evidence |
| A bug | An issue with a URL and the output |

## Rules for changes

- **Spec changes** start as an issue labelled `spec`. Say what changes, why, and what evidence
  supports it (scans, implementation reports, agent transcripts). Weights change only with data.
- **Lint checks** read public pages only, at most a handful of requests, and never submit a form
  or create anything on the site being checked.
- **Examples** use real products only with that product's permission. Otherwise invent the
  company, and say it is invented.
- **No agent transcripts with personal data.** Redact emails, names and keys.
- Plain words. Short sentences. Absolute dates.

## Running the lint locally

```sh
node cli/aai-lint.mjs https://example.com
node cli/aai-lint.mjs example.com --json
```

No build step and no dependencies. Node 18+.

## Licensing of contributions

Code you contribute is MIT; text you contribute is CC BY 4.0, the same as the rest of the repo.

## Maintainers

Netanel Baruch (GTMagentcy). Questions: open an issue, or netanel@gtmagentcy.com.
