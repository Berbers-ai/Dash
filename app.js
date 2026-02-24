const $ = (sel) => document.querySelector(sel);

const fmtTime = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleTimeString("nl-NL",{hour:"2-digit",minute:"2-digit"});
};
const fmtDate = (d) => d.toLocaleDateString("nl-NL",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
const fmtPct = (n) => (n==null || isNaN(n)) ? "—" : (n>0?"+":"") + Number(n).toFixed(2) + "%";
const fmtNum = (n, digits=2) => (n==null || isNaN(n)) ? "—" : Number(n).toFixed(digits);

function setGreetingAndDate(){
  const now = new Date();
  const h = now.getHours();
  let greet = "Goedemorgen";
  if (h>=12 && h<18) greet = "Goedemiddag";
  else if (h>=18 && h<23) greet = "Goedenavond";
  else if (h>=23 || h<5) greet = "Goedennacht";
  $("#greeting").textContent = greet;
  $("#dateNow").textContent = fmtDate(now) + " • " + now.toLocaleTimeString("nl-NL",{hour:"2-digit",minute:"2-digit"});
}

const LOCATION = {
  name: "Amsterdam",
  lat: 52.3676,
  lon: 4.9041,
  tz: "Europe/Amsterdam"
};

let NEWS_SOURCES = [];
let NEWS_CACHE = {};
let activeNewsKey = null;

async function apiJSON(url){
  const r = await fetch(url, { cache:"no-store" });
  const j = await r.json().catch(()=> ({}));
  if(!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

function renderNewsTabs(){
  const tabs = $("#newsTabs");
  tabs.innerHTML = "";
  NEWS_SOURCES.forEach(src => {
    const b = document.createElement("div");
    b.className = "tab" + (src.key===activeNewsKey ? " active" : "");
    b.textContent = src.label;
    b.onclick = () => selectNews(src.key);
    tabs.appendChild(b);
  });
}

function renderNewsList(){
  const list = $("#newsList");
  const src = NEWS_SOURCES.find(s=>s.key===activeNewsKey);
  const data = NEWS_CACHE[activeNewsKey];

  if(!src){ list.innerHTML = `<div class="muted">Geen bronnen.</div>`; return; }

  if(!data){
    list.innerHTML = `<div class="muted">Laden…</div>`;
    return;
  }
  if(data.error){
    list.innerHTML = `
      <div class="muted">
        Deze bron kon niet geladen worden.
        <a href="${src.site}" target="_blank" rel="noreferrer">Open site</a><br/>
        <span class="small">${data.error}</span>
      </div>`;
    return;
  }
  const items = (data.items || []).slice(0,10);
  if(items.length===0){
    list.innerHTML = `<div class="muted">Geen items gevonden. <a href="${src.site}" target="_blank" rel="noreferrer">Open site</a></div>`;
    return;
  }
  list.innerHTML = items.map(it => `
    <div class="item">
      <div>
        <div class="title"><a href="${it.link}" target="_blank" rel="noreferrer">${it.title}</a></div>
      </div>
      <div class="time">${fmtTime(it.publishedAt)}</div>
    </div>
  `).join("");
}

async function loadAllNews(){
  $("#newsStatus").textContent = "laden…";
  await Promise.all(NEWS_SOURCES.map(async (src)=>{
    try{
      const j = await apiJSON(`/api/news?source=${encodeURIComponent(src.key)}`);
      NEWS_CACHE[src.key] = { items: j.items };
    }catch(e){
      NEWS_CACHE[src.key] = { error: e.message || String(e) };
    }
  }));
  $("#newsStatus").textContent = "bijgewerkt";
  renderNewsList();
}

function selectNews(key){
  activeNewsKey = key;
  renderNewsTabs();
  renderNewsList();
}

function wcodeToText(code){
  const map = {
    0:"Helder",1:"Meestal helder",2:"Deels bewolkt",3:"Bewolkt",
    45:"Mist",48:"Rijp-mist",
    51:"Lichte motregen",53:"Motregen",55:"Zware motregen",
    61:"Lichte regen",63:"Regen",65:"Zware regen",
    71:"Lichte sneeuw",73:"Sneeuw",75:"Zware sneeuw",
    80:"Lichte buien",81:"Buien",82:"Hevige buien",
    95:"Onweer",96:"Onweer met hagel",99:"Zwaar onweer met hagel"
  };
  return map[code] || "Weer";
}

async function loadWeather(){
  $("#weatherLoc").textContent = LOCATION.name;
  $("#weatherErr").classList.remove("show");
  try{
    const j = await apiJSON(`/api/weather?lat=${LOCATION.lat}&lon=${LOCATION.lon}&tz=${encodeURIComponent(LOCATION.tz)}`);
    const c = j.current || {};
    $("#tempNow").textContent = (c.temperatureC==null ? "—°" : `${Math.round(c.temperatureC)}°`);
    $("#apparentNow").textContent = (c.apparentC==null ? "—°" : `${Math.round(c.apparentC)}°`);
    $("#precipNow").textContent = (c.precipitationMm==null ? "—" : `${fmtNum(c.precipitationMm,1)} mm`);
    $("#windNow").textContent = (c.windKmh==null ? "—" : `${fmtNum(c.windKmh,0)} km/u`);
    $("#cloudNow").textContent = (c.cloudPct==null ? "—" : `${fmtNum(c.cloudPct,0)}%`);
    $("#weatherSummary").textContent = wcodeToText(c.weatherCode);
    $("#weatherUpdated").textContent = c.time ? ("Update: " + c.time.replace("T"," ")) : "";

    const alerts = j.alerts || [];
    const box = $("#alertsBox");
    const ul = $("#alertsList");
    ul.innerHTML = "";
    if(alerts.length){
      alerts.forEach(a=>{
        const li = document.createElement("li");
        li.innerHTML = `<a target="_blank" rel="noreferrer" href="${a.link}">${a.title}</a>`;
        ul.appendChild(li);
      });
      box.classList.add("show");
    }else{
      box.classList.remove("show");
    }
  }catch(e){
    $("#weatherErr").textContent = `Weer kon niet geladen worden: ${e.message || String(e)}`;
    $("#weatherErr").classList.add("show");
    $("#weatherSummary").textContent = "—";
    $("#alertsBox").classList.remove("show");
  }
}

function renderMoverList(el, quotes){
  el.innerHTML = (quotes || []).map(q=>{
    const pc = q.changePct;
    const cls = pc>=0 ? "good" : "bad";
    return `
      <div class="quote">
        <div class="qname" title="${q.name}">${q.name}</div>
        <div class="qmeta">
          <div class="qpx">${fmtNum(q.price,2)}</div>
          <div class="qpc ${cls}">${fmtPct(pc)}</div>
        </div>
      </div>
    `;
  }).join("");
}

async function loadStocks(){
  $("#stocksStatus").textContent = "laden…";
  $("#stocksErr").classList.remove("show");
  try{
    const j = await apiJSON("/api/stocks");
    const aex = j.aex;
    if(aex){
      $("#aexPrice").textContent = fmtNum(aex.price,2);
      const pc = aex.changePct;
      const chgEl = $("#aexChg");
      chgEl.textContent = `${fmtPct(pc)} • ${fmtNum(aex.change,2)}`;
      chgEl.classList.toggle("good", pc>=0);
      chgEl.classList.toggle("bad", pc<0);
    }
    renderMoverList($("#gainers"), j.gainers);
    renderMoverList($("#losers"), j.losers);
    $("#stocksStatus").textContent = "bijgewerkt";
  }catch(e){
    $("#stocksErr").textContent = `Beursdata kon niet geladen worden: ${e.message || String(e)}`;
    $("#stocksErr").classList.add("show");
    $("#stocksStatus").textContent = "fout";
  }
}

async function loadPodcasts(){
  $("#podStatus").textContent = "laden…";
  $("#podErr").classList.remove("show");
  $("#podList").innerHTML = "";
  try{
    const j = await apiJSON("/api/podcasts");
    const items = j.items || [];
    if(!items.length){
      $("#podErr").textContent = "Geen afleveringen gevonden.";
      $("#podErr").classList.add("show");
      $("#podStatus").textContent = "—";
      return;
    }
    $("#podList").innerHTML = items.map(ep=>{
      const d = ep.publishedAt ? new Date(ep.publishedAt).toLocaleString("nl-NL",{weekday:"short",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}) : "—";
      const audio = ep.audioUrl ? `<audio controls preload="none" src="${ep.audioUrl}"></audio>` : `<div class="small muted">Geen audiobestand gevonden (wel link).</div>`;
      return `
        <div class="pod">
          <div class="podTop">
            <div>
              <p class="podTitle">${ep.podcastTitle}</p>
              <p class="podEp"><a href="${ep.link}" target="_blank" rel="noreferrer">${ep.episodeTitle}</a></p>
              <div class="small muted">${d}</div>
            </div>
            <div class="pill">nieuw</div>
          </div>
          ${audio}
        </div>
      `;
    }).join("");
    $("#podStatus").textContent = "bijgewerkt";
  }catch(e){
    $("#podErr").textContent = `Podcasts konden niet geladen worden: ${e.message || String(e)}`;
    $("#podErr").classList.add("show");
    $("#podStatus").textContent = "fout";
  }
}

async function init(){
  setGreetingAndDate();
  setInterval(setGreetingAndDate, 30_000);

  const cfg = await apiJSON("/api/config");
  NEWS_SOURCES = cfg.newsSources || [];
  activeNewsKey = NEWS_SOURCES[0]?.key || null;
  renderNewsTabs();
  renderNewsList();

  await Promise.allSettled([
    loadAllNews(),
    loadWeather(),
    loadStocks(),
    loadPodcasts()
  ]);
}

init();
