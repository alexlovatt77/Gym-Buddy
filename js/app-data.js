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
    "studio.theme.v1",
  ];

  var BACKUP_KEYS = STORAGE_KEYS.filter(function (key) {
    return key !== "studio.demo.bundle";
  });

  window.studioClearAllData = function () {
    STORAGE_KEYS.forEach(function (key) {
      localStorage.removeItem(key);
    });
  };

  window.studioExportBackup = function () {
    var data = {};
    BACKUP_KEYS.forEach(function (key) {
      var value = localStorage.getItem(key);
      if (value != null) data[key] = value;
    });
    return {
      app: "Gym Buddy",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: data,
    };
  };

  window.studioImportBackup = function (backup) {
    if (!backup || typeof backup !== "object" || !backup.data || typeof backup.data !== "object") {
      throw new Error("That file is not a Gym Buddy backup.");
    }
    Object.keys(backup.data).forEach(function (key) {
      if (BACKUP_KEYS.indexOf(key) < 0) return;
      var value = backup.data[key];
      if (typeof value !== "string") return;
      localStorage.setItem(key, value);
    });
  };

  window.studioDownloadBackup = function () {
    var backup = window.studioExportBackup();
    var stamp = backup.exportedAt.slice(0, 10);
    var blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "gym-buddy-backup-" + stamp + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
    return backup;
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
