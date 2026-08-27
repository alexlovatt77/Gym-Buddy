(function () {
  "use strict";

  var KEY = "studio.theme.v1";
  var MODES = ["light", "dark", "fallout", "system"];

  function getStoredMode() {
    try {
      var value = localStorage.getItem(KEY);
      return MODES.indexOf(value) >= 0 ? value : "light";
    } catch (err) {
      return "light";
    }
  }

  function resolve(mode) {
    if (mode === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    if (mode === "dark" || mode === "fallout") return mode;
    return "light";
  }

  function applyResolved(resolved) {
    document.documentElement.setAttribute("data-theme", resolved);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      var colors = {
        dark: "#121a22",
        fallout: "#071109",
        light: "#e9eef2",
      };
      meta.setAttribute("content", colors[resolved] || colors.light);
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
      if (MODES.indexOf(mode) < 0) mode = "light";
      localStorage.setItem(KEY, mode);
      apply(mode);
    },
    resolve: resolve,
  };
})();
