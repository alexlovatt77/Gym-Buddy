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
  var prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return res.status(400).json({ error: "Send a prompt string." });
  }
  if (prompt.length > 4000) {
    prompt = prompt.slice(0, 4000);
  }

  try {
    var openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You are a concise personal gym coach for Gym Buddy. Give short, practical advice. No fluff.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    var data = await openaiRes.json();
    if (!openaiRes.ok) {
      return res.status(500).json({
        error: (data && data.error && data.error.message) || "OpenAI request failed.",
      });
    }

    var reply =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
        ? String(data.choices[0].message.content).trim()
        : "";

    return res.status(200).json({ reply: reply });
  } catch (err) {
    return res.status(500).json({ error: "Could not reach OpenAI." });
  }
};
