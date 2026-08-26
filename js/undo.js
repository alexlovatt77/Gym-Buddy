(function () {
  "use strict";

  var DURATION_MS = 5000;
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
    if (toastEl) toastEl.hidden = true;
  }

  window.studioUndo = {
    offer: function (options) {
      ensureToast();
      dismiss();

      var opts = options || {};
      if (typeof opts.onUndo !== "function") return;

      currentUndo = { onUndo: opts.onUndo };
      labelEl.textContent = opts.message || "Removed";
      toastEl.hidden = false;

      timer = setTimeout(function () {
        dismiss();
      }, DURATION_MS);
    },
  };
})();
