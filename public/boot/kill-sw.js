(function () {
  try {
    if (!("serviceWorker" in navigator)) return;
    var p = location.pathname;
    if (
      p !== "/" &&
      p.indexOf("/contact") !== 0 &&
      p.indexOf("/legal") !== 0 &&
      p.indexOf("/auth") !== 0 &&
      p.indexOf("/o/") !== 0
    ) {
      return;
    }
    navigator.serviceWorker
      .getRegistrations()
      .then(function (regs) {
        return Promise.all(
          regs.map(function (r) {
            return r.unregister();
          }),
        ).then(function () {
          try {
            if (typeof caches === "undefined" || !caches.keys) return [];
            return caches.keys();
          } catch (_e) {
            return [];
          }
        });
      })
      .then(function (keys) {
        try {
          if (typeof caches === "undefined") return [];
          return Promise.all(
            (keys || []).map(function (k) {
              return caches.delete(k);
            }),
          );
        } catch (_e) {
          return [];
        }
      })
      .then(function () {
        try {
          if (
            navigator.serviceWorker.controller &&
            !sessionStorage.getItem("pmo:sw-public-cleared")
          ) {
            sessionStorage.setItem("pmo:sw-public-cleared", "1");
            location.reload();
          }
        } catch (e) {}
      })
      .catch(function () {});
  } catch (e) {}
})();
