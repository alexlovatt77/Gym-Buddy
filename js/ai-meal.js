(function () {
  "use strict";

  var MEAL_URL = "https://gym-buddy-alexs-projects-ebb0ec48.vercel.app/api/meal";

  var pendingMeal = null;

  function setStatus(text, isError) {
    var el = document.getElementById("ai-meal-status");
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
    el.classList.toggle("is-error", !!isError);
  }

  function titleCase(value) {
    return String(value || "")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, function (ch) {
        return ch.toUpperCase();
      });
  }

  function actionLabel(type) {
    if (type === "set_day") return "Set day totals";
    if (type === "add_macros") return "Add macros";
    return "Add meal";
  }

  function showPreview(meal) {
    var preview = document.getElementById("ai-meal-preview");
    if (!preview) return;
    if (!meal) {
      preview.hidden = true;
      preview.innerHTML = "";
      pendingMeal = null;
      return;
    }
    pendingMeal = meal;

    var type = meal.type || "add_meal";
    var itemsHtml = "";
    if (Array.isArray(meal.items) && meal.items.length) {
      itemsHtml =
        '<ul class="ai-meal-preview__items">' +
        meal.items
          .map(function (item) {
            var portionBit = item.portion
              ? escapeHtml(item.portion)
              : escapeHtml(item.label || "");
            var note = item.matched
              ? escapeHtml(item.matched)
              : escapeHtml(item.label || "");
            var gramsBit =
              item.grams > 0
                ? ' <span class="ai-meal-preview__grams">≈ ' + item.grams + "g</span>"
                : "";
            return (
              '<li class="ai-meal-preview__item">' +
              '<div class="ai-meal-preview__item-main">' +
              '<p class="ai-meal-preview__item-portion">' +
              portionBit +
              gramsBit +
              "</p>" +
              '<p class="ai-meal-preview__item-match">' +
              note +
              "</p>" +
              "</div>" +
              '<div class="ai-meal-preview__item-macros">' +
              "<span>" +
              item.calories +
              " kcal</span>" +
              "<span>P " +
              item.protein +
              "g</span>" +
              "<span>F " +
              item.fat +
              "g</span>" +
              "<span>C " +
              item.carbs +
              "g</span>" +
              "</div>" +
              "</li>"
            );
          })
          .join("") +
        "</ul>";
    }

    var summary =
      meal.summary ||
      (type === "set_day"
        ? "Replace today’s meal log with these totals."
        : type === "add_macros"
          ? "Add these macros to today."
          : "Add this meal to today.");

    var confirmLabel =
      type === "set_day" ? "Update day" : type === "add_macros" ? "Add macros" : "Add to day";

    preview.hidden = false;
    preview.innerHTML =
      '<div class="ai-meal-preview__head">' +
      '<div class="ai-meal-preview__identity">' +
      '<p class="ai-meal-preview__eyebrow">' +
      escapeHtml(actionLabel(type)) +
      " · review</p>" +
      '<h3 class="ai-meal-preview__title">' +
      escapeHtml(meal.name) +
      "</h3>" +
      '<p class="ai-meal-preview__meta">' +
      escapeHtml(titleCase(meal.category)) +
      "</p>" +
      '<p class="ai-meal-preview__summary">' +
      escapeHtml(summary) +
      "</p>" +
      "</div>" +
      '<div class="ai-meal-preview__totals" aria-label="Macro totals">' +
      '<div class="ai-meal-preview__total"><span class="ai-meal-preview__total-value">' +
      meal.calories +
      '</span><span class="ai-meal-preview__total-label">kcal</span></div>' +
      '<div class="ai-meal-preview__total"><span class="ai-meal-preview__total-value">' +
      meal.protein +
      '</span><span class="ai-meal-preview__total-label">Protein</span></div>' +
      '<div class="ai-meal-preview__total"><span class="ai-meal-preview__total-value">' +
      meal.fat +
      '</span><span class="ai-meal-preview__total-label">Fat</span></div>' +
      '<div class="ai-meal-preview__total"><span class="ai-meal-preview__total-value">' +
      meal.carbs +
      '</span><span class="ai-meal-preview__total-label">Carbs</span></div>' +
      "</div>" +
      "</div>" +
      itemsHtml +
      '<div class="ai-meal-preview__actions">' +
      '<button class="btn" type="button" id="ai-meal-confirm">' +
      escapeHtml(confirmLabel) +
      "</button>" +
      '<button class="btn btn--ghost" type="button" id="ai-meal-cancel">Cancel</button>' +
      "</div>";
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function estimateMeal() {
    var input = document.getElementById("ai-meal-input");
    var category = document.getElementById("ai-meal-category");
    var btn = document.getElementById("ai-meal-estimate");
    var description = input ? String(input.value || "").trim() : "";
    var categoryValue = category ? String(category.value || "").trim() : "";
    if (!description) {
      setStatus("Describe food, or give day totals like 2500 cal / 180p / 70f / 200c.", true);
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Working…";
    }
    setStatus("Reading that…");
    showPreview(null);

    var current =
      typeof window.studioDayMacroTotals === "function" ? window.studioDayMacroTotals() : null;

    try {
      var res = await fetch(MEAL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description,
          category: categoryValue,
          current: current,
        }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        if (data.needCategory) {
          throw new Error("Pick a category for this meal.");
        }
        throw new Error(data.error || "Could not process that.");
      }
      if (!data.meal) throw new Error("No food data returned.");
      setStatus("Check the preview, then confirm.");
      showPreview(data.meal);
    } catch (err) {
      var message = err && err.message ? err.message : "Could not process that.";
      if (/OPENAI_API_KEY/i.test(message)) {
        message = "Add OPENAI_API_KEY in Vercel, then redeploy.";
      } else if (/no credits remaining|billing|insufficient/i.test(message)) {
        message = "OpenAI account has no credits. Add billing at platform.openai.com.";
      }
      setStatus(message, true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Update log";
      }
    }
  }

  function confirmMeal() {
    if (!pendingMeal) return;
    var type = pendingMeal.type || "add_meal";

    if (type === "set_day") {
      if (typeof window.studioSetDayMacros !== "function") {
        setStatus("Macro log is not ready on this page.", true);
        return;
      }
      window.studioSetDayMacros(pendingMeal);
      if (window.studioToast) window.studioToast.show("Day macros updated");
    } else {
      if (typeof window.studioLogAiMeal !== "function") {
        setStatus("Meal log is not ready on this page.", true);
        return;
      }
      window.studioLogAiMeal(pendingMeal);
      if (window.studioToast) {
        window.studioToast.show(type === "add_macros" ? "Macros added" : "Meal added");
      }
    }

    var input = document.getElementById("ai-meal-input");
    if (input) input.value = "";
    showPreview(null);
    setStatus("");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var estimateBtn = document.getElementById("ai-meal-estimate");
    if (estimateBtn) {
      estimateBtn.addEventListener("click", function () {
        estimateMeal();
      });
    }

    var preview = document.getElementById("ai-meal-preview");
    if (preview) {
      preview.addEventListener("click", function (event) {
        if (event.target.closest("#ai-meal-confirm")) {
          confirmMeal();
          return;
        }
        if (event.target.closest("#ai-meal-cancel")) {
          showPreview(null);
          setStatus("");
        }
      });
    }
  });
})();
