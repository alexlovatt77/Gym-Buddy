/* Shared weekly set-target storage */
(function (global) {
  "use strict";

  var TARGETS_KEY = "studio.sets.targets.v3";

  function defaults() {
    var base = global.STUDIO_DEFAULT_TARGETS || {};
    var groups = global.STUDIO_MUSCLE_GROUPS || Object.keys(base);
    var out = {};
    groups.forEach(function (group) {
      out[group] = base[group] || 0;
    });
    return out;
  }

  function cloneTargets(source) {
    var out = defaults();
    Object.keys(out).forEach(function (group) {
      if (source && source[group] != null && isFinite(Number(source[group]))) {
        out[group] = Number(source[group]);
      }
    });
    return out;
  }

  function emptyStore() {
    return { current: defaults(), weeks: {} };
  }

  function loadStore() {
    try {
      var raw = localStorage.getItem(TARGETS_KEY);
      if (!raw) {
        // migrate v2 flat targets if present
        var legacy = localStorage.getItem("studio.sets.targets.v2");
        if (legacy) {
          var legacyData = JSON.parse(legacy);
          var migrated = emptyStore();
          migrated.current = cloneTargets(legacyData);
          localStorage.setItem(TARGETS_KEY, JSON.stringify(migrated));
          return migrated;
        }
        return emptyStore();
      }
      var data = JSON.parse(raw);
      return {
        current: cloneTargets(data.current || data),
        weeks: data.weeks && typeof data.weeks === "object" ? data.weeks : {},
      };
    } catch (err) {
      return emptyStore();
    }
  }

  function saveStore(store) {
    localStorage.setItem(TARGETS_KEY, JSON.stringify(store));
  }

  function getCurrentTargets() {
    return cloneTargets(loadStore().current);
  }

  function saveCurrentTargets(targets) {
    var store = loadStore();
    store.current = cloneTargets(targets);
    // keep this week’s snapshot in sync with current settings
    var monday = weekMondayISO(new Date());
    store.weeks[monday] = cloneTargets(targets);
    saveStore(store);
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function toISO(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function startOfWeek(d) {
    var copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var day = copy.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    copy.setDate(copy.getDate() + diff);
    return copy;
  }

  function weekMondayISO(d) {
    return toISO(startOfWeek(d));
  }

  function getTargetsForWeek(mondayISO) {
    var store = loadStore();
    if (store.weeks[mondayISO]) return cloneTargets(store.weeks[mondayISO]);
    var targets = cloneTargets(store.current);
    // Freeze past/current weeks so later setting changes don’t rewrite history
    var thisMonday = weekMondayISO(new Date());
    if (mondayISO <= thisMonday) {
      store.weeks[mondayISO] = targets;
      saveStore(store);
    }
    return targets;
  }

  global.studioTargets = {
    defaults: defaults,
    getCurrent: getCurrentTargets,
    saveCurrent: saveCurrentTargets,
    forWeek: getTargetsForWeek,
    weekMondayISO: weekMondayISO,
    startOfWeek: startOfWeek,
    toISO: toISO,
  };
})(window);
