/*!
 * AG Analytics tracker
 * Cookie-free, privacy-first, single tracking beacon per page view.
 * Usage: <script defer src="https://YOUR-WORKER.workers.dev/widget.js" data-site="your-site-id"></script>
 * (Named "widget.js" rather than "tracker.js" on purpose — the latter is a
 * common pattern in ad-blocker filter lists. "/tracker.js" still works too,
 * as an alias, for backward compatibility with already-embedded snippets.)
 */
(function () {
  "use strict";

  var scriptTag = document.currentScript;
  var site = scriptTag.getAttribute("data-site");
  if (!site) return;

  // Guards against this script somehow running more than once for the same
  // site on the same page — e.g. a framework component (React/Vue/Next.js)
  // that re-injects the <script> tag on every render or remount, a common
  // pattern when a third-party script is embedded without a dedupe check,
  // instead of once statically in the page HTML. Without this, each
  // duplicate run independently fires its own pageview AND wraps
  // history.pushState/replaceState again on top of the previous wrapper —
  // compounding the problem further with every re-render, not just doubling
  // it once.
  window.__agAnalyticsInit = window.__agAnalyticsInit || {};
  if (window.__agAnalyticsInit[site]) return;
  window.__agAnalyticsInit[site] = true;

  var endpoint = new URL(scriptTag.src).origin;
  var sessionKey = "ag_session_" + site;
  var sessionId = sessionStorageGet(sessionKey);

  if (!sessionId) {
    sessionId = site + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    sessionStorageSet(sessionKey, sessionId);
  }

  function sessionStorageGet(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function sessionStorageSet(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch (e) {
      /* private browsing mode or storage disabled: session id just won't persist */
    }
  }

  function send(path, payload) {
    var body = JSON.stringify(payload);
    // Deliberately using fetch(), not navigator.sendBeacon(). Beacon requests
    // are tagged by the browser itself as resource type "ping", and a lot of
    // ad-blocker configurations (Brave Shields, several uBlock Origin lists)
    // block that entire request type outright, regardless of the URL or
    // domain it's going to. A plain fetch() with keepalive is classified as
    // an ordinary "fetch"/"xhr" request, which isn't singled out the same way.
    fetch(endpoint + path, {
      method: "POST",
      body: body,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      mode: "cors",
    }).catch(function () {
      // Best-effort: if this particular request fails (offline, blocked,
      // page unloading before it completes), there's nothing useful to do —
      // failing loudly would be worse than silently skipping one data point.
    });
  }

  function trackPageView() {
    send("/event", {
      site: site,
      sessionId: sessionId,
      url: location.href,
      title: document.title,
      referrer: document.referrer || null,
      screen: screen.width + "x" + screen.height,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  }

  function trackHeartbeat() {
    if (document.visibilityState === "visible") {
      send("/ping", { site: site, sessionId: sessionId });
    }
  }

  // Public API for custom events/goals, e.g.:
  //   agEvent("signup");
  //   agEvent("purchase", { plan: "pro", amount: 29 });
  // `props` is optional and is stored as-is (JSON), for later reference in
  // the dashboard's "Custom events" panel. Keep it small and non-sensitive —
  // this is not meant for PII.
  window.agEvent = function (name, props) {
    if (!name) return;
    send("/track", {
      site: site,
      sessionId: sessionId,
      name: String(name),
      url: location.href,
      props: props || null,
    });
  };

  trackPageView();
  // 45s heartbeat: frequent enough for the "online now" indicator to feel
  // live, spaced out enough to stay comfortably inside free-tier database quotas.
  setInterval(trackHeartbeat, 45000);

  // Single Page Apps: catch client-side navigation via the History API
  // instead of watching the whole DOM for mutations. A MutationObserver on
  // `document` fires on ANY DOM change anywhere on the page — a cookie
  // banner appending a hash, a share widget adjusting query params via
  // replaceState, a router normalizing the URL a few times during its own
  // startup — and each one looked identical to a brand new pageview,
  // inflating referrer counts for what was really a single visit. Hooking
  // pushState/replaceState/popstate directly ties tracking to actual
  // navigation calls instead of an indirect side effect, and the short
  // debounce collapses any still-rapid, same-visit URL changes (e.g. a
  // router doing 2-3 quick replaceState calls while it boots) into one
  // pageview instead of several.
  var lastUrl = location.href;
  var debounceTimer = null;

  function handleUrlChange() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(trackPageView, 50);
  }

  var originalPushState = history.pushState;
  history.pushState = function () {
    originalPushState.apply(history, arguments);
    handleUrlChange();
  };

  var originalReplaceState = history.replaceState;
  history.replaceState = function () {
    originalReplaceState.apply(history, arguments);
    handleUrlChange();
  };

  window.addEventListener("popstate", handleUrlChange);
  window.addEventListener("hashchange", handleUrlChange);
})();
