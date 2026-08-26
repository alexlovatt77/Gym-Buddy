(function () {
  "use strict";

  var path = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();

  document.querySelectorAll(".tabbar a").forEach(function (link) {
    var href = (link.getAttribute("href") || "").toLowerCase();
    if (href === path || (path === "" && href === "index.html")) {
      link.setAttribute("aria-current", "page");
    }
  });
})();
