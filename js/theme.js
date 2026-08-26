(function () {
  "use strict";

  var KEY = "studio.theme.v1";
  var MODES = ["light", "dark", "system"];

  function getStoredMode() {
    try {
      var value = localStorage.getItem(KEY);
      return MODES.indexOf(value) >= 0 ? value : "system";
    } catch (err) {
      return "system";
    }
  }

  function resolve(mode) {
    if (mode === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return mode === "dark" ? "dark" : "light";
  }

  function applyResolved(resolved) {
    document.documentElement.setAttribute("data-theme", resolved);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", resolved === "dark" ? "#121a22" : "#e9eef2");
    }
  }

  function apply(mode) {
    applyResolved(resolve(mode));
  }

  apply(getStoredMode());

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
    if (getStoredMode() === "system") apply("system");
  });

  window.studioTheme = {
    getMode: getStoredMode,
    setMode: function (mode) {
      if (MODES.indexOf(mode) < 0) mode = "system";
      localStorage.setItem(KEY, mode);
      apply(mode);
    },
    resolve: resolve,
  };
})();
