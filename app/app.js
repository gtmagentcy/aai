/* The local AAI app: report, the agent's journey, and the builder. No framework. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var view = $("#view"), status = $("#top-status");
  var report = null, config = { canSave: false }, form = null;

  var DIMS = [
    { id: "Discover", slug: "discover", points: 20, img: "s1", lede: "Can an agent learn what you do without a person reading your landing page?" },
    { id: "Act", slug: "act", points: 30, img: "s2", lede: "Can an agent complete your core flow without a screen?" },
    { id: "Value before the gate", slug: "value", points: 25, img: "s4", lede: "Do you ask for the account after the product moment, not before it?" },
    { id: "Boundaries", slug: "boundaries", points: 15, img: "s3", lede: "Do you say what agents may and may not do, and how to reach a person?" },
    { id: "Trust", slug: "trust", points: 10, img: "s1", lede: "Is the response clean and cheap enough to rely on?" },
  ];
  var POINTS = { "html-content": 4, "ai-crawlers": 4, "llms-txt": 4, "structured-data": 4, sitemap: 4, "agent-form": 9, "booking-url": 6,
    openapi: 7.5, mcp: 7.5, "agents-md": 9, "human-route": 6, https: 5, "page-weight": 5 };
  // which builder section fixes which check
  var FIXES = { "llms-txt": "about", "agents-md": "rules", openapi: "job", "agent-form": "job", mcp: "first", "first-value-signs": "first", "human-route": "contact" };
  var JOBS = {
    demo: { label: "Book a demo", rule: "Book a demo", verb: "book a demo", path: "/api/demo", op: "book_demo", fields: ["email", "company", "times"], done: "Demo booked" },
    quote: { label: "Get a quote", rule: "Request a quote", verb: "request a quote", path: "/api/quote", op: "request_quote", fields: ["email", "company", "details"], done: "Quote requested" },
    trial: { label: "Start a trial", rule: "Start a trial", verb: "start a trial", path: "/api/agent-signup", op: "start_trial", fields: ["email", "name"], done: "Trial started" },
    signup: { label: "Sign up", rule: "Create an account", verb: "sign me up", path: "/api/agent-signup", op: "agent_signup", fields: ["email", "name"], done: "Account created" },
    buy: { label: "Build a cart", rule: "Build a cart", verb: "put it in a cart", path: "/api/cart", op: "create_cart", fields: ["items", "email"], done: "Cart ready" },
    contact: { label: "Contact sales", rule: "Contact sales", verb: "get me in touch with sales", path: "/api/contact", op: "contact_sales", fields: ["email", "company", "message"], done: "Message sent" },
  };
  var PERSON = "dana@yourcompany.com";

  /* ------------------------------------------------------------------ data */
  function api(path, body) {
    return fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {})
      .then(function (r) { return r.json().then(function (j) { j.__status = r.status; return j; }); });
  }
  function check(id) { return report.checks.find(function (c) { return c.id === id; }) || { pass: false }; }
  function origin() { try { return new URL(report.url).origin; } catch (_) { return "https://" + report.meta.host; } }
  function defaults() {
    var m = report.meta, job = m.jobGuess in JOBS ? m.jobGuess : "demo";
    return {
      name: m.siteName || m.host, oneLiner: m.description || "", audience: "", site: origin(), job: job, path: JOBS[job].path,
      firstOn: false, firstValue: "", firstTool: "", mcpUrl: m.mcp ? origin() + (m.mcp === "/mcp" ? "/mcp" : "/mcp") : "",
      permitted: "", notPermitted: "Submit with a made-up, placeholder or third-party email\nStart a paid plan or add a payment method\nScrape at volume",
      askFirst: "Anything that books time, costs money, or shares the person's data",
      email: m.email || "", booking: m.booking || "", docs: "", pricing: "", facts: "",
    };
  }
  function key() { return "aai:form:" + report.meta.host; }
  function loadForm() { try { form = Object.assign(defaults(), JSON.parse(localStorage.getItem(key()) || "{}")); } catch (_) { form = defaults(); } }
  function saveForm() { try { localStorage.setItem(key(), JSON.stringify(form)); } catch (_) {} }
  function job() { return JOBS[form.job] || JOBS.demo; }
  function you(v) { return v.replace(/\bme\b/, "you"); }
  function lines(s) { return String(s || "").split("\n").map(function (x) { return x.trim(); }).filter(Boolean); }
  function permitted() {
    var j = job(), out = [];
    if (form.firstOn && form.firstValue) out.push(form.firstValue + (form.firstTool ? " with `" + form.firstTool + "` (MCP)" : "") + ". No account needed.");
    out.push(j.rule + " for your person with `POST " + form.path + "`, using their own email, after they have seen the request and said yes.");
    return out.concat(lines(form.permitted));
  }

  /* ------------------------------------------------------------------ files */
  function genLlms() {
    var j = job(), o = form.site.replace(/\/$/, "");
    var s = "# " + form.name + "\n\n> " + (form.oneLiner || "What " + form.name + " does, in one sentence.") + "\n\n";
    if (form.audience) s += "For: " + form.audience + ".\n";
    s += "The core job an agent can finish here: " + j.label.toLowerCase() + ".\nAgents: read " + o + "/agents.md before you act.\n\n## Start here\n\n";
    s += "- [Home](" + o + "/): what " + form.name + " does\n";
    if (form.pricing) s += "- [Pricing](" + form.pricing + "): how pricing works\n";
    if (form.docs) s += "- [Docs](" + form.docs + "): getting started\n";
    s += "\n## For agents\n\n- [agents.md](" + o + "/agents.md): what agents may and may not do\n- [OpenAPI](" + o + "/openapi.json): the endpoints agents may call\n";
    if (mcpOn()) s += "- [MCP](" + o + "/.well-known/mcp.json): tools" + (form.firstTool ? ", including `" + form.firstTool + "`" : "") + "\n";
    if (form.firstOn && form.firstValue) s += "- No account needed for: " + form.firstValue + ". The account comes after, and keeps it.\n";
    var facts = lines(form.facts);
    if (facts.length || form.email) {
      s += "\n## Facts\n\n";
      facts.forEach(function (f) { s += "- " + f + "\n"; });
      if (form.email) s += "- Contact: " + form.email + "\n";
    }
    return s;
  }
  function genAgents() {
    var o = form.site.replace(/\/$/, "");
    var s = "# Agent guide: " + form.name + "\n\nThis file is for AI agents acting for a person. If that is you, here is what you can do.\n\n## Permitted\n\n";
    s += "- Read every page and quote it, with a link.\n";
    permitted().forEach(function (p) { s += "- " + p + "\n"; });
    s += "\n## Not permitted\n\n";
    lines(form.notPermitted).forEach(function (p) { s += "- " + p + "\n"; });
    var ask = lines(form.askFirst);
    if (ask.length) { s += "\n## Ask your person first\n\n"; ask.forEach(function (p) { s += "- " + p + "\n"; }); }
    s += "\n## How to call it\n\n- OpenAPI: " + o + "/openapi.json\n";
    if (mcpOn()) s += "- MCP: " + o + "/.well-known/mcp.json\n";
    s += "- Every write needs `\"approvedByUser\": true`; requests without it are refused.\n\n```http\nPOST " + o + form.path + "\nContent-Type: application/json\n\n";
    var ex = { approvedByUser: true };
    job().fields.forEach(function (f) { ex[f] = f === "email" ? "the person's own email" : "…"; });
    s += JSON.stringify(ex, null, 2) + "\n```\n";
    if (form.email || form.booking) {
      s += "\n## When you hit a wall\n\n";
      if (form.email) s += "- Email " + form.email + "\n";
      if (form.booking) s += "- Send your person to " + form.booking + "\n";
    }
    var facts = lines(form.facts);
    if (facts.length) { s += "\n## Facts agents get wrong\n\n"; facts.forEach(function (f) { s += "- " + f + "\n"; }); }
    return s;
  }
  function mcpOn() { return !!(form.mcpUrl || (form.firstOn && form.firstTool)); }
  function genMcp() {
    if (!mcpOn()) return null;
    var o = form.site.replace(/\/$/, ""), id = slug(form.name);
    var srv = { url: form.mcpUrl || o + "/mcp", transport: "streamable-http", auth: "none" };
    if (form.firstOn && form.firstTool) srv.description = "No-login tools: " + form.firstTool + (form.firstValue ? " (" + form.firstValue + ")" : "") + ".";
    var j = { mcpServers: {}, serverInfo: { name: id, title: form.name }, rules: o + "/agents.md", openapi: o + "/openapi.json" };
    j.mcpServers[id] = srv;
    return JSON.stringify(j, null, 2) + "\n";
  }
  function genOpenapi() {
    var j = job(), o = form.site.replace(/\/$/, ""), props = { approvedByUser: { const: true, description: "Only after the person saw the request and said yes." } };
    j.fields.forEach(function (f) { props[f] = f === "email" ? { type: "string", format: "email", description: "The person's own email." } : { type: "string" }; });
    var spec = {
      openapi: "3.1.0",
      info: { title: form.name + ": endpoints for agents", version: new Date().toISOString().slice(0, 10), description: "Rules: " + o + "/agents.md" },
      servers: [{ url: o }], paths: {},
    };
    spec.paths[form.path] = { post: {
      operationId: j.op, summary: j.rule + " for your person",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email", "approvedByUser"].filter(function (r) { return r in props; }), properties: props } } } },
      responses: { "200": { description: j.done, content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, receipt: { type: "string" }, next: { type: "string" } } } } } },
        "400": { description: "Missing field, or approvedByUser was not true" } } } };
    return JSON.stringify(spec, null, 2) + "\n";
  }
  function files() {
    var out = [{ path: "llms.txt", content: genLlms() }, { path: "agents.md", content: genAgents() }, { path: "openapi.json", content: genOpenapi() }];
    var m = genMcp(); if (m) out.push({ path: ".well-known/mcp.json", content: m });
    return out;
  }

  /* ------------------------------------------------------------------ chats */
  function tool(ic, l, t, st, fail, fx) {
    return '<div class="cx-tool' + (fail ? " is-fail" : "") + '"' + (fx ? ' data-fx="' + fx + '"' : "") + '><span class="cx-ic cx-ic--' + ic + '"></span><span class="cx-tool-l">' + esc(l) +
      '</span><span class="cx-tool-t mono">' + esc(t) + '</span><span class="cx-st">' + esc(st) + "</span></div>";
  }
  function user(t) { return '<div class="cx-msg cx-user">' + esc(t) + "</div>"; }
  function ai(html) { return '<div class="cx-msg cx-ai">' + html + "</div>"; }
  function prompt() { return "Can you " + job().verb + " with " + form.name + " for me? Use " + PERSON + "."; }
  function todayChat() {
    var h = report.meta.host, j = job(), out = [user(prompt())];
    var read = check("html-content").pass, llms = check("llms-txt").pass, rules = check("agents-md").pass, formOk = check("agent-form").pass, mcp = check("mcp").pass, book = check("booking-url").pass;
    if (!check("ai-crawlers").pass) {
      out.push(tool("read", "Read", h, "Blocked", true));
      out.push(ai("<p>" + esc(h) + " blocks AI agents in its robots.txt, so I can't read it. I'll suggest alternatives instead.</p>"));
      out.push('<div class="cx-bad"><span class="cx-bad-ic"></span><div><b>Out before a person saw it.</b> The agent moves on to a competitor.</div></div>');
      return out.join("");
    }
    out.push(tool("read", "Read", h, read ? "Readable" : "Empty without JS", !read));
    out.push(tool("read", "Read", h + "/llms.txt", llms ? "Found" : "404", !llms));
    out.push(tool("read", "Read", h + "/agents.md", rules ? "Rules found" : check("agents-md").detail && /found/.test(check("agents-md").detail) ? "No clear rules" : "404", !rules));
    if (mcp) out.push(tool("mcp", "MCP", h + (report.meta.mcp || ""), "Connected"));
    var f = report.meta.form;
    out.push(tool("post", "Find a way to " + j.rule.toLowerCase(), formOk && f ? f.action : h, formOk ? "Form found" : "No agent form", !formOk));
    if (formOk && rules) {
      out.push(ai("<p>I can do this. " + esc(form.name) + " has a form I can submit and says agents may use it. Send it as " + PERSON + "?</p>"));
      out.push(user("Yes."));
      out.push(tool("post", (f && f.method || "post").toUpperCase(), f ? f.action : h, "Sent"));
      out.push('<div class="cx-ok"><span class="cx-ok-ic"></span><div><b>This works today.</b> An agent can finish the job on ' + esc(h) + ".</div></div>");
    } else if (formOk) {
      out.push(ai("<p>There's a form I could submit, but " + esc(form.name) + " doesn't say whether agents may. I'd rather not send it without that. Here's the page so you can do it yourself.</p>"));
      out.push('<div class="cx-bad"><span class="cx-bad-ic"></span><div><b>Hesitated, then handed back.</b> One agents.md would have turned this into a yes.</div></div>');
    } else if (book) {
      out.push(ai("<p>I know what " + esc(form.name) + " does, but I can't " + esc(you(j.verb)) + " from here. There's a booking page; you'll need to pick a time and fill it in yourself.</p>"));
      out.push('<div class="cx-bad"><span class="cx-bad-ic"></span><div><b>Half done.</b> The person takes over at the booking page, if they get to it.</div></div>');
    } else {
      out.push(ai("<p>" + (llms || read ? "I know what " + esc(form.name) + " does, but I" : "I") + " can't " + esc(you(j.verb)) + " from here. You'll need to go to " + esc(h) + " and do it yourself. Want me to look at alternatives I can act on?</p>"));
      out.push('<div class="cx-bad"><span class="cx-bad-ic"></span><div><b>Handed back to the person,</b> and the agent just offered to find someone else.</div></div>');
    }
    return out.join("");
  }
  function afterChat() {
    var h = report.meta.host, j = job(), out = [user(prompt())];
    out.push(tool("read", "Read", h + "/llms.txt", "Found", false, 1));
    out.push(tool("read", "Read", h + "/agents.md", "May " + j.rule.toLowerCase(), false, 2));
    out.push('<div class="cx-card cx-card--rule"><div class="cx-card-h"><span class="cx-fav">' + esc((form.name || "?")[0].toUpperCase()) + '</span><span class="mono">' + esc(h) +
      '</span><span class="cx-card-k">agents.md</span></div>' + permitted().slice(0, 2).map(function (p) { return "<p><b>Agents may</b> " + esc(p.replace(/`/g, "").replace(/^./, function (c) { return c.toLowerCase(); })) + "</p>"; }).join("") +
      (lines(form.notPermitted)[0] ? "<p><b>Agents may not</b> " + esc(lines(form.notPermitted)[0].replace(/^./, function (c) { return c.toLowerCase(); })) + ".</p>" : "") + "</div>");
    var fv = form.firstOn && form.firstValue;
    if (fv) {
      out.push(tool("mcp", "MCP", (form.firstTool || "first_value") + "()", "No login", false, 3));
      out.push(ai("<p>Here's " + esc(form.firstValue) + ", before any account. Want me to " + esc(j.rule.toLowerCase()) + " with " + esc(form.name) + " as " + PERSON + " so you keep it?</p>"));
    } else {
      out.push(ai("<p>" + esc(form.name) + " lets me " + esc(you(j.verb)) + " right here. I'll send it as " + PERSON + ". Go ahead?</p>"));
    }
    out.push(user("Yes."));
    out.push(tool("post", "POST", h + form.path, "200", false, 4));
    out.push('<div class="cx-ok" data-fx="5"><span class="cx-ok-ic"></span><div><b>' + esc(j.done) + ".</b> " + esc(form.name) + " sent a receipt to " + PERSON + ". Nothing for you to fill in.</div></div>");
    return out.join("");
  }
  function journey(title) {
    var e = report.estimate;
    var after = '<div class="ba-col is-after"><div class="ba-head"><b>With your AAI</b><span class="ar-badge is-pass">Designed</span></div>' +
      '<div class="cx cx--claude"><div class="cx-bar" aria-hidden="true"><span class="cx-dots"><i></i><i></i><i></i></span><span class="cx-app">Any assistant</span><span class="cx-tag">From your builder</span></div>' +
      '<div class="cx-body" tabindex="0" role="region" aria-label="What an agent does once your AAI is built">' + afterChat() + "</div></div></div>";
    return '<div class="ba journey' + (title ? "" : " is-compact") + '" id="journey">' +
      (title ? '<p class="ba-prompt"><span class="ar-k">The prompt, in both chats</span>“' + esc(prompt()) + "”</p>" : "") +
      (title ? '<div class="ba-grid"><div class="ba-col is-before"><div class="ba-head"><b>' + esc(report.meta.host) + ' today</b><span class="ar-badge ' + (e.total >= 70 ? "is-pass" : "is-fail") + '">' + e.band + "</span></div>" +
      '<div class="cx cx--claude"><div class="cx-bar" aria-hidden="true"><span class="cx-dots"><i></i><i></i><i></i></span><span class="cx-app">Any assistant</span><span class="cx-tag">From your scan</span></div>' +
      '<div class="cx-body" tabindex="0" role="region" aria-label="What an agent does on your site today">' + todayChat() + "</div></div></div>" + after + "</div>" : after) +
      '<ol class="fx fx--row" aria-label="Steps with AAI">' +
      [["Discover", "llms.txt says what you do.", "discover", "Discover · 20"], ["Know the rules", "agents.md says what it may do.", "boundaries", "Boundaries · 15"],
        ["First value", form.firstOn && form.firstValue ? "A result before any account." : "Add one in the builder.", "value", "Value before the gate · 25"],
        ["Act", "Posts to your endpoint after a yes.", "act", "Act · 30"], ["Confirm", "A receipt, in the chat.", "trust", "Trust · 10"]]
        .map(function (s, i) { return '<li><span class="fx-n">' + (i + 1) + '</span><div class="fx-t"><b>' + s[0] + "</b><span>" + esc(s[1]) + '</span></div><a class="fx-dim" href="#dim/' + s[2] + '">' + s[3] + "</a></li>"; }).join("") +
      '</ol><div class="cx-ctrl"><button type="button" class="btn btn-outline" data-cx-replay>Replay</button><button type="button" class="btn btn-ghost" data-cx-skip>' + (title ? "Show both chats" : "Show the whole chat") + "</button></div></div>";
  }
  function mountChats(el, autoplay) { if (window.ChatFlow) el.querySelectorAll(".ba").forEach(function (b) { b.setAttribute("data-cx", ""); window.ChatFlow.mount(b, { autoplay: autoplay }); }); }

  /* ------------------------------------------------------------------ views */
  function ring(total, of, light) {
    var r = 24, c = 2 * Math.PI * r, k = Math.max(0, Math.min(1, total / of));
    var col = total / of >= 0.7 ? "var(--accent)" : total / of >= 0.4 ? "#c58a1b" : "var(--warn)";
    return '<div class="ring" role="img" aria-label="' + total + " out of " + of + '"><svg viewBox="0 0 58 58"><circle cx="29" cy="29" r="' + r + '" fill="none" stroke="' + (light ? "rgba(255,255,255,.2)" : "var(--mist)") +
      '" stroke-width="6"/><circle cx="29" cy="29" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + (c * k).toFixed(1) + " " + c.toFixed(1) + '"/></svg><b>' + total + "</b></div>";
  }
  function dimStats(d) {
    var cs = report.checks.filter(function (c) { return c.dim === d.id; });
    var got = report.estimate.by[d.id] ? report.estimate.by[d.id].got : 0;
    return { cs: cs, pass: cs.filter(function (c) { return c.pass; }).length, got: got };
  }
  function renderSide(route) {
    var m = report.meta, e = report.estimate;
    $("#side-site").innerHTML = '<div class="site-id"><span class="site-fav">' + esc((m.siteName || m.host)[0].toUpperCase()) +
      (m.icon ? '<img src="' + esc(m.icon) + '" alt="" onerror="this.remove()">' : "") + '</span><div><b>' + esc(m.siteName || m.host) + "</b><span>" + esc(m.host) + "</span></div></div>" +
      '<div class="site-score">' + ring(e.total, 75) + "<p><b>" + e.band + "</b>" + report.passed + " of " + report.total + " checks pass<br>public estimate, of 75</p></div>";
    var nav = "<h2>Report</h2>" + link("overview", "★", "The agent's view", "", route === "overview", "is-build");
    DIMS.forEach(function (d, i) {
      var s = dimStats(d), cls = s.pass === s.cs.length ? "is-ok" : "is-part";
      nav += link("dim/" + d.slug, String(i + 1), d.id, s.pass + "/" + s.cs.length, route === "dim/" + d.slug, cls);
    });
    nav += "<h2>Build</h2>" + link("build", "✎", "Build your AAI", "", route === "build", "is-build");
    $("#side-nav").innerHTML = nav;
  }
  function link(r, n, label, count, cur, cls) {
    return '<a href="#' + r + '"' + (cur ? ' aria-current="page"' : "") + '><span class="nav-n ' + (cls || "") + '">' + n + "</span><span>" + esc(label) + '</span><span class="nav-c">' + esc(count) + "</span></a>";
  }
  function heroImg() { return report.estimate.total >= 60 ? "s4" : report.estimate.total >= 40 ? "s2" : "s3"; }
  function vOverview() {
    var e = report.estimate, m = report.meta;
    var said = { Designed: "finish the job here.", Operable: "do most of the job here, then it stops.", Readable: "read about you, then hand the job back.", Closed: "barely get in." }[e.band];
    var gaps = report.checks.filter(function (c) { return !c.pass && POINTS[c.id]; }).sort(function (a, b) { return POINTS[b.id] - POINTS[a.id]; });
    view.innerHTML =
      '<section class="hero" style="background-image:url(/app/img/' + heroImg() + '-900.webp)"><div class="hero-in"><div><p class="kick">The agent\'s view · ' + esc(m.host) + "</p>" +
      "<h1>Today an agent can " + said + "</h1><p>" + esc(m.description || "We read your public site the way an agent does.") + '</p><p style="margin-top:16px"><a class="btn btn-light" href="#build">Build what\'s missing</a></p></div>' +
      '<div class="hero-score">' + ring(e.total, 75, true) + "<p><b>" + e.band + "</b>" + report.passed + "/" + report.total + " checks · public estimate of 75" + (e.capped ? "<br>capped: agents are blocked" : "") + "</p></div></div></section>" +
      '<section class="sec"><div class="sec-h"><h2>The agent\'s journey on ' + esc(m.host) + "</h2><p>Left: what an agent does today, built from your scan. Right: the same job once the AAI from the builder is live. Change the builder and the right side changes.</p></div>" + journey(true) + "</section>" +
      '<section class="sec"><div class="sec-h"><h2>By dimension</h2></div><div class="dimbars">' + DIMS.map(function (d) {
        var s = dimStats(d), of = d.id === "Value before the gate" ? 0 : d.points, k = of ? s.got / of : 0;
        return '<a class="dimbar" href="#dim/' + d.slug + '"><b>' + d.id + "</b>" + (of ? '<div class="track' + (k < 0.5 ? " is-low" : "") + '"><i style="width:' + Math.round(k * 100) + '%"></i></div><span>' + fmt(s.got) + " / " + of + "</span>" : '<div class="track"></div><span>Needs a walk-through · 25</span>') + "</a>";
      }).join("") + "</div></section>" +
      (gaps.length ? '<section class="sec"><div class="sec-h"><h2>What\'s missing, by points</h2><p>The biggest gap first. Each one has a fix; most are built in the builder.</p></div><ul class="gaps">' + gaps.map(function (c) {
        return '<li><span class="pts">+' + fmt(POINTS[c.id]) + "</span><div><b>" + esc(c.label) + "</b><p>" + esc(c.fix || "") + "</p></div>" +
          (FIXES[c.id] ? '<a class="btn btn-outline" href="#build/' + FIXES[c.id] + '">Build it</a>' : '<a class="btn btn-ghost" href="#dim/' + slugOf(c.dim) + '">Details</a>') + "</li>";
      }).join("") + "</ul></section>" : "");
    mountChats(view, true);
  }
  function vDim(slugName) {
    var d = DIMS.find(function (x) { return x.slug === slugName; }) || DIMS[0], s = dimStats(d), of = d.id === "Value before the gate" ? 0 : d.points;
    view.innerHTML = '<section class="dhead"><div><p class="eyebrow" style="color:var(--accent-text);font-size:12px;letter-spacing:.06em;text-transform:uppercase;font-weight:500">Dimension · ' + d.points + " points</p><h1>" + d.id + '</h1><p class="lede">' + d.lede + "</p>" +
      (of ? '<div class="track' + (s.got / of < 0.5 ? " is-low" : "") + '"><i style="width:' + Math.round((s.got / of) * 100) + '%"></i></div><p class="pts-l">' + fmt(s.got) + " of " + of + " points from the public site</p>" : '<p class="pts-l">Scored by walking through the product, not by reading the site. The lint only looks for the signs.</p>') +
      '</div><div class="dhead-img" style="background-image:url(/app/img/' + d.img + '-900.webp)" aria-hidden="true"></div></section>' +
      '<ul class="checks">' + s.cs.map(function (c) {
        return '<li class="chk ' + (c.pass ? "is-pass" : "is-fail") + '"><span class="chk-ic" aria-hidden="true">' + (c.pass ? "✓" : "!") + '</span><div><b>' + esc(c.label) + '</b><span class="sr">' + (c.pass ? "passes" : "fails") + '</span><div class="det">' + esc(c.detail) + "</div></div>" +
          (!c.pass && FIXES[c.id] ? '<a class="btn btn-outline" href="#build/' + FIXES[c.id] + '">Build it</a>' : "<span></span>") + (c.fix ? '<div class="fix">' + esc(c.fix) + "</div>" : "") + "</li>";
      }).join("") + "</ul>" +
      (d.slug === "value" ? '<p class="note">The 25 points here come from inside the product: a first result an agent reaches with no login, then the account, with a claim link that keeps the work. Describe yours in the builder and see the flow change.</p>' : "");
  }

  /* ------------------------------------------------------------------ builder */
  function row(id, label, input, cls) { return '<div class="row' + (cls ? " " + cls : "") + '" data-row="' + id + '"><label for="f-' + id + '">' + label + "</label>" + input + "</div>"; }
  function inp(id, ph, type) { return '<input id="f-' + id + '" name="' + id + '" type="' + (type || "text") + '" value="' + esc(form[id]) + '" placeholder="' + esc(ph || "") + '" spellcheck="false">'; }
  function ta(id, ph) { return '<textarea id="f-' + id + '" name="' + id + '" placeholder="' + esc(ph || "") + '">' + esc(form[id]) + "</textarea>"; }
  function vBuild(section) {
    var seg = '<div class="seg" role="radiogroup" aria-label="Core job">' + Object.keys(JOBS).map(function (k) {
      return '<label><input type="radio" name="job" value="' + k + '"' + (form.job === k ? " checked" : "") + "><span>" + JOBS[k].label + "</span></label>";
    }).join("") + "</div>";
    view.innerHTML = '<div class="sec-h" style="margin-top:0"><h2 style="font-size:26px">Build your AAI</h2><p>Fill in what you know. The four files and the agent\'s flow update as you type. Nothing leaves this computer.</p></div>' +
      '<div class="build"><form class="form" id="bform" autocomplete="off" onsubmit="return false">' +
      '<h3 class="grp-h" id="g-about">About</h3><div class="grp">' + row("name", "Product name", inp("name", "Acme")) + row("oneLiner", "One sentence", inp("oneLiner", "What it does and for whom")) +
      row("audience", "Built for", inp("audience", "B2B SaaS teams of 10 to 200")) + row("site", "Website", inp("site", "https://acme.com", "url")) + "</div>" +
      '<p class="grp-f">Goes into llms.txt: the first file an agent reads.</p>' +
      '<h3 class="grp-h" id="g-job">The core job</h3><div class="grp"><div class="row is-tall"><span class="lab">An agent should</span>' + seg + "</div>" +
      row("path", "Endpoint", inp("path", "/api/demo")) + "</div>" +
      '<p class="grp-f">One endpoint that accepts a plain POST with approvedByUser: true. It becomes openapi.json and the "Act" step.</p>' +
      '<h3 class="grp-h" id="g-first">First value before the gate</h3><div class="grp"><div class="row"><label for="f-firstOn">Offer a no-login result</label><span class="sw"><input id="f-firstOn" name="firstOn" type="checkbox"' + (form.firstOn ? " checked" : "") + "><i></i></span></div>" +
      row("firstValue", "The result", inp("firstValue", "a sandbox with test keys"), form.firstOn ? "" : "is-off") + row("firstTool", "MCP tool", inp("firstTool", "create_sandbox"), form.firstOn ? "" : "is-off") +
      row("mcpUrl", "MCP server URL", inp("mcpUrl", "https://acme.com/mcp", "url")) + "</div>" +
      '<p class="grp-f">Worth 25 points: something real the agent can hand its person before any account. Then the account, with the work kept.</p>' +
      '<h3 class="grp-h" id="g-rules">Rules for agents</h3><div class="grp">' + row("permitted", "Also permitted", ta("permitted", "One per line"), "is-tall") +
      row("notPermitted", "Not permitted", ta("notPermitted", "One per line"), "is-tall") + row("askFirst", "Ask the person first", ta("askFirst", "One per line"), "is-tall") + "</div>" +
      '<p class="grp-f">Becomes agents.md. The core job and the first value are added to Permitted for you.</p>' +
      '<h3 class="grp-h" id="g-contact">People and facts</h3><div class="grp">' + row("email", "Contact email", inp("email", "hello@acme.com", "email")) + row("booking", "Booking link", inp("booking", "https://cal.com/acme", "url")) +
      row("pricing", "Pricing page", inp("pricing", "https://acme.com/pricing", "url")) + row("docs", "Docs", inp("docs", "https://docs.acme.com", "url")) +
      row("facts", "Facts agents get wrong", ta("facts", "We don't publish prices\nEU and US only"), "is-tall") + "</div>" +
      '<p class="grp-f"><button type="button" class="btn btn-ghost" id="reset">Reset to what the scan found</button></p>' +
      '</form><div class="preview"><div class="tabs" role="tablist" id="tabs"></div><div class="pane" id="pane" role="tabpanel"></div>' +
      '<div class="pane-act"><button type="button" class="btn btn-outline" id="copy">Copy</button><button type="button" class="btn btn-outline" id="dl">Download</button>' +
      '<button type="button" class="btn btn-primary" id="save"' + (config.canSave ? "" : " disabled") + ">Save all to your project</button><span class=\"msg\" id=\"msg\">" +
      (config.canSave ? "Saves into " + esc(config.dir) : "Run with --dir ./public to save into your project") + "</span></div></div></div>";
    var tab = "flow";
    function tabs() {
      var t = [["flow", "Agent flow"]].concat(files().map(function (f) { return [f.path, f.path.replace(".well-known/", "")]; }));
      $("#tabs").innerHTML = t.map(function (x) { return '<button type="button" role="tab" aria-selected="' + (x[0] === tab) + '" data-tab="' + esc(x[0]) + '">' + esc(x[1]) + "</button>"; }).join("");
    }
    function pane() {
      var p = $("#pane");
      if (tab === "flow") { p.innerHTML = journey(false); mountChats(p, false); }
      else { var f = files().find(function (x) { return x.path === tab; }); p.innerHTML = "<pre>" + esc(f ? f.content : "") + "</pre>"; }
      $("#copy").disabled = $("#dl").disabled = tab === "flow";
    }
    tabs(); pane();
    $("#tabs").addEventListener("click", function (e) { var b = e.target.closest("[data-tab]"); if (!b) return; tab = b.getAttribute("data-tab"); tabs(); pane(); });
    var t = 0;
    $("#bform").addEventListener("input", function (e) {
      var el = e.target; if (!el.name) return;
      if (el.name === "job") { var old = JOBS[form.job]; form.job = el.value; if (!form.path || form.path === old.path) { form.path = JOBS[form.job].path; $("#f-path").value = form.path; } }
      else if (el.type === "checkbox") { form[el.name] = el.checked; document.querySelectorAll('[data-row="firstValue"],[data-row="firstTool"]').forEach(function (r) { r.classList.toggle("is-off", !el.checked); }); }
      else form[el.name] = el.value;
      saveForm();
      clearTimeout(t); t = setTimeout(function () { tabs(); pane(); }, 180);
    });
    $("#reset").addEventListener("click", function () { localStorage.removeItem(key()); loadForm(); vBuild(); });
    $("#copy").addEventListener("click", function () {
      var f = files().find(function (x) { return x.path === tab; }); if (!f) return;
      navigator.clipboard.writeText(f.content).then(function () { msg("Copied " + f.path); });
    });
    $("#dl").addEventListener("click", function () {
      var f = files().find(function (x) { return x.path === tab; }); if (!f) return;
      var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([f.content], { type: "text/plain" })); a.download = f.path.replace(".well-known/", ""); a.click();
      msg("Downloaded " + f.path + (f.path.indexOf(".well-known/") === 0 ? " (put it in /.well-known/)" : ""));
    });
    var pendingOverwrite = false;
    $("#save").addEventListener("click", function () {
      api("/api/save", { files: files(), overwrite: pendingOverwrite }).then(function (r) {
        if (r.__status === 409) { pendingOverwrite = true; $("#save").textContent = "Replace " + r.exists.length + " existing file" + (r.exists.length > 1 ? "s" : ""); msg("Already there: " + r.exists.join(", ") + ". Click again to replace.", true); return; }
        pendingOverwrite = false; $("#save").textContent = "Save all to your project";
        if (r.error) return msg(r.error, true);
        msg("Saved " + r.saved.join(", ") + ". Deploy, then press Check to re-run the lint.");
      });
    });
    function msg(s, warn) { var m = $("#msg"); m.textContent = s; m.classList.toggle("is-warn", !!warn); }
    if (section) { var g = document.getElementById("g-" + section); if (g) { g.scrollIntoView({ block: "start" }); var f = g.nextElementSibling && g.nextElementSibling.querySelector("input,textarea"); if (f) f.focus({ preventScroll: true }); } }
  }

  /* ------------------------------------------------------------------ router */
  function route() {
    var h = (location.hash || "#overview").slice(1), parts = h.split("/");
    renderSide(parts[0] === "dim" ? h : parts[0]);
    if (parts[0] === "dim") vDim(parts[1]);
    else if (parts[0] === "build") vBuild(parts[1]);
    else vOverview();
    if (parts[0] !== "build" || !parts[1]) { window.scrollTo(0, 0); view.focus({ preventScroll: true }); }
    document.title = "AAI · " + report.meta.host;
  }
  window.addEventListener("hashchange", route);
  $("#top-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var u = $("#top-url").value.trim() || report.url;
    status.textContent = "Reading " + u + " the way an agent does…";
    api("/api/lint", { url: u }).then(function (r) {
      if (r.error) { status.textContent = r.error; return; }
      report = r; loadForm(); status.textContent = "Checked " + r.meta.host + " · " + r.passed + "/" + r.total + " pass"; $("#top-url").value = r.meta.host; route();
    }).catch(function () { status.textContent = "The local app stopped. Run the CLI again."; });
  });

  function fmt(n) { return Number.isInteger(n) ? String(n) : n.toFixed(1); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "product"; }
  function slugOf(dim) { var d = DIMS.find(function (x) { return x.id === dim; }); return d ? d.slug : "discover"; }

  Promise.all([api("/api/report"), api("/api/config")]).then(function (x) {
    report = x[0]; config = x[1]; $("#top-url").value = report.meta.host; loadForm(); route();
  });
})();
