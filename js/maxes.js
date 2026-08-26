(function () {
  "use strict";

  var STORAGE_KEY = "studio.maxes.v1";

  var EXERCISES = {
    rm1: [
      { id: "smith-squat", label: "Smith squat" },
      { id: "smith-incline-bench", label: "Smith incline bench" },
      { id: "smith-row", label: "Smith row" },
    ],
    rm8: [
      { id: "incline-bench", label: "Incline bench" },
      { id: "shoulder-press", label: "Shoulder press" },
      { id: "smith-row", label: "Smith row" },
      { id: "barbell-curl", label: "Barbell curl" },
      { id: "smith-squat", label: "Smith squat" },
    ],
  };

  var TYPE_LABEL = {
    rm1: "1-rep",
    rm8: "8-rep",
  };

  function emptyStore() {
    return { entries: [] };
  }

  function loadStore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyStore();
      var data = JSON.parse(raw);
      return { entries: Array.isArray(data.entries) ? data.entries : [] };
    } catch (err) {
      console.warn("Could not read maxes store", err);
      return emptyStore();
    }
  }

  function saveStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function uid() {
    return "x_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
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

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatWeight(lbs) {
    if (lbs == null || !isFinite(lbs)) return "—";
    return Number.isInteger(lbs) ? String(lbs) + " lbs" : String(lbs) + " lbs";
  }

  function formatDateFull(iso) {
    if (!iso) return "—";
    var d = new Date(iso + "T12:00:00");
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function formatDateLabel(iso) {
    if (!iso) return "—";
    var parts = iso.split("-");
    if (parts.length !== 3) return iso;
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var month = months[Number(parts[1]) - 1] || parts[1];
    return month + " " + Number(parts[2]);
  }

  function escapeXml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function exerciseLabel(type, exerciseId) {
    var list = EXERCISES[type] || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === exerciseId) return list[i].label;
    }
    return exerciseId;
  }

  function bestFor(entries, type, exerciseId) {
    var best = null;
    entries.forEach(function (entry) {
      if (entry.type !== type || entry.exercise !== exerciseId) return;
      if (!best || entry.weight > best.weight) best = entry;
    });
    return best;
  }

  function entriesFor(entries, type, exerciseId) {
    return entries
      .filter(function (entry) {
        return entry.type === type && entry.exercise === exerciseId;
      })
      .slice()
      .sort(function (a, b) {
        if (a.date < b.date) return -1;
        if (a.date > b.date) return 1;
        return (a.createdAt || 0) - (b.createdAt || 0);
      });
  }

  var CHART_SLIDES = [];
  ["rm1", "rm8"].forEach(function (type) {
    EXERCISES[type].forEach(function (item) {
      CHART_SLIDES.push({
        type: type,
        exercise: item.id,
        label: item.label,
        typeLabel: TYPE_LABEL[type],
      });
    });
  });

  var inclineSlide = CHART_SLIDES.findIndex(function (slide) {
    return slide.type === "rm8" && slide.exercise === "incline-bench";
  });
  if (inclineSlide < 0) inclineSlide = 0;
  var progressIndex = inclineSlide;

  function formatAxisWeight(lbs) {
    if (!isFinite(lbs)) return "—";
    var rounded = Math.round(lbs * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  /** Weight on Y (higher = better), date of each best on X. Scale fits the data. */
  function renderWeightChart(container, entries) {
    if (!entries.length) {
      container.innerHTML = '<p class="chart-empty">Record a best to start this chart.</p>';
      return;
    }

    var width = 640;
    var height = 240;
    var pad = { top: 16, right: 16, bottom: 44, left: 48 };
    var innerW = width - pad.left - pad.right;
    var innerH = height - pad.top - pad.bottom;

    var weights = entries.map(function (e) {
      return e.weight;
    });
    var minW = Math.min.apply(null, weights);
    var maxW = Math.max.apply(null, weights);
    var span = maxW - minW;
    var padY = span === 0 ? Math.max(5, maxW * 0.08) : span * 0.18;
    var yMin = Math.max(0, minW - padY);
    var yMax = maxW + padY;

    function xAt(i) {
      if (entries.length === 1) return pad.left + innerW / 2;
      return pad.left + (i / (entries.length - 1)) * innerW;
    }

    function yAt(weight) {
      return pad.top + ((yMax - weight) / (yMax - yMin)) * innerH;
    }

    var gridLines = [];
    var ticks = 4;
    for (var g = 0; g <= ticks; g++) {
      var value = yMin + ((yMax - yMin) * g) / ticks;
      var y = yAt(value);
      gridLines.push(
        '<line x1="' +
          pad.left +
          '" y1="' +
          y +
          '" x2="' +
          (width - pad.right) +
          '" y2="' +
          y +
          '" stroke="#c2ccd6" stroke-width="1" />' +
          '<text x="' +
          (pad.left - 8) +
          '" y="' +
          (y + 4) +
          '" text-anchor="end" fill="#6b7c89" font-size="11" font-family="IBM Plex Sans, sans-serif">' +
          escapeXml(formatAxisWeight(value)) +
          "</text>"
      );
    }

    var points = entries.map(function (entry, i) {
      return { x: xAt(i), y: yAt(entry.weight), entry: entry };
    });

    var pathD = points
      .map(function (p, i) {
        return (i === 0 ? "M" : "L") + p.x.toFixed(1) + " " + p.y.toFixed(1);
      })
      .join(" ");

    var dots = points
      .map(function (p) {
        return (
          '<circle cx="' +
          p.x.toFixed(1) +
          '" cy="' +
          p.y.toFixed(1) +
          '" r="4.5" fill="#1f4e5f" stroke="#f4f7f9" stroke-width="2">' +
          "<title>" +
          escapeXml(formatDateFull(p.entry.date) + " · " + formatWeight(p.entry.weight)) +
          "</title></circle>"
        );
      })
      .join("");

    var xLabels = points
      .map(function (p, i) {
        var show =
          entries.length <= 6 ||
          i === 0 ||
          i === entries.length - 1 ||
          i % Math.ceil(entries.length / 5) === 0;
        if (!show) return "";
        return (
          '<text x="' +
          p.x.toFixed(1) +
          '" y="' +
          (height - 14) +
          '" text-anchor="middle" fill="#6b7c89" font-size="11" font-family="IBM Plex Sans, sans-serif">' +
          escapeXml(formatDateLabel(p.entry.date)) +
          "</text>"
        );
      })
      .join("");

    container.innerHTML =
      '<svg viewBox="0 0 ' +
      width +
      " " +
      height +
      '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      gridLines.join("") +
      '<line x1="' +
      pad.left +
      '" y1="' +
      (pad.top + innerH) +
      '" x2="' +
      (width - pad.right) +
      '" y2="' +
      (pad.top + innerH) +
      '" stroke="#9aabb8" stroke-width="1.25" />' +
      '<path d="' +
      pathD +
      '" fill="none" stroke="#1f4e5f" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />' +
      dots +
      xLabels +
      "</svg>";
  }

  function renderSlideDots(containerId, activeIndex) {
    var dots = document.getElementById(containerId);
    dots.innerHTML = CHART_SLIDES.map(function (_, i) {
      return (
        '<button type="button" class="chart-dot' +
        (i === activeIndex ? " is-active" : "") +
        '" data-slide-index="' +
        i +
        '" aria-label="Exercise ' +
        (i + 1) +
        '"></button>'
      );
    }).join("");
  }

  function showProgressSlide(index) {
    progressIndex = (index + CHART_SLIDES.length) % CHART_SLIDES.length;
    var slide = CHART_SLIDES[progressIndex];
    var store = loadStore();
    var entries = entriesFor(store.entries, slide.type, slide.exercise);
    var history = entries.slice().reverse();

    document.getElementById("progress-slide-label").textContent = slide.label;
    document.getElementById("progress-slide-meta").textContent = slide.typeLabel;
    renderWeightChart(document.getElementById("max-chart"), entries);

    var tbody = document.getElementById("max-history-body");
    if (!history.length) {
      tbody.innerHTML =
        '<tr class="is-placeholder"><td colspan="3">No bests yet</td></tr>';
    } else {
      tbody.innerHTML = history
        .map(function (entry) {
          return (
            "<tr>" +
            "<td>" +
            escapeHtml(formatDateFull(entry.date)) +
            "</td>" +
            '<td class="num">' +
            escapeHtml(formatWeight(entry.weight)) +
            "</td>" +
            '<td class="num"><div class="history-actions">' +
            '<button type="button" data-edit-date="' +
            escapeHtml(entry.id) +
            '">Date</button>' +
            '<button type="button" data-delete="' +
            escapeHtml(entry.id) +
            '">Remove</button></div></td>' +
            "</tr>"
          );
        })
        .join("");
    }

    renderSlideDots("progress-dots", progressIndex);
  }

  var typeSelect = document.getElementById("max-type");
  var exerciseSelect = document.getElementById("max-exercise");
  var weightSelect = document.getElementById("max-weight");
  var errorEl = document.getElementById("max-error");
  var editDateSheet = document.getElementById("edit-date-sheet");
  var editMonthSelect = document.getElementById("edit-month");
  var editDaySelect = document.getElementById("edit-day");
  var editYearSelect = document.getElementById("edit-year");
  var editDateError = document.getElementById("edit-date-error");
  var editingEntryId = null;

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function populateExercises() {
    var type = typeSelect.value;
    var list = EXERCISES[type] || [];
    exerciseSelect.innerHTML = list
      .map(function (item) {
        return '<option value="' + item.id + '">' + escapeHtml(item.label) + "</option>";
      })
      .join("");
  }

  function refreshEditDays(preferredDay) {
    var year = Number(editYearSelect.value);
    var month = Number(editMonthSelect.value);
    var maxDay = daysInMonth(year, month);
    var current = preferredDay != null ? preferredDay : Number(editDaySelect.value) || 1;
    fillSelect(editDaySelect, range(1, maxDay));
    setSelectValue(editDaySelect, Math.min(current, maxDay));
  }

  function initFormControls() {
    fillSelect(
      weightSelect,
      range(0, 500, 2.5),
      function (v) {
        return Number.isInteger(v) ? String(v) : v.toFixed(1);
      }
    );

    var months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    editMonthSelect.innerHTML = months
      .map(function (name, index) {
        return '<option value="' + (index + 1) + '">' + name + "</option>";
      })
      .join("");

    var now = new Date();
    fillSelect(editYearSelect, range(now.getFullYear() - 10, now.getFullYear() + 1));
    editMonthSelect.addEventListener("change", function () {
      refreshEditDays();
    });
    editYearSelect.addEventListener("change", function () {
      refreshEditDays();
    });

    populateExercises();
    setSelectValue(weightSelect, 135);
  }

  function readEditDate() {
    var year = Number(editYearSelect.value);
    var month = Number(editMonthSelect.value);
    var day = Number(editDaySelect.value);
    if (!year || !month || !day) return null;
    if (day > daysInMonth(year, month)) return null;
    return year + "-" + pad2(month) + "-" + pad2(day);
  }

  function openEditDate(entryId, iso) {
    editingEntryId = entryId;
    editDateError.hidden = true;
    var parts = String(iso || todayISO()).split("-");
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    var day = Number(parts[2]);
    setSelectValue(editYearSelect, year);
    setSelectValue(editMonthSelect, month);
    refreshEditDays(day);
    editDateSheet.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeEditDate() {
    editingEntryId = null;
    editDateSheet.hidden = true;
    document.body.style.overflow = "";
  }

  function renderBestTable(type, tbodyId) {
    var tbody = document.getElementById(tbodyId);
    var store = loadStore();
    var list = EXERCISES[type];

    tbody.innerHTML = list
      .map(function (item) {
        var best = bestFor(store.entries, type, item.id);
        return (
          "<tr>" +
          "<td>" +
          escapeHtml(item.label) +
          "</td>" +
          '<td class="num">' +
          (best ? escapeHtml(formatWeight(best.weight)) : "—") +
          "</td>" +
          '<td class="num">' +
          (best ? escapeHtml(formatDateFull(best.date)) : "—") +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function refresh() {
    renderBestTable("rm1", "table-1rm");
    renderBestTable("rm8", "table-8rm");
    showProgressSlide(progressIndex);
  }

  function resetFormDefaults() {
    typeSelect.value = "rm1";
    populateExercises();
    setSelectValue(weightSelect, 135);
  }

  typeSelect.addEventListener("change", populateExercises);

  document.getElementById("progress-prev").addEventListener("click", function () {
    showProgressSlide(progressIndex - 1);
  });
  document.getElementById("progress-next").addEventListener("click", function () {
    showProgressSlide(progressIndex + 1);
  });
  document.getElementById("progress-dots").addEventListener("click", function (event) {
    var dot = event.target.closest("[data-slide-index]");
    if (!dot) return;
    showProgressSlide(Number(dot.getAttribute("data-slide-index")));
  });

  document.getElementById("max-form").addEventListener("submit", function (event) {
    event.preventDefault();
    errorEl.hidden = true;

    var type = typeSelect.value;
    var exercise = exerciseSelect.value;
    var weight = Number(weightSelect.value);
    var date = todayISO();

    if (!EXERCISES[type]) {
      errorEl.textContent = "Choose 1-rep or 8-rep.";
      errorEl.hidden = false;
      return;
    }
    var known = (EXERCISES[type] || []).some(function (item) {
      return item.id === exercise;
    });
    if (!known) {
      errorEl.textContent = "Choose a valid exercise for that type.";
      errorEl.hidden = false;
      return;
    }
    if (!isFinite(weight) || weight < 0) {
      errorEl.textContent = "Pick a weight.";
      errorEl.hidden = false;
      return;
    }

    var store = loadStore();
    store.entries.push({
      id: uid(),
      type: type,
      exercise: exercise,
      weight: weight,
      date: date,
      createdAt: Date.now(),
    });
    saveStore(store);
    resetFormDefaults();
    refresh();
  });

  document.getElementById("edit-date-form").addEventListener("submit", function (event) {
    event.preventDefault();
    editDateError.hidden = true;
    if (!editingEntryId) return;
    var date = readEditDate();
    if (!date) {
      editDateError.textContent = "Pick a valid date.";
      editDateError.hidden = false;
      return;
    }
    var store = loadStore();
    store.entries = store.entries.map(function (entry) {
      if (entry.id !== editingEntryId) return entry;
      return {
        id: entry.id,
        type: entry.type,
        exercise: entry.exercise,
        weight: entry.weight,
        date: date,
        createdAt: entry.createdAt,
      };
    });
    saveStore(store);
    closeEditDate();
    refresh();
  });

  editDateSheet.addEventListener("click", function (event) {
    if (event.target.closest("[data-close-date]")) closeEditDate();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !editDateSheet.hidden) closeEditDate();
  });

  document.body.addEventListener("click", function (event) {
    var editBtn = event.target.closest("[data-edit-date]");
    if (editBtn) {
      var editId = editBtn.getAttribute("data-edit-date");
      var entry = loadStore().entries.find(function (item) {
        return item.id === editId;
      });
      if (entry) openEditDate(entry.id, entry.date);
      return;
    }

    var btn = event.target.closest("[data-delete]");
    if (!btn) return;
    var id = btn.getAttribute("data-delete");
    var store = loadStore();
    var removed = null;
    store.entries.forEach(function (entry) {
      if (entry.id === id) removed = entry;
    });
    if (!removed) return;
    store.entries = store.entries.filter(function (entry) {
      return entry.id !== id;
    });
    saveStore(store);
    refresh();
    window.studioUndo.offer({
      message: "Best removed",
      onUndo: function () {
        var s = loadStore();
        s.entries.push(removed);
        saveStore(s);
        refresh();
      },
    });
  });

  initFormControls();
  refresh();
})();
