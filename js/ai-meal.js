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

    var itemsHtml = "";
    if (Array.isArray(meal.items) && meal.items.length) {
      itemsHtml =
        '<ul class="ai-meal-preview__items">' +
        meal.items
          .map(function (item) {
            var portionBit = item.portion
              ? escapeHtml(item.portion)
              : escapeHtml(item.label || "");
            return (
              '<li class="ai-meal-preview__item">' +
              '<div class="ai-meal-preview__item-main">' +
              '<p class="ai-meal-preview__item-portion">' +
              portionBit +
              ' <span class="ai-meal-preview__grams">≈ ' +
              item.grams +
              "g</span></p>" +
              '<p class="ai-meal-preview__item-match">' +
              escapeHtml(item.matched || "") +
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

    preview.hidden = false;
    preview.innerHTML =
      '<div class="ai-meal-preview__head">' +
      '<div class="ai-meal-preview__identity">' +
      '<p class="ai-meal-preview__eyebrow">Review before adding' +
      (meal.source === "usda" ? " · USDA" : "") +
      "</p>" +
      '<h3 class="ai-meal-preview__title">' +
      escapeHtml(meal.name) +
      "</h3>" +
      '<p class="ai-meal-preview__meta">' +
      escapeHtml(titleCase(meal.category)) +
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
      '<button class="btn" type="button" id="ai-meal-confirm">Add to day</button>' +
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

  async function lookupMeal() {
    var input = document.getElementById("ai-meal-input");
    var category = document.getElementById("ai-meal-category");
    var btn = document.getElementById("ai-meal-estimate");
    var description = input ? String(input.value || "").trim() : "";
    var categoryValue = category ? String(category.value || "").trim() : "";
    if (!description) {
      setStatus("Describe what you ate — portions like “2 servings” are fine.", true);
      return;
    }
    if (!categoryValue) {
      setStatus("Pick a category first.", true);
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Looking up…";
    }
    setStatus("Matching foods in USDA FoodData…");
    showPreview(null);

    try {
      var res = await fetch(MEAL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description,
          category: categoryValue,
        }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        throw new Error(data.error || "Lookup failed.");
      }
      if (!data.meal) throw new Error("No meal data returned.");
      setStatus(
        data.meal.usdaDemo
          ? "Review the matches below, then add. Tip: add your own USDA_API_KEY in Vercel for reliability."
          : "Review the matches below, then add to today’s log."
      );
      showPreview(data.meal);
    } catch (err) {
      var message = err && err.message ? err.message : "Could not look up meal.";
      if (/OPENAI_API_KEY/i.test(message)) {
        message = "Add OPENAI_API_KEY in Vercel, then redeploy.";
      } else if (/USDA_API_KEY|FDC_API_KEY/i.test(message)) {
        message =
          "Add USDA_API_KEY in Vercel (free at fdc.nal.usda.gov/api-key-signup.html), then Redeploy.";
      } else if (/no credits remaining|billing|insufficient/i.test(message)) {
        message = "OpenAI account has no credits. Add billing at platform.openai.com.";
      }
      setStatus(message, true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Look up macros";
      }
    }
  }

  function confirmMeal() {
    if (!pendingMeal) return;
    if (typeof window.studioLogAiMeal !== "function") {
      setStatus("Meal log is not ready on this page.", true);
      return;
    }
    window.studioLogAiMeal(pendingMeal);
    var input = document.getElementById("ai-meal-input");
    if (input) input.value = "";
    showPreview(null);
    setStatus("");
    if (window.studioToast) window.studioToast.show("Meal added");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var estimateBtn = document.getElementById("ai-meal-estimate");
    if (estimateBtn) {
      estimateBtn.addEventListener("click", function () {
        lookupMeal();
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
