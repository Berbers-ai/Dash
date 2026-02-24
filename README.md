# Persoonlijk Dashboard

Clean personal dashboard met 4 blokken: Nieuws, Weer, Beurs (AEX + movers), Podcasts.

## Run lokaal

```bash
npm install
npm run dev
# open http://localhost:3000
```

## Deploy (Git)

- Commit deze repo.
- Deploy op een Node host (Render/Fly/Heroku-like/Vercel Node server).
- Zet `PORT` env var indien nodig.

## Config aanpassen

In `server.js`:
- `NEWS_SOURCES` (RSS feeds + sites)
- `PODCAST_FEEDS`
- `AEX` tickers
In `public/app.js`:
- `LOCATION` (lat/lon/naam)

## Notes
- Sommige uitgevers kunnen RSS beperken; pas feed-URL's aan als nodig.
- Yahoo Finance endpoint is onofficieel; als die verandert, moet `/api/stocks` aangepast worden.
