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

  if (!description) {
    return res.status(400).json({ error: "Describe what you ate (portions are fine)." });
  }
  if (description.length > 2000) {
    description = description.slice(0, 2000);
  }

  var allowedCategories = ["breakfast", "lunch", "dinner", "snack", "dessert"];
  if (allowedCategories.indexOf(categoryHint) === -1) {
    return res.status(400).json({ error: "Pick a category." });
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
              "You are a careful personal nutrition coach logging one person's meals. " +
              "Respond exactly like a sharp human coach would if they said what they ate in chat: " +
              "use common sense, typical restaurant/home portions, and your nutrition knowledge. " +
              "Do NOT call databases, USDA, barcodes, or brands unless the user named a brand. " +
              "Interpret casually: 'milk' = drinking milk (assume whole if unspecified); " +
              "'butter' = butter not buttermilk; 'chicken breast' = plain cooked breast not breaded. " +
              "Rough portions are fine (servings, breasts, cups, handfuls). Convert them yourself. " +
              "Return JSON only with keys: " +
              "name (short meal title), " +
              "calories (integer kcal total), protein (integer g), fat (integer g), carbs (integer g), " +
              "confidence (low|medium|high), " +
              "items (array of {label, portion, grams, matched, calories, protein, fat, carbs}). " +
              "For each item: portion echoes what they said; grams is your assumed edible weight; " +
              "matched is a short plain-English food note (NOT a database id), e.g. 'whole milk, ~1 cup'. " +
              "Item macros must sum approximately to the totals. " +
              "Do not invent foods they did not mention. Do not return a category.",
          },
          {
            role: "user",
            content:
              "Category (already chosen by user, do not change): " +
              categoryHint +
              "\nWhat they ate:\n" +
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
      return res.status(500).json({ error: "Could not parse meal estimate." });
    }

    var items = Array.isArray(parsed.items) ? parsed.items : [];
    var lookedUp = items
      .map(function (item) {
        return {
          label: String((item && item.label) || "").trim().slice(0, 80) || "Food",
          portion: String((item && item.portion) || (item && item.label) || "").trim().slice(0, 80),
          grams: Math.max(0, Math.round(Number(item && item.grams) || 0)),
          estimated: true,
          matched: String((item && item.matched) || (item && item.label) || "").trim().slice(0, 140),
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

    if (!calories && lookedUp.length) {
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

    if (!calories && !lookedUp.length) {
      return res.status(400).json({
        error: "Could not estimate that meal. Try adding a rough portion.",
      });
    }

    var confidence = String(parsed.confidence || "medium").toLowerCase();
    if (["low", "medium", "high"].indexOf(confidence) === -1) confidence = "medium";

    var meal = {
      name: String(parsed.name || description).trim().slice(0, 80) || "Meal",
      category: categoryHint,
      calories: calories,
      protein: protein,
      fat: fat,
      carbs: carbs,
      confidence: confidence,
      source: "coach",
      items: lookedUp,
    };

    return res.status(200).json({ meal: meal });
  } catch (err) {
    return res.status(500).json({ error: "Could not reach OpenAI." });
  }
};
