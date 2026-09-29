var MODEL_CHAIN = (process.env.OPENAI_MODEL ? [process.env.OPENAI_MODEL] : []).concat([
  "gpt-5-mini",
  "gpt-4.1",
]);

var ALLOWED_CATEGORIES = ["breakfast", "lunch", "dinner", "snack", "dessert"];

var SYSTEM_PROMPT = [
  "You are an expert sports nutritionist logging food for one lifter. Think like a careful human coach reading a chat message.",
  "",
  "Decide the intent:",
  '- "add_meal": they described food/drink they ate.',
  '- "set_day": they gave totals for the WHOLE day (e.g. "today was 2500 cal 180p 70f 200c", "I hit 220g protein and 2800 cals").',
  '- "add_macros": they want to add a lump of macros without naming food (e.g. "add 500 cal and 40 protein").',
  "",
  "For add_meal, break the food into items. For EACH item give:",
  "- label: plain food name",
  "- portion: short echo of what they said (\"4 breasts\", \"2 servings\")",
  "- grams: total edible grams you assume for that item, as eaten (cooked weight for meat/rice/pasta)",
  "- per100: {calories, protein, fat, carbs} per 100 g of that food as eaten",
  "Do NOT compute item totals yourself; the app multiplies grams × per100.",
  "",
  "Portion defaults (use unless they say otherwise):",
  "- chicken breast, skinless boneless: 1 breast ≈ 175 g cooked; per100 ≈ 165 kcal, 31 P, 3.6 F, 0 C",
  "- milk: 1 serving = 1 cup = 244 g; assume whole milk (per100 ≈ 61 kcal, 3.2 P, 3.3 F, 4.8 C) unless they say skim/1%/2%",
  "- butter: 1 serving = 1 tbsp = 14 g (per100 ≈ 717 kcal, 0.9 P, 81 F, 0 C)",
  "- large egg ≈ 50 g; slice of sandwich bread ≈ 30 g; medium banana ≈ 118 g; handful of nuts ≈ 28 g",
  "- scoop of whey ≈ 30 g; cooked white rice 1 cup ≈ 158 g; ribeye oz weights are cooked unless stated raw",
  "- restaurant/fast food: use that chain's published nutrition for the named item and size",
  "Vague food with no amount: assume one typical adult portion and say so in the portion.",
  "",
  "For set_day and add_macros, return totals directly in calories/protein/fat/carbs. Use null for any macro they did not give — do not guess it.",
  "",
  "Never invent foods they did not mention. Never use 0 for a macro you actually know is non-zero.",
  "",
  "Return JSON only:",
  "{",
  '  "type": "add_meal" | "set_day" | "add_macros",',
  '  "name": short title,',
  '  "category": "breakfast"|"lunch"|"dinner"|"snack"|"dessert"|"",',
  '  "items": [{"label","portion","grams","per100":{"calories","protein","fat","carbs"}}],',
  '  "calories": number|null, "protein": number|null, "fat": number|null, "carbs": number|null,',
  '  "confidence": "low"|"medium"|"high",',
  '  "note": one short sentence about any big assumption, or ""',
  "}",
].join("\n");

module.exports = async function handler(req, res) {
  var origin = req.headers.origin || "";
  var allowedOrigins = [
    "https://alexlovatt77.github.io",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
  ];
  res.setHeader(
    "Access-Control-Allow-Origin",
    allowedOrigins.indexOf(origin) !== -1 ? origin : "https://alexlovatt77.github.io"
  );
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not set on Vercel." });
  }

  var body = req.body || {};
  var description = typeof body.description === "string" ? body.description.trim() : "";
  var categoryHint = typeof body.category === "string" ? body.category.trim().toLowerCase() : "";
  if (ALLOWED_CATEGORIES.indexOf(categoryHint) === -1) categoryHint = "";
  var current = body.current && typeof body.current === "object" ? cleanTotals(body.current) : null;

  if (!description) {
    return res.status(400).json({ error: "Tell me what you ate, or give today’s macros." });
  }
  if (description.length > 2000) description = description.slice(0, 2000);

  var userContent =
    (categoryHint ? "Meal category chosen by user: " + categoryHint + ".\n" : "") +
    (current
      ? "Already logged today: " +
        current.calories +
        " kcal, P " +
        current.protein +
        " g, F " +
        current.fat +
        " g, C " +
        current.carbs +
        " g.\n"
      : "") +
    "Message:\n" +
    description;

  var result;
  try {
    result = await callOpenAI(userContent);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Could not reach OpenAI." });
  }

  var parsed = result.parsed;
  var type = String(parsed.type || "add_meal").toLowerCase();
  if (["add_meal", "set_day", "add_macros"].indexOf(type) === -1) type = "add_meal";

  var category = String(parsed.category || "").toLowerCase();
  if (categoryHint) category = categoryHint;
  if (ALLOWED_CATEGORIES.indexOf(category) === -1) category = "";
  if (type === "add_meal" && !category) category = guessCategoryByTime();

  var notes = [];
  if (parsed.note) notes.push(String(parsed.note).trim());

  var items = [];
  var totals;

  if (type === "add_meal") {
    items = (Array.isArray(parsed.items) ? parsed.items : [])
      .map(buildItem)
      .filter(Boolean)
      .slice(0, 15);
    if (!items.length) {
      return res.status(400).json({
        error: "Couldn’t work out the food there. Try something like “3 eggs and 2 slices of toast”.",
      });
    }
    totals = items.reduce(
      function (acc, item) {
        acc.calories += item.calories;
        acc.protein += item.protein;
        acc.fat += item.fat;
        acc.carbs += item.carbs;
        return acc;
      },
      { calories: 0, protein: 0, fat: 0, carbs: 0 }
    );
  } else {
    var filled = fillMissingMacros(parsed);
    totals = filled.totals;
    notes = [filled.note || (type === "set_day" ? "Replaces today’s log with the totals you gave." : "Adds the macros you gave to today.")];
  }

  if (!totals.calories && !totals.protein && !totals.fat && !totals.carbs) {
    return res.status(400).json({
      error: "Couldn’t get macros from that. Try food with amounts, or totals like 2500 cal / 180p / 70f / 200c.",
    });
  }

  var confidence = String(parsed.confidence || "medium").toLowerCase();
  if (["low", "medium", "high"].indexOf(confidence) === -1) confidence = "medium";

  var defaultName = type === "set_day" ? "Day totals" : type === "add_macros" ? "Macro add" : "Meal";

  return res.status(200).json({
    meal: {
      type: type,
      name: String(parsed.name || defaultName).trim().slice(0, 80) || defaultName,
      category: category || "snack",
      calories: Math.round(totals.calories),
      protein: Math.round(totals.protein),
      fat: Math.round(totals.fat),
      carbs: Math.round(totals.carbs),
      confidence: confidence,
      source: "coach",
      summary: notes.filter(Boolean).join(" ").slice(0, 240),
      items: items,
      replacesDay: type === "set_day",
      model: result.model,
    },
  });
};

