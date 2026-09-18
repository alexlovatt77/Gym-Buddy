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
    return res.status(400).json({ error: "Describe what you ate." });
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
    var openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You estimate nutrition for a food diary app. " +
              "Given a free-text meal description, return JSON only with keys: " +
              "name (short meal title), category (breakfast|lunch|dinner|snack|dessert), " +
              "calories (integer kcal), protein (integer grams), fat (integer grams), carbs (integer grams), " +
              "confidence (low|medium|high). " +
              "Use reasonable typical portions if amount is vague. " +
              "Do not include markdown or extra keys.",
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

    var category = String(parsed.category || categoryHint || "snack").toLowerCase();
    if (allowedCategories.indexOf(category) === -1) category = "snack";

    var meal = {
      name: String(parsed.name || description).trim().slice(0, 80) || "Meal",
      category: category,
      calories: Math.max(0, Math.round(Number(parsed.calories) || 0)),
      protein: Math.max(0, Math.round(Number(parsed.protein) || 0)),
      fat: Math.max(0, Math.round(Number(parsed.fat) || 0)),
      carbs: Math.max(0, Math.round(Number(parsed.carbs) || 0)),
      confidence: ["low", "medium", "high"].indexOf(parsed.confidence) !== -1 ? parsed.confidence : "medium",
    };

    return res.status(200).json({ meal: meal });
  } catch (err) {
    return res.status(500).json({ error: "Could not reach OpenAI." });
  }
};
