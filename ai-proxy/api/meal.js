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

  var rawUsdaKey = process.env.USDA_API_KEY || process.env.FDC_API_KEY || "";
  var usingDemoUsda =
    !rawUsdaKey || /REPLACE_WITH_YOUR_USDA_KEY/i.test(rawUsdaKey);
  var usdaKey = usingDemoUsda ? "DEMO_KEY" : rawUsdaKey;

  var body = req.body || {};
  var description = typeof body.description === "string" ? body.description.trim() : "";
  var categoryHint =
    typeof body.category === "string" ? body.category.trim().toLowerCase() : "";

  if (!description) {
    return res.status(400).json({ error: "Describe what you ate (portions are fine)." });
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
        error:
          "Could not parse foods. Try something like: 4 skinless boneless chicken breasts, 2 servings butter.",
      });
    }

    var missing = parsed.items.filter(function (item) {
      return !(item.grams > 0);
    });
    if (missing.length) {
      return res.status(400).json({
        error:
          "Need a rough portion for: " +
          missing
            .map(function (item) {
              return item.label || item.query || "item";
            })
            .join(", ") +
          ". Example: 2 servings, 1 breast, 1 cup.",
      });
    }

    var lookedUp = [];
    var usedEstimate = false;
    for (var i = 0; i < parsed.items.length; i++) {
      var item = parsed.items[i];
      if (item.estimated) usedEstimate = true;
      var match = await lookupUsdaFood(usdaKey, item.query || item.label);
      if (!match) {
        return res.status(404).json({
          error: 'No USDA match for "' + (item.label || item.query) + '". Try a clearer food name.',
        });
      }
      var scale = item.grams / 100;
      lookedUp.push({
        label: item.label || item.query,
        portion: item.portion || "",
        grams: Math.round(item.grams),
        estimated: !!item.estimated,
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
      confidence: usedEstimate ? "medium" : "high",
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
            "items (array of {label, query, portion, grams, estimated}). " +
            "label = human food name. query = plain USDA-style search terms for the SAME food the user meant. " +
            "Examples: milk → 'Milk, whole, fluid'; butter → 'Butter, salted'; " +
            "chicken breast → 'chicken breast meat only cooked skinless boneless'; " +
            "rice → 'rice white long-grain cooked'; egg → 'egg whole cooked'. " +
            "Do not turn milk into cheese, ricotta, yogurt, cream, or flavored milk unless the user said that. " +
            "Avoid brand/recipe/breaded/fried/lunchmeat unless the user said that. " +
            "portion = short copy of what the user said (e.g. '2 servings of milk', '4 chicken breasts'). " +
            "grams = TOTAL grams for that line after converting portions to weight. " +
            "Rough estimates are expected: servings, pieces, breasts, eggs, slices, cups, tbsp, tsp, oz. " +
            "Typical portions: 1 serving / 1 cup milk ≈ 244g; 1 tbsp / 1 serving butter ≈ 14g; " +
            "1 medium skinless boneless chicken breast ≈ 170g cooked; 1 large egg ≈ 50g; 1 slice bread ≈ 28g. " +
            "estimated=true when grams came from a typical portion rather than an exact weight. " +
            "estimated=false only if the user gave an exact mass (g, kg, oz, lb). " +
            "If they name a food with no usable portion at all, set grams: 0. " +
            "Do not invent nutrition numbers. Do not include markdown or extra keys.",
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
        portion: String((item && item.portion) || "").trim().slice(0, 80),
        grams: Math.max(0, Number(item && item.grams) || 0),
        estimated: !!(item && item.estimated),
      };
    })
    .filter(function (item) {
      return item.query;
    })
    .slice(0, 12);

  return parsed;
}

