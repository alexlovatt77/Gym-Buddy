# Gym Buddy AI proxy (Vercel)

Tiny serverless endpoint so Gym Buddy can call OpenAI **without putting your API key in the browser**.

## Endpoint

`POST /api/coach`

Body:

```json
{ "prompt": "I finished push day. Give 3 short tips." }
```

Response:

```json
{ "reply": "..." }
```

## Deploy on Vercel

1. Push this `ai-proxy` folder (or the whole Gym App repo) to GitHub.
2. In Vercel: **Add New… → Project** → import the repo.
3. Set **Root Directory** to `ai-proxy` (important if this lives inside Gym App).
4. Deploy.
5. **Settings → Environment Variables**
   - Name: `OPENAI_API_KEY`
   - Value: your OpenAI secret key
   - Environments: Production, Preview, Development
6. **Deployments → … → Redeploy** (so the key is picked up).

## Test

Replace `YOUR_DEPLOYMENT` with your Vercel URL:

```bash
curl -X POST https://YOUR_DEPLOYMENT.vercel.app/api/coach \
  -H "Content-Type: application/json" \
  -d '{"prompt":"I did legs today. Give 2 recovery tips."}'
```

## Security notes

- Never commit the API key.
- Set a monthly spend limit in the OpenAI dashboard.
- CORS is limited to your GitHub Pages origin.
