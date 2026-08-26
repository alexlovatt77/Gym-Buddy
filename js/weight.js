(function () {
  "use strict";

  var STORAGE_KEY = "studio.weight.v2";
  var WINDOW = 7;

  function emptyStore() {
    return { entries: [] };
  }

  function loadStore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyStore();
      var data = JSON.parse(raw);
      return {
        entries: Array.isArray(data.entries) ? data.entries : [],
      };
    } catch (err) {
      console.warn("Could not read weight store", err);
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

  function escapeXml(value) {
    return escapeHtml(value);
  }

  function formatLbs(n) {
    if (n == null || !isFinite(n)) return "—";
    var r = Math.round(n * 10) / 10;
    return (Number.isInteger(r) ? String(r) : r.toFixed(1)) + " lbs";
  }

  function formatAxis(n) {
    var r = Math.round(n * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }

  function formatDateLabel(iso) {
    var parts = iso.split("-");
    if (parts.length !== 3) return iso;
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return (months[Number(parts[1]) - 1] || parts[1]) + " " + Number(parts[2]);
  }

  function formatDateFull(iso) {
    var d = new Date(iso + "T12:00:00");
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function sortedEntries(entries) {
    return entries.slice().sort(function (a, b) {
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      return 0;
    });
  }

  /** One entry per date — latest save wins. */
  function dedupeByDate(entries) {
    var map = {};
    entries.forEach(function (entry) {
      map[entry.date] = entry;
    });
    return sortedEntries(
      Object.keys(map).map(function (date) {
        return map[date];
      })
    );
  }

  function parseISO(iso) {
    var parts = iso.split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function addDaysISO(iso, delta) {
    var d = parseISO(iso);
    d.setDate(d.getDate() + delta);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  /**
   * For each weigh-in day, average all logged weights in the past 7 calendar days
   * (that day inclusive). Skipped days simply reduce the count — e.g. 1 skip → avg of 6.
   */
  function withAverages(entries) {
    var byDate = {};
    entries.forEach(function (entry) {
      byDate[entry.date] = entry.weight;
    });

    return entries.map(function (entry) {
      var weights = [];
      for (var back = 0; back < WINDOW; back++) {
        var day = addDaysISO(entry.date, -back);
        if (byDate[day] != null) weights.push(byDate[day]);
      }
      var sum = weights.reduce(function (acc, w) {
        return acc + w;
      }, 0);
      var avg = Math.round((sum / weights.length) * 10) / 10;
      return {
        date: entry.date,
        weight: entry.weight,
        avg: avg,
        avgCount: weights.length,
      };
    });
  }

  var wholeSelect = document.getElementById("weight-whole");
  var decimalSelect = document.getElementById("weight-decimal");
  if (!wholeSelect || !decimalSelect) return;

  var errorEl = document.getElementById("weight-error");
  var tooltip = document.getElementById("weight-tooltip");
  var chartEl = document.getElementById("weight-chart");
  var hasChart = !!chartEl;

  fillSelect(wholeSelect, range(0, 400, 1));
  decimalSelect.innerHTML = range(0, 0.9, 0.1)
    .map(function (v) {
      var value = v.toFixed(1);
      var label = "." + value.split(".")[1];
      return '<option value="' + value + '">' + label + "</option>";
    })
    .join("");

  function splitWeight(weight) {
    var n = Math.round(Number(weight) * 10) / 10;
    var whole = Math.floor(n);
    var decimal = Math.round((n - whole) * 10) / 10;
    return { whole: whole, decimal: decimal };
  }

  function combinedWeight() {
    return Math.round((Number(wholeSelect.value) + Number(decimalSelect.value)) * 10) / 10;
  }

  function setWeightSelects(weight) {
    var parts = splitWeight(weight);
    setSelectValue(wholeSelect, parts.whole);
    setSelectValue(decimalSelect, parts.decimal.toFixed(1));
  }

  function entryForToday(store) {
    var today = todayISO();
    for (var i = 0; i < store.entries.length; i++) {
      if (store.entries[i].date === today) return store.entries[i];
    }
    return null;
  }

  function sundayOnOrBefore(iso) {
    var d = parseISO(iso);
    d.setDate(d.getDate() - d.getDay());
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  /**
   * One point per Sunday = average of logged weights in that week
   * (Monday–Sunday, i.e. Sunday and the 6 days before it).
   */
  function weeklySundaySeries(entries) {
    if (!entries.length) return [];
    var byDate = {};
    entries.forEach(function (entry) {
      byDate[entry.date] = entry.weight;
    });

    var start = sundayOnOrBefore(entries[0].date);
    var end = sundayOnOrBefore(
      entries[entries.length - 1].date > todayISO()
        ? entries[entries.length - 1].date
        : todayISO()
    );
    var points = [];
    var cursor = start;

    while (cursor <= end) {
      var weights = [];
      for (var back = 0; back < WINDOW; back++) {
        var day = addDaysISO(cursor, -back);
        if (byDate[day] != null) weights.push(byDate[day]);
      }
      if (weights.length) {
        var sum = weights.reduce(function (acc, w) {
          return acc + w;
        }, 0);
        var avg = Math.round((sum / weights.length) * 10) / 10;
        points.push({
          date: cursor,
          weight: avg,
          avg: avg,
          avgCount: weights.length,
          weekly: true,
        });
      }
      cursor = addDaysISO(cursor, 7);
    }
    return points;
  }

  var chartMode = "daily";

  function getSeries() {
    var entries = dedupeByDate(loadStore().entries);
    if (chartMode === "weekly") return weeklySundaySeries(entries);
    return withAverages(entries);
  }

  function updateModeUi() {
    var toggle = document.getElementById("chart-mode-toggle");
    var note = document.getElementById("chart-mode-note");
    if (!toggle || !note) return;
    var isWeekly = chartMode === "weekly";
    toggle.setAttribute("aria-pressed", isWeekly ? "true" : "false");
    toggle.setAttribute(
      "aria-label",
      isWeekly ? "Switch to daily chart" : "Switch to weekly Sunday averages"
    );
    toggle.title = isWeekly ? "Daily" : "Weekly";
    note.textContent = isWeekly ? "Weekly" : "Daily";
  }

  function renderForm() {
    var store = loadStore();
    var labelEl =
      document.getElementById("today-label") ||
      document.getElementById("weight-today-label");
    if (labelEl) labelEl.textContent = formatDateFull(todayISO());
    var existing = entryForToday(store);
    setWeightSelects(existing ? existing.weight : 180);
    var saveBtn = document.getElementById("weight-save");
    if (saveBtn) {
      saveBtn.textContent = existing ? "Update today’s weight" : "Save today’s weight";
    }
  }

  function renderChart() {
    if (!chartEl) return;
    updateModeUi();
    var series = getSeries();
    var isWeekly = chartMode === "weekly";

    if (!series.length) {
      chartEl.innerHTML = '<p class="chart-empty">Add today’s weight to start the chart.</p>';
      chartEl._series = [];
      return;
    }

    var width = 640;
    var height = 260;
    var pad = { top: 20, right: 18, bottom: 44, left: 48 };
    var innerW = width - pad.left - pad.right;
    var innerH = height - pad.top - pad.bottom;

    var values = [];
    series.forEach(function (point) {
      if (isWeekly) {
        values.push(point.avg);
      } else {
        values.push(point.weight);
      }
    });
    var minV = Math.min.apply(null, values);
    var maxV = Math.max.apply(null, values);
    var span = maxV - minV;
    var padY = span === 0 ? Math.max(2, maxV * 0.02) : span * 0.2;
    var yMin = minV - padY;
    var yMax = maxV + padY;

    function msOf(iso) {
      return parseISO(iso).getTime();
    }

    var t0 = msOf(series[0].date);
    var t1 = msOf(series[series.length - 1].date);
    var tSpan = Math.max(1, t1 - t0);

    /** Position by calendar date so skipped days leave a gap — no dot, line bridges them. */
    function xAt(i) {
      if (series.length === 1) return pad.left + innerW / 2;
      return pad.left + ((msOf(series[i].date) - t0) / tSpan) * innerW;
    }

    function yAt(value) {
      return pad.top + ((yMax - value) / (yMax - yMin)) * innerH;
    }

    var grid = [];
    for (var g = 0; g <= 4; g++) {
      var value = yMin + ((yMax - yMin) * g) / 4;
      var y = yAt(value);
      grid.push(
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
          escapeXml(formatAxis(value)) +
          "</text>"
      );
    }

    var avgSegments = [];
    if (isWeekly) {
      for (var i = 1; i < series.length; i++) {
        var prev = series[i - 1];
        var curr = series[i];
        var prevVal = prev.avg;
        var currVal = curr.avg;
        if (prevVal == null || currVal == null) continue;
        var rising = currVal >= prevVal;
        avgSegments.push(
          '<line x1="' +
            xAt(i - 1).toFixed(1) +
            '" y1="' +
            yAt(prevVal).toFixed(1) +
            '" x2="' +
            xAt(i).toFixed(1) +
            '" y2="' +
            yAt(currVal).toFixed(1) +
            '" stroke="' +
            (rising ? "#2f5d4a" : "#a33b2c") +
            '" stroke-width="2.25" stroke-linecap="round" />'
        );
      }
    }

    var dailyPath = "";
    var dayDots = "";
    if (isWeekly) {
      dayDots = series
        .map(function (point, i) {
          var prevAvg = i > 0 ? series[i - 1].avg : null;
          var weekRising = prevAvg == null ? true : point.avg >= prevAvg;
          return (
            '<g class="day-hit" data-index="' +
            i +
            '">' +
            '<circle cx="' +
            xAt(i).toFixed(1) +
            '" cy="' +
            yAt(point.avg).toFixed(1) +
            '" r="14" fill="transparent" />' +
            '<circle class="day-dot" cx="' +
            xAt(i).toFixed(1) +
            '" cy="' +
            yAt(point.avg).toFixed(1) +
            '" r="5" fill="' +
            (weekRising ? "#2f5d4a" : "#a33b2c") +
            '" stroke="#f4f7f9" stroke-width="2" />' +
            "</g>"
          );
        })
        .join("");
    } else {
      // Only logged days get dots; line connects consecutive logs across any skipped days.
      var connectors = [];
      for (var c = 1; c < series.length; c++) {
        connectors.push(
          '<line x1="' +
            xAt(c - 1).toFixed(1) +
            '" y1="' +
            yAt(series[c - 1].weight).toFixed(1) +
            '" x2="' +
            xAt(c).toFixed(1) +
            '" y2="' +
            yAt(series[c].weight).toFixed(1) +
            '" stroke="#1f4e5f" stroke-width="1.75" stroke-linecap="round" opacity="0.85" />'
        );
      }
      dailyPath = connectors.join("");
      dayDots = series
        .map(function (point, i) {
          return (
            '<g class="day-hit" data-index="' +
            i +
            '">' +
            '<circle cx="' +
            xAt(i).toFixed(1) +
            '" cy="' +
            yAt(point.weight).toFixed(1) +
            '" r="14" fill="transparent" />' +
            '<circle class="day-dot" cx="' +
            xAt(i).toFixed(1) +
            '" cy="' +
            yAt(point.weight).toFixed(1) +
            '" r="4.5" fill="#1f4e5f" stroke="#f4f7f9" stroke-width="2" />' +
            "</g>"
          );
        })
        .join("");
    }

    var xLabels = series
      .map(function (point, i) {
        var show =
          isWeekly ||
          series.length <= 7 ||
          i === 0 ||
          i === series.length - 1 ||
          i % Math.ceil(series.length / 5) === 0;
        if (!show) return "";
        return (
          '<text x="' +
          xAt(i).toFixed(1) +
          '" y="' +
          (height - 14) +
          '" text-anchor="middle" fill="#6b7c89" font-size="11" font-family="IBM Plex Sans, sans-serif">' +
          escapeXml(formatDateLabel(point.date)) +
          "</text>"
        );
      })
      .join("");

    chartEl.innerHTML =
      '<svg viewBox="0 0 ' +
      width +
      " " +
      height +
      '" preserveAspectRatio="xMidYMid meet">' +
      grid.join("") +
      '<line x1="' +
      pad.left +
      '" y1="' +
      (pad.top + innerH) +
      '" x2="' +
      (width - pad.right) +
      '" y2="' +
      (pad.top + innerH) +
      '" stroke="#9aabb8" stroke-width="1.25" />' +
      dailyPath +
      (isWeekly ? avgSegments.join("") : "") +
      dayDots +
      xLabels +
      "</svg>";

    chartEl._series = series;
    chartEl._mode = chartMode;
  }

  function showTooltip(index, clientX, clientY) {
    if (!tooltip || !chartEl) return;
    var series = chartEl._series;
    if (!series || !series[index]) {
      tooltip.hidden = true;
      return;
    }
    var point = series[index];
    var html;
    if (chartEl._mode === "weekly") {
      html =
        "<strong>Week ending " +
        escapeHtml(formatDateFull(point.date)) +
        "</strong>" +
        "<span>Week avg: " +
        escapeHtml(formatLbs(point.avg)) +
        "</span>" +
        "<span>" +
        point.avgCount +
        " of 7 days logged</span>";
    } else {
      html =
        "<strong>" +
        escapeHtml(formatDateFull(point.date)) +
        "</strong>" +
        "<span>Weight: " +
        escapeHtml(formatLbs(point.weight)) +
        "</span>";
    }
    tooltip.innerHTML = html;
    tooltip.hidden = false;

    var wrap = chartEl.parentElement.getBoundingClientRect();
    var left = clientX - wrap.left + 12;
    var top = clientY - wrap.top - 12;
    var tipW = tooltip.offsetWidth || 160;
    if (left + tipW > wrap.width - 8) left = clientX - wrap.left - tipW - 12;
    if (top < 8) top = 8;
    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
  }

  function hideTooltip() {
    if (tooltip) tooltip.hidden = true;
  }

  if (hasChart) {
    chartEl.addEventListener("pointermove", function (event) {
      var hit = event.target.closest(".day-hit");
      if (!hit) {
        hideTooltip();
        return;
      }
      showTooltip(Number(hit.getAttribute("data-index")), event.clientX, event.clientY);
    });

    chartEl.addEventListener("pointerleave", hideTooltip);

    chartEl.addEventListener("click", function (event) {
      var hit = event.target.closest(".day-hit");
      if (!hit) return;
      showTooltip(Number(hit.getAttribute("data-index")), event.clientX, event.clientY);
    });

    var modeToggle = document.getElementById("chart-mode-toggle");
    if (modeToggle) {
      modeToggle.addEventListener("click", function () {
        chartMode = chartMode === "daily" ? "weekly" : "daily";
        hideTooltip();
        renderChart();
      });
    }
  }

  var weightForm = document.getElementById("weight-form");
  if (weightForm) {
    weightForm.addEventListener("submit", function (event) {
    event.preventDefault();
    errorEl.hidden = true;
    var weight = combinedWeight();
    if (!isFinite(weight) || weight < 0) {
      errorEl.textContent = "Choose a weight.";
      errorEl.hidden = false;
      return;
    }

    var store = loadStore();
    var today = todayISO();
    var found = false;
    store.entries = store.entries.map(function (entry) {
      if (entry.date === today) {
        found = true;
        return { date: today, weight: weight, updatedAt: Date.now() };
      }
      return entry;
    });
    if (!found) {
      store.entries.push({ date: today, weight: weight, updatedAt: Date.now() });
    }
    saveStore(store);
    renderForm();
    renderChart();
    });
  }

  renderForm();
  renderChart();
})();
