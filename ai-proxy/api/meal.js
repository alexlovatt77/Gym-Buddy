module.exports = async function handler(req, res) {
  var origin = req.headers.origin || "";
  var allowed = [
    "https://alexlovatt77.github.io",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
  ];
  if (allowed.indexOf(origin) !== -1) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "https://alexlovatt77.github.io");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not set on Vercel." });
  }

  var body = req.body || {};
  var description = typeof body.description === "string" ? body.description.trim() : "";
  var categoryHint =
    typeof body.category === "string" ? body.category.trim().toLowerCase() : "";
  var current =
    body.current && typeof body.current === "object"
      ? {
          calories: Math.max(0, Math.round(Number(body.current.calories) || 0)),
          protein: Math.max(0, Math.round(Number(body.current.protein) || 0)),
          fat: Math.max(0, Math.round(Number(body.current.fat) || 0)),
          carbs: Math.max(0, Math.round(Number(body.current.carbs) || 0)),
        }
      : null;

  if (!description) {
    return res.status(400).json({
      error: "Tell me what you ate, or give today’s macros.",
    });
  }
  if (description.length > 2000) {
    description = description.slice(0, 2000);
  }

  var allowedCategories = ["breakfast", "lunch", "dinner", "snack", "dessert"];
  if (categoryHint && allowedCategories.indexOf(categoryHint) === -1) {
    categoryHint = "";
  }

  try {
    var openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a careful personal nutrition coach for a food diary app. " +
              "Read the user's message like a smart human coach would. " +
              "Decide the intent:\n" +
              '1) "add_meal" — they described food/drinks to log as a meal (estimate macros).\n' +
              '2) "set_day" — they gave (or clearly meant) totals for the whole day ' +
              "(e.g. 'today was 2500 cal, 180p, 70f, 200c', 'set my macros to...', " +
              "'I hit 220g protein / 2800 calories'). " +
              "Use the numbers they gave; do not invent missing macros — set missing ones to 0 " +
              "only if they clearly omitted that macro on purpose, otherwise ask is not possible: " +
              "if calories/protein/fat/carbs are incomplete for a set_day, still fill what you can " +
              "and put 0 for unspecified macros.\n" +
              '3) "add_macros" — they want to ADD a lump of macros (not replace the day), ' +
              "e.g. 'add 500 calories and 40 protein'.\n" +
              "Do NOT use USDA or external databases. Use common sense for food estimates. " +
              "Return JSON only with keys: " +
              "type (add_meal|set_day|add_macros), " +
              "name (short title), " +
              "category (breakfast|lunch|dinner|snack|dessert or empty string), " +
              "calories, protein, fat, carbs (integers), " +
              "confidence (low|medium|high), " +
              "summary (one short sentence of what you will do), " +
              "items (array; for add_meal use {label, portion, grams, matched, calories, protein, fat, carbs}; " +
              "for set_day/add_macros use [] or a single explanatory item).\n" +
              "For add_meal: estimate from foods; prefer the user's category if provided. " +
              "For set_day: macros are the TARGET day totals. " +
              "For add_macros: macros are the amount to ADD. " +
              "Do not invent foods they did not mention.",
          },
          {
            role: "user",
            content:
              (categoryHint ? "Preferred meal category: " + categoryHint + ".\n" : "") +
              (current
                ? "Current logged totals today: " +
                  current.calories +
                  " kcal, P " +
                  current.protein +
                  "g, F " +
                  current.fat +
                  "g, C " +
                  current.carbs +
                  "g.\n"
                : "") +
              "User message:\n" +
              description,
          },
        ],
      }),
    });

    var data = await openaiRes.json();
    if (!openaiRes.ok) {
      return res.status(500).json({
        error: (data && data.error && data.error.message) || "OpenAI request failed.",
      });
    }

    var raw =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
        ? String(data.choices[0].message.content).trim()
        : "";

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return res.status(500).json({ error: "Could not parse food response." });
    }

    var type = String(parsed.type || "add_meal").toLowerCase();
    if (["add_meal", "set_day", "add_macros"].indexOf(type) === -1) type = "add_meal";

    var category = String(parsed.category || categoryHint || "").toLowerCase();
    if (allowedCategories.indexOf(category) === -1) {
      category = type === "add_meal" ? categoryHint || "snack" : "snack";
    }
    if (type === "add_meal" && allowedCategories.indexOf(category) === -1) {
      return res.status(400).json({
        error: "Pick a category for this meal.",
        needCategory: true,
      });
    }

    var items = Array.isArray(parsed.items) ? parsed.items : [];
    var lookedUp = items
      .map(function (item) {
        return {
          label: String((item && item.label) || "").trim().slice(0, 80) || "Food",
          portion: String((item && item.portion) || (item && item.label) || "")
            .trim()
            .slice(0, 80),
          grams: Math.max(0, Math.round(Number(item && item.grams) || 0)),
          estimated: true,
          matched: String((item && item.matched) || (item && item.label) || "")
            .trim()
            .slice(0, 140),
          calories: Math.max(0, Math.round(Number(item && item.calories) || 0)),
          protein: Math.max(0, Math.round(Number(item && item.protein) || 0)),
          fat: Math.max(0, Math.round(Number(item && item.fat) || 0)),
          carbs: Math.max(0, Math.round(Number(item && item.carbs) || 0)),
        };
      })
      .filter(function (item) {
        return item.label;
      })
      .slice(0, 12);

    var calories = Math.max(0, Math.round(Number(parsed.calories) || 0));
    var protein = Math.max(0, Math.round(Number(parsed.protein) || 0));
    var fat = Math.max(0, Math.round(Number(parsed.fat) || 0));
    var carbs = Math.max(0, Math.round(Number(parsed.carbs) || 0));

    if (type === "add_meal" && !calories && lookedUp.length) {
      calories = lookedUp.reduce(function (sum, row) {
        return sum + row.calories;
      }, 0);
      protein = lookedUp.reduce(function (sum, row) {
        return sum + row.protein;
      }, 0);
      fat = lookedUp.reduce(function (sum, row) {
        return sum + row.fat;
      }, 0);
      carbs = lookedUp.reduce(function (sum, row) {
        return sum + row.carbs;
      }, 0);
    }

    if (!calories && !protein && !fat && !carbs) {
      return res.status(400).json({
        error: "Could not get macros from that. Try food with portions, or day totals like 2500 cal / 180p / 70f / 200c.",
      });
    }

    var confidence = String(parsed.confidence || "medium").toLowerCase();
    if (["low", "medium", "high"].indexOf(confidence) === -1) confidence = "medium";

    var defaultName =
      type === "set_day" ? "Day totals" : type === "add_macros" ? "Macro add" : "Meal";
    var meal = {
      type: type,
      name: String(parsed.name || defaultName).trim().slice(0, 80) || defaultName,
      category: category || "snack",
      calories: calories,
      protein: protein,
      fat: fat,
      carbs: carbs,
      confidence: confidence,
      source: "coach",
      summary: String(parsed.summary || "").trim().slice(0, 200),
      items: lookedUp,
      replacesDay: type === "set_day",
    };

    return res.status(200).json({ meal: meal });
  } catch (err) {
    return res.status(500).json({ error: "Could not reach OpenAI." });
  }
};