async function lookupUsdaFood(apiKey, query) {
  var searchQuery = normalizeUsdaQuery(query);
  var searchRes = await fetch(
    "https://api.nal.usda.gov/fdc/v1/foods/search?api_key=" + encodeURIComponent(apiKey),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: searchQuery,
        pageSize: 40,
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
  var best = null;
  var bestScore = -Infinity;
  var q = String(searchQuery || query || "").toLowerCase();

  for (var i = 0; i < foods.length; i++) {
    var food = foods[i];
    var per100 = extractPer100(food);
    if (!per100) continue;
    var score = scoreUsdaFood(food, q);
    if (score > bestScore) {
      bestScore = score;
      best = {
        fdcId: food.fdcId,
        description: String(food.description || query).trim().slice(0, 120),
        per100: per100,
      };
    }
  }
  return best;
}

function normalizeUsdaQuery(query) {
  var q = String(query || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Keep common drinks/foods from drifting into related products (e.g. milk → ricotta).
  if (
    /^(milk|whole milk|milk whole|2% milk|1% milk|skim milk|fat free milk)(\s|,|$)/.test(q) ||
    /milk.*fluid|fluid.*milk/.test(q) ||
    q.indexOf("milk") !== -1 && q.indexOf("cheese") === -1 && q.indexOf("ricotta") === -1 && tokensAreMostlyMilk(q)
  ) {
    if (/\b(skim|fat free|nonfat|non fat)\b/.test(q)) return "Milk, nonfat, fluid";
    if (/\b(1%|1 percent|lowfat|low fat)\b/.test(q)) return "Milk, lowfat, fluid, 1% milkfat";
    if (/\b(2%|2 percent|reduced fat)\b/.test(q)) return "Milk, reduced fat, fluid, 2% milkfat";
    return "Milk, whole, 3.25% milkfat";
  }
  if (/^butter\b/.test(q) && q.indexOf("butter milk") === -1 && q.indexOf("buttermilk") === -1) {
    return "Butter, salted";
  }
  return query;
}

function tokensAreMostlyMilk(q) {
  // True for queries like "milk whole", "milk, whole, fluid", "whole milk".
  var cleaned = q.replace(/milk|whole|fluid|cow|vitamin|added|and|with/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  return cleaned.length === 0;
}

function hasWord(text, word) {
  return new RegExp("(^|[^a-z0-9])" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)", "i").test(
    text
  );
}

function scoreUsdaFood(food, queryLower) {
  var desc = String(food.description || "").toLowerCase();
  var dataType = String(food.dataType || "");
  var score = 0;

  if (dataType === "Foundation") score += 25;
  else if (dataType === "SR Legacy") score += 35;
  else if (dataType.indexOf("Survey") !== -1) score += 20;

  var tokens = queryLower.split(/[^a-z0-9]+/).filter(function (t) {
    return t && t.length > 1 && ["and", "with", "the", "only"].indexOf(t) === -1;
  });
  for (var i = 0; i < tokens.length; i++) {
    if (hasWord(desc, tokens[i])) score += 10;
  }

  // Prefer descriptions that start with the main food word.
  var main = tokens[0] || "";
  if (main && (desc.indexOf(main + ",") === 0 || desc.indexOf(main + " ") === 0)) {
    score += 40;
  } else if (main && hasWord(desc, main)) {
    score += 5;
  } else if (main) {
    score -= 40;
  }

  var junk = [
    "breaded",
    "battered",
    "fried",
    "fast food",
    "lunchmeat",
    "lunch meat",
    "nugget",
    "tenders",
    "patty",
    "with gravy",
    "canned",
    "babyfood",
    "baby food",
    "imitation",
    "dessert",
    "frozen",
    "powder",
    "protein supplement",
    "crackers",
    "cracker",
  ];
  for (var j = 0; j < junk.length; j++) {
    if (desc.indexOf(junk[j]) !== -1 && queryLower.indexOf(junk[j]) === -1) {
      score -= 50;
    }
  }

  // Milk must stay milk — not cheese made from milk.
  if (hasWord(queryLower, "milk") && !hasWord(queryLower, "cheese") && !hasWord(queryLower, "ricotta")) {
    if (
      hasWord(desc, "cheese") ||
      hasWord(desc, "ricotta") ||
      hasWord(desc, "yogurt") ||
      hasWord(desc, "yoghurt") ||
      hasWord(desc, "ice cream") ||
      (hasWord(desc, "cream") && !/\bcream\b/.test(queryLower))
    ) {
      score -= 120;
    }
    if (hasWord(desc, "buttermilk") && !hasWord(queryLower, "buttermilk")) {
      score -= 150;
    }
    if (hasWord(desc, "fluid")) score += 10;
    if (/^(milk,|milk )/.test(desc)) score += 30;
    // Prefer plain cow's milk over buttermilk / flavored / alt milks.
    if (/milk, whole, 3\.25%/.test(desc) || /^milk, whole\b/.test(desc)) score += 80;
    if (/milk, reduced fat|milk, lowfat|milk, nonfat|milk, skim/.test(desc) && !/lowfat|reduced|nonfat|skim|1%|2%/.test(queryLower)) {
      score -= 60;
    }
    if (/milk, reduced fat, fluid|milk, lowfat, fluid|milk, nonfat, fluid/.test(desc) && /1%|2%|lowfat|nonfat|skim|reduced/.test(queryLower)) {
      score += 40;
    }
    var altMilks = ["coconut", "almond", "oat", "rice", "soy", "goat", "human", "chocolate", "malted", "filled", "dry", "condensed", "evaporated"];
    for (var k = 0; k < altMilks.length; k++) {
      if (hasWord(desc, altMilks[k]) && !hasWord(queryLower, altMilks[k])) score -= 80;
    }
  }

  // Butter should not become buttermilk unless asked.
  if (hasWord(queryLower, "butter") && !hasWord(queryLower, "buttermilk")) {
    if (hasWord(desc, "buttermilk")) score -= 100;
  }

  if (desc.indexOf("meat only") !== -1) score += 12;
  if (desc.indexOf("skinless") !== -1) score += 6;
  if (desc.indexOf("cooked") !== -1 && queryLower.indexOf("raw") === -1) score += 4;
  if (desc.indexOf("raw") !== -1 && queryLower.indexOf("raw") === -1) score -= 8;

  var nutrients = Array.isArray(food.foodNutrients) ? food.foodNutrients : [];
  var hasEnergy = nutrients.some(function (n) {
    var id = Number((n && (n.nutrientId || n.nutrientNumber)) || 0);
    var unit = String((n && n.unitName) || "").toUpperCase();
    return id === 1008 || unit === "KCAL";
  });
  if (hasEnergy) score += 15;

  return score;
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

  var p = protein == null ? 0 : protein;
  var f = fat == null ? 0 : fat;
  var c = carbs == null ? 0 : carbs;
  var kcal = calories == null ? 0 : calories;
  // Some Foundation search hits omit Energy; derive Atwater kcal when needed.
  if (kcal <= 0 && (p > 0 || f > 0 || c > 0)) {
    kcal = p * 4 + c * 4 + f * 9;
  }

  return {
    calories: kcal,
    protein: p,
    fat: f,
    carbs: c,
  };
}
