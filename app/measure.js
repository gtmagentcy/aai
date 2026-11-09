/* The Measure half of the local app: the agent funnel, a journey replay drawn as a chat, the
   install page for the three taps, and "Ask your agent" (the dashboard's MCP server). No framework. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var get = function (p) { return fetch(p).then(function (r) { return r.json(); }); };
  var store = function (k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (_) { return null; } };

  var FIX = null, sites = [], live = null, liveSubs = [], lastTotal = null, origin = location.origin;
  var STEP_LABEL = { reach: "Reach", understand: "Understand", rules: "Rules", act: "Act", first_value: "First value", account: "Account", activated: "Activated" };
  var KIND_LABEL = { user: "In a chat", browser: "Browser agent", coding: "Coding agent", search: "AI search", crawler: "Crawler", script: "Script", referral: "Person from an answer", unknown: "Unnamed" };
  var SOURCE_LABEL = { server: "server tap", browser: "browser tag", action: "action tap", log: "access log" };

  function stream() {
    if (live) return;
    try {
      live = new EventSource("/api/stream");
      live.onmessage = function (m) { var e = JSON.parse(m.data); liveSubs.forEach(function (fn) { try { fn(e); } catch (_) {} }); };
    } catch (_) {}
  }
  function onLive(fn) { liveSubs = [fn]; stream(); }

  function pick(site) { if (site) store("aai:site", site); return site || store("aai:site") || (sites[0] && sites[0].site) || ""; }
  function n(x) { return x == null ? "–" : Number(x).toLocaleString("en-US"); }
  function pct(a, b) { return b ? Math.round((a / b) * 100) + "%" : "–"; }
  function secs(s) { if (s == null) return "–"; if (s < 60) return s + " s"; var m = Math.round(s / 60); return m + " min"; }
  function ago(ts) { var d = (Date.now() - Date.parse(ts)) / 1000; if (d < 60) return "just now"; if (d < 3600) return Math.round(d / 60) + " min ago"; if (d < 86400) return Math.round(d / 3600) + " h ago"; return Math.round(d / 86400) + " d ago"; }
  function copy(text, btn) {
    var done = function () { if (!btn) return; var t = btn.textContent; btn.textContent = "Copied"; setTimeout(function () { btn.textContent = t; }, 1400); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { fallback(); }); else fallback();
    function fallback() { var a = document.createElement("textarea"); a.value = text; document.body.appendChild(a); a.select(); try { document.execCommand("copy"); } catch (_) {} a.remove(); done(); }
  }
  function fixes() { return FIX ? Promise.resolve(FIX) : get("/api/fixes").catch(function () { return {}; }).then(function (f) { return (FIX = f); }); }

  /* ------------------------------------------------------------------ funnel */
  function vFunnel(view, args) {
    var days = +(store("aai:days") || 30);
    view.innerHTML = '<p class="m-loading">Reading the collector…</p>';
    get("/api/sites").then(function (list) {
      sites = list;
      var site = pick(args[0]);
      if (!list.length) return empty(view);
      return Promise.all([get("/api/funnel?site=" + encodeURIComponent(site) + "&days=" + days), fixes()]).then(function (x) { draw(view, site, days, x[0]); });
    });
  }

  function empty(view) {
    view.innerHTML =
      '<header class="m-head"><div><p class="m-eyebrow">Measure</p><h1>The agent funnel</h1><p class="m-lede">How agents move through your site, from the first fetch to an account, measured on your own traffic. Nothing has arrived yet.</p></div></header>' +
      '<div class="m-empty">' +
        '<div class="m-empty-card"><b>Install the taps</b><p>A server tap, a browser tag and an action tap for your MCP server or API. Each one takes a few lines.</p><a class="btn btn-primary" href="#install">Install</a></div>' +
        '<div class="m-empty-card"><b>Or see it with a demo</b><p>Starts a small demo site with all three taps and sends it about a hundred simulated agents.</p><pre class="m-code"><code>npx github:NetanelBaruch/aai demo</code></pre></div>' +
        '<div class="m-empty-card"><b>Or import a log</b><p>No code on the site: read an access log (nginx, Apache, most CDNs). IPs are hashed and dropped.</p><pre class="m-code"><code>npx github:NetanelBaruch/aai import access.log --site you</code></pre></div>' +
      "</div>";
    onLive(function () { route(); });
  }

  function draw(view, site, days, f) {
    var steps = f.steps, top = steps[0].journeys || 1, m = f.metrics;
    lastTotal = f.total;
    var siteOpts = sites.map(function (s) { return '<option value="' + esc(s.site) + '"' + (s.site === site ? " selected" : "") + ">" + esc(s.site) + "</option>"; }).join("");
    var dayOpts = [7, 30, 90].map(function (d) { return '<option value="' + d + '"' + (d === days ? " selected" : "") + ">Last " + d + " days</option>"; }).join("");

    var kpis = [
      ["Agent journeys", n(m.agentJourneys), "every agent visit, crawlers included"],
      ["Acted", n(m.acted), pct(m.acted, m.agentJourneys) + " of journeys used a form, API or tool"],
      ["First value", n(m.firstValue), pct(m.firstValue, m.acted) + " of those who acted got a result"],
      ["Signups from agents", n(m.signups), "joined to the agent's journey by claim id"],
      ["Time to first value", secs(m.medianTimeToFirstValueSec), "median, active time only"],
      ["From an answer", n(m.referrals), "people who clicked through from an assistant"],
    ];

    var map = steps.map(function (s, i) {
      var h = Math.max(4, Math.round((s.journeys / top) * 100));
      return '<li class="fn-st' + (s.journeys ? "" : " is-zero") + '">' +
        (i ? '<span class="fn-rate" title="of the step before">' + (s.rate == null ? "–" : s.rate + "%") + "</span>" : '<span class="fn-rate fn-rate--first">start</span>') +
        '<div class="fn-bar"><i style="height:' + h + '%"></i></div>' +
        '<b class="fn-n">' + n(s.journeys) + "</b><span class=\"fn-l\">" + esc(s.label) + '</span><span class="fn-q">' + esc(s.q) + "</span></li>";
    }).join("");

    var max = 1; f.agents.forEach(function (a) { if (a.journeys > max) max = a.journeys; });
    var matrix = '<div class="mx-wrap"><table class="mx"><thead><tr><th scope="col">Agent</th>' + steps.map(function (s) { return '<th scope="col">' + esc(s.label) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      f.agents.map(function (a) {
        return '<tr><th scope="row"><b>' + esc(a.label) + '</b><span class="mx-k">' + esc(KIND_LABEL[a.kind] || a.kind) + (a.confirmed === false ? " · unverified token" : "") + "</span></th>" +
          steps.map(function (s) { var v = a.steps[s.id] || 0, o = v ? 0.08 + 0.72 * (v / max) : 0; return '<td style="--o:' + o.toFixed(2) + '"' + (v ? "" : ' class="is-zero"') + ">" + (v ? n(v) : "·") + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody></table></div>";

    var drops = f.dropOffs.filter(function (d) { return d.from !== "reach" || d.agents.some(function (a) { return !/bot|crawler/i.test(a.label); }); }).slice(0, 4).map(function (d) {
      var fx = FIX[d.to] || {};
      return '<article class="drop"><div class="drop-n"><b>' + n(d.lost) + "</b><span>" + d.rate + "% stop</span></div><div class=\"drop-b\">" +
        "<h3>After " + esc(STEP_LABEL[d.from]) + ", before " + esc(STEP_LABEL[d.to]) + ": " + esc(fx.title || "") + "</h3>" +
        '<p class="drop-who">Mostly ' + d.agents.map(function (a) { return esc(a.label) + " (" + a.n + ")"; }).join(", ") + "</p>" +
        "<p>" + esc(fx.fix || "") + '</p><div class="drop-act"><button class="btn btn-outline" data-copy-fix="' + d.to + '">Copy the fix as a prompt</button></div></div></article>';
    }).join("");

    var recent = f.recent.slice(0, 10).map(function (r) {
      return '<li><a href="#journey/' + encodeURIComponent(r.key) + '"><span class="jr-who"><b>' + esc(r.label) + "</b><span>" + esc(KIND_LABEL[r.kind] || "") + '</span></span><span class="jr-path">' +
        steps.map(function (s) { var on = r.furthest && f.steps.findIndex(function (x) { return x.id === r.furthest; }) >= f.steps.indexOf(s); return '<i class="' + (on ? "on" : "") + '" title="' + esc(s.label) + '"></i>'; }).join("") +
        '</span><span class="jr-to">' + esc(STEP_LABEL[r.furthest] || "–") + '</span><span class="jr-ago">' + ago(r.end) + "</span></a></li>";
    }).join("");

    view.innerHTML =
      '<header class="m-head"><div><p class="m-eyebrow">Measure · ' + esc(site) + '</p><h1>The agent funnel</h1><p class="m-lede">Every agent journey on your site, from the first fetch to an account. A journey counts at a step if it got that far or further. Sources: ' +
        (m.sources.map(function (s) { return SOURCE_LABEL[s] || s; }).join(", ") || "none yet") + '.</p></div>' +
        '<div class="m-ctl"><label class="sr" for="m-site">Site</label><select id="m-site">' + siteOpts + '</select><label class="sr" for="m-days">Period</label><select id="m-days">' + dayOpts + '</select><span class="live" id="live"><i></i>Live</span></div></header>' +
      '<div class="kpis">' + kpis.map(function (k) { return '<div class="kpi"><span>' + k[0] + "</span><b>" + k[1] + "</b><small>" + k[2] + "</small></div>"; }).join("") + "</div>" +
      '<section class="sec"><div class="sec-h"><h2>The journey</h2><p>The same stations as the AAI score. The percentage is how many of the step before got this far.</p></div><ol class="fn">' + map + "</ol></section>" +
      (drops ? '<section class="sec"><div class="sec-h"><h2>Where agents stop</h2><p>The biggest losses first, with who stopped and what fixes it. Each fix copies as a prompt for your coding agent.</p></div><div class="drops">' + drops + "</div></section>" : "") +
      '<section class="sec"><div class="sec-h"><h2>By agent</h2><p>Journeys per agent and step. Crawlers only ever count at Reach: they read for later, not for a person.</p></div>' + matrix + "</section>" +
      '<section class="sec m-two"><div><div class="sec-h"><h2>Recent journeys</h2><p>Open one to replay it as the agent saw it.</p></div><ul class="jr">' + (recent || '<li class="m-muted">No journey past the first fetch yet.</li>') + '</ul></div>' +
        '<div><div class="sec-h"><h2>Live</h2><p>Events as they arrive.</p></div><ul class="feed" id="feed"><li class="m-muted">Waiting for the next event…</li></ul></div></section>';

    $("#m-site").addEventListener("change", function (e) { location.hash = "#funnel/" + encodeURIComponent(e.target.value); });
    $("#m-days").addEventListener("change", function (e) { store("aai:days", e.target.value); route(); });
    $$("[data-copy-fix]", view).forEach(function (b) { b.addEventListener("click", function () { copy(promptFor(b.getAttribute("data-copy-fix"), site, f), b); }); });

    var feed = $("#feed"), first = true, timer = null;
    onLive(function (e) {
      if (e.site !== site) return;
      if (first) { feed.innerHTML = ""; first = false; }
      var li = document.createElement("li");
      li.innerHTML = '<span class="feed-step">' + esc(STEP_LABEL[e.step] || e.event) + "</span><b>" + esc(agentLabel(e)) + '</b><span class="mono">' + esc(e.tool || e.path) + '</span><span class="feed-src">' + esc(SOURCE_LABEL[e.source] || e.source) + "</span>";
      feed.insertBefore(li, feed.firstChild);
      while (feed.children.length > 14) feed.removeChild(feed.lastChild);
      $("#live").classList.add("is-on"); setTimeout(function () { var l = $("#live"); if (l) l.classList.remove("is-on"); }, 600);
      clearTimeout(timer); timer = setTimeout(function () { if ((location.hash || "").indexOf("#funnel") === 0) softRefresh(view, site, days); }, 2500);
    });
  }
  function softRefresh(view, site, days) {
    var y = window.scrollY;
    get("/api/funnel?site=" + encodeURIComponent(site) + "&days=" + days).then(function (f) { if (f.total !== lastTotal) { draw(view, site, days, f); window.scrollTo(0, y); } });
  }
  function agentLabel(e) { return e.agent === "unknown" ? "Unnamed" : e.agent.replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }).replace("Chatgpt", "ChatGPT").replace("Oai", "OAI").replace("Gptbot", "GPTBot"); }
  function promptFor(step, site, f) {
    var fx = FIX[step] || {}, d = f.dropOffs.find(function (x) { return x.to === step; });
    return "AAI funnel for " + site + " (last " + f.days + " days): " + (d ? d.lost + " agent journeys (" + d.rate + "%) stopped after " + STEP_LABEL[d.from] + ", before " + STEP_LABEL[d.to] + "; mostly " + d.agents.map(function (a) { return a.label; }).join(", ") + "." : "") +
      "\n\nThe fix: " + (fx.fix || "") + "\n\n" + (fx.prompt || "") + "\n\nWhen you are done, tell me what changed so I can watch the funnel at " + origin + "/#funnel/" + encodeURIComponent(site) + ".";
  }

  /* ------------------------------------------------------------------ journey replay */
  var ICON = { reach: "search", understand: "read", rules: "read", act: "post", first_value: "mcp", account: "edit", activated: "run" };
  function verb(e) {
    if (e.event === "request") return e.method && e.method !== "GET" ? e.method : "Read";
    return { agent_visit: "Arrived", prompt_copy: "Prompt copied", form_start: "Form", form_submit: "Submitted", api_call: "API", mcp_session: "MCP", tool_call: "Tool", first_value: "First value", claim_click: "Claim link", signup_from_agent: "Signed up", activated: "Activated" }[e.event] || e.event;
  }
  function vJourney(view, args) {
    view.innerHTML = '<p class="m-loading">Loading the journey…</p>';
    get("/api/journey?key=" + encodeURIComponent(args[0] || "")).then(function (j) {
      if (j.error) { view.innerHTML = '<p class="m-loading">' + esc(j.error) + ' <a href="#funnel">Back to the funnel</a></p>'; return; }
      var name = j.label || agentLabel({ agent: j.agent }), last = j.events[j.events.length - 1];
      var reached = j.steps.indexOf("account") >= 0 || j.steps.indexOf("activated") >= 0;
      var rows = j.events.map(function (e) {
        var target = e.tool ? (e.event === "tool_call" || e.event === "first_value" ? e.tool + "()" : e.tool) : e.path;
        return '<div class="cx-tool' + (e.status >= 400 ? " is-fail" : "") + '"><span class="cx-ic cx-ic--' + (ICON[e.step] || "read") + '"></span><span class="cx-tool-l">' + esc(verb(e)) + '</span><span class="cx-tool-t mono">' + esc(target) + '</span><span class="cx-st">' + esc(STEP_LABEL[e.step] || "–") + "</span></div>";
      }).join("");
      var end = reached
        ? '<div class="cx-ok"><span class="cx-ok-ic" aria-hidden="true"></span><div><b>' + (j.steps.indexOf("activated") >= 0 ? "Signed up and activated." : "Signed up from the agent's work.") + "</b> The claim id joined the agent's session to the account" + (j.ttfv != null ? ", " + secs(j.ttfv) + " of active time to the first value." : ".") + "</div></div>"
        : '<div class="cx-bad"><span class="cx-bad-ic" aria-hidden="true"></span><div><b>Stopped at ' + esc(STEP_LABEL[j.furthest] || "the first fetch") + ".</b> " + esc((FIX && FIX[nextStep(j.furthest)] || {}).fix || "") + "</div></div>";
      view.innerHTML =
        '<header class="m-head"><div><p class="m-eyebrow"><a href="#funnel/' + encodeURIComponent(j.site) + '">← ' + esc(j.site) + '</a></p><h1>' + esc(name) + "'s journey</h1><p class=\"m-lede\">" + j.events.length + " events from " + new Date(j.start).toLocaleString() + ". Replayed from what your taps saw; the agent's own words aren't recorded.</p></div></header>" +
        '<div class="jv"><div class="cx cx--claude" data-cx><div class="cx-bar" aria-hidden="true"><span class="cx-dots"><i></i><i></i><i></i></span><span class="cx-app">' + esc(name) + '</span><span class="cx-tag">Replay</span></div>' +
        '<div class="cx-body" tabindex="0" role="region" aria-label="Replay of the journey">' + rows + end + '</div></div><div class="cx-ctrl"><button class="btn btn-outline" data-cx-replay>Replay</button><button class="btn btn-ghost" data-cx-skip>Show all</button></div>' +
        '<aside class="jv-side"><h2>Steps reached</h2><ol class="jv-steps">' + Object.keys(STEP_LABEL).map(function (s) { return '<li class="' + (j.reached.indexOf(s) >= 0 ? "on" : "") + '">' + STEP_LABEL[s] + "</li>"; }).join("") + "</ol>" +
        "<dl><dt>Agent</dt><dd>" + esc(name) + "</dd><dt>Identified by</dt><dd>" + esc(j.events[0].via) + "</dd><dt>Seen by</dt><dd>" + esc(uniq(j.events.map(function (e) { return SOURCE_LABEL[e.source] || e.source; })).join(", ")) + "</dd><dt>Last event</dt><dd>" + esc(ago(last.ts)) + "</dd></dl></aside></div>";
      var block = $(".jv", view);
      if (window.ChatFlow) window.ChatFlow.mount(block, { autoplay: j.events.length <= 16 });
    });
  }
  function nextStep(s) { var k = Object.keys(STEP_LABEL), i = k.indexOf(s); return k[i + 1] || s; }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

  /* ------------------------------------------------------------------ install */
  var STACKS = [["html", "Browser tag"], ["express", "Node / Express"], ["nextjs", "Next.js"], ["vercel", "Vercel"], ["cloudflare", "Cloudflare"], ["firebase", "Firebase"], ["mcp", "MCP / API"], ["logs", "Access logs"]];
  function vInstall(view) {
    get("/api/sites").then(function (list) {
      sites = list;
      var site = store("aai:install-site") || pick() || "yoursite", stack = store("aai:stack") || "html";
      view.innerHTML =
        '<header class="m-head"><div><p class="m-eyebrow">Measure</p><h1>Install the taps</h1><p class="m-lede">Most agents never run JavaScript: ChatGPT, Claude and Perplexity fetch your HTML from a server. So the pixel is three taps that feed one funnel. Start with the server tap; add the action tap where agents act; the browser tag catches people arriving from an answer.</p></div></header>' +
        '<ol class="taps"><li><b>Server tap</b><span>Assistants that fetch without a browser, and every read of llms.txt, agents.md, OpenAPI and the MCP card.</span></li><li><b>Action tap</b><span>MCP tool calls and API calls, the first value, and the signup that follows, joined by a claim id.</span></li><li><b>Browser tag</b><span>People from an assistant\'s answer, agents in a real browser (a heuristic), prompt copies and forms.</span></li></ol>' +
        '<div class="inst-form"><label>Site key<input id="i-site" value="' + esc(site) + '" spellcheck="false"></label><label>Collector<input id="i-col" value="' + esc(origin) + '" spellcheck="false"></label>' +
        '<button class="btn btn-outline" id="i-test" type="button">Send a test event</button><span class="inst-st" id="i-st" role="status" aria-live="polite"></span></div>' +
        '<p class="m-note">Testing on this machine works as is. For a deployed site, run <code>aai serve --host 0.0.0.0</code> on a server it can reach and put that URL here; the dashboard still answers only on its own machine.</p>' +
        '<div class="tabs" role="tablist">' + STACKS.map(function (s) { return '<button role="tab" type="button" data-stack="' + s[0] + '" aria-selected="' + (s[0] === stack) + '">' + s[1] + "</button>"; }).join("") + '</div><div id="i-code"></div>';
      function paint() {
        get("/api/snippets?site=" + encodeURIComponent($("#i-site").value || "yoursite") + "&collector=" + encodeURIComponent($("#i-col").value || origin)).then(function (all) {
          var s = all[stack];
          $("#i-code").innerHTML = '<p class="inst-note"><span class="tap-k">' + esc(s.tap) + " tap</span> " + esc(s.note) + "</p>" + s.files.map(function (f, i) {
            return '<div class="codebox"><div class="codebox-h"><span class="mono">' + esc(f.name) + '</span><button class="btn btn-ghost" data-i="' + i + '">Copy</button></div><pre><code>' + esc(f.code) + "</code></pre></div>";
          }).join("");
          $$("#i-code [data-i]").forEach(function (b) { b.addEventListener("click", function () { copy(s.files[+b.getAttribute("data-i")].code, b); }); });
        });
      }
      $$(".tabs [data-stack]", view).forEach(function (b) { b.addEventListener("click", function () { stack = b.getAttribute("data-stack"); store("aai:stack", stack); $$(".tabs [data-stack]").forEach(function (x) { x.setAttribute("aria-selected", x === b); }); paint(); }); });
      ["#i-site", "#i-col"].forEach(function (id) { $(id).addEventListener("change", function () { store("aai:install-site", $("#i-site").value); paint(); }); });
      $("#i-test").addEventListener("click", function () {
        $("#i-st").textContent = "Sent. Waiting for the collector…";
        fetch($("#i-col").value.replace(/\/$/, "") + "/e", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ site: $("#i-site").value, event: "test", ua: "aai-test", path: "/test", source: "browser" }) })
          .catch(function () { $("#i-st").textContent = "The collector didn't answer at that URL."; $("#i-st").className = "inst-st is-warn"; });
      });
      onLive(function (e) {
        if (e.site !== $("#i-site").value) return;
        var st = $("#i-st"); if (!st) return;
        st.className = "inst-st is-ok";
        st.textContent = e.event === "test" ? "Received: the collector works. Test events never count in the funnel." : "First real event received: " + (STEP_LABEL[e.step] || e.event) + " from " + agentLabel(e) + ". Open the funnel.";
      });
      paint();
    });
  }

  /* ------------------------------------------------------------------ ask */
  function vAsk(view) {
    var mcp = origin + "/mcp";
    var cfg = JSON.stringify({ mcpServers: { "aai-local": { url: mcp } } }, null, 2);
    var prompts = [
      "Where do agents drop off on my site, and what's the one change that would move the most journeys to an account?",
      "Compare ChatGPT and Claude on my funnel this month. Which step loses each one?",
      "Take the biggest drop-off, get the fix prompt, and make the change in this repo. Show me the diff before you commit.",
      "Install the AAI server tap and action tap in this codebase (get_install_snippet), then tell me how to check events arrive.",
    ];
    view.innerHTML =
      '<header class="m-head"><div><p class="m-eyebrow">Measure</p><h1>Ask your agent</h1><p class="m-lede">The dashboard is also an MCP server, read-only and local. Connect Claude Code, Cursor or any MCP client and ask about your agent funnel in plain words; it can fetch the fix and make it in your repo.</p></div></header>' +
      '<section class="sec"><div class="sec-h"><h2>Connect</h2></div>' +
        box("Claude Code", "claude mcp add --transport http aai-local " + mcp) + box("Cursor, Claude Desktop and others (mcp.json)", cfg) + "</section>" +
      '<section class="sec"><div class="sec-h"><h2>Try asking</h2></div><ul class="asks">' + prompts.map(function (p, i) { return '<li><p>' + esc(p) + '</p><button class="btn btn-ghost" data-p="' + i + '">Copy</button></li>'; }).join("") + "</ul></section>" +
      '<section class="sec"><div class="sec-h"><h2>Tools</h2></div><dl class="tools">' +
        [["list_sites", "Sites that sent events, with counts."], ["get_funnel", "Journeys per step, conversion, per-agent breakdown, key metrics."], ["get_drop_offs", "Where journeys stop, who stopped, and the fix."], ["get_journey", "One journey, event by event."], ["get_fix_prompt", "A prompt for a coding agent that fixes a step."], ["get_install_snippet", "The tap code for a stack."]]
          .map(function (t) { return "<dt class=\"mono\">" + t[0] + "</dt><dd>" + t[1] + "</dd>"; }).join("") + "</dl></section>" +
      '<p class="m-note">No model runs inside the dashboard and no key is needed: your own agent does the thinking. Nothing leaves this machine unless you point a tap at another collector.</p>';
    $$("[data-p]", view).forEach(function (b) { b.addEventListener("click", function () { copy(prompts[+b.getAttribute("data-p")], b); }); });
    $$(".codebox [data-copy]", view).forEach(function (b) { b.addEventListener("click", function () { copy(b.parentNode.nextSibling.textContent, b); }); });
  }
  function box(name, code) { return '<div class="codebox"><div class="codebox-h"><span>' + esc(name) + '</span><button class="btn btn-ghost" data-copy>Copy</button></div><pre><code>' + esc(code) + "</code></pre></div>"; }

  function route() { window.dispatchEvent(new HashChangeEvent("hashchange")); }

  // sidebar badge: journeys in the last 30 days for the current site
  var badgeText = "";
  get("/api/sites").then(function (l) { sites = l; var s = pick(); if (!s) return; get("/api/funnel?site=" + encodeURIComponent(s)).then(function (f) { badgeText = f.journeys ? String(f.journeys) : ""; if (window.AAIApp) window.AAIApp.rerenderSide(); }); });

  window.AAIMeasure = {
    views: { funnel: vFunnel, journey: vJourney, install: vInstall, ask: vAsk },
    title: function (v) { return { funnel: "Agent funnel", journey: "Journey", install: "Install", ask: "Ask your agent" }[v]; },
    badge: function () { return badgeText; },
  };
})();
