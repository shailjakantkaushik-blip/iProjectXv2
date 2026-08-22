(function () {
  try {
    if (location.pathname !== "/") return;
    var raw = localStorage.getItem("pmo.landingConfig.v2");
    if (!raw) return;
    var cfg = JSON.parse(raw);
    if (!cfg) return;
    var p = cfg.palette;
    if (p) {
      var dark = cfg.theme === "dark";
      var bg = dark ? p.navy : "#ffffff";
      document.documentElement.style.backgroundColor = bg;
      document.documentElement.style.color = p.textBody || "#1e3a5f";
    }
    var b = cfg.brand || {};
    var logo = String(b.logo_url_landing || "").trim();
    if (!logo || logo.indexOf("data:") === 0 || logo.length > 1800) return;
    if (logo.indexOf("http://") !== 0 && logo.indexOf("https://") !== 0) return;
    document.cookie =
      "pmo_llogo=" + encodeURIComponent(logo) + "; Path=/; Max-Age=2592000; SameSite=Lax";
    if (!document.querySelector('link[data-pmo-landing-logo]')) {
      var link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = logo;
      link.setAttribute("data-pmo-landing-logo", "1");
      document.head.appendChild(link);
    }
  } catch (e) {}
})();
