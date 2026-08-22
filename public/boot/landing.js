(function () {
  try {
    var path = location.pathname || "/";
    var onLanding = path === "/";
    var onAuth = path === "/auth" || path.indexOf("/auth?") === 0;
    if (!onLanding && !onAuth) return;

    function cookieUrl(name) {
      var parts = document.cookie ? document.cookie.split(";") : [];
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        var idx = p.indexOf("=");
        if (idx < 0) continue;
        if (p.slice(0, idx).trim() !== name) continue;
        try {
          var v = decodeURIComponent(p.slice(idx + 1).trim());
          if (v && v.indexOf("http") === 0 && v.indexOf("data:") !== 0) return v;
        } catch (e) {}
        return "";
      }
      return "";
    }

    function preload(href, attr) {
      if (!href || document.querySelector("link[" + attr + "]")) return;
      var link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = href;
      link.setAttribute(attr, "1");
      document.head.appendChild(link);
    }

    if (onLanding) {
      try {
        var raw = localStorage.getItem("pmo.landingConfig.v2");
        if (raw) {
          var cfg = JSON.parse(raw);
          var p = cfg && cfg.palette;
          if (p) {
            var dark = cfg.theme === "dark";
            document.documentElement.style.backgroundColor = dark ? p.navy : "#ffffff";
            document.documentElement.style.color = p.textBody || "#1e3a5f";
          }
          var b = cfg && cfg.brand;
          var stored = b && String(b.logo_url_landing || b.logo_url || "").trim();
          if (stored && stored.indexOf("data:") !== 0) preload(stored, "data-pmo-landing-logo");
        }
      } catch (e) {}
      var land = cookieUrl("pmo_llogo");
      if (land) preload(land, "data-pmo-landing-logo");
      else preload("/api/public/landing-logo", "data-pmo-landing-logo");
    }

    if (onAuth) {
      var auth = cookieUrl("pmo_alogo") || cookieUrl("pmo_llogo");
      if (auth) preload(auth, "data-pmo-auth-logo");
      else preload("/api/public/landing-logo?surface=auth", "data-pmo-auth-logo");
    }
  } catch (e) {}
})();
