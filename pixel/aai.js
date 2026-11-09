/* AAI browser tag. One of three taps; see taps/README.md for the other two.
 *
 *   <script src="https://<collector>/aai.js" data-site="yoursite" defer></script>
 *
 * What it sees: people who arrive from an assistant's answer (referrer or utm_source), visitors who
 * came by an agent link (?via=agent), agents driving a real browser (a heuristic, labelled as one),
 * prompt copies, forms started and submitted on the agent path, and anything you send with
 * aai.track(event, extra). What it can't see: assistants that fetch your HTML without running
 * JavaScript (ChatGPT-User, Claude-User, Perplexity-User, crawlers). The server tap sees those.
 *
 * Nothing personal: no cookies, no IP, no form values. A random id in sessionStorage joins one
 * visit's events. A plain human visit with no agent signal sends nothing at all.
 *
 * Options (attributes on the script tag):
 *   data-site       your site key (required)
 *   data-endpoint   collector origin, if not the script's own origin
 *   data-forms      "all" to watch every form on the agent path; default watches [data-aai-form]
 */
(function () {
  var s = document.currentScript;
  var site = s && s.getAttribute("data-site");
  if (!site) return;
  var origin = s.getAttribute("data-endpoint") || new URL(s.src).origin;
  var endpoint = origin.replace(/\/$/, "") + "/e";
  var KEY = "aai_journey";

  function store(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function rid() { return Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4); }

  var q = new URLSearchParams(location.search);
  var utm = q.get("utm_source") || "";
  var via = q.get("via") === "agent" ? "agent" : "";
  var cid = q.get("aai_cid") || q.get("claim") || "";
  var ref = document.referrer && document.referrer.indexOf(location.origin) !== 0 ? document.referrer : "";
  var ASSIST = /chatgpt\.com|chat\.openai\.com|claude\.ai|perplexity\.ai|gemini\.google\.com|copilot\.microsoft\.com|chat\.mistral\.ai|meta\.ai/;
  var UTM = /^(chatgpt\.com|claude\.ai|perplexity(\.ai)?|gemini\.google\.com|copilot(\.microsoft)?\.com)$/i;
  // Heuristic only: automation flags that agentic browsers often leave. Labelled "heuristic" downstream.
  var automated = navigator.webdriver === true;

  var journey = store(KEY);
  var fresh = !journey && (via || cid || UTM.test(utm) || ASSIST.test(ref) || automated);
  if (fresh) { journey = rid(); store(KEY, journey); }
  if (cid) store("aai_cid", cid);

  function send(event, extra) {
    if (!journey && !store("aai_cid")) return; // not on the agent path: send nothing
    var b = { site: site, event: event, path: location.pathname, referrer: ref, utm: utm, ua: navigator.userAgent, session: journey,
      cid: store("aai_cid") || undefined, via: via || (automated ? "browser-agent" : ""), ts: new Date().toISOString() };
    for (var k in extra || {}) b[k] = extra[k];
    var body = JSON.stringify(b);
    try { if (navigator.sendBeacon && navigator.sendBeacon(endpoint, new Blob([body], { type: "text/plain" }))) return; } catch (e) {}
    try { fetch(endpoint, { method: "POST", body: body, keepalive: true, headers: { "content-type": "text/plain" } }); } catch (e) {}
  }

  if (journey) send("agent_visit");
  if (cid) send("claim_click");

  function closest(t, sel) { return t && t.closest ? t.closest(sel) : null; }
  document.addEventListener("copy", function (e) { var el = closest(e.target, "[data-agent-prompt]"); if (el) { if (!journey) { journey = rid(); store(KEY, journey); } send("prompt_copy", { tool: (el.getAttribute("data-agent-prompt") || "").slice(0, 80) }); } });
  document.addEventListener("click", function (e) { var el = closest(e.target, "[data-agent-prompt-copy]"); if (el) { if (!journey) { journey = rid(); store(KEY, journey); } send("prompt_copy", { tool: (el.getAttribute("data-agent-prompt-copy") || "").slice(0, 80) }); } });

  var all = s.getAttribute("data-forms") === "all", started = {};
  function formName(f) { return (f.getAttribute("data-aai-form") || f.getAttribute("name") || f.id || f.getAttribute("action") || "form").slice(0, 80); }
  function watched(f) { return f && (all || f.hasAttribute("data-aai-form")); }
  document.addEventListener("focusin", function (e) { var f = closest(e.target, "form"); if (watched(f)) { var n = formName(f); if (!started[n]) { started[n] = 1; send("form_start", { tool: n }); } } });
  document.addEventListener("submit", function (e) { var f = e.target; if (watched(f)) send("form_submit", { tool: formName(f) }); }, true);

  /** aai.track("first_value" | "signup_from_agent" | "activated" | ..., { tool }) */
  window.aai = window.aai || {};
  window.aai.track = function (event, extra) { send(event, extra); };
  /** The claim id to put on a signup request, so the signup joins this journey. */
  window.aai.cid = function () { return store("aai_cid") || journey; };
  window.aai.onAgentPath = function () { return !!journey; };
})();
