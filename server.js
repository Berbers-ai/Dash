import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import Parser from "rss-parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const parser = new Parser({
  timeout: 12000,
  headers: {
    "User-Agent": "persoonlijk-dashboard/1.0 (+https://example.local)"
  }
});

// --- Config (edit if you want) ---
const NEWS_SOURCES = {
  nrc:      { label: "NRC",        feed: "https://www.nrc.nl/rss/",                  site: "https://www.nrc.nl/" },
  vk:       { label: "Volkskrant", feed: "https://www.volkskrant.nl/rss.xml",        site: "https://www.volkskrant.nl/" },
  ad:       { label: "AD",         feed: "https://www.ad.nl/rss.xml",                site: "https://www.ad.nl/" },
  parool:   { label: "Parool",     feed: "https://www.parool.nl/rss.xml",            site: "https://www.parool.nl/" },
  nu:       { label: "NU.nl",      feed: "https://www.nu.nl/rss",                    site: "https://www.nu.nl/" },
  rtl:      { label: "RTL",        feed: "https://www.rtl.nl/nieuws/rss.xml",        site: "https://www.rtl.nl/nieuws" },
  nos:      { label: "NOS",        feed: "https://feeds.nos.nl/nosnieuwsalgemeen",   site: "https://nos.nl/" },
  fd:       { label: "FD",         feed: "https://fd.nl/?rss=1",                     site: "https://fd.nl/" },
  quotenet: { label: "Quote",      feed: "https://www.quotenet.nl/rss",              site: "https://www.quotenet.nl/" }
};

const PODCAST_FEEDS = [
  { key:"rest",   title:"The Rest is History",      feed:"https://feeds.acast.com/public/shows/therestishistory" },
  { key:"waweek", title:"Wat een week!",            feed:"https://www.bnr.nl/podcast/wat-een-week/rss" },
  { key:"boeken", title:"Boeken FM",                feed:"https://feeds.transistor.fm/boeken-fm" },
  { key:"contr",  title:"De Nieuwe Contrabas",      feed:"https://feeds.acast.com/public/shows/de-nieuwe-contrabas" },
  { key:"zsim",   title:"Zo Simpel Is het Niet",    feed:"https://rss.art19.com/zo-simpel-is-het-niet" }
];

const AEX = {
  indexSymbol: "^AEX",
  // Common AEX tickers on Yahoo Finance:
  tickers: [
    "AD.AS","ASML.AS","ASM.AS","AKZA.AS","ABN.AS","AGN.AS","BESI.AS","HEIA.AS","IMCD.AS",
    "INGA.AS","KPN.AS","NN.AS","PHIA.AS","PRX.AS","RAND.AS","SHELL.AS","UNA.AS","UMG.AS","WKL.AS","MT.AS"
  ]
};

