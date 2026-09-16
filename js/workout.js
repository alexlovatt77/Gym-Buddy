(function () {
  "use strict";

  var STORAGE_KEY = "studio.workout.v1";
  var PICKER_PREFS_KEY = "studio.workout.picker.v1";

  function emptyStore() {
    return { days: {}, draft: null };
  }

  function loadStore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyStore();
      var data = JSON.parse(raw);
      var store = {
        days: data.days && typeof data.days === "object" ? data.days : {},
        draft: null,
      };
      if (data.draft && typeof data.draft === "object" && data.draft.date) {
        store.draft = {
          date: data.draft.date,
          exercises: Array.isArray(data.draft.exercises) ? data.draft.exercises : [],
        };
      }
      return store;
    } catch (err) {
      console.warn("Could not read workout store", err);
      return emptyStore();
    }
  }

  function saveStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function formatDateFull(iso) {
    var d = new Date(iso + "T12:00:00");
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function formatDateShort(iso) {
    var d = new Date(iso + "T12:00:00");
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  function startOfWeek(d) {
    var copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var day = copy.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    copy.setDate(copy.getDate() + diff);
    return copy;
  }

  function endOfWeek(monday) {
    var copy = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate());
    copy.setDate(copy.getDate() + 6);
    return copy;
  }

  function toISODate(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function weekCompletedDays(store) {
    var monday = startOfWeek(new Date());
    var sunday = endOfWeek(monday);
    var start = toISODate(monday);
    var end = toISODate(sunday);
    var days = [];
    Object.keys(store.days || {})
      .sort()
      .forEach(function (date) {
        if (date < start || date > end) return;
        var exercises = Array.isArray(store.days[date]) ? store.days[date] : [];
        if (!exercises.length) return;
        days.push({ date: date, exercises: exercises });
      });
    return { monday: monday, sunday: sunday, days: days };
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

  function range(start, end, step) {
    var list = [];
    var s = step || 1;
    for (var i = start; i <= end + 1e-9; i = Math.round((i + s) * 100) / 100) {
      list.push(i);
    }
    return list;
  }

  function fillSelect(select, values, formatter) {
    select.innerHTML = values
      .map(function (value) {
        var label = formatter ? formatter(value) : String(value);
        return '<option value="' + value + '">' + label + "</option>";
      })
      .join("");
  }

  function setSelectValue(select, value) {
    select.value = String(value);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatWeight(n) {
    var r = Math.round(Number(n) * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }

  function ensureDraft(store, date) {
    if (!store.draft || store.draft.date !== date) {
      store.draft = { date: date, exercises: [] };
    }
    if (!Array.isArray(store.draft.exercises)) store.draft.exercises = [];
    return store.draft;
  }

  function draftExercises(store, date) {
    if (!store.draft || store.draft.date !== date) return [];
    return Array.isArray(store.draft.exercises) ? store.draft.exercises : [];
  }

  function setSummaryLine(sets) {
    return sets
      .map(function (set) {
        return set.reps + "×" + formatWeight(set.weight) + " lbs";
      })
      .join(" · ");
  }

  function mergeDraftIntoDay(store, date) {
    var draft = draftExercises(store, date);
    if (!draft.length) return false;
    store.days[date] = draft.map(function (draftEx) {
      return {
        id: draftEx.id || uid("ex"),
        name: draftEx.name,
        sets: draftEx.sets.slice(),
      };
    });
    store.draft = null;
    return true;
  }

  function finishedExercises(store, date) {
    var list = store.days && store.days[date];
    return Array.isArray(list) && list.length ? list : [];
  }

  function dayHasFinishedWorkout(store, date) {
    return finishedExercises(store, date).length > 0;
  }

  function removeWorkoutButton(date) {
    return (
      '<button type="button" class="session-remove-workout" data-remove-workout="' +
      escapeHtml(date) +
      '">Remove workout</button>'
    );
  }

  function removeWorkoutFromStore(store, date) {
    if (!dayHasFinishedWorkout(store, date)) return null;
    var removed = JSON.parse(JSON.stringify(store.days[date]));
    delete store.days[date];
    if (store.draft && store.draft.date === date) store.draft = null;
    return removed;
  }

  var LIBRARY = window.STUDIO_PPL_LIBRARY || [];
  var MUSCLE_LIBRARY = window.STUDIO_EXERCISE_LIBRARY || [];
  var listEl = document.getElementById("session-list");
  var weekWorkoutsEl = document.getElementById("week-workouts");
  var hasTodayUI = !!(listEl && document.getElementById("finish-workout"));
  var hasWeekUI = !!weekWorkoutsEl;

  var sheet = document.getElementById("add-set-sheet");
  var categorySelect = document.getElementById("set-category");
  var exerciseSelect = document.getElementById("set-exercise");
  var repsSelect = document.getElementById("set-reps");
  var weightSelect = document.getElementById("set-weight");
  var errorEl = document.getElementById("add-set-error");
  var finishBtn = document.getElementById("finish-workout");
  var finishMsg = document.getElementById("finish-msg");
  var openAddSetBtn = document.getElementById("open-add-set");
  var activeDay = todayISO();
  var finishArmed = false;
  var weekDayIndex = 0;
  var weekDayCount = 0;

  if (hasTodayUI && repsSelect && weightSelect) {
    fillSelect(repsSelect, range(1, 12));
    fillSelect(
      weightSelect,
      range(0, 250, 5),
      function (v) {
        return Number.isInteger(v) ? String(v) : v.toFixed(1);
      }
    );
    setSelectValue(repsSelect, 8);
    setSelectValue(weightSelect, 135);
  }

  function syncDay() {
    activeDay = todayISO();
    var dateEl = document.getElementById("session-date");
    if (dateEl) dateEl.textContent = formatDateFull(activeDay);
  }

  function loadPickerPrefs() {
    try {
      var raw = localStorage.getItem(PICKER_PREFS_KEY);
      if (!raw) {
        return { category: null, muscle: null, exercise: null, reps: null, weight: null };
      }
      var data = JSON.parse(raw);
      return {
        category: typeof data.category === "string" ? data.category : null,
        muscle: typeof data.muscle === "string" ? data.muscle : null,
        exercise: typeof data.exercise === "string" ? data.exercise : null,
        reps: isFinite(Number(data.reps)) ? Number(data.reps) : null,
        weight: isFinite(Number(data.weight)) ? Number(data.weight) : null,
      };
    } catch (err) {
      return { category: null, muscle: null, exercise: null, reps: null, weight: null };
    }
  }

  function savePickerPrefs(category, muscle, exercise, reps, weight) {
    if (!category || !exercise) return;
    localStorage.setItem(
      PICKER_PREFS_KEY,
      JSON.stringify({
        category: category,
        muscle: muscle || null,
        exercise: exercise,
        reps: reps,
        weight: weight,
      })
    );
  }

  function applyRepsWeightDefaults() {
    var prefs = loadPickerPrefs();
    setSelectValue(repsSelect, prefs.reps != null ? prefs.reps : 8);
    setSelectValue(weightSelect, prefs.weight != null ? prefs.weight : 135);
  }

  function findPplIndex(categoryName) {
    return LIBRARY.findIndex(function (group) {
      return group.category === categoryName;
    });
  }

  function findPplCategoryForExercise(name) {
    var lower = String(name || "").toLowerCase();
    for (var i = 0; i < LIBRARY.length; i++) {
      var group = LIBRARY[i];
      for (var j = 0; j < group.exercises.length; j++) {
        if (group.exercises[j].toLowerCase() === lower) return group.category;
      }
    }
    return null;
  }

  function primaryMuscleForExercise(name) {
    var lower = String(name || "").toLowerCase();
    for (var i = 0; i < MUSCLE_LIBRARY.length; i++) {
      var group = MUSCLE_LIBRARY[i];
      for (var j = 0; j < group.exercises.length; j++) {
        if (group.exercises[j].toLowerCase() === lower) return group.category;
      }
    }
    return null;
  }

  function selectedPplGroup() {
    return LIBRARY[Number(categorySelect.value)] || null;
  }

  function musclesForPplGroup(pplGroup) {
    if (!pplGroup || !pplGroup.exercises) return [];
    var found = {};
    pplGroup.exercises.forEach(function (exerciseName) {
      var muscle = primaryMuscleForExercise(exerciseName);
      if (muscle) found[muscle] = true;
    });
    return Object.keys(found).sort(function (a, b) {
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });
  }

  function exercisesForPplAndMuscle(pplGroup, muscle) {
    if (!pplGroup || !pplGroup.exercises || !muscle) return [];
    return pplGroup.exercises
      .filter(function (exerciseName) {
        return primaryMuscleForExercise(exerciseName) === muscle;
      })
      .slice()
      .sort(function (a, b) {
        return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
      });
  }

  function initCategories() {
    categorySelect.innerHTML = LIBRARY.filter(function (group) {
      return group.exercises && group.exercises.length;
    })
      .map(function (group) {
        var index = LIBRARY.indexOf(group);
        return '<option value="' + index + '">' + escapeHtml(group.category) + "</option>";
      })
      .join("");
  }

  function populateLibraryExercises(preferredExercise) {
    var pplGroup = selectedPplGroup();
    var muscles = musclesForPplGroup(pplGroup);
    while (exerciseSelect.firstChild) {
      exerciseSelect.removeChild(exerciseSelect.firstChild);
    }
    if (!muscles.length) return;

    var allExercises = [];
    muscles.forEach(function (muscle) {
      var exercises = exercisesForPplAndMuscle(pplGroup, muscle);
      if (!exercises.length) return;

      var header = document.createElement("option");
      header.disabled = true;
      header.value = "";
      header.textContent = "— " + muscle + " —";
      exerciseSelect.appendChild(header);

      exercises.forEach(function (name) {
        var option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        exerciseSelect.appendChild(option);
        allExercises.push(name);
      });
    });

    var prefs = loadPickerPrefs();
    var pick = preferredExercise || prefs.exercise;
    if (pick && allExercises.indexOf(pick) !== -1) {
      exerciseSelect.value = pick;
    } else if (allExercises.length) {
      exerciseSelect.value = allExercises[0];
    }
  }

  function applyLibraryDefaults(preferredExercise) {
    var prefs = loadPickerPrefs();
    var exerciseName = preferredExercise || prefs.exercise;
    var categoryName = exerciseName
      ? findPplCategoryForExercise(exerciseName)
      : prefs.category;
    var idx = categoryName ? findPplIndex(categoryName) : -1;
    if (idx < 0 && prefs.category) idx = findPplIndex(prefs.category);
    if (idx < 0) {
      idx = LIBRARY.findIndex(function (group) {
        return group.exercises && group.exercises.length;
      });
    }
    categorySelect.value = String(Math.max(0, idx));
    populateLibraryExercises(exerciseName);
  }

  function resetFinishButton() {
    finishArmed = false;
    finishBtn.textContent = "Finish workout";
  }

  function workoutPplLabel(exercises) {
    var counts = { Push: 0, Pull: 0, Legs: 0 };
    exercises.forEach(function (ex) {
      var cat = findPplCategoryForExercise(ex.name);
      if (!cat) return;
      var setCount = Array.isArray(ex.sets) ? ex.sets.length : 0;
      counts[cat] += setCount;
    });
    var best = null;
    var bestCount = 0;
    ["Push", "Pull", "Legs"].forEach(function (cat) {
      if (counts[cat] > bestCount) {
        bestCount = counts[cat];
        best = cat;
      }
    });
    return best;
  }

  function renderDayExercises(exercises) {
    return exercises
      .map(function (ex) {
        var count = Array.isArray(ex.sets) ? ex.sets.length : 0;
        return (
          '<article class="session-exercise">' +
          '<div class="session-exercise__top">' +
          "<div>" +
          '<h3 class="session-exercise__name">' +
          escapeHtml(ex.name) +
          "</h3>" +
          '<p class="session-exercise__sets">' +
          count +
          " set" +
          (count === 1 ? "" : "s") +
          "</p>" +
          '<p class="session-exercise__detail">' +
          escapeHtml(setSummaryLine(ex.sets || [])) +
          "</p>" +
          "</div>" +
          "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  function showWeekDay(index, days) {
    var wrap = document.getElementById("week-workouts");
    var label = document.getElementById("week-day-label");
    var meta = document.getElementById("week-day-meta");
    var prevBtn = document.getElementById("week-prev");
    var nextBtn = document.getElementById("week-next");

    if (!wrap || !label || !meta || !prevBtn || !nextBtn) return;

    if (!days.length) {
      label.textContent = "—";
      meta.textContent = "";
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      wrap.innerHTML = '<p class="session-empty">No finished workouts this week yet</p>';
      return;
    }

    weekDayIndex = (index + days.length) % days.length;
    var day = days[weekDayIndex];
    var totalSets = day.exercises.reduce(function (sum, ex) {
      return sum + (Array.isArray(ex.sets) ? ex.sets.length : 0);
    }, 0);

    label.textContent = formatDateShort(day.date);
    var ppl = workoutPplLabel(day.exercises);
    meta.textContent =
      (ppl ? ppl + " · " : "") +
      day.exercises.length +
      " exercise" +
      (day.exercises.length === 1 ? "" : "s") +
      " · " +
      totalSets +
      " set" +
      (totalSets === 1 ? "" : "s");
    prevBtn.disabled = days.length <= 1;
    nextBtn.disabled = days.length <= 1;
    wrap.innerHTML =
      '<div class="session-list">' +
      renderDayExercises(day.exercises) +
      "</div>" +
      removeWorkoutButton(day.date);
  }

  function renderWeekWorkouts() {
    if (!hasWeekUI) return;
    var rangeEl = document.getElementById("week-workouts-range");
    if (!rangeEl) return;
    var week = weekCompletedDays(loadStore());
    var days = week.days;
    var opts = { month: "short", day: "numeric" };
    rangeEl.textContent =
      week.monday.toLocaleDateString(undefined, opts) +
      " – " +
      week.sunday.toLocaleDateString(undefined, opts);

    if (days.length !== weekDayCount) {
      weekDayIndex = Math.max(0, days.length - 1);
      weekDayCount = days.length;
    } else if (weekDayIndex >= days.length) {
      weekDayIndex = Math.max(0, days.length - 1);
    }

    showWeekDay(weekDayIndex, days);
  }

  function renderSession() {
    if (!hasTodayUI || !listEl) return;
    syncDay();
    if (finishMsg) finishMsg.hidden = true;
    var store = loadStore();
    var finishedToday = finishedExercises(store, activeDay);

    if (finishedToday.length) {
      if (store.draft && store.draft.date === activeDay) {
        store.draft = null;
        saveStore(store);
      }
      openAddSetBtn.disabled = true;
      finishBtn.disabled = true;
      resetFinishButton();
      listEl.innerHTML =
        '<div class="session-list">' +
        renderDayExercises(finishedToday) +
        "</div>" +
        removeWorkoutButton(activeDay);
    } else {
      openAddSetBtn.disabled = false;
      var exercises = draftExercises(store, activeDay);
      finishBtn.disabled = !exercises.length;
      if (!exercises.length) resetFinishButton();

      if (!exercises.length) {
        listEl.innerHTML = '<p class="session-empty">No sets yet</p>';
      } else {
        listEl.innerHTML = exercises
          .map(function (ex) {
            var count = ex.sets.length;
            return (
              '<article class="session-exercise" data-exercise-id="' +
              escapeHtml(ex.id) +
              '">' +
              '<div class="session-exercise__top">' +
              "<div>" +
              '<h3 class="session-exercise__name">' +
              escapeHtml(ex.name) +
              "</h3>" +
              '<p class="session-exercise__sets">' +
              count +
              " set" +
              (count === 1 ? "" : "s") +
              "</p>" +
              '<p class="session-exercise__detail">' +
              escapeHtml(setSummaryLine(ex.sets)) +
              "</p>" +
              "</div>" +
              '<button type="button" class="session-exercise__add" data-add-to="' +
              escapeHtml(ex.id) +
              '" data-add-name="' +
              escapeHtml(ex.name) +
              '">+ set</button>' +
              "</div>" +
              '<button type="button" class="session-exercise__undo" data-undo="' +
              escapeHtml(ex.id) +
              '">Remove last set</button>' +
              "</article>"
            );
          })
          .join("");
      }
    }
  }

  function refreshWorkoutViews() {
    if (hasTodayUI) renderSession();
    if (hasWeekUI) renderWeekWorkouts();
    if (typeof window.studioSetsWeekRefresh === "function") {
      window.studioSetsWeekRefresh();
    }
  }

  function openSheet(preferredExerciseName) {
    if (!hasTodayUI) return;
    if (dayHasFinishedWorkout(loadStore(), activeDay)) {
      finishMsg.textContent = "You already finished today’s workout. Remove it to log a new one.";
      finishMsg.hidden = false;
      finishMsg.style.color = "var(--signal)";
      return;
    }
    errorEl.hidden = true;
    applyLibraryDefaults(preferredExerciseName || null);
    applyRepsWeightDefaults();
    sheet.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeSheet() {
    sheet.hidden = true;
    document.body.style.overflow = "";
  }

  if (hasWeekUI) {
    var weekPrevBtn = document.getElementById("week-prev");
    var weekNextBtn = document.getElementById("week-next");
    var weekWorkoutsWrap = document.getElementById("week-workouts");

    if (weekPrevBtn) {
      weekPrevBtn.addEventListener("click", function () {
        showWeekDay(weekDayIndex - 1, weekCompletedDays(loadStore()).days);
      });
    }
    if (weekNextBtn) {
      weekNextBtn.addEventListener("click", function () {
        showWeekDay(weekDayIndex + 1, weekCompletedDays(loadStore()).days);
      });
    }
    if (weekWorkoutsWrap) {
      weekWorkoutsWrap.addEventListener("click", function (event) {
        var removeBtn = event.target.closest("[data-remove-workout]");
        if (!removeBtn) return;
        handleRemoveWorkout(removeBtn.getAttribute("data-remove-workout"));
      });
    }
  }

  if (hasTodayUI) {
    if (openAddSetBtn) {
      openAddSetBtn.addEventListener("click", function () {
        openSheet(null);
      });
    }

    if (categorySelect) {
      categorySelect.addEventListener("change", function () {
        populateLibraryExercises(null);
      });
    }

    if (sheet) {
      sheet.addEventListener("click", function (event) {
        if (event.target.closest("[data-close-add]")) closeSheet();
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && sheet && !sheet.hidden) closeSheet();
    });

    listEl.addEventListener("click", function (event) {
    var removeBtn = event.target.closest("[data-remove-workout]");
    if (removeBtn) {
      handleRemoveWorkout(removeBtn.getAttribute("data-remove-workout"));
      return;
    }

    var addBtn = event.target.closest("[data-add-to]");
    if (addBtn) {
      openSheet(addBtn.getAttribute("data-add-name"));
      return;
    }

    var undoBtn = event.target.closest("[data-undo]");
    if (!undoBtn) return;
    var exerciseId = undoBtn.getAttribute("data-undo");
    var store = loadStore();
    var draft = ensureDraft(store, activeDay);
    var list = draft.exercises;
    var ex = list.find(function (item) {
      return item.id === exerciseId;
    });
    if (!ex || !ex.sets.length) return;
    var removedSet = {
      id: ex.sets[ex.sets.length - 1].id,
      reps: ex.sets[ex.sets.length - 1].reps,
      weight: ex.sets[ex.sets.length - 1].weight,
      at: ex.sets[ex.sets.length - 1].at,
    };
    var restore = {
      exerciseId: ex.id,
      exerciseName: ex.name,
      set: removedSet,
    };
    ex.sets.pop();
    if (!ex.sets.length) {
      draft.exercises = list.filter(function (item) {
        return item.id !== exerciseId;
      });
    }
    if (!draft.exercises.length) store.draft = null;
    saveStore(store);
    renderSession();
    window.studioUndo.offer({
      message: "Set removed",
      onUndo: function () {
        var s = loadStore();
        var d = ensureDraft(s, activeDay);
        var exercises = d.exercises;
        var target = exercises.find(function (item) {
          return item.id === restore.exerciseId;
        });
        if (!target) {
          target = {
            id: restore.exerciseId,
            name: restore.exerciseName,
            sets: [],
          };
          exercises.push(target);
        }
        target.sets.push(restore.set);
        saveStore(s);
        renderSession();
      },
    });
  });

    var addSetForm = document.getElementById("add-set-form");
    if (addSetForm) {
      addSetForm.addEventListener("submit", function (event) {
        event.preventDefault();
        errorEl.hidden = true;
        syncDay();

        var reps = Number(repsSelect.value);
        var weight = Number(weightSelect.value);
        if (!isFinite(reps) || reps < 1) {
          errorEl.textContent = "Choose reps.";
          errorEl.hidden = false;
          return;
        }
        if (!isFinite(weight) || weight < 0) {
          errorEl.textContent = "Choose weight.";
          errorEl.hidden = false;
          return;
        }

        var name = exerciseSelect.value || null;
        if (!name) {
          errorEl.textContent = "Choose an exercise from the library.";
          errorEl.hidden = false;
          return;
        }

        var store = loadStore();
        if (dayHasFinishedWorkout(store, activeDay)) {
          errorEl.textContent = "You already finished today’s workout.";
          errorEl.hidden = false;
          closeSheet();
          renderSession();
          return;
        }

        var draft = ensureDraft(store, activeDay);
        var list = draft.exercises;
        var exercise = list.find(function (item) {
          return item.name.toLowerCase() === name.toLowerCase();
        });
        if (!exercise) {
          exercise = { id: uid("ex"), name: name, sets: [] };
          list.push(exercise);
        }

        exercise.sets.push({
          id: uid("set"),
          reps: reps,
          weight: weight,
          at: Date.now(),
        });
        var group = LIBRARY[Number(categorySelect.value)];
        savePickerPrefs(
          group && group.category,
          primaryMuscleForExercise(name),
          name,
          reps,
          weight
        );
        saveStore(store);
        closeSheet();
        renderSession();
      });
    }

    if (finishBtn) {
      finishBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        if (finishBtn.disabled) return;

        if (!finishArmed) {
          finishArmed = true;
          finishBtn.textContent = "Confirm finish";
          return;
        }

        syncDay();
        var store = loadStore();
        if (dayHasFinishedWorkout(store, activeDay)) {
          finishMsg.textContent = "You already finished today’s workout.";
          finishMsg.hidden = false;
          finishMsg.style.color = "var(--signal)";
          resetFinishButton();
          return;
        }
        if (!mergeDraftIntoDay(store, activeDay)) {
          resetFinishButton();
          return;
        }
        saveStore(store);
        resetFinishButton();
        renderSession();
        if (typeof window.studioSetsWeekRefresh === "function") {
          window.studioSetsWeekRefresh();
        }
        finishMsg.textContent = "Workout saved. Week volume updated.";
        finishMsg.hidden = false;
        finishMsg.style.color = "var(--fjord)";
      });
    }

    document.addEventListener("click", function (event) {
      if (!finishArmed) return;
      if (event.target.closest("#finish-workout")) return;
      resetFinishButton();
    });
  }

  function handleRemoveWorkout(date) {
    if (!date) return;
    var store = loadStore();
    var removed = removeWorkoutFromStore(store, date);
    if (!removed) return;
    saveStore(store);
    refreshWorkoutViews();
    window.studioUndo.offer({
      message: "Workout removed",
      onUndo: function () {
        var s = loadStore();
        s.days[date] = removed;
        saveStore(s);
        refreshWorkoutViews();
      },
    });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") refreshWorkoutViews();
  });

  if (hasTodayUI) {
    initCategories();
    populateLibraryExercises();
    renderSession();
  } else if (hasWeekUI) {
    renderWeekWorkouts();
  }
})();
