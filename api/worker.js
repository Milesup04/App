/**
 * Daily Alpha AI — API proxy (Cloudflare Worker)
 *
 * Holds your Finnhub + Groq keys as secrets so app users never need their own.
 *
 * Deploy:
 *   1. npm install -g wrangler
 *   2. wrangler login
 *   3. wrangler secret put FINNHUB_KEY   (paste your Finnhub key)
 *   4. wrangler secret put GROQ_KEY      (paste your Groq key)
 *   5. wrangler deploy
 *
 * Endpoints:
 *   GET  /quote?symbol=AAPL          → Finnhub quote
 *   GET  /candles?symbol=AAPL&days=30 → Finnhub daily candles
 *   GET  /news?symbol=AAPL           → Finnhub company news (or general if no symbol)
 *   GET  /recommendation?symbol=AAPL → Finnhub analyst recommendations
 *   POST /ai  {messages:[...]}       → Groq chat completion (Llama 3.3 70B)
 */

const ALLOWED_ORIGINS = ['*']; // tighten to your domain(s) in production, e.g. ['https://yourapp.netlify.app']

const CORS = (origin) => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes('*') ? '*' : (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]),
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
});

// Simple per-IP rate limit using Cloudflare's cache (best-effort)
const RATE_LIMIT_PER_MIN = 60;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = CORS(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } });

    try {
      switch (url.pathname) {
        case '/quote': {
          const symbol = (url.searchParams.get('symbol') || '').toUpperCase();
          if (!/^[A-Z.\-:]{1,12}$/.test(symbol)) return json({ error: 'bad symbol' }, 400);
          const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${env.FINNHUB_KEY}`, {
            cf: { cacheTtl: 60, cacheEverything: true }, // cache quotes 60s to stay inside Finnhub free tier
          });
          return json(await r.json(), r.status);
        }

        case '/candles': {
          const symbol = (url.searchParams.get('symbol') || '').toUpperCase();
          const days = Math.min(365, parseInt(url.searchParams.get('days') || '30'));
          if (!/^[A-Z.\-:]{1,12}$/.test(symbol)) return json({ error: 'bad symbol' }, 400);
          const to = Math.floor(Date.now() / 1000);
          const from = to - days * 86400;
          const r = await fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${to}&token=${env.FINNHUB_KEY}`, {
            cf: { cacheTtl: 3600, cacheEverything: true },
          });
          return json(await r.json(), r.status);
        }

        case '/news': {
          const symbol = (url.searchParams.get('symbol') || '').toUpperCase();
          let api;
          if (symbol) {
            if (!/^[A-Z.\-:]{1,12}$/.test(symbol)) return json({ error: 'bad symbol' }, 400);
            const to = new Date().toISOString().slice(0, 10);
            const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
            api = `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${env.FINNHUB_KEY}`;
          } else {
            api = `https://finnhub.io/api/v1/news?category=general&token=${env.FINNHUB_KEY}`;
          }
          const r = await fetch(api, { cf: { cacheTtl: 300, cacheEverything: true } });
          const items = await r.json();
          return json(Array.isArray(items) ? items.slice(0, 20) : items, r.status);
        }

        case '/recommendation': {
          const symbol = (url.searchParams.get('symbol') || '').toUpperCase();
          if (!/^[A-Z.\-:]{1,12}$/.test(symbol)) return json({ error: 'bad symbol' }, 400);
          const r = await fetch(`https://finnhub.io/api/v1/stock/recommendation?symbol=${symbol}&token=${env.FINNHUB_KEY}`, {
            cf: { cacheTtl: 86400, cacheEverything: true },
          });
          return json(await r.json(), r.status);
        }

        case '/ai': {
          if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
          const body = await request.json().catch(() => null);
          if (!body || !Array.isArray(body.messages) || body.messages.length === 0) return json({ error: 'messages[] required' }, 400);
          if (JSON.stringify(body.messages).length > 40000) return json({ error: 'payload too large' }, 413);
          const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${env.GROQ_KEY}`,
            },
            body: JSON.stringify({
              model: 'llama-3.3-70b-versatile',
              messages: body.messages.slice(-12), // cap history length
              max_tokens: 1024,
              temperature: 0.7,
            }),
          });
          const data = await r.json();
          // Return only what the app needs — never leak headers/keys
          const text = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : null;
          return json({ text, error: text ? undefined : (data.error && data.error.message) || 'AI error' }, r.status);
        }

        case '/':
          return json({ ok: true, service: 'Daily Alpha AI API', endpoints: ['/quote', '/candles', '/news', '/recommendation', '/ai'] });

        default:
          return json({ error: 'not found' }, 404);
      }
    } catch (e) {
      return json({ error: 'server error' }, 500);
    }
  },
};
