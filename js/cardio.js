(function () {
  "use strict";

  var STORAGE_KEY = "studio.cardio.runs";
  var DISTANCES = {
    mile1: { label: "1 mile" },
    mile3: { label: "3 mile" },
  };

  function loadStore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { mile1: [], mile3: [] };
      var data = JSON.parse(raw);
      return {
        mile1: Array.isArray(data.mile1) ? data.mile1 : [],
        mile3: Array.isArray(data.mile3) ? data.mile3 : [],
      };
    } catch (err) {
      console.warn("Could not read cardio store", err);
      return { mile1: [], mile3: [] };
    }
  }

  function saveStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function fillSelect(select, values, formatter) {
    select.innerHTML = values
      .map(function (value) {
        var label = formatter ? formatter(value) : String(value);
        return '<option value="' + value + '">' + label + "</option>";
      })
      .join("");
  }

  function range(start, end) {
    var list = [];
    for (var i = start; i <= end; i++) list.push(i);
    return list;
  }

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function setSelectValue(select, value) {
    select.value = String(value);
  }

  function initFormControls() {
    var minSelect = document.getElementById("time-min");
    var secSelect = document.getElementById("time-sec");

    fillSelect(minSelect, range(0, 99), pad2);
    fillSelect(secSelect, range(0, 59), pad2);

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

    setSelectValue(minSelect, 7);
    setSelectValue(secSelect, 0);
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function refreshEditDays(preferredDay) {
    var year = Number(editYearSelect.value);
    var month = Number(editMonthSelect.value);
    var maxDay = daysInMonth(year, month);
    var current = preferredDay != null ? preferredDay : Number(editDaySelect.value) || 1;
    fillSelect(editDaySelect, range(1, maxDay));
    setSelectValue(editDaySelect, Math.min(current, maxDay));
  }

  function readEditDate() {
    var year = Number(editYearSelect.value);
    var month = Number(editMonthSelect.value);
    var day = Number(editDaySelect.value);
    if (!year || !month || !day) return null;
    if (day > daysInMonth(year, month)) return null;
    return year + "-" + pad2(month) + "-" + pad2(day);
  }

  function openEditDate(entryId, distance, iso) {
    editingEntryId = entryId;
    editingDistance = distance;
    editDateError.hidden = true;
    var parts = String(iso || todayISO()).split("-");
    setSelectValue(editYearSelect, Number(parts[0]));
    setSelectValue(editMonthSelect, Number(parts[1]));
    refreshEditDays(Number(parts[2]));
    editDateSheet.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeEditDate() {
    editingEntryId = null;
    editingDistance = null;
    editDateSheet.hidden = true;
    document.body.style.overflow = "";
  }

  function readFormSeconds() {
    var minutes = Number(document.getElementById("time-min").value);
    var seconds = Number(document.getElementById("time-sec").value);
    if (!isFinite(minutes) || !isFinite(seconds)) return null;
    var total = minutes * 60 + seconds;
    return total > 0 ? total : null;
  }

  function resetFormDefaults() {
    setSelectValue(document.getElementById("time-min"), 7);
    setSelectValue(document.getElementById("time-sec"), 0);
    document.getElementById("distance").value = "mile1";
  }

  function formatTime(seconds) {
    if (seconds == null || !isFinite(seconds)) return "—";
    var total = Math.round(seconds);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    var ss = s < 10 ? "0" + s : String(s);
    if (h > 0) {
      var mm = m < 10 ? "0" + m : String(m);
      return h + ":" + mm + ":" + ss;
    }
    return m + ":" + ss;
  }

  function formatDateLabel(iso) {
    if (!iso) return "—";
    var parts = iso.split("-");
    if (parts.length !== 3) return iso;
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var month = months[Number(parts[1]) - 1] || parts[1];
    return month + " " + Number(parts[2]);
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

  function sortedEntries(list) {
    return list.slice().sort(function (a, b) {
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }

  function bestEntry(list) {
    if (!list.length) return null;
    return list.reduce(function (best, entry) {
      return entry.seconds < best.seconds ? entry : best;
    });
  }

  function escapeXml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Chart X = each logged effort in order (labeled by that entry's date).
   * Not a fixed week/day calendar — only the dates you actually entered.
   */
  function renderChart(container, entries) {
    var sorted = sortedEntries(entries);

    if (!sorted.length) {
      container.innerHTML = '<p class="chart-empty">Log a run to start the chart.</p>';
      return;
    }

    var width = 640;
    var height = 220;
    var pad = { top: 16, right: 16, bottom: 44, left: 52 };
    var innerW = width - pad.left - pad.right;
    var innerH = height - pad.top - pad.bottom;

    var times = sorted.map(function (e) {
      return e.seconds;
    });
    var minT = Math.min.apply(null, times);
    var maxT = Math.max.apply(null, times);
    var span = maxT - minT;
    var padY = span === 0 ? Math.max(30, minT * 0.05) : span * 0.18;
    var yMin = Math.max(0, minT - padY);
    var yMax = maxT + padY;

    function xAt(i) {
      if (sorted.length === 1) return pad.left + innerW / 2;
      return pad.left + (i / (sorted.length - 1)) * innerW;
    }

    function yAt(seconds) {
      return pad.top + ((yMax - seconds) / (yMax - yMin)) * innerH;
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
          escapeXml(formatTime(value)) +
          "</text>"
      );
    }

    var points = sorted.map(function (entry, i) {
      return { x: xAt(i), y: yAt(entry.seconds), entry: entry };
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
          escapeXml(formatDateFull(p.entry.date) + " · " + formatTime(p.entry.seconds)) +
          "</title></circle>"
        );
      })
      .join("");

    var xLabels = points
      .map(function (p, i) {
        var show =
          sorted.length <= 6 ||
          i === 0 ||
          i === sorted.length - 1 ||
          i % Math.ceil(sorted.length / 5) === 0;
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

  function renderBests(store) {
    ["mile1", "mile3"].forEach(function (key) {
      var best = bestEntry(store[key]);
      var timeEl = document.getElementById("best-" + key);
      var dateEl = document.getElementById("best-" + key + "-date");
      if (!best) {
        timeEl.textContent = "—";
        dateEl.textContent = "—";
        return;
      }
      timeEl.textContent = formatTime(best.seconds);
      dateEl.textContent = formatDateFull(best.date);
    });
  }

  function renderHistory(key, list) {
    var tbody = document.getElementById("history-" + key);
    var sorted = sortedEntries(list).reverse();

    if (!sorted.length) {
      tbody.innerHTML = '<tr class="is-placeholder"><td colspan="3">No entries yet</td></tr>';
      return;
    }

    tbody.innerHTML = sorted
      .map(function (entry) {
        return (
          "<tr>" +
          "<td>" +
          escapeXml(formatDateFull(entry.date)) +
          "</td>" +
          '<td class="num">' +
          escapeXml(formatTime(entry.seconds)) +
          "</td>" +
          '<td class="num"><div class="history-actions">' +
          '<button type="button" data-edit-date="' +
          escapeXml(entry.id) +
          '" data-distance="' +
          key +
          '">Date</button>' +
          '<button type="button" data-delete="' +
          escapeXml(entry.id) +
          '" data-distance="' +
          key +
          '">Remove</button>' +
          "</div></td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function refresh() {
    var store = loadStore();
    renderBests(store);
    renderChart(document.getElementById("chart-mile1"), store.mile1);
    renderChart(document.getElementById("chart-mile3"), store.mile3);
    renderHistory("mile1", store.mile1);
    renderHistory("mile3", store.mile3);
  }

  function uid() {
    return "r_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }

  var form = document.getElementById("cardio-form");
  var errorEl = document.getElementById("form-error");
  var editDateSheet = document.getElementById("edit-date-sheet");
  var editMonthSelect = document.getElementById("edit-month");
  var editDaySelect = document.getElementById("edit-day");
  var editYearSelect = document.getElementById("edit-year");
  var editDateError = document.getElementById("edit-date-error");
  var editingEntryId = null;
  var editingDistance = null;

  initFormControls();

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    errorEl.hidden = true;

    var distance = document.getElementById("distance").value;
    if (!DISTANCES[distance]) {
      errorEl.textContent = "Choose 1 mile or 3 mile.";
      errorEl.hidden = false;
      return;
    }

    var seconds = readFormSeconds();
    if (seconds == null) {
      errorEl.textContent = "Pick a time greater than 0:00.";
      errorEl.hidden = false;
      return;
    }

    var store = loadStore();
    store[distance].push({
      id: uid(),
      date: todayISO(),
      seconds: seconds,
      createdAt: Date.now(),
    });
    saveStore(store);
    resetFormDefaults();
    refresh();
  });

  document.getElementById("edit-date-form").addEventListener("submit", function (event) {
    event.preventDefault();
    editDateError.hidden = true;
    if (!editingEntryId || !editingDistance) return;
    var date = readEditDate();
    if (!date) {
      editDateError.textContent = "Pick a valid date.";
      editDateError.hidden = false;
      return;
    }
    var store = loadStore();
    store[editingDistance] = store[editingDistance].map(function (entry) {
      if (entry.id !== editingEntryId) return entry;
      return {
        id: entry.id,
        date: date,
        seconds: entry.seconds,
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
      var editDistance = editBtn.getAttribute("data-distance");
      var entry = loadStore()[editDistance].find(function (item) {
        return item.id === editId;
      });
      if (entry) openEditDate(entry.id, editDistance, entry.date);
      return;
    }

    var btn = event.target.closest("[data-delete]");
    if (!btn) return;
    var id = btn.getAttribute("data-delete");
    var distance = btn.getAttribute("data-distance");
    var store = loadStore();
    var removed = null;
    store[distance].forEach(function (entry) {
      if (entry.id === id) removed = entry;
    });
    if (!removed) return;
    store[distance] = store[distance].filter(function (entry) {
      return entry.id !== id;
    });
    saveStore(store);
    refresh();
    window.studioUndo.offer({
      message: "Run removed",
      onUndo: function () {
        var s = loadStore();
        s[distance].push(removed);
        saveStore(s);
        refresh();
      },
    });
  });

  refresh();
})();