// --- Helpers ---
function asISO(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

function pickPubDate(item) {
  return item.isoDate || item.pubDate || item.published || item.updated || null;
}

function limit10(arr) {
  return (arr || []).slice(0, 10);
}

function normalizeNewsItems(feed) {
  const items = (feed.items || [])
    .map(it => ({
      title: it.title?.trim() || "",
      link: (it.link || it.guid || "").trim(),
      publishedAt: asISO(pickPubDate(it))
    }))
    .filter(it => it.title && it.link)
    .sort((a,b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
  return limit10(items);
}

function extractAudioUrl(item) {
  // rss-parser commonly yields enclosure.url
  if (item.enclosure?.url) return item.enclosure.url;
  // Some feeds use "itunes:episode" etc; sometimes link points to mp3
  const candidates = [];
  if (typeof item.link === "string") candidates.push(item.link);
  if (typeof item.guid === "string") candidates.push(item.guid);
  // Attempt to find <enclosure> in "content" fields (best-effort)
  const content = `${item.content || ""} ${item["content:encoded"] || ""}`;
  const m = content.match(/https?:\/\/[^"' ]+\.(mp3|m4a|aac)(\?[^"' ]+)?/i);
  if (m) return m[0];
  const mp = candidates.find(u => /\.(mp3|m4a|aac)(\?|$)/i.test(u));
  return mp || null;
}

async function fetchYahooQuotes(symbols) {
  // server-side, no CORS issue
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}`;
  const r = await fetch(url, { headers: { "User-Agent": "persoonlijk-dashboard/1.0" } });
  if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
  const j = await r.json();
  return j?.quoteResponse?.result || [];
}

// --- Static frontend ---
app.use(express.static(path.join(__dirname, "public"), { etag: false, maxAge: 0 }));

// --- APIs ---
app.get("/api/config", (req,res) => {
  res.json({
    newsSources: Object.entries(NEWS_SOURCES).map(([key,v]) => ({ key, label: v.label, site: v.site })),
  });
});

app.get("/api/news", async (req,res) => {
  try{
    const key = String(req.query.source || "").toLowerCase();
    const src = NEWS_SOURCES[key];
    if(!src) return res.status(400).json({ error: "Unknown source", available: Object.keys(NEWS_SOURCES) });

    const feed = await parser.parseURL(src.feed);
    res.json({ source: key, label: src.label, site: src.site, items: normalizeNewsItems(feed) });
  }catch(e){
    res.status(502).json({ error: e?.message || String(e) });
  }
});

app.get("/api/weather", async (req,res) => {
  try{
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const tz = String(req.query.tz || "Europe/Amsterdam");
    if(!isFinite(lat) || !isFinite(lon)) return res.status(400).json({ error: "lat/lon required" });

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,cloud_cover,weather_code&timezone=${encodeURIComponent(tz)}`;
    const r = await fetch(url);
    if(!r.ok) throw new Error(`Open-Meteo HTTP ${r.status}`);
    const data = await r.json();

    const c = data.current || {};
    const current = {
      temperatureC: c.temperature_2m ?? null,
      apparentC: c.apparent_temperature ?? null,
      precipitationMm: c.precipitation ?? null,
      windKmh: c.wind_speed_10m ?? null,
      cloudPct: c.cloud_cover ?? null,
      weatherCode: c.weather_code ?? null,
      time: c.time ?? null
    };

    // Best-effort KNMI warnings (RSS). If it fails, return empty alerts.
    let alerts = [];
    try{
      const knmi = await parser.parseURL("https://www.knmi.nl/nederland-nu/weer/waarschuwingen/rss");
      alerts = (knmi.items || [])
        .map(it => ({
          title: it.title?.trim() || "",
          link: (it.link || "").trim(),
          publishedAt: asISO(pickPubDate(it))
        }))
        .filter(a => a.title && !/geen waarschuwingen/i.test(a.title))
        .slice(0, 5);
    }catch(_){}

    res.json({ current, alerts });
  }catch(e){
    res.status(502).json({ error: e?.message || String(e) });
  }
});

app.get("/api/stocks", async (req,res) => {
  try{
    const idx = await fetchYahooQuotes([AEX.indexSymbol]);
    const indexQ = idx[0] || null;

    const quotes = await fetchYahooQuotes(AEX.tickers);
    const cleaned = quotes
      .filter(q => typeof q.regularMarketChangePercent === "number" && typeof q.regularMarketPrice === "number")
      .sort((a,b) => b.regularMarketChangePercent - a.regularMarketChangePercent);

    const gainers = cleaned.slice(0,5).map(q => ({
      symbol: q.symbol,
      name: q.shortName || q.longName || q.symbol,
      price: q.regularMarketPrice,
      change: q.regularMarketChange,
      changePct: q.regularMarketChangePercent
    }));

    const losers = cleaned.slice(-5).reverse().map(q => ({
      symbol: q.symbol,
      name: q.shortName || q.longName || q.symbol,
      price: q.regularMarketPrice,
      change: q.regularMarketChange,
      changePct: q.regularMarketChangePercent
    }));

    const aex = indexQ ? {
      symbol: indexQ.symbol,
      price: indexQ.regularMarketPrice,
      change: indexQ.regularMarketChange,
      changePct: indexQ.regularMarketChangePercent,
      time: indexQ.regularMarketTime ? new Date(indexQ.regularMarketTime * 1000).toISOString() : null
    } : null;

    res.json({ aex, gainers, losers });
  }catch(e){
    res.status(502).json({ error: e?.message || String(e) });
  }
});

app.get("/api/podcasts", async (req,res) => {
  try{
    const all = [];

    await Promise.all(PODCAST_FEEDS.map(async (p) => {
      try{
        const feed = await parser.parseURL(p.feed);
        const items = (feed.items || [])
          .map(it => ({
            podcastTitle: p.title,
            episodeTitle: it.title?.trim() || "",
            link: (it.link || it.guid || "").trim(),
            publishedAt: asISO(pickPubDate(it)),
            audioUrl: extractAudioUrl(it)
          }))
          .filter(ep => ep.episodeTitle && (ep.audioUrl || ep.link))
          .slice(0, 10);
        all.push(...items);
      }catch(_){}
    }));

    const top3 = all
      .filter(x => x.publishedAt)
      .sort((a,b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""))
      .slice(0, 3);

    res.json({ items: top3 });
  }catch(e){
    res.status(502).json({ error: e?.message || String(e) });
  }
});

// health
app.get("/api/health", (req,res)=>res.json({ ok:true }));

app.listen(PORT, () => {
  console.log(`Dashboard running on http://localhost:${PORT}`);
});
