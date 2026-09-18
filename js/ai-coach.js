(function () {
  "use strict";

  /* Vercel proxy — key stays on the server, never in this file */
  var COACH_URL = "https://gym-buddy-alexs-projects-ebb0ec48.vercel.app/api/coach";

  function todayISO() {
    var d = new Date();
    function pad(n) {
      return n < 10 ? "0" + n : String(n);
    }
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function loadWorkoutStore() {
    try {
      var raw = localStorage.getItem("studio.workout.v1");
      if (!raw) return { days: {}, draft: null };
      return JSON.parse(raw);
    } catch (err) {
      return { days: {}, draft: null };
    }
  }

  function loadWeightStore() {
    try {
      var raw = localStorage.getItem("studio.weight.v2");
      if (!raw) return { entries: [] };
      return JSON.parse(raw);
    } catch (err) {
      return { entries: [] };
    }
  }

  function formatSet(set) {
    var weight = set.weight;
    var load = set.load === "each" ? " lbs each" : " lbs";
    return set.reps + "×" + weight + load;
  }

  function buildPrompt() {
    var date = todayISO();
    var store = loadWorkoutStore();
    var exercises = [];
    if (store.draft && store.draft.date === date && Array.isArray(store.draft.exercises)) {
      exercises = store.draft.exercises;
    } else if (store.days && Array.isArray(store.days[date])) {
      exercises = store.days[date];
    }

    var lines = ["Date: " + date, "Today's workout:"];
    if (!exercises.length) {
      lines.push("- No sets logged yet.");
    } else {
      exercises.forEach(function (ex) {
        var sets = Array.isArray(ex.sets) ? ex.sets : [];
        var detail = sets.map(formatSet).join(", ") || "no sets";
        lines.push("- " + ex.name + ": " + detail);
      });
    }

    var weights = loadWeightStore().entries || [];
    var todayWeight = null;
    for (var i = 0; i < weights.length; i++) {
      if (weights[i] && weights[i].date === date) {
        todayWeight = weights[i].weight;
        break;
      }
    }
    if (todayWeight != null) lines.push("Bodyweight today: " + todayWeight + " lbs");

    lines.push("");
    lines.push(
      "Give 3 short, practical coaching tips for this session (form, progression, or recovery). Keep it under 80 words."
    );
    return lines.join("\n");
  }

  function setCoachStatus(text, isError) {
    var el = document.getElementById("coach-status");
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
    el.classList.toggle("is-error", !!isError);
  }

  function setCoachReply(text) {
    var el = document.getElementById("coach-reply");
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = text;
  }

  async function askCoach() {
    var btn = document.getElementById("ask-coach");
    if (btn) btn.disabled = true;
    setCoachStatus("Thinking…");
    setCoachReply("");

    try {
      var res = await fetch(COACH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: buildPrompt() }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        throw new Error(data.error || "Coach request failed.");
      }
      if (!data.reply) throw new Error("No reply from coach.");
      setCoachStatus("");
      setCoachReply(data.reply);
      if (window.studioToast) window.studioToast.show("Coach reply ready");
    } catch (err) {
      var message = err && err.message ? err.message : "Could not reach coach.";
      if (/OPENAI_API_KEY/i.test(message)) {
        message = "Add OPENAI_API_KEY in your Vercel project settings, then redeploy.";
      } else if (/no credits remaining|billing|insufficient/i.test(message)) {
        message = "OpenAI account has no credits. Add billing/credits at platform.openai.com.";
      }
      setCoachStatus(message, true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("ask-coach");
    if (!btn) return;
    btn.addEventListener("click", function () {
      askCoach();
    });
  });
})();
