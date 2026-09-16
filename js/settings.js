(function () {
  "use strict";

  var GROUPS = window.STUDIO_MUSCLE_GROUPS || [];
  var targetsApi = window.studioTargets;
  var MACRO_KEY = "studio.macro.v1";

  var SETUP_TABS = [
    {
      id: "targets",
      label: "Weekly targets",
      panel: "setup-panel-targets",
    },
    {
      id: "meals",
      label: "Meals",
      panel: "setup-panel-meals",
    },
    {
      id: "goals",
      label: "Macro goals",
      panel: "setup-panel-goals",
    },
    {
      id: "appearance",
      label: "Appearance",
      panel: "setup-panel-appearance",
    },
  ];

  var CATEGORIES = [
    { id: "breakfast", label: "Breakfast" },
    { id: "lunch", label: "Lunch" },
    { id: "dinner", label: "Dinner" },
    { id: "snack", label: "Snack" },
    { id: "dessert", label: "Dessert" },
  ];

  var CATEGORY_LABEL = CATEGORIES.reduce(function (map, item) {
    map[item.id] = item.label;
    return map;
  }, {});

  function range(start, end) {
    var list = [];
    for (var i = start; i <= end; i++) list.push(i);
    return list;
  }

  function fillSelect(select, values) {
    select.innerHTML = values
      .map(function (value) {
        return '<option value="' + value + '">' + value + "</option>";
      })
      .join("");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatNum(n) {
    if (!isFinite(n)) return "0";
    var r = Math.round(Number(n) * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }

  function uid(prefix) {
    return (
      prefix +
      "_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 7)
    );
  }

  function emptyMacroStore() {
    return {
      meals: [],
      defaultMealsSeeded: false,
      removedMealIds: [],
      logs: {},
      goalsCurrent: { calories: 3200, protein: 132, fat: 100, carbs: 443 },
      dayGoals: {},
    };
  }

  function normalizeGoals(source) {
    var defaults = emptyMacroStore().goalsCurrent;
    var src = source || defaults;
    var goals = {
      calories: Number(src.calories),
      protein: Number(src.protein),
      fat: Number(src.fat),
      carbs: Number(src.carbs),
    };
    ["calories", "protein", "fat", "carbs"].forEach(function (key) {
      if (!isFinite(goals[key]) || goals[key] < 0) goals[key] = defaults[key];
    });
    return goals;
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function ensureTodayGoals(store) {
    var today = todayISO();
    if (!store.dayGoals) store.dayGoals = {};
    if (!store.dayGoals[today]) {
      store.dayGoals[today] = {
        calories: store.goalsCurrent.calories,
        protein: store.goalsCurrent.protein,
        fat: store.goalsCurrent.fat,
        carbs: store.goalsCurrent.carbs,
      };
    }
  }

  function loadMacroStore() {
    try {
      var raw = localStorage.getItem(MACRO_KEY);
      var store = emptyMacroStore();
      var needsPersist = false;
      if (raw) {
        var data = JSON.parse(raw);
        store = {
          meals: Array.isArray(data.meals) ? data.meals : [],
          // Older saved stores were seeded before this marker existed.
          defaultMealsSeeded:
            typeof data.defaultMealsSeeded === "boolean"
              ? data.defaultMealsSeeded
              : true,
          removedMealIds: Array.isArray(data.removedMealIds)
            ? data.removedMealIds.map(String)
            : [],
          logs: data.logs && typeof data.logs === "object" ? data.logs : {},
          goalsCurrent: normalizeGoals(
            data.goalsCurrent || emptyMacroStore().goalsCurrent
          ),
          dayGoals:
            data.dayGoals && typeof data.dayGoals === "object" ? data.dayGoals : {},
        };
        if (typeof data.defaultMealsSeeded !== "boolean") needsPersist = true;
        if (!Array.isArray(data.removedMealIds)) needsPersist = true;
      }
      if (typeof window.studioEnsureDefaultMeals === "function") {
        if (window.studioEnsureDefaultMeals(store)) needsPersist = true;
      }
      if (needsPersist) saveMacroStore(store);
      return store;
    } catch (err) {
      console.warn("Could not read macro store", err);
      var fallback = emptyMacroStore();
      if (typeof window.studioEnsureDefaultMeals === "function") {
        window.studioEnsureDefaultMeals(fallback);
      }
      return fallback;
    }
  }

  function saveMacroStore(store) {
    localStorage.setItem(MACRO_KEY, JSON.stringify(store));
  }

  var tabIndex = 0;

  function showSetupTab(index) {
    tabIndex = (index + SETUP_TABS.length) % SETUP_TABS.length;
    var tab = SETUP_TABS[tabIndex];
    document.getElementById("setup-tab-label").textContent = tab.label;
    SETUP_TABS.forEach(function (item) {
      var panel = document.getElementById(item.panel);
      if (!panel) return;
      panel.hidden = item.id !== tab.id;
    });
  }

  var fields = {};
  GROUPS.forEach(function (group) {
    var select = document.getElementById("target-" + group.toLowerCase());
    if (!select) return;
    fillSelect(select, range(0, 80));
    fields[group] = select;
  });

  function renderTargets() {
    var targets = targetsApi.getCurrent();
    GROUPS.forEach(function (group) {
      if (fields[group]) fields[group].value = String(targets[group]);
    });
  }

  function renderLibrary() {
    var store = loadMacroStore();
    var tbody = document.getElementById("meal-library");
    var meals = store.meals.slice().sort(function (a, b) {
      var cat = (CATEGORY_LABEL[a.category] || "").localeCompare(
        CATEGORY_LABEL[b.category] || ""
      );
      if (cat !== 0) return cat;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });

    if (!meals.length) {
      tbody.innerHTML =
        '<tr class="is-placeholder"><td colspan="7">No meals yet</td></tr>';
      return;
    }

    tbody.innerHTML = meals
      .map(function (meal) {
        return (
          "<tr>" +
          "<td>" +
          escapeHtml(CATEGORY_LABEL[meal.category] || meal.category) +
          "</td>" +
          "<td>" +
          escapeHtml(meal.name) +
          "</td>" +
          '<td class="num">' +
          formatNum(meal.calories) +
          "</td>" +
          '<td class="num">' +
          formatNum(meal.protein) +
          "</td>" +
          '<td class="num">' +
          formatNum(meal.fat) +
          "</td>" +
          '<td class="num">' +
          formatNum(meal.carbs) +
          "</td>" +
          '<td class="num"><div class="history-actions">' +
          '<button type="button" data-remove-meal="' +
          escapeHtml(meal.id) +
          '">Remove</button></div></td>' +
          "</tr>"
        );
      })
      .join("");
  }

  document.getElementById("setup-prev").addEventListener("click", function () {
    showSetupTab(tabIndex - 1);
  });
  document.getElementById("setup-next").addEventListener("click", function () {
    showSetupTab(tabIndex + 1);
  });

  function setStatus(el, message, kind) {
    if (!el) return;
    el.classList.remove("is-error", "is-success", "field-error", "section__note");
    el.classList.add("field-status");
    if (kind === "error") el.classList.add("is-error");
    if (kind === "success") el.classList.add("is-success");
    el.textContent = message || "";
    el.hidden = !message;
  }

  function toast(message) {
    if (window.studioToast) window.studioToast.show(message);
  }

  document.getElementById("targets-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var next = {};
    GROUPS.forEach(function (group) {
      next[group] = fields[group] ? Number(fields[group].value) || 0 : 0;
    });
    targetsApi.saveCurrent(next);
    var note = document.getElementById("targets-saved");
    if (note) note.hidden = true;
    toast("Targets saved");
  });

  var mealError = document.getElementById("meal-error");

  document.getElementById("meal-form").addEventListener("submit", function (event) {
    event.preventDefault();
    setStatus(mealError, "");

    var category = document.getElementById("meal-category").value;
    var name = document.getElementById("meal-name").value.trim();
    var calories = Number(document.getElementById("meal-calories").value);
    var protein = Number(document.getElementById("meal-protein").value);
    var fat = Number(document.getElementById("meal-fat").value);
    var carbs = Number(document.getElementById("meal-carbs").value);

    if (!CATEGORY_LABEL[category]) {
      setStatus(mealError, "Choose a category.", "error");
      return;
    }
    if (!name) {
      setStatus(mealError, "Enter a meal name.", "error");
      return;
    }
    if (
      !isFinite(calories) ||
      calories < 0 ||
      !isFinite(protein) ||
      protein < 0 ||
      !isFinite(fat) ||
      fat < 0 ||
      !isFinite(carbs) ||
      carbs < 0
    ) {
      setStatus(mealError, "Enter calories and macros as 0 or higher.", "error");
      return;
    }

    var store = loadMacroStore();
    store.meals.push({
      id: uid("m"),
      category: category,
      name: name,
      calories: calories,
      protein: protein,
      fat: fat,
      carbs: carbs,
    });
    saveMacroStore(store);

    document.getElementById("meal-form").reset();
    document.getElementById("meal-category").value = category;
    renderLibrary();
    toast("Meal saved");
  });

  document.body.addEventListener("click", function (event) {
    var mealBtn = event.target.closest("[data-remove-meal]");
    if (!mealBtn) return;
    event.preventDefault();
    var mealId = String(mealBtn.getAttribute("data-remove-meal") || "");
    if (!mealId) return;
    var store = loadMacroStore();
    var removedMeal = null;
    store.meals.forEach(function (meal) {
      if (String(meal.id) === mealId) removedMeal = meal;
    });
    if (!removedMeal) return;
    store.meals = store.meals.filter(function (meal) {
      return String(meal.id) !== mealId;
    });
    store.defaultMealsSeeded = true;
    if (typeof window.studioMarkMealRemoved === "function") {
      window.studioMarkMealRemoved(store, mealId);
    }
    saveMacroStore(store);
    renderLibrary();
    if (window.studioUndo) {
      window.studioUndo.offer({
        message: "Meal removed",
        onUndo: function () {
          var s = loadMacroStore();
          s.meals.push(removedMeal);
          if (typeof window.studioUnmarkMealRemoved === "function") {
            window.studioUnmarkMealRemoved(s, mealId);
          }
          saveMacroStore(s);
          renderLibrary();
        },
      });
    }
  });

  function fillGoalsForm() {
    var goals = loadMacroStore().goalsCurrent;
    document.getElementById("goal-calories").value = goals.calories;
    document.getElementById("goal-protein").value = goals.protein;
    document.getElementById("goal-fat").value = goals.fat;
    document.getElementById("goal-carbs").value = goals.carbs;
  }

  document.getElementById("goals-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var errorEl = document.getElementById("goals-error");
    setStatus(errorEl, "");

    var next = normalizeGoals({
      calories: Number(document.getElementById("goal-calories").value),
      protein: Number(document.getElementById("goal-protein").value),
      fat: Number(document.getElementById("goal-fat").value),
      carbs: Number(document.getElementById("goal-carbs").value),
    });

    if (
      !isFinite(next.calories) ||
      next.calories < 0 ||
      !isFinite(next.protein) ||
      next.protein < 0 ||
      !isFinite(next.fat) ||
      next.fat < 0 ||
      !isFinite(next.carbs) ||
      next.carbs < 0
    ) {
      setStatus(errorEl, "Enter goals as 0 or higher.", "error");
      return;
    }

    var store = loadMacroStore();
    ensureTodayGoals(store);
    store.goalsCurrent = next;
    saveMacroStore(store);
    fillGoalsForm();
    toast("Goals saved — they apply from tomorrow");
  });

  showSetupTab(0);
  renderTargets();
  renderLibrary();
  fillGoalsForm();

  var themeSelect = document.getElementById("theme-mode");
  var themeNote = document.getElementById("theme-note");

  function updateThemeNote(mode) {
    if (!themeNote) return;
    if (mode === "fallout") {
      themeNote.textContent = "Fallout mode active — Pip-Boy terminal look.";
    } else if (mode === "dark") {
      themeNote.textContent = "Dark mode active.";
    } else if (mode === "system") {
      themeNote.textContent = "Follows your device light or dark setting.";
    } else {
      themeNote.textContent = "Choose light, dark, system, or Fallout.";
    }
  }

  function applyThemeFromSelect() {
    if (!themeSelect || !window.studioTheme) return;
    var mode = window.studioTheme.setMode(themeSelect.value);
    themeSelect.value = mode;
    updateThemeNote(mode);
  }

  if (themeSelect && window.studioTheme) {
    themeSelect.value = window.studioTheme.getMode();
    updateThemeNote(themeSelect.value);
    themeSelect.addEventListener("change", applyThemeFromSelect);
    themeSelect.addEventListener("input", applyThemeFromSelect);
  }

  var backupMsg = document.getElementById("backup-msg");

  if (/[\?&]restored=1(?:&|$)/.test(location.search)) {
    toast("Backup restored");
    history.replaceState({}, "", location.pathname.split("/").pop() || "settings.html");
  }

  document.getElementById("export-backup").addEventListener("click", function () {
    try {
      if (typeof window.studioDownloadBackup !== "function") {
        throw new Error("Backup is not available.");
      }
      window.studioDownloadBackup();
      setStatus(backupMsg, "");
      toast("Backup downloaded");
    } catch (err) {
      setStatus(backupMsg, err.message || "Could not export backup.", "error");
    }
  });

  var restoreBtn = document.getElementById("restore-backup");
  var restoreFile = document.getElementById("restore-backup-file");
  if (restoreBtn && restoreFile) {
    restoreBtn.addEventListener("click", function () {
      restoreFile.value = "";
      restoreFile.click();
    });

    restoreFile.addEventListener("change", function () {
      var file = restoreFile.files && restoreFile.files[0];
      if (!file) return;
      if (
        !confirm(
          "Restore this backup? It will replace workouts, macros, weight, water, maxes, and settings on this device."
        )
      ) {
        restoreFile.value = "";
        return;
      }

      var reader = new FileReader();
      reader.onload = function () {
        try {
          var backup = JSON.parse(String(reader.result || ""));
          window.studioImportBackup(backup);
          location.replace("settings.html?restored=1");
        } catch (err) {
          setStatus(backupMsg, err.message || "Could not restore that file.", "error");
        }
      };
      reader.onerror = function () {
        setStatus(backupMsg, "Could not read that file.", "error");
      };
      reader.readAsText(file);
    });
  }

  document.getElementById("clear-all-data").addEventListener("click", function () {
    if (
      !confirm(
        "Clear all Gym Buddy data on this device?\n\nThis permanently deletes workouts, maxes, macros, weight, water, and settings."
      )
    ) {
      return;
    }
    if (!confirm("This cannot be undone. Clear everything?")) {
      return;
    }
    if (typeof window.studioClearAllData === "function") {
      window.studioClearAllData();
    }
    location.reload();
  });
})();
