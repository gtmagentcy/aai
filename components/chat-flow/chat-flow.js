/* /aai/ "See it in the chat" and "Before and after AAI".
 *
 * Each [data-cx] block holds one or more chats (.cx-body) and, optionally, a step list (.fx).
 * Every message is already in the HTML, so with no JS, and under prefers-reduced-motion, the
 * reader gets the final frame. With motion allowed, the block is "armed" (messages hidden), and
 * the first time it scrolls into view the messages arrive one by one: typing dots before the
 * agent speaks, a spinner on each tool call, and the step list lighting up as each step lands.
 * Replay plays it again; "Show the whole chat" jumps to the final frame.
 */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var roots = document.querySelectorAll("[data-cx]");
  if (!roots.length) return;

  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function kindOf(el) {
    var c = el.classList;
    if (c.contains("cx-user") || c.contains("cx-q")) return "user";
    if (c.contains("cx-tool")) return "tool";
    if (c.contains("cx-ai")) return "ai";
    if (c.contains("cx-ok") || c.contains("cx-bad")) return "ok";
    return "card";
  }
  function textLen(el) { return (el.textContent || "").replace(/\s+/g, " ").length; }

  function setup(root) {
    var bodies = root.querySelectorAll(".cx-body");
    var steps = root.querySelectorAll(".fx li");
    var timers = [];
    var io = null;
    function noAuto() { if (io) { io.disconnect(); io = null; } }

    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    function stop() {
      timers.forEach(clearTimeout); timers = [];
      each(root.querySelectorAll(".cx-typing"), function (n) { n.remove(); });
      each(root.querySelectorAll(".cx-tool.is-run"), function (n) { n.classList.remove("is-run"); });
    }
    function toBottom(b, smooth) {
      if (b.scrollHeight <= b.clientHeight) return;
      try { b.scrollTo({ top: b.scrollHeight, behavior: smooth && !reduce ? "smooth" : "auto" }); }
      catch (_) { b.scrollTop = b.scrollHeight; }
    }
    function light(n) {
      each(steps, function (li, i) {
        li.classList.toggle("is-done", i < n - 1);
        li.classList.toggle("is-on", i === n - 1);
      });
      var on = steps[n - 1];
      var strip = on && on.parentNode;
      // On phones the step list is a horizontal strip: keep the lit step in it, without moving the page.
      if (strip && strip.scrollWidth > strip.clientWidth) {
        strip.scrollTo({ left: on.offsetLeft - strip.offsetLeft - 8, behavior: reduce ? "auto" : "smooth" });
      }
    }
    function finish() {
      stop();
      root.classList.remove("cx-armed");
      each(bodies, function (b) {
        each(b.children, function (el) { el.classList.remove("is-wait", "is-show"); });
        b.removeAttribute("aria-busy");
        toBottom(b, false);
      });
      each(steps, function (li) { li.classList.remove("is-on", "is-done"); });
    }
    function arm() {
      stop();
      root.classList.add("cx-armed");
      each(steps, function (li) { li.classList.remove("is-on", "is-done"); });
      each(bodies, function (b) {
        each(b.children, function (el) { el.classList.remove("is-show"); el.classList.add("is-wait"); });
        b.scrollTop = 0;
      });
    }
    function reveal(b, el) {
      var typing = el.previousElementSibling;
      if (typing && typing.classList.contains("cx-typing")) typing.remove();
      el.classList.remove("is-wait");
      el.classList.add("is-show");
      if (el.classList.contains("cx-tool")) {
        el.classList.add("is-run");
        later(function () { el.classList.remove("is-run"); }, 750);
      }
      var fx = +el.getAttribute("data-fx");
      if (fx) light(fx);
      toBottom(b, true);
    }
    function play() {
      arm();
      var left = bodies.length;
      each(bodies, function (b) {
        b.setAttribute("aria-busy", "true");
        var t = 350;
        each(b.children, function (el) {
          var k = kindOf(el);
          if (k === "ai" || k === "ok") {
            later(function () {
              var dots = document.createElement("div");
              dots.className = "cx-typing"; dots.setAttribute("aria-hidden", "true");
              dots.innerHTML = "<i></i><i></i><i></i>";
              b.insertBefore(dots, el);
              toBottom(b, true);
            }, t);
            t += 800;
          }
          later(function () { reveal(b, el); }, t);
          var len = textLen(el);
          t += k === "user" ? Math.min(1900, 700 + len * 9)
             : k === "tool" ? 1050
             : k === "ai" ? Math.min(3400, 700 + len * 16)
             : k === "ok" ? 1400
             : Math.min(2000, 700 + len * 6);
        });
        later(function () { if (--left === 0) finish(); }, t + 600);
      });
    }

    each(root.querySelectorAll("[data-cx-replay]"), function (btn) {
      btn.addEventListener("click", function () { noAuto(); play(); });
    });
    each(root.querySelectorAll("[data-cx-skip]"), function (btn) {
      btn.addEventListener("click", function () { noAuto(); finish(); });
    });

    if (reduce || !("IntersectionObserver" in window)) { finish(); return; }
    arm();
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting || !io) return;
        noAuto();
        play();
      });
    }, { threshold: 0.3 });
    io.observe(root.querySelector(".cx") || root);
  }

  each(roots, setup);
})();
