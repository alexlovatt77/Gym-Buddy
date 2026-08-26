(function () {
  "use strict";

  var STORAGE_KEYS = [
    "studio.demo.bundle",
    "studio.workout.v1",
    "studio.workout.picker.v1",
    "studio.maxes.v1",
    "studio.cardio.runs",
    "studio.macro.v1",
    "studio.weight.v2",
    "studio.sets.targets.v3",
    "studio.sets.targets.v2",
  ];

  window.studioClearAllData = function () {
    STORAGE_KEYS.forEach(function (key) {
      localStorage.removeItem(key);
    });
  };

  if (/[\?&]clear=1(?:&|$)/.test(location.search)) {
    window.studioClearAllData();
    var clean = location.pathname.split("/").pop() || "index.html";
    location.replace(clean);
    return;
  }

  if (localStorage.getItem("studio.demo.bundle")) {
    window.studioClearAllData();
  }
})();
