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
            return (
              "<li>" +
              escapeHtml(item.label || "") +
              " (" +
              item.grams +
              "g) → " +
              escapeHtml(item.matched || "") +
              ": " +
              item.calories +
              " kcal · P" +
              item.protein +
              " F" +
              item.fat +
              " C" +
              item.carbs +
              "</li>"
            );
          })
          .join("") +
        "</ul>";
    }

    preview.hidden = false;
    preview.innerHTML =
      '<p class="ai-meal-preview__title">' +
      escapeHtml(meal.name) +
      "</p>" +
      '<p class="ai-meal-preview__meta">' +
      escapeHtml(meal.category) +
      " · " +
      meal.calories +
      " kcal · P " +
      meal.protein +
      "g · F " +
      meal.fat +
      "g · C " +
      meal.carbs +
      "g" +
      (meal.source === "usda" ? " · USDA" : "") +
      "</p>" +
      itemsHtml +
      '<div class="btn-row">' +
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
    if (!description) {
      setStatus("Describe what you ate, with amounts.", true);
      return;
    }

    if (btn) btn.disabled = true;
    setStatus("Looking up macros in USDA…");
    showPreview(null);

    try {
      var res = await fetch(MEAL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description,
          category: category ? category.value : "",
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
          ? "Check the USDA matches, then add it. (Using shared USDA demo key — add your free USDA_API_KEY in Vercel for reliability.)"
          : "Check the USDA matches, then add it."
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
      if (btn) btn.disabled = false;
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
