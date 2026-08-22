(function () {
  try {
    if (location.pathname !== "/") return;
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
      var u = b && String(b.logo_url_landing || b.logo_url || "").trim();
      if (u && u.indexOf("data:") !== 0 && !document.querySelector('link[data-pmo-landing-logo]')) {
        var link = document.createElement("link");
        link.rel = "preload";
        link.as = "image";
        link.href = u;
        link.setAttribute("data-pmo-landing-logo", "1");
        document.head.appendChild(link);
      }
    }
  } catch (e) {}
})();
