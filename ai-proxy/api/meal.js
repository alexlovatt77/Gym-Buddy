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

  var usdaKey = process.env.USDA_API_KEY || process.env.FDC_API_KEY || "DEMO_KEY";
  var usingDemoUsda = !process.env.USDA_API_KEY && !process.env.FDC_API_KEY;

  var body = req.body || {};
  var description = typeof body.description === "string" ? body.description.trim() : "";
  var categoryHint =
    typeof body.category === "string" ? body.category.trim().toLowerCase() : "";

  if (!description) {
    return res.status(400).json({ error: "Describe what you ate, with amounts." });
  }
  if (description.length > 2000) {
    description = description.slice(0, 2000);
  }

  var allowedCategories = ["breakfast", "lunch", "dinner", "snack", "dessert"];
  var hintLine =
    allowedCategories.indexOf(categoryHint) !== -1
      ? "Preferred category: " + categoryHint + "."
      : "Pick the best category.";

  try {
    var parsed = await parseMealItems(description, hintLine);
    if (!parsed || !Array.isArray(parsed.items) || !parsed.items.length) {
      return res.status(400).json({
        error: "Could not find foods with amounts. Example: 170g chicken breast, 1 cup rice.",
      });
    }

    var missing = parsed.items.filter(function (item) {
      return !(item.grams > 0);
    });
    if (missing.length) {
      return res.status(400).json({
        error:
          "Add amounts for: " +
          missing
            .map(function (item) {
              return item.label || item.query || "item";
            })
            .join(", "),
      });
    }

    var lookedUp = [];
    for (var i = 0; i < parsed.items.length; i++) {
      var item = parsed.items[i];
      var match = await lookupUsdaFood(usdaKey, item.query || item.label);
      if (!match) {
        return res.status(404).json({
          error: 'No USDA match for "' + (item.label || item.query) + '". Try a clearer food name.',
        });
      }
      var scale = item.grams / 100;
      lookedUp.push({
        label: item.label || item.query,
        grams: Math.round(item.grams),
        matched: match.description,
        fdcId: match.fdcId,
        calories: roundMacro(match.per100.calories * scale),
        protein: roundMacro(match.per100.protein * scale),
        fat: roundMacro(match.per100.fat * scale),
        carbs: roundMacro(match.per100.carbs * scale),
      });
    }

    var totals = lookedUp.reduce(
      function (acc, row) {
        acc.calories += row.calories;
        acc.protein += row.protein;
        acc.fat += row.fat;
        acc.carbs += row.carbs;
        return acc;
      },
      { calories: 0, protein: 0, fat: 0, carbs: 0 }
    );

    var category = String(parsed.category || categoryHint || "snack").toLowerCase();
    if (allowedCategories.indexOf(category) === -1) category = "snack";

    var meal = {
      name: String(parsed.name || description).trim().slice(0, 80) || "Meal",
      category: category,
      calories: Math.round(totals.calories),
      protein: Math.round(totals.protein),
      fat: Math.round(totals.fat),
      carbs: Math.round(totals.carbs),
      confidence: "high",
      source: "usda",
      items: lookedUp,
      usdaDemo: usingDemoUsda,
    };

    return res.status(200).json({ meal: meal });
  } catch (err) {
    var message = err && err.message ? err.message : "Could not look up meal.";
    return res.status(500).json({ error: message });
  }
};

function roundMacro(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

async function parseMealItems(description, hintLine) {
  var openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.OPENAI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You parse food diary text into USDA-searchable items. " +
            "Return JSON only with keys: name (short meal title), " +
            "category (breakfast|lunch|dinner|snack|dessert), " +
            "items (array of {label, query, grams}). " +
            "label = human food name. query = plain English search for USDA FoodData Central. " +
            "grams = total grams for that food after converting the user's amount " +
            "(oz→g, lb→g, cups/tbsp/tsp using typical density for that food, pieces/slices using typical weight). " +
            "Only include foods with a usable amount. Never invent amounts the user did not give. " +
            "If an amount is missing, still include the item with grams: 0. " +
            "Do not estimate nutrition. Do not include markdown or extra keys.",
        },
        {
          role: "user",
          content: hintLine + "\nMeal description:\n" + description,
        },
      ],
    }),
  });

  var data = await openaiRes.json();
  if (!openaiRes.ok) {
    throw new Error(
      (data && data.error && data.error.message) || "OpenAI request failed."
    );
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
    throw new Error("Could not parse meal items.");
  }

  var items = Array.isArray(parsed.items) ? parsed.items : [];
  parsed.items = items
    .map(function (item) {
      return {
        label: String((item && item.label) || (item && item.query) || "").trim().slice(0, 80),
        query: String((item && item.query) || (item && item.label) || "").trim().slice(0, 120),
        grams: Math.max(0, Number(item && item.grams) || 0),
      };
    })
    .filter(function (item) {
      return item.query;
    })
    .slice(0, 12);

  return parsed;
}

async function lookupUsdaFood(apiKey, query) {
  var searchRes = await fetch(
    "https://api.nal.usda.gov/fdc/v1/foods/search?api_key=" + encodeURIComponent(apiKey),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: query,
        pageSize: 8,
        dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"],
      }),
    }
  );

  var searchData = await searchRes.json();
  if (!searchRes.ok) {
    throw new Error(
      (searchData && searchData.message) || "USDA FoodData lookup failed."
    );
  }

  var foods = Array.isArray(searchData.foods) ? searchData.foods : [];
  for (var i = 0; i < foods.length; i++) {
    var food = foods[i];
    var per100 = extractPer100(food);
    if (!per100) continue;
    return {
      fdcId: food.fdcId,
      description: String(food.description || query).trim().slice(0, 120),
      per100: per100,
    };
  }
  return null;
}

function extractPer100(food) {
  var nutrients = Array.isArray(food.foodNutrients) ? food.foodNutrients : [];
  var calories = null;
  var protein = null;
  var fat = null;
  var carbs = null;

  for (var i = 0; i < nutrients.length; i++) {
    var n = nutrients[i] || {};
    var id = Number(n.nutrientId || n.nutrientNumber || 0);
    var name = String(n.nutrientName || "").toLowerCase();
    var unit = String(n.unitName || "").toUpperCase();
    var value = Number(n.value);
    if (!isFinite(value)) continue;

    if (
      calories == null &&
      (id === 1008 ||
        ((name.indexOf("energy") !== -1 || name.indexOf("calories") !== -1) &&
          (unit === "KCAL" || unit === "KCALORIE")))
    ) {
      calories = value;
      continue;
    }
    if (protein == null && (id === 1003 || name === "protein")) {
      protein = value;
      continue;
    }
    if (
      fat == null &&
      (id === 1004 || name.indexOf("total lipid") !== -1 || name === "fat")
    ) {
      fat = value;
      continue;
    }
    if (
      carbs == null &&
      (id === 1005 || name.indexOf("carbohydrate") !== -1)
    ) {
      carbs = value;
    }
  }

  if (calories == null && protein == null && fat == null && carbs == null) {
    return null;
  }

  return {
    calories: calories == null ? 0 : calories,
    protein: protein == null ? 0 : protein,
    fat: fat == null ? 0 : fat,
    carbs: carbs == null ? 0 : carbs,
  };
}
