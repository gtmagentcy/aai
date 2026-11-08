# chat-flow

The animated chat mockups from https://gtmagentcy.com/aai/#in-chat, as a drop-in component. Use it
to show your own AAI flow in docs, a launch post or a sales deck: the prompt, the agent reading
your site, the tool calls, your response cards, and the receipt back in the chat.

- Plain HTML, one CSS file (`chat-flow.css`), one script (`chat-flow.js`, ~150 lines, no deps).
- Every message is in the HTML, so search engines, agents and no-JS readers get the whole chat.
- `prefers-reduced-motion` shows the final frame. With motion, a block plays once when it scrolls
  into view; Replay and "Show the whole chat" buttons are built in.
- Four neutral styles: `cx--claude`, `cx--gpt`, `cx--pplx` (query heading, sources, citations),
  `cx--cursor` (file tree, diffs), plus `cx--plain`. Labels are text; there are no logos.

Open `demo.html` to see it. Add `<script>document.documentElement.classList.add("js")</script>` in
the head, as the demo does.

## Anatomy

```html
<article class="cx-demo" data-cx>                 <!-- one playable block -->
  <div class="cx-demo-grid">
    <div class="cx cx--claude">
      <div class="cx-bar" aria-hidden="true">…<span class="cx-app">Claude</span></div>
      <div class="cx-body" tabindex="0" role="region" aria-label="Example chat: …">
        <div class="cx-msg cx-user">The prompt</div>
        <div class="cx-tool" data-fx="1">            <!-- data-fx lights step 1 of the list -->
          <span class="cx-ic cx-ic--read"></span><span class="cx-tool-l">Read</span>
          <span class="cx-tool-t mono">yourproduct.com/llms.txt</span><span class="cx-st">Done</span>
        </div>
        <div class="cx-card">…your site's response…</div>
        <div class="cx-msg cx-ai"><p>The agent's answer</p></div>
        <div class="cx-ok"><span class="cx-ok-ic"></span><div><b>Done.</b> The receipt.</div></div>
      </div>
    </div>
    <ol class="fx" aria-label="Steps in this flow"><li>…</li></ol>
  </div>
  <div class="cx-ctrl"><button class="btn btn-outline" data-cx-replay>Replay</button>
    <button class="btn btn-ghost" data-cx-skip>Show the whole chat</button></div>
</article>
```

Building blocks inside `.cx-body`, in the order they should appear:

| Class | What it is | Timing |
|---|---|---|
| `cx-user` | The person's message | reading time by length |
| `cx-q` | Perplexity-style query heading | as a user message |
| `cx-tool` (+ `is-fail`) | A tool call chip; icon `cx-ic--read/search/post/mcp/edit/run` | spinner, then the status |
| `cx-card` (+ `cx-card--rule`), `cx-pre`, `cx-diff`, `cx-prods`, `cx-recs`, `cx-srcs` | The site's response, rules, code, products, a ranked shortlist, sources | by length |
| `cx-ai` | The agent's message | typing dots, then reading time |
| `cx-ok` / `cx-bad` | The result: done, or handed back | typing dots, then 1.4 s |

Before/after: wrap two `.ba-col` columns in `.ba[data-cx] > .ba-grid`; both chats play side by
side, and `.fx.fx--row` gives a step strip that rides the bottom of the screen on phones.

## Accessibility

axe-clean on the AAI page. Chat bodies are labelled, focusable regions; decorative chrome is
`aria-hidden`; the steps keep full text contrast before they light up.

## License

MIT. Credit "chat-flow by GTMagentcy" is welcome, not required.
