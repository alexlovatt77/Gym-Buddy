(function () {
  "use strict";

  var STORAGE_KEY = "studio.macro.v1";

  var DEFAULT_GOALS = {
    calories: 3200,
    protein: 132,
    fat: 100,
    carbs: 443,
  };

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

  function cloneGoals(source) {
    var src = source || DEFAULT_GOALS;
    return {
      calories: Number(src.calories),
      protein: Number(src.protein),
      fat: Number(src.fat),
      carbs: Number(src.carbs),
    };
  }

  function normalizeGoals(source) {
    var goals = cloneGoals(source);
    ["calories", "protein", "fat", "carbs"].forEach(function (key) {
      if (!isFinite(goals[key]) || goals[key] < 0) {
        goals[key] = DEFAULT_GOALS[key];
      }
    });
    return goals;
  }

  function emptyStore() {
    return {
      meals: [],
      defaultMealsSeeded: false,
      removedMealIds: [],
      logs: {},
      goalsCurrent: cloneGoals(DEFAULT_GOALS),
      dayGoals: {},
    };
  }

  function loadStore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var store = emptyStore();
      var needsPersist = false;
      if (raw) {
        var data = JSON.parse(raw);
        store = {
          meals: Array.isArray(data.meals) ? data.meals : [],
          // Legacy stores have already received their defaults. Mark them seeded
          // so a deliberately removed default meal is not recreated.
          defaultMealsSeeded:
            typeof data.defaultMealsSeeded === "boolean"
              ? data.defaultMealsSeeded
              : true,
          removedMealIds: Array.isArray(data.removedMealIds)
            ? data.removedMealIds.map(String)
            : [],
          logs: data.logs && typeof data.logs === "object" ? data.logs : {},
          goalsCurrent: normalizeGoals(data.goalsCurrent || DEFAULT_GOALS),
          dayGoals:
            data.dayGoals && typeof data.dayGoals === "object" ? data.dayGoals : {},
        };
        if (typeof data.defaultMealsSeeded !== "boolean") needsPersist = true;
        if (!Array.isArray(data.removedMealIds)) needsPersist = true;
      }
      if (typeof window.studioEnsureDefaultMeals === "function") {
        if (window.studioEnsureDefaultMeals(store)) needsPersist = true;
      }
      if (needsPersist) saveStore(store);
      return store;
    } catch (err) {
      console.warn("Could not read macro store", err);
      var fallback = emptyStore();
      fallback._readError = true;
      if (typeof window.studioEnsureDefaultMeals === "function") {
        window.studioEnsureDefaultMeals(fallback);
      }
      return fallback;
    }
  }

  function saveStore(store) {
    // Never overwrite real data with an empty fallback after a read failure.
    if (store && store._readError) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  /** Goals frozen for that calendar day — used by history and pass/fail. */
  function goalsForDay(store, date) {
    if (store.dayGoals && store.dayGoals[date]) {
      return normalizeGoals(store.dayGoals[date]);
    }
    return normalizeGoals(store.goalsCurrent);
  }

  /**
   * Lock today's goals the first time we need them.
   * Later goal edits in Setup only change goalsCurrent (tomorrow onward).
   */
  function ensureTodayGoals(store) {
    var today = todayISO();
    if (!store.dayGoals) store.dayGoals = {};
    if (!store.dayGoals[today]) {
      store.dayGoals[today] = cloneGoals(store.goalsCurrent);
    }
    return store.dayGoals[today];
  }

  /** When a day ends, lock yesterday if it never got a snapshot. */
  function freezeDayGoals(store, date) {
    if (!date) return;
    if (!store.dayGoals) store.dayGoals = {};
    if (!store.dayGoals[date]) {
      store.dayGoals[date] = cloneGoals(store.goalsCurrent);
    }
  }

  function formatGoalsLine(goals) {
    return (
      formatNum(goals.calories) +
      " kcal · P " +
      formatNum(goals.protein) +
      " g · F " +
      formatNum(goals.fat) +
      " g · C " +
      formatNum(goals.carbs) +
      " g"
    );
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

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function formatNum(n) {
    if (!isFinite(n)) return "0";
    return Number.isInteger(n) ? String(n) : String(round1(n));
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function formatDayLabel(iso) {
    var d = new Date(iso + "T12:00:00");
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function msUntilNextMidnight() {
    var now = new Date();
    var next = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      0,
      50
    );
    return Math.max(1000, next.getTime() - now.getTime());
  }

  var activeDay = todayISO();
  var midnightTimer = null;
  var logCategory = document.getElementById("log-category");
  var logMeal = document.getElementById("log-meal");
  var logError = document.getElementById("log-error");

  function selectedDateISO() {
    return activeDay;
  }

  function syncActiveDay(forceRefresh) {
    var previousDay = activeDay;
    var nextDay = todayISO();
    var changed = nextDay !== activeDay;

    if (changed) {
      var store = loadStore();
      freezeDayGoals(store, previousDay);
      store.goalsCurrent = normalizeGoals(store.goalsCurrent);
      ensureTodayGoals(store);
      saveStore(store);
    } else {
      var storeToday = loadStore();
      ensureTodayGoals(storeToday);
      saveStore(storeToday);
    }

    activeDay = nextDay;
    var label = document.getElementById("current-day-label");
    if (label) label.textContent = formatDayLabel(activeDay);
    if (changed || forceRefresh) refresh();
  }

  function scheduleMidnightReset() {
    if (midnightTimer) clearTimeout(midnightTimer);
    midnightTimer = setTimeout(function () {
      syncActiveDay(true);
      scheduleMidnightReset();
    }, msUntilNextMidnight());
  }

  function mealsForCategory(store, category) {
    return store.meals
      .filter(function (meal) {
        return meal.category === category;
      })
      .slice()
      .sort(function (a, b) {
        return a.name.localeCompare(b.name);
      });
  }

  function populateMealDropdown() {
    var category = logCategory.value;
    var store = loadStore();

    if (!category) {
      logMeal.disabled = true;
      logMeal.innerHTML = '<option value="">Select category first…</option>';
      return;
    }

    var meals = mealsForCategory(store, category);
    if (!meals.length) {
      logMeal.disabled = true;
      logMeal.innerHTML =
        '<option value="">No meals in ' +
        escapeHtml(CATEGORY_LABEL[category] || category) +
        " yet</option>";
      return;
    }

    logMeal.disabled = false;
    logMeal.innerHTML =
      '<option value="">Select meal…</option>' +
      meals
        .map(function (meal) {
          return (
            '<option value="' +
            escapeHtml(meal.id) +
            '">' +
            escapeHtml(meal.name) +
            " · " +
            formatNum(meal.calories) +
            " kcal</option>"
          );
        })
        .join("");
  }

  function goalClass(actual, goal) {
    return actual >= goal ? "is-over" : "is-under";
  }

  function updateStat(id, barId, actual, goal, unit) {
    var el = document.getElementById(id);
    var bar = document.getElementById(barId);
    if (!el || !bar) return;
    el.textContent = formatNum(actual) + " / " + formatNum(goal) + " " + unit;
    el.classList.remove("is-under", "is-over");
    el.classList.add(goalClass(actual, goal));

    var pct = goal > 0 ? Math.min(100, (actual / goal) * 100) : 0;
    bar.style.setProperty("--pct", pct.toFixed(1) + "%");
    bar.classList.remove("is-under", "is-over");
    bar.classList.add(goalClass(actual, goal));
  }

  function dayEntries(store, date) {
    var list = store.logs[date];
    return Array.isArray(list) ? list : [];
  }

  function sumDay(entries) {
    return entries.reduce(
      function (acc, entry) {
        acc.calories += Number(entry.calories) || 0;
        acc.protein += Number(entry.protein) || 0;
        acc.fat += Number(entry.fat) || 0;
        acc.carbs += Number(entry.carbs) || 0;
        return acc;
      },
      { calories: 0, protein: 0, fat: 0, carbs: 0 }
    );
  }

  function renderTotals(store) {
    var date = selectedDateISO();
    var goals = goalsForDay(store, date);
    var totals = sumDay(dayEntries(store, date));
    updateStat("total-calories", "bar-calories", totals.calories, goals.calories, "kcal");
    updateStat("total-protein", "bar-protein", totals.protein, goals.protein, "g");
    updateStat("total-fat", "bar-fat", totals.fat, goals.fat, "g");
    updateStat("total-carbs", "bar-carbs", totals.carbs, goals.carbs, "g");

    var note = document.getElementById("goals-note");
    if (note) note.textContent = "Goal: " + formatGoalsLine(goals);
  }

  function renderEntries(store) {
    var tbody = document.getElementById("entry-list");
    if (!tbody) return;
    var date = selectedDateISO();
    var entries = dayEntries(store, date).slice().reverse();
    var compact = !document.getElementById("total-calories");
    var cols = compact ? 3 : 6;

    if (!entries.length) {
      tbody.innerHTML =
        '<tr class="is-placeholder"><td colspan="' +
        cols +
        '">' +
        (compact ? "No meals yet" : "No entries yet") +
        "</td></tr>";
      return;
    }

    tbody.innerHTML = entries
      .map(function (entry) {
        var cat = CATEGORY_LABEL[entry.category] || entry.category;
        var removeBtn =
          '<td class="num"><div class="history-actions">' +
          '<button type="button" data-remove-entry="' +
          escapeHtml(entry.id) +
          '">Remove</button></div></td>';

        if (compact) {
          return (
            "<tr>" +
            "<td>" +
            escapeHtml(entry.name) +
            '<span class="entry-cat"> · ' +
            escapeHtml(cat) +
            "</span></td>" +
            '<td class="num">' +
            formatNum(entry.calories) +
            "</td>" +
            removeBtn +
            "</tr>"
          );
        }

        return (
          "<tr>" +
          "<td>" +
          escapeHtml(entry.name) +
          '<span class="entry-cat"> · ' +
          escapeHtml(cat) +
          "</span></td>" +
          '<td class="num">' +
          formatNum(entry.calories) +
          "</td>" +
          '<td class="num">' +
          formatNum(entry.protein) +
          "</td>" +
          '<td class="num">' +
          formatNum(entry.fat) +
          "</td>" +
          '<td class="num">' +
          formatNum(entry.carbs) +
          "</td>" +
          removeBtn +
          "</tr>"
        );
      })
      .join("");
  }

  function migrateDayGoals(store) {
    var today = todayISO();
    if (!store.dayGoals) store.dayGoals = {};
    Object.keys(store.logs || {}).forEach(function (date) {
      if (date < today && !store.dayGoals[date]) {
        store.dayGoals[date] = cloneGoals(store.goalsCurrent);
      }
    });
    ensureTodayGoals(store);
  }

  function refresh() {
    var store = loadStore();
    migrateDayGoals(store);
    saveStore(store);
    renderTotals(store);
    renderEntries(store);
    if (logCategory) populateMealDropdown();
    var historySheetEl = document.getElementById("history-sheet");
    if (historySheetEl && !historySheetEl.hidden) {
      renderCalendar();
      if (!document.getElementById("history-day-view").hidden && historySelectedDay) {
        openHistoryDay(historySelectedDay);
      }
    }
  }

  /* —— History calendar —— */
  var historySheet = document.getElementById("history-sheet");
  var historySelectedDay = null;
  var calCursor = (function () {
    var d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  })();

  function dayPassFail(totals, goals) {
    return {
      calories: totals.calories >= goals.calories,
      protein: totals.protein >= goals.protein,
      fat: totals.fat >= goals.fat,
      carbs: totals.carbs >= goals.carbs,
    };
  }

  function markHtml(label, passed, compact) {
    return (
      '<span class="mark ' +
      (passed ? "is-pass" : "is-fail") +
      '"><span class="mark__label">' +
      label +
      '</span><span class="mark__icon" aria-hidden="true">' +
      (passed ? "✓" : "✗") +
      "</span>" +
      (compact
        ? ""
        : '<span class="visually-hidden">' +
          (passed ? " passed" : " failed") +
          "</span>") +
      "</span>"
    );
  }

  function isoFromParts(year, monthIndex, day) {
    return year + "-" + pad2(monthIndex + 1) + "-" + pad2(day);
  }

  function renderCalendar() {
    var label = document.getElementById("cal-month-label");
    var grid = document.getElementById("cal-grid");
    if (!label || !grid) return;
    var store = loadStore();
    var monthDate = new Date(calCursor.year, calCursor.month, 1);
    label.textContent = monthDate.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });

    var firstDow = (monthDate.getDay() + 6) % 7; // Monday = 0
    var daysInMonth = new Date(calCursor.year, calCursor.month + 1, 0).getDate();
    var today = todayISO();
    var html = "";

    for (var i = 0; i < firstDow; i++) {
      html += '<div class="cal-day is-empty" aria-hidden="true"></div>';
    }

    for (var day = 1; day <= daysInMonth; day++) {
      var iso = isoFromParts(calCursor.year, calCursor.month, day);
      var isFuture = iso > today;
      var isToday = iso === today;
      var classes = "cal-day";
      if (isFuture) classes += " is-future";
      if (isToday) classes += " is-today";

      var marksHtml = "";
      if (!isFuture) {
        var totals = sumDay(dayEntries(store, iso));
        var goals = goalsForDay(store, iso);
        var marks = dayPassFail(totals, goals);
        marksHtml =
          '<span class="cal-day__marks">' +
          markHtml("Kc", marks.calories, true) +
          markHtml("P", marks.protein, true) +
          markHtml("F", marks.fat, true) +
          markHtml("C", marks.carbs, true) +
          "</span>";
      }

      html +=
        '<button type="button" class="' +
        classes +
        '" data-history-day="' +
        iso +
        '" aria-label="' +
        escapeHtml(formatDayLabel(iso)) +
        '">' +
        '<span class="cal-day__num">' +
        day +
        "</span>" +
        marksHtml +
        "</button>";
    }

    grid.innerHTML = html;
  }

  function showHistoryCalendar() {
    document.getElementById("history-calendar-view").hidden = false;
    document.getElementById("history-day-view").hidden = true;
    historySelectedDay = null;
    renderCalendar();
  }

  function openHistorySheet() {
    if (!historySheet) return;
    historySheet.hidden = false;
    document.body.style.overflow = "hidden";
    showHistoryCalendar();
  }

  function closeHistorySheet() {
    if (!historySheet) return;
    historySheet.hidden = true;
    document.body.style.overflow = "";
    historySelectedDay = null;
  }

  function setHistoryStat(id, actual, goal, unit) {
    var el = document.getElementById(id);
    el.textContent = formatNum(actual) + " / " + formatNum(goal) + " " + unit;
    el.classList.remove("is-under", "is-over");
    el.classList.add(goalClass(actual, goal));
  }

  function openHistoryDay(iso) {
    var store = loadStore();
    var entries = dayEntries(store, iso);
    var totals = sumDay(entries);
    var goals = goalsForDay(store, iso);
    var marks = dayPassFail(totals, goals);
    historySelectedDay = iso;

    document.getElementById("history-calendar-view").hidden = true;
    document.getElementById("history-day-view").hidden = false;
    document.getElementById("history-day-title").textContent = formatDayLabel(iso);
    document.getElementById("history-day-goals-note").textContent =
      "Goals that day: " + formatGoalsLine(goals);
    document.getElementById("history-day-marks").innerHTML =
      markHtml("Kc", marks.calories, false) +
      markHtml("P", marks.protein, false) +
      markHtml("F", marks.fat, false) +
      markHtml("C", marks.carbs, false);

    setHistoryStat("history-day-calories", totals.calories, goals.calories, "kcal");
    setHistoryStat("history-day-protein", totals.protein, goals.protein, "g");
    setHistoryStat("history-day-fat", totals.fat, goals.fat, "g");
    setHistoryStat("history-day-carbs", totals.carbs, goals.carbs, "g");

    var tbody = document.getElementById("history-day-meals");
    if (!entries.length) {
      tbody.innerHTML =
        '<tr class="is-placeholder"><td colspan="5">No entries yet</td></tr>';
      return;
    }

    tbody.innerHTML = entries
      .map(function (entry) {
        var cat = CATEGORY_LABEL[entry.category] || entry.category;
        return (
          "<tr>" +
          "<td>" +
          escapeHtml(entry.name) +
          '<span class="entry-cat"> · ' +
          escapeHtml(cat) +
          "</span></td>" +
          '<td class="num">' +
          formatNum(entry.calories) +
          "</td>" +
          '<td class="num">' +
          formatNum(entry.protein) +
          "</td>" +
          '<td class="num">' +
          formatNum(entry.fat) +
          "</td>" +
          '<td class="num">' +
          formatNum(entry.carbs) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  if (historySheet) {
  var openHistoryBtn = document.getElementById("open-history");
  if (openHistoryBtn) openHistoryBtn.addEventListener("click", openHistorySheet);
  document.getElementById("cal-prev").addEventListener("click", function () {
    calCursor.month -= 1;
    if (calCursor.month < 0) {
      calCursor.month = 11;
      calCursor.year -= 1;
    }
    renderCalendar();
  });
  document.getElementById("cal-next").addEventListener("click", function () {
    calCursor.month += 1;
    if (calCursor.month > 11) {
      calCursor.month = 0;
      calCursor.year += 1;
    }
    renderCalendar();
  });
  document.getElementById("history-back").addEventListener("click", showHistoryCalendar);

  document.getElementById("cal-grid").addEventListener("click", function (event) {
    var dayBtn = event.target.closest("[data-history-day]");
    if (!dayBtn) return;
    openHistoryDay(dayBtn.getAttribute("data-history-day"));
  });

  historySheet.addEventListener("click", function (event) {
    if (event.target.closest("[data-close-history]")) closeHistorySheet();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !historySheet.hidden) closeHistorySheet();
  });
  }

  if (logCategory) {
    syncActiveDay(false);
    scheduleMidnightReset();

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        syncActiveDay(false);
        scheduleMidnightReset();
      }
    });

    window.addEventListener("focus", function () {
      syncActiveDay(false);
    });

    logCategory.addEventListener("change", function () {
      populateMealDropdown();
    });

    document.getElementById("log-form").addEventListener("submit", function (event) {
    event.preventDefault();
    logError.hidden = true;

    var category = logCategory.value;
    var mealId = logMeal.value;
    if (!category) {
      logError.textContent = "Choose a category.";
      logError.hidden = false;
      return;
    }
    if (!mealId) {
      logError.textContent = "Choose a meal.";
      logError.hidden = false;
      return;
    }

    var store = loadStore();
    var meal = store.meals.find(function (item) {
      return item.id === mealId;
    });
    if (!meal) {
      logError.textContent = "That meal was removed from your library.";
      logError.hidden = false;
      populateMealDropdown();
      return;
    }

    var date = selectedDateISO();
    if (!store.logs[date]) store.logs[date] = [];
    ensureTodayGoals(store);
    var entryId = uid("e");
    store.logs[date].push({
      id: entryId,
      mealId: meal.id,
      category: meal.category,
      name: meal.name,
      calories: Number(meal.calories) || 0,
      protein: Number(meal.protein) || 0,
      fat: Number(meal.fat) || 0,
      carbs: Number(meal.carbs) || 0,
      loggedAt: Date.now(),
    });
    saveStore(store);
    logMeal.value = "";
    refresh();
    window.studioUndo.offer({
      message: "Meal added",
      onUndo: function () {
        var s = loadStore();
        s.logs[date] = dayEntries(s, date).filter(function (entry) {
          return entry.id !== entryId;
        });
        saveStore(s);
        refresh();
      },
    });
  });

  document.body.addEventListener("click", function (event) {
    var entryBtn = event.target.closest("[data-remove-entry]");
    if (!entryBtn) return;
    event.preventDefault();
    var entryId = String(entryBtn.getAttribute("data-remove-entry") || "");
    if (!entryId) return;
    var store = loadStore();
    var date = selectedDateISO();
    var removed = null;
    dayEntries(store, date).forEach(function (entry) {
      if (String(entry.id) === entryId) removed = entry;
    });
    if (!removed) return;
    store.logs[date] = dayEntries(store, date).filter(function (entry) {
      return String(entry.id) !== entryId;
    });
    saveStore(store);
    refresh();
    window.studioUndo.offer({
      message: "Meal removed",
      onUndo: function () {
        var s = loadStore();
        if (!s.logs[date]) s.logs[date] = [];
        s.logs[date].push(removed);
        saveStore(s);
        refresh();
      },
    });
  });
  }

  window.studioLogAiMeal = function (meal) {
    if (!meal || typeof meal !== "object") return null;
    var store = loadStore();
    var date = selectedDateISO();
    if (!store.logs[date]) store.logs[date] = [];
    ensureTodayGoals(store);
    var entryId = uid("e");
    var entry = {
      id: entryId,
      mealId: null,
      category: meal.category || "snack",
      name: String(meal.name || "Meal").trim() || "Meal",
      calories: Math.max(0, Math.round(Number(meal.calories) || 0)),
      protein: Math.max(0, Math.round(Number(meal.protein) || 0)),
      fat: Math.max(0, Math.round(Number(meal.fat) || 0)),
      carbs: Math.max(0, Math.round(Number(meal.carbs) || 0)),
      loggedAt: Date.now(),
      source: "ai",
    };
    store.logs[date].push(entry);
    saveStore(store);
    refresh();
    if (window.studioUndo) {
      window.studioUndo.offer({
        message: "Meal added",
        onUndo: function () {
          var s = loadStore();
          s.logs[date] = dayEntries(s, date).filter(function (item) {
            return item.id !== entryId;
          });
          saveStore(s);
          refresh();
        },
      });
    }
    return entry;
  };

  refresh();
})();
