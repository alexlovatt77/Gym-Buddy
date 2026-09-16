(function () {
  "use strict";

  var UNDO_MS = 5000;
  var TOAST_MS = 2600;
  var toastEl = null;
  var labelEl = null;
  var undoBtn = null;
  var timer = null;
  var currentUndo = null;

  function ensureToast() {
    if (toastEl) return;
    toastEl = document.createElement("div");
    toastEl.className = "undo-toast";
    toastEl.hidden = true;
    toastEl.setAttribute("role", "status");
    toastEl.setAttribute("aria-live", "polite");
    toastEl.innerHTML =
      '<p class="undo-toast__label"></p>' +
      '<button type="button" class="undo-toast__action">Undo</button>';
    labelEl = toastEl.querySelector(".undo-toast__label");
    undoBtn = toastEl.querySelector(".undo-toast__action");
    document.body.appendChild(toastEl);

    undoBtn.addEventListener("click", function () {
      if (currentUndo && typeof currentUndo.onUndo === "function") {
        currentUndo.onUndo();
      }
      dismiss();
    });
  }

  function dismiss() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    currentUndo = null;
    if (toastEl) {
      toastEl.hidden = true;
      toastEl.classList.remove("undo-toast--ok");
    }
    if (undoBtn) undoBtn.hidden = false;
  }

  function showToast(message, options) {
    ensureToast();
    dismiss();

    var opts = options || {};
    labelEl.textContent = message || "";
    toastEl.classList.toggle("undo-toast--ok", !!opts.ok);
    if (undoBtn) undoBtn.hidden = !opts.onUndo;
    toastEl.hidden = false;

    if (typeof opts.onUndo === "function") {
      currentUndo = { onUndo: opts.onUndo };
    }

    timer = setTimeout(function () {
      dismiss();
    }, opts.duration || (opts.onUndo ? UNDO_MS : TOAST_MS));
  }

  window.studioUndo = {
    offer: function (options) {
      var opts = options || {};
      if (typeof opts.onUndo !== "function") return;
      showToast(opts.message || "Removed", {
        onUndo: opts.onUndo,
        duration: UNDO_MS,
      });
    },
  };

  window.studioToast = {
    show: function (message, durationMs) {
      if (!message) return;
      showToast(message, { ok: true, duration: durationMs || TOAST_MS });
    },
  };
})();