async function callOpenAI(userContent) {
  var lastError = null;
  for (var i = 0; i < MODEL_CHAIN.length; i++) {
    var model = MODEL_CHAIN[i];
    var isReasoning = /^(gpt-5|o\d)/.test(model);
    var payload = {
      model: model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    };
    if (isReasoning) {
      payload.reasoning_effort = "low";
    } else {
      payload.temperature = 0.1;
    }

    var response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    var data = await response.json().catch(function () {
      return {};
    });

    if (!response.ok) {
      var message = (data && data.error && data.error.message) || "OpenAI request failed.";
      lastError = new Error(message);
      if (response.status === 404 || /model|does not exist|not have access|unsupported/i.test(message)) {
        continue;
      }
      throw lastError;
    }

    var raw =
      data.choices && data.choices[0] && data.choices[0].message
        ? String(data.choices[0].message.content || "").trim()
        : "";
    try {
      return { parsed: JSON.parse(raw), model: model };
    } catch (err) {
      lastError = new Error("Could not parse food response.");
    }
  }
  throw lastError || new Error("OpenAI request failed.");
}

function num(value) {
  var n = Number(value);
  return isFinite(n) && n > 0 ? n : 0;
}

function numOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  var n = Number(value);
  return isFinite(n) && n >= 0 ? n : null;
}

function cleanTotals(src) {
  return {
    calories: Math.round(num(src.calories)),
    protein: Math.round(num(src.protein)),
    fat: Math.round(num(src.fat)),
    carbs: Math.round(num(src.carbs)),
  };
}

function atwater(p, f, c) {
  return p * 4 + f * 9 + c * 4;
}

function buildItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  var grams = num(raw.grams);
  var per = raw.per100 && typeof raw.per100 === "object" ? raw.per100 : {};
  var p = num(per.protein);
  var f = num(per.fat);
  var c = num(per.carbs);
  var kcal = num(per.calories);
  var derived = atwater(p, f, c);
  // Keep kcal and macros consistent; drinks like diet soda can legitimately be ~0.
  if (derived > 0 && (kcal === 0 || Math.abs(kcal - derived) / derived > 0.15)) {
    kcal = derived;
  }
  if (!grams) return null;
  var scale = grams / 100;
  return {
    label: String(raw.label || "Food").trim().slice(0, 80),
    portion: String(raw.portion || "").trim().slice(0, 80),
    grams: Math.round(grams),
    estimated: true,
    matched: "",
    calories: Math.round(kcal * scale),
    protein: Math.round(p * scale),
    fat: Math.round(f * scale),
    carbs: Math.round(c * scale),
  };
}

function fillMissingMacros(parsed) {
  var kcal = numOrNull(parsed.calories);
  var p = numOrNull(parsed.protein);
  var f = numOrNull(parsed.fat);
  var c = numOrNull(parsed.carbs);
  var note = "";

  if (kcal === null) {
    kcal = atwater(p || 0, f || 0, c || 0);
    if (p === null || f === null || c === null) {
      note = "Calories are from the macros you gave only.";
    }
    return { totals: { calories: kcal, protein: p || 0, fat: f || 0, carbs: c || 0 }, note: note };
  }

  var missing = [];
  if (p === null) missing.push("protein");
  if (f === null) missing.push("fat");
  if (c === null) missing.push("carbs");

  if (missing.length && missing.length < 3) {
    var used = (p || 0) * 4 + (f || 0) * 9 + (c || 0) * 4;
    var remaining = Math.max(0, kcal - used);
    var shares = { protein: 0.25, fat: 0.3, carbs: 0.45 };
    var shareTotal = missing.reduce(function (sum, key) {
      return sum + shares[key];
    }, 0);
    missing.forEach(function (key) {
      var kcalForKey = remaining * (shares[key] / shareTotal);
      var grams = key === "fat" ? kcalForKey / 9 : kcalForKey / 4;
      if (key === "protein") p = grams;
      if (key === "fat") f = grams;
      if (key === "carbs") c = grams;
    });
    note =
      missing.join(" and ").replace(/^./, function (ch) {
        return ch.toUpperCase();
      }) + " estimated from your remaining calories — edit if you know them.";
  }

  return { totals: { calories: kcal, protein: p || 0, fat: f || 0, carbs: c || 0 }, note: note };
}

function guessCategoryByTime() {
  var hour = Number(
    new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" })
  );
  if (hour < 11) return "breakfast";
  if (hour < 16) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}
