(function () {
  "use strict";

  var STORAGE_KEY = "studio.water.v1";

  function emptyStore() {
    return { days: {} };
  }

  function loadStore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyStore();
      var data = JSON.parse(raw);
      return {
        days: data.days && typeof data.days === "object" ? data.days : {},
      };
    } catch (err) {
      console.warn("Could not read water store", err);
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

  function isoFromParts(year, monthIndex, day) {
    return year + "-" + pad2(monthIndex + 1) + "-" + pad2(day);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

  function litersFor(store, date) {
    var value = Number(store.days[date]);
    return isFinite(value) && value > 0 ? value : 0;
  }

  function formatLiters(n) {
    if (!n) return "0L";
    var r = Math.round(Number(n) * 10) / 10;
    return (Number.isInteger(r) ? String(r) : r.toFixed(1)) + "L";
  }

  function formatTotal(n) {
    return "Total " + formatLiters(n);
  }

  var calCursor = (function () {
    var d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  })();

  function renderToday() {
    var store = loadStore();
    var today = todayISO();
    var label = document.getElementById("water-today-label");
    var total = document.getElementById("water-total");
    if (label) label.textContent = formatDateFull(today);
    if (total) total.textContent = formatTotal(litersFor(store, today));
  }

  function renderCalendar() {
    var store = loadStore();
    var label = document.getElementById("water-cal-label");
    var grid = document.getElementById("water-cal-grid");
    if (!label || !grid) return;

    var monthDate = new Date(calCursor.year, calCursor.month, 1);
    label.textContent = monthDate.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });

    var firstDow = (monthDate.getDay() + 6) % 7;
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
      var liters = litersFor(store, iso);
      var classes = "cal-day water-cal-day";
      if (isFuture) classes += " is-future";
      if (isToday) classes += " is-today";
      if (liters > 0) classes += " has-water";

      html +=
        '<div class="' +
        classes +
        '" aria-label="' +
        escapeHtml(formatDateFull(iso) + ": " + formatLiters(liters)) +
        '">' +
        '<span class="cal-day__num">' +
        day +
        "</span>" +
        '<span class="water-cal-day__amount">' +
        (isFuture ? "" : liters > 0 ? escapeHtml(formatLiters(liters)) : "—") +
        "</span>" +
        "</div>";
    }

    grid.innerHTML = html;
  }

  function refresh() {
    renderToday();
    renderCalendar();
  }

  document.getElementById("water-add").addEventListener("click", function () {
    var store = loadStore();
    var today = todayISO();
    var next = litersFor(store, today) + 1;
    store.days[today] = next;
    saveStore(store);
    refresh();
    if (window.studioUndo) {
      window.studioUndo.offer({
        message: "Added 1L",
        onUndo: function () {
          var s = loadStore();
          var value = litersFor(s, today) - 1;
          if (value <= 0) delete s.days[today];
          else s.days[today] = value;
          saveStore(s);
          refresh();
        },
      });
    }
  });

  document.getElementById("water-cal-prev").addEventListener("click", function () {
    calCursor.month -= 1;
    if (calCursor.month < 0) {
      calCursor.month = 11;
      calCursor.year -= 1;
    }
    renderCalendar();
  });

  document.getElementById("water-cal-next").addEventListener("click", function () {
    calCursor.month += 1;
    if (calCursor.month > 11) {
      calCursor.month = 0;
      calCursor.year += 1;
    }
    renderCalendar();
  });

  refresh();
})();
