/*!
 * AG Analytics tracker
 * Cookie-free, privacy-first, single tracking beacon per page view.
 * Usage: <script defer src="https://YOUR-WORKER.workers.dev/tracker.js" data-site="your-site-id"></script>
 */
(function () {
  "use strict";

  var scriptTag = document.currentScript;
  var site = scriptTag.getAttribute("data-site");
  if (!site) return;

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
    if (navigator.sendBeacon) {
      var blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(endpoint + path, blob);
    } else {
      fetch(endpoint + path, {
        method: "POST",
        body: body,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }).catch(function () {});
    }
  }

  function trackPageView() {
    send("/collect", {
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
      send("/heartbeat", { site: site });
    }
  }

  trackPageView();
  setInterval(trackHeartbeat, 30000);

  // Single Page Apps: catch client-side navigation without a full page reload
  var lastUrl = location.href;
  var observer = new MutationObserver(function () {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      trackPageView();
    }
  });
  observer.observe(document, { subtree: true, childList: true });
})();
