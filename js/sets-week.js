(function () {
  "use strict";

  var WORKOUT_KEY = "studio.workout.v1";
  var GROUPS = window.STUDIO_MUSCLE_GROUPS || [];
  var targetsApi = window.studioTargets;

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function toISO(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function endOfWeek(start) {
    var copy = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    copy.setDate(copy.getDate() + 6);
    return copy;
  }

  function loadWorkoutDays() {
    try {
      var raw = localStorage.getItem(WORKOUT_KEY);
      if (!raw) return {};
      var data = JSON.parse(raw);
      return data.days && typeof data.days === "object" ? data.days : {};
    } catch (err) {
      return {};
    }
  }

  function emptyCounts() {
    var counts = {};
    GROUPS.forEach(function (group) {
      counts[group] = 0;
    });
    return counts;
  }

  function countSetsForWeek(mondayISO) {
    var counts = emptyCounts();
    var start = mondayISO;
    var endDate = endOfWeek(targetsApi.startOfWeek(new Date(mondayISO + "T12:00:00")));
    var end = toISO(endDate);
    var days = loadWorkoutDays();
    var creditFn = window.studioSetCredits;

    Object.keys(days).forEach(function (date) {
      if (date < start || date > end) return;
      var exercises = Array.isArray(days[date]) ? days[date] : [];
      exercises.forEach(function (ex) {
        var setCount = Array.isArray(ex.sets) ? ex.sets.length : 0;
        if (!setCount || typeof creditFn !== "function") return;
        creditFn(ex.name).forEach(function (credit) {
          if (!counts.hasOwnProperty(credit.group)) return;
          counts[credit.group] += setCount * credit.amount;
        });
      });
    });

    GROUPS.forEach(function (group) {
      counts[group] = Math.round(counts[group] * 10) / 10;
    });
    return counts;
  }

  function totalRawSetsForWeek(mondayISO) {
    var start = mondayISO;
    var endDate = endOfWeek(targetsApi.startOfWeek(new Date(mondayISO + "T12:00:00")));
    var end = toISO(endDate);
    var days = loadWorkoutDays();
    var total = 0;

    Object.keys(days).forEach(function (date) {
      if (date < start || date > end) return;
      var exercises = Array.isArray(days[date]) ? days[date] : [];
      exercises.forEach(function (ex) {
        total += Array.isArray(ex.sets) ? ex.sets.length : 0;
      });
    });

    return total;
  }

  function formatCount(n) {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  function formatRange(start, end) {
    var opts = { month: "short", day: "numeric" };
    return (
      start.toLocaleDateString(undefined, opts) +
      " – " +
      end.toLocaleDateString(undefined, opts)
    );
  }

  function renderGroupTable(tbody, mondayISO, showToGo) {
    var targets = targetsApi.forWeek(mondayISO);
    var counts = countSetsForWeek(mondayISO);
    tbody.innerHTML = GROUPS.map(function (group) {
      var done = counts[group];
      var target = targets[group];
      var row = "<tr><td>" + group + "</td>";
      if (showToGo) {
        var left = Math.max(0, Math.round((target - done) * 10) / 10);
        row +=
          '<td class="num">' +
          formatCount(done) +
          "</td>" +
          '<td class="num">' +
          formatCount(left) +
          "</td>" +
          '<td class="num">' +
          formatCount(target) +
          "</td>";
      } else {
        row +=
          '<td class="num">' +
          formatCount(target) +
          "</td>" +
          '<td class="num">' +
          formatCount(done) +
          "</td>";
      }
      return row + "</tr>";
    }).join("");
  }

  var calCursor = (function () {
    var d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  })();

  function weeksInMonth(year, month) {
    var first = new Date(year, month, 1);
    var last = new Date(year, month + 1, 0);
    var cursor = targetsApi.startOfWeek(first);
    var end = targetsApi.startOfWeek(last);
    var weeks = [];
    while (cursor <= end) {
      // include week if it overlaps this month
      var weekEnd = endOfWeek(cursor);
      if (weekEnd >= first && cursor <= last) {
        weeks.push(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
      }
      cursor.setDate(cursor.getDate() + 7);
    }
    return weeks;
  }

  function renderThisWeek() {
    var monday = targetsApi.startOfWeek(new Date());
    var sunday = endOfWeek(monday);
    var mondayISO = toISO(monday);
    document.getElementById("week-range").textContent =
      formatRange(monday, sunday) + ", " + sunday.getFullYear();
    renderGroupTable(document.getElementById("group-table"), mondayISO, true);
  }

  function renderWeekCalendar() {
    var label = document.getElementById("sets-cal-label");
    var list = document.getElementById("week-cal-list");
    var monthDate = new Date(calCursor.year, calCursor.month, 1);
    label.textContent = monthDate.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });

    var thisMonday = toISO(targetsApi.startOfWeek(new Date()));
    var weeks = weeksInMonth(calCursor.year, calCursor.month).filter(function (monday) {
      var mondayISO = toISO(monday);
      if (mondayISO === thisMonday) return true;
      if (mondayISO > thisMonday) return false;
      return totalRawSetsForWeek(mondayISO) >= 1;
    });

    if (!weeks.length) {
      list.innerHTML = '<p class="session-empty">No weeks logged yet</p>';
      return;
    }

    list.innerHTML = weeks
      .map(function (monday) {
        var mondayISO = toISO(monday);
        var sunday = endOfWeek(monday);
        var isCurrent = mondayISO === thisMonday;
        var meta = isCurrent ? "Done · To go · Target" : "Target · Done";
        return (
          '<button type="button" class="week-cal__item' +
          (isCurrent ? " is-current" : "") +
          '" data-week="' +
          mondayISO +
          '">' +
          '<span class="week-cal__range">' +
          formatRange(monday, sunday) +
          "</span>" +
          '<span class="week-cal__meta">' +
          meta +
          "</span>" +
          "</button>"
        );
      })
      .join("");
  }

  var detailDays = [];
  var detailDayIndex = 0;

  function formatDayLabel(iso) {
    var d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }

  function formatWeight(n) {
    var r = Math.round(Number(n) * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }

  function formatSetWeight(set) {
    var weight = formatWeight(set.weight);
    if (set.load === "each") return weight + " ea";
    return weight;
  }

  function setSummaryLine(sets) {
    return (sets || [])
      .map(function (set) {
        return set.reps + "×" + formatSetWeight(set);
      })
      .join(" · ");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function workoutDaysForWeek(mondayISO) {
    var monday = targetsApi.startOfWeek(new Date(mondayISO + "T12:00:00"));
    var sunday = endOfWeek(monday);
    var start = toISO(monday);
    var end = toISO(sunday);
    var daysMap = loadWorkoutDays();
    var days = [];
    Object.keys(daysMap)
      .sort()
      .forEach(function (date) {
        if (date < start || date > end) return;
        var exercises = Array.isArray(daysMap[date]) ? daysMap[date] : [];
        if (!exercises.length) return;
        days.push({ date: date, exercises: exercises });
      });
    return days;
  }

  function renderDetailExercises(exercises) {
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

  function showDetailDay(index) {
    var label = document.getElementById("week-detail-day-label");
    var meta = document.getElementById("week-detail-day-meta");
    var pos = document.getElementById("week-detail-day-position");
    var wrap = document.getElementById("week-detail-workouts");
    var prevBtn = document.getElementById("week-detail-prev");
    var nextBtn = document.getElementById("week-detail-next");
    if (!label || !meta || !wrap || !prevBtn || !nextBtn) return;

    if (!detailDays.length) {
      label.textContent = "No workouts";
      meta.textContent = "No finished sessions this week.";
      if (pos) pos.textContent = "";
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      wrap.innerHTML = '<p class="session-empty">No finished workouts this week</p>';
      return;
    }

    detailDayIndex = (index + detailDays.length) % detailDays.length;
    var day = detailDays[detailDayIndex];
    var totalSets = day.exercises.reduce(function (sum, ex) {
      return sum + (Array.isArray(ex.sets) ? ex.sets.length : 0);
    }, 0);

    label.textContent = formatDayLabel(day.date);
    meta.textContent =
      day.exercises.length +
      " exercise" +
      (day.exercises.length === 1 ? "" : "s") +
      " · " +
      totalSets +
      " set" +
      (totalSets === 1 ? "" : "s");
    if (pos) pos.textContent = detailDayIndex + 1 + " / " + detailDays.length;
    prevBtn.disabled = detailDays.length <= 1;
    nextBtn.disabled = detailDays.length <= 1;
    wrap.innerHTML = '<div class="session-list">' + renderDetailExercises(day.exercises) + "</div>";
  }

  function openWeekDetail(mondayISO) {
    var monday = targetsApi.startOfWeek(new Date(mondayISO + "T12:00:00"));
    var sunday = endOfWeek(monday);
    var thisMonday = toISO(targetsApi.startOfWeek(new Date()));
    var isCurrent = mondayISO === thisMonday;
    var head = document.getElementById("week-detail-head");
    head.innerHTML = isCurrent
      ? "<th>Group</th><th class=\"num\">Done</th><th class=\"num\">To go</th><th class=\"num\">Target</th>"
      : "<th>Group</th><th class=\"num\">Target</th><th class=\"num\">Done</th>";
    document.getElementById("week-detail-title").textContent = formatRange(monday, sunday);
    renderGroupTable(document.getElementById("week-detail-table"), mondayISO, isCurrent);

    detailDays = workoutDaysForWeek(mondayISO);
    detailDayIndex = Math.max(0, detailDays.length - 1);
    showDetailDay(detailDayIndex);

    document.getElementById("week-detail-sheet").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeWeekDetail() {
    document.getElementById("week-detail-sheet").hidden = true;
    document.body.style.overflow = "";
    detailDays = [];
    detailDayIndex = 0;
  }

  function refresh() {
    renderThisWeek();
    renderWeekCalendar();
  }

  document.getElementById("sets-cal-prev").addEventListener("click", function () {
    calCursor.month -= 1;
    if (calCursor.month < 0) {
      calCursor.month = 11;
      calCursor.year -= 1;
    }
    renderWeekCalendar();
  });
  document.getElementById("sets-cal-next").addEventListener("click", function () {
    calCursor.month += 1;
    if (calCursor.month > 11) {
      calCursor.month = 0;
      calCursor.year += 1;
    }
    renderWeekCalendar();
  });

  document.getElementById("week-cal-list").addEventListener("click", function (event) {
    var btn = event.target.closest("[data-week]");
    if (!btn) return;
    openWeekDetail(btn.getAttribute("data-week"));
  });

  document.getElementById("week-detail-sheet").addEventListener("click", function (event) {
    if (event.target.closest("[data-close-week]")) closeWeekDetail();
  });

  var detailPrev = document.getElementById("week-detail-prev");
  var detailNext = document.getElementById("week-detail-next");
  if (detailPrev) {
    detailPrev.addEventListener("click", function () {
      showDetailDay(detailDayIndex - 1);
    });
  }
  if (detailNext) {
    detailNext.addEventListener("click", function () {
      showDetailDay(detailDayIndex + 1);
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeWeekDetail();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") refresh();
  });

  refresh();

  window.studioSetsWeekRefresh = refresh;
})();
