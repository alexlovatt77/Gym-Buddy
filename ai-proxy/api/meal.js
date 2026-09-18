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
          "Could not parse foods. Try something like: 4 chicken breasts, 2 servings milk.",
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

    var candidateSets = [];
    for (var i = 0; i < parsed.items.length; i++) {
      var item = parsed.items[i];
      var candidates = await searchUsdaCandidates(usdaKey, item.query || item.label);
      if (!candidates.length) {
        return res.status(404).json({
          error:
            'No USDA matches for "' +
            (item.label || item.query) +
            '". Try a clearer food name.',
        });
      }
      candidateSets.push({ item: item, candidates: candidates });
    }

    var picks = await chooseUsdaMatches(description, candidateSets);

    var lookedUp = [];
    var usedEstimate = false;
    for (var j = 0; j < candidateSets.length; j++) {
      var row = candidateSets[j];
      var item2 = row.item;
      if (item2.estimated) usedEstimate = true;
      var pickId = picks[j];
      var match =
        row.candidates.find(function (c) {
          return Number(c.fdcId) === Number(pickId);
        }) || row.candidates[0];

      var scale = item2.grams / 100;
      lookedUp.push({
        label: item2.label || item2.query,
        portion: item2.portion || "",
        grams: Math.round(item2.grams),
        estimated: !!item2.estimated,
        matched: match.description,
        fdcId: match.fdcId,
        calories: roundMacro(match.per100.calories * scale),
        protein: roundMacro(match.per100.protein * scale),
        fat: roundMacro(match.per100.fat * scale),
        carbs: roundMacro(match.per100.carbs * scale),
      });
    }

    var totals = lookedUp.reduce(
      function (acc, row2) {
        acc.calories += row2.calories;
        acc.protein += row2.protein;
        acc.fat += row2.fat;
        acc.carbs += row2.carbs;
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

async function openaiJson(messages, model) {
  var openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.OPENAI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || "gpt-4.1",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: messages,
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

  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error("Could not parse AI response.");
  }
}

async function parseMealItems(description, hintLine) {
  var parsed = await openaiJson(
    [
      {
        role: "system",
        content:
          "You are a sharp food-diary coach helping one person log meals. " +
          "Read casual language the way a careful human would: " +
          "'milk' means drinking milk, not ricotta/cheese/yogurt; " +
          "'butter' means butter, not buttermilk; " +
          "'chicken breast' means plain chicken breast, not breaded tenders. " +
          "Use common sense about what they almost certainly meant. " +
          "Return JSON only with keys: name (short meal title), " +
          "category (breakfast|lunch|dinner|snack|dessert), " +
          "items (array of {label, query, portion, grams, estimated}). " +
          "label = plain food name. " +
          "query = best USDA FoodData search string for THAT exact food " +
          "(include form cues like fluid/cooked/raw/skinless when helpful). " +
          "portion = short echo of their wording. " +
          "grams = TOTAL grams after converting rough portions " +
          "(servings, breasts, eggs, cups, tbsp, slices, handfuls). " +
          "Defaults: 1 serving/cup milk ≈ 244g; 1 serving/tbsp butter ≈ 14g; " +
          "1 medium cooked chicken breast ≈ 170g; 1 large egg ≈ 50g; 1 slice bread ≈ 28g. " +
          "If fat % is not said for milk, assume whole milk. " +
          "estimated=true unless they gave an exact mass (g/kg/oz/lb). " +
          "If a food has no usable portion, grams: 0. " +
          "Do not invent nutrition numbers.",
      },
      {
        role: "user",
        content: hintLine + "\nMeal description:\n" + description,
      },
    ],
    "gpt-4.1"
  );

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

async function searchUsdaCandidates(apiKey, query) {
  var searchRes = await fetch(
    "https://api.nal.usda.gov/fdc/v1/foods/search?api_key=" + encodeURIComponent(apiKey),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: query,
        pageSize: 25,
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
  var out = [];
  for (var i = 0; i < foods.length; i++) {
    var food = foods[i];
    var per100 = extractPer100(food);
    if (!per100) continue;
    out.push({
      fdcId: food.fdcId,
      description: String(food.description || query).trim().slice(0, 140),
      dataType: String(food.dataType || ""),
      per100: per100,
    });
    if (out.length >= 15) break;
  }
  return out;
}

async function chooseUsdaMatches(originalDescription, candidateSets) {
  var payload = candidateSets.map(function (row, index) {
    return {
      index: index,
      label: row.item.label,
      portion: row.item.portion,
      query: row.item.query,
      grams: row.item.grams,
      candidates: row.candidates.map(function (c) {
        return {
          fdcId: c.fdcId,
          description: c.description,
          dataType: c.dataType,
          per100kcal: Math.round(c.per100.calories),
        };
      }),
    };
  });

  var chosen = await openaiJson(
    [
      {
        role: "system",
        content:
          "You choose the best USDA FoodData Central entry for each food the user ate. " +
          "Think like a careful human coach reading a food diary. " +
          "Use the user's original wording and common sense: " +
          "milk → drinking milk (usually whole/fluid cow's milk), NEVER ricotta/cheese/yogurt unless said; " +
          "butter → butter, not buttermilk; " +
          "chicken breast → plain chicken breast meat, not breaded/nuggets/lunchmeat unless said; " +
          "prefer simple whole-food SR Legacy/Foundation entries over desserts, powders, baby food, or flavored variants. " +
          "Return JSON only: {\"picks\":[{\"index\":0,\"fdcId\":123,\"why\":\"short\"}]}. " +
          "Every index must appear once. fdcId MUST be one of the provided candidates.",
      },
      {
        role: "user",
        content:
          "Original meal text:\n" +
          originalDescription +
          "\n\nChoose one USDA match per item:\n" +
          JSON.stringify(payload),
      },
    ],
    "gpt-4.1"
  );

  var picksArr = Array.isArray(chosen.picks) ? chosen.picks : [];
  var byIndex = {};
  for (var i = 0; i < picksArr.length; i++) {
    var p = picksArr[i];
    if (p && p.index != null) byIndex[Number(p.index)] = Number(p.fdcId);
  }

  return candidateSets.map(function (row, index) {
    var id = byIndex[index];
    var ok = row.candidates.some(function (c) {
      return Number(c.fdcId) === Number(id);
    });
    return ok ? id : row.candidates[0].fdcId;
  });
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
