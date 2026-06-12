/* ========================================================
   РАДАР МОСБИРЖИ — главная логика
   Данные: MOEX ISS API (бесплатный, без ключей)
   https://iss.moex.com/iss/reference/
   ======================================================== */

const ISS = "https://iss.moex.com/iss";
const REFRESH_MS = 60_000;

// Названия секторов и заметки для популярных тикеров (статический слой поверх живых данных)
const META = {
  SBER:  { sector:"Финансы",        note:"Крупнейший банк РФ. Бенефициар снижения ставки ЦБ." },
  SBERP: { sector:"Финансы",        note:"Привилегированные акции Сбербанка." },
  LKOH:  { sector:"Нефть и газ",    note:"Лучший частный нефтяник: низкий долг, стабильные дивиденды 2 раза в год." },
  GAZP:  { sector:"Нефть и газ",    note:"Газовая монополия. Дивиденды под вопросом, высокий долг." },
  ROSN:  { sector:"Нефть и газ",    note:"Госнефть. Проект Восток Ойл. Дивиденды ~50% прибыли." },
  TATN:  { sector:"Нефть и газ",    note:"Высокая дивдоходность, консервативное управление." },
  NVTK:  { sector:"Нефть и газ",    note:"СПГ-экспортёр. Арктик СПГ-2 возобновил отгрузки." },
  SNGSP: { sector:"Нефть и газ",    note:"Валютная кубышка ~$60 млрд. Дивиденды зависят от курса рубля." },
  SIBN:  { sector:"Нефть и газ",    note:"Нефтяная дочка Газпрома. Щедрые дивиденды ~12%." },
  YDEX:  { sector:"Технологии",     note:"Монополия в поиске. Акция роста, дивидендов нет." },
  HEAD:  { sector:"Технологии",     note:"Монополия рынка труда. Байбэк 25% free-float." },
  OZON:  { sector:"E-commerce",     note:"GMV растёт >40% г/г. Пока убыточен." },
  MTSS:  { sector:"Телеком",        note:"Дивиденд 35₽ зафиксирован. Но платит больше прибыли — риск." },
  RTKM:  { sector:"Телеком",        note:"Ростелеком. Госкомпания, планы IPO дочек." },
  PLZL:  { sector:"Золото",         note:"Золото на рекордах. Лучший рост 2025 года (+71%)." },
  GMKN:  { sector:"Металлы",        note:"Никель и палладий. Дивиденды за 2025 отменены." },
  CHMF:  { sector:"Металлургия",    note:"Сталь. Дивиденды приостановлены, акции на минимумах." },
  NLMK:  { sector:"Металлургия",    note:"Сохранил экспорт лучше других. Дивидендов пока нет." },
  MAGN:  { sector:"Металлургия",    note:"ММК. Самый слабый из тройки металлургов сейчас." },
  ALRS:  { sector:"Металлы",        note:"Алмазы. Санкции + слабый мировой спрос." },
  PHOR:  { sector:"Удобрения",      note:"Платит >75% FCF. Бенефициар слабого рубля." },
  X5:    { sector:"Ритейл",         note:"Пятёрочка и Перекрёсток. Фаворит дивидендного сезона." },
  MGNT:  { sector:"Ритейл",         note:"Прибыль упала вдвое в Q1 2026. Рейтинг понижен." },
  IRAO:  { sector:"Энергетика",     note:"~450 млрд₽ кэша на балансе. Дивдоходность ~10%." },
  HYDR:  { sector:"Энергетика",     note:"Гидроэнергетика. Тарифы растут медленнее инфляции." },
  FEES:  { sector:"Энергетика",     note:"Россети. Сетевая монополия." },
  TRNFP: { sector:"Инфраструктура", note:"Нефтепроводы. Тарифная модель, дивдоходность ~15%." },
  AFLT:  { sector:"Авиация",        note:"Дивиденд 5.29₽. Государство продаёт 23.76% акций." },
  VTBR:  { sector:"Финансы",        note:"Госбанк. Допэмиссии размывают акционеров." },
  T:     { sector:"Финансы",        note:"Т-Технологии. Растущий необанк, байбэк 10% free-float." },
  SVCB:  { sector:"Финансы",        note:"Совкомбанк. Универсальный частный банк." },
  MOEX:  { sector:"Финансы",        note:"Сама биржа. Зарабатывает на оборотах и остатках." },
  AFKS:  { sector:"Холдинг",        note:"Владеет МТС, Сегежей, агро. Высокий долг холдинга." },
  SMLT:  { sector:"Недвижимость",   note:"Девелопер. Высокая ставка давит на продажи." },
  PIKK:  { sector:"Недвижимость",   note:"ПИК. Долговая нагрузка, дивидендов нет." },
  RENI:  { sector:"Финансы",        note:"Страхование. Бенефициар снижения ставки." },
};

/* ===== ЛОГОТИПЫ =====
   Публичный CDN брендов (по ISIN). Если лого не загрузилось —
   фолбэк на цветной аватар с буквами тикера (onerror в renderLogo). */
const LOGO_CDN = isin => isin ? `https://invest-brands.cdn-tinkoff.ru/${isin}x160.png` : null;

const AVATAR_COLORS = ["#4fc3f7","#26d991","#f5c542","#a78bfa","#fb923c","#f05656","#34d3c3","#e879a8"];
function avatarColor(ticker) {
  let h = 0;
  for (const ch of ticker) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function renderLogo(s, size = 36) {
  const color = avatarColor(s.ticker);
  const letters = s.ticker.slice(0, 2);
  const fallback = `<div class="logo-fallback" style="width:${size}px;height:${size}px;background:${color}22;color:${color};font-size:${size*0.32}px">${letters}</div>`;
  const url = LOGO_CDN(s.isin);
  if (!url) return fallback;
  return `<div class="logo-wrap" style="width:${size}px;height:${size}px">
    <img src="${url}" alt="" loading="lazy" width="${size}" height="${size}"
      onerror="this.parentElement.innerHTML='${letters}';this.parentElement.className='logo-fallback';this.parentElement.style.cssText+='background:${color}22;color:${color};font-size:${size*0.32}px'">
  </div>`;
}

/* ===== РОБО-ПОМОЩНИК: модельные данные =====
   quality 1-5: устойчивость бизнеса и выплат
   divYield: ориентир дивдоходности %, 0 = роста-акция
   role: краткое объяснение зачем в портфеле */
const ADVISOR_POOL = {
  // тикер: { q=качество, dy=дивдоходность, profile: в какие профили входит, role }
  LKOH:  { q:5, dy:10.5, profiles:["cons","bal","agg"], role:"Якорь портфеля: лучший частный нефтяник, низкий долг, дивиденды дважды в год даже в кризис." },
  SBER:  { q:5, dy:10.5, profiles:["cons","bal","agg"], role:"Главный бенефициар снижения ставки ЦБ: дивиденд ~10% плюс переоценка тела при смягчении ДКП." },
  TATN:  { q:4, dy:13.5, profiles:["cons","bal","agg"], role:"Высокая дивдоходность 13-14% при консервативном управлении. Доходная нефтяная позиция." },
  SIBN:  { q:4, dy:12.0, profiles:["bal","agg"],        role:"Эффективность частника при господдержке. Дивиденды ~12% без газовых проблем материнского Газпрома." },
  X5:    { q:4, dy:15.0, profiles:["cons","bal","agg"], role:"Защита от инфляции: ритейл перекладывает рост цен на покупателя. Дивдоходность ~15%." },
  IRAO:  { q:4, dy:10.0, profiles:["cons","bal"],       role:"Энергетика для диверсификации. Кубышка ~450 млрд ₽ на балансе, потенциал роста выплат." },
  MTSS:  { q:3, dy:15.4, profiles:["bal","agg"],        role:"Максимальный дивиденд рынка (35₽, ~15%). Риск: платит больше прибыли — держим долю небольшой." },
  TRNFP: { q:4, dy:14.5, profiles:["cons","bal"],       role:"Монополия нефтепроводов: тарифная модель не зависит от цен на нефть. Дивиденды ~15%." },
  PHOR:  { q:4, dy:5.5,  profiles:["bal","agg"],        role:"Удобрения: глобальный спрос + слабый рубль = рост выручки. Платит >75% свободного денежного потока." },
  PLZL:  { q:4, dy:2.6,  profiles:["agg"],              role:"Золото на исторических рекордах. Защитный актив + лучший рост 2025 года (+71%)." },
  HEAD:  { q:4, dy:7.5,  profiles:["agg"],              role:"Монополия рынка труда, байбэк 25% free-float. Рост + дивиденды." },
  YDEX:  { q:4, dy:0,    profiles:["agg"],              role:"Акция роста: монополия в поиске, прибыльные Такси и Маркет. Ставка на переоценку." },
  T:     { q:3, dy:4.0,  profiles:["agg"],              role:"Растущий необанк с байбэком. Сильный апсайд при снижении ставки." },
  NVTK:  { q:3, dy:5.0,  profiles:["agg"],              role:"СПГ-экспортёр: Арктик СПГ-2 возобновил отгрузки, +15% с начала года." },
};

const PROFILES = {
  cons: { label:"Консервативный", desc:"Максимум надёжности: только качественные дивидендные фишки. Подходит для первых шагов.", icon:"🛡" },
  bal:  { label:"Сбалансированный", desc:"Баланс дохода и роста: дивидендные лидеры + умеренный риск.", icon:"⚖️" },
  agg:  { label:"Агрессивный", desc:"Ставка на рост: акции роста + высокодоходные. Выше волатильность.", icon:"🚀" },
};

/* Жадный аллокатор с учётом лотов */
function buildPortfolio(budget, profile) {
  const candidates = Object.entries(ADVISOR_POOL)
    .filter(([t, m]) => m.profiles.includes(profile))
    .map(([t, m]) => ({ ticker: t, ...m, live: stocks.find(s => s.ticker === t) }))
    .filter(c => c.live && c.live.price > 0);

  if (!candidates.length) return null;

  // сортируем по качеству, потом по доходности
  candidates.sort((a, b) => b.q - a.q || b.dy - a.dy);

  // целевые веса: качество^2 как базовый вес
  const totalW = candidates.reduce((s, c) => s + c.q * c.q, 0);
  candidates.forEach(c => c.targetShare = (c.q * c.q) / totalW);

  // первый проход: покупаем лоты под целевые суммы
  let cash = budget;
  const positions = [];
  for (const c of candidates) {
    const lotPrice = c.live.price * c.live.lot;
    if (lotPrice > budget) continue; // лот не влезает в бюджет вообще
    const target = budget * c.targetShare;
    let lots = Math.floor(target / lotPrice);
    if (lots === 0 && lotPrice <= cash && positions.length < 3) lots = 1; // топовые позиции стараемся включить
    if (lots === 0) continue;
    const cost = lots * lotPrice;
    if (cost > cash) continue;
    cash -= cost;
    positions.push({ ...c, lots, lotPrice, cost, shares: lots * c.live.lot });
  }

  // второй проход: докупаем лоты пока есть кэш (по приоритету качества)
  let changed = true;
  while (changed && cash > 0) {
    changed = false;
    for (const p of positions) {
      if (p.lotPrice <= cash && (p.cost + p.lotPrice) / budget < p.targetShare + 0.12) {
        p.lots += 1;
        p.shares += p.live.lot;
        p.cost += p.lotPrice;
        cash -= p.lotPrice;
        changed = true;
      }
    }
  }

  // ещё кандидаты на остаток
  for (const c of candidates) {
    if (positions.find(p => p.ticker === c.ticker)) continue;
    const lotPrice = c.live.price * c.live.lot;
    if (lotPrice <= cash) {
      cash -= lotPrice;
      positions.push({ ...c, lots:1, lotPrice, cost: lotPrice, shares: c.live.lot });
    }
  }

  const invested = budget - cash;
  const wAvgYield = invested ? positions.reduce((s,p) => s + p.dy * p.cost, 0) / invested : 0;

  return { positions, invested, cash, wAvgYield, budget };
}

// Дивидендный календарь (статические ориентиры, лето 2026)
const DIVIDENDS = [
  { ticker:"SBER",  date:"Июль 2026",   amt:"~34 ₽",   yield:"10–11%" },
  { ticker:"MTSS",  date:"09.07.2026",  amt:"35 ₽",    yield:"15.4%" },
  { ticker:"AFLT",  date:"16.07.2026",  amt:"5.29 ₽",  yield:"12.1%" },
  { ticker:"TATN",  date:"Июль 2026",   amt:"~90 ₽",   yield:"13–14%" },
  { ticker:"X5",    date:"Июль 2026",   amt:"~500 ₽",  yield:"~15%" },
  { ticker:"SIBN",  date:"Июль 2026",   amt:"~70 ₽",   yield:"~12%" },
  { ticker:"TRNFP", date:"Лето 2026",   amt:"~192 ₽",  yield:"~15%" },
  { ticker:"HEAD",  date:"28.09.2026",  amt:"~211 ₽",  yield:"7–8%" },
  { ticker:"LKOH",  date:"Осень 2026",  amt:"~300 ₽",  yield:"~5.5%" },
  { ticker:"PHOR",  date:"Осень 2026",  amt:"~360 ₽",  yield:"5–6%" },
];

// ===== STATE =====
let stocks = [];          // [{ticker, name, price, change, value}]
let bonds = [];
let watchlist = JSON.parse(localStorage.getItem("watchlist") || "[]");
let currentView = "stocks";
let searchQuery = "";
let sortMode = "value";
let rsiCache = {};        // ticker -> { rsi, candles, ts }

// ===== HELPERS =====
const $ = sel => document.querySelector(sel);
const fmt = n => n == null ? "—" : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n);
const fmtVol = v => {
  if (v == null) return "";
  if (v >= 1e9) return (v/1e9).toFixed(1) + " млрд ₽";
  if (v >= 1e6) return (v/1e6).toFixed(0) + " млн ₽";
  return fmt(v) + " ₽";
};

function saveWatchlist() {
  localStorage.setItem("watchlist", JSON.stringify(watchlist));
}

// ===== MOEX API =====
async function fetchStocks() {
  const url = `${ISS}/engines/stock/markets/shares/boards/TQBR/securities.json?iss.meta=off&iss.only=securities,marketdata&securities.columns=SECID,SHORTNAME,PREVPRICE,LOTSIZE,ISIN&marketdata.columns=SECID,LAST,LASTTOPREVPRICE,VALTODAY`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("MOEX API error " + res.status);
  const data = await res.json();

  const names = {};
  data.securities.data.forEach(([secid, shortname, prev, lot, isin]) => {
    names[secid] = { name: shortname, prev, lot: lot || 1, isin };
  });

  const out = [];
  data.marketdata.data.forEach(([secid, last, chg, val]) => {
    const meta = names[secid];
    if (!meta) return;
    const price = last ?? meta.prev;
    if (!price || !val || val < 1e6) return; // только ликвидные
    out.push({
      ticker: secid,
      name: meta.name,
      price,
      change: chg ?? 0,
      value: val,
      lot: meta.lot,
      isin: meta.isin,
    });
  });
  return out;
}

async function fetchImoex() {
  const url = `${ISS}/engines/stock/markets/index/boards/SNDX/securities/IMOEX.json?iss.meta=off&iss.only=marketdata&marketdata.columns=LASTVALUE,LASTCHANGEPRC`;
  const res = await fetch(url);
  const data = await res.json();
  const row = data.marketdata.data[0];
  return row ? { value: row[0], change: row[1] } : null;
}

async function fetchBonds() {
  // ОФЗ торгуются на board TQOB
  const url = `${ISS}/engines/stock/markets/bonds/boards/TQOB/securities.json?iss.meta=off&iss.only=securities,marketdata&securities.columns=SECID,SHORTNAME,PREVPRICE,COUPONPERCENT,MATDATE&marketdata.columns=SECID,LAST,YIELD`;
  const res = await fetch(url);
  const data = await res.json();

  const info = {};
  data.securities.data.forEach(([secid, name, prev, coupon, mat]) => {
    info[secid] = { name, prev, coupon, mat };
  });

  const out = [];
  data.marketdata.data.forEach(([secid, last, yld]) => {
    const m = info[secid];
    if (!m || !m.name?.startsWith("ОФЗ")) return;
    out.push({
      ticker: secid,
      name: m.name,
      price: last ?? m.prev,
      yield: yld,
      coupon: m.coupon,
      maturity: m.mat,
    });
  });
  out.sort((a,b) => (a.maturity||"").localeCompare(b.maturity||""));
  return out;
}

async function fetchCandles(ticker) {
  const from = new Date(Date.now() - 100 * 864e5).toISOString().slice(0,10);
  const url = `${ISS}/engines/stock/markets/shares/securities/${ticker}/candles.json?iss.meta=off&interval=24&from=${from}&candles.columns=close`;
  const res = await fetch(url);
  const data = await res.json();
  return data.candles.data.map(r => r[0]).filter(Boolean);
}

// ===== RSI(14) =====
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i-1];
    if (d > 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i-1];
    avgGain = (avgGain * (period-1) + Math.max(d,0)) / period;
    avgLoss = (avgLoss * (period-1) + Math.max(-d,0)) / period;
  }
  if (avgLoss === 0) return 100;
  return Math.round(100 - 100 / (1 + avgGain / avgLoss));
}

// ===== RENDER: STOCKS =====
function renderStocks() {
  const container = currentView === "watchlist" ? $("#watchList") : $("#stocksList");
  let list = [...stocks];

  if (currentView === "watchlist") {
    list = list.filter(s => watchlist.includes(s.ticker));
    if (!list.length) {
      container.innerHTML = `<div class="empty-state"><div class="big">★</div>Избранное пусто.<br>Добавь акции звёздочкой из списка.</div>`;
      return;
    }
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(s => s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
  }

  switch (sortMode) {
    case "value": list.sort((a,b) => b.value - a.value); break;
    case "change-up": list.sort((a,b) => b.change - a.change); break;
    case "change-down": list.sort((a,b) => a.change - b.change); break;
    case "name": list.sort((a,b) => a.ticker.localeCompare(b.ticker)); break;
  }

  if (currentView === "stocks") list = list.slice(0, 60);

  container.innerHTML = list.map(s => {
    const dir = s.change > 0.05 ? "up" : s.change < -0.05 ? "down" : "flat";
    const sign = s.change > 0 ? "+" : "";
    const starred = watchlist.includes(s.ticker);
    return `
      <div class="stock-row" data-ticker="${s.ticker}">
        <button class="star-btn ${starred?"starred":""}" data-star="${s.ticker}">★</button>
        ${renderLogo(s, 36)}
        <div class="stock-info">
          <div class="stock-ticker">${s.ticker}</div>
          <div class="stock-name">${s.name}</div>
          <div class="stock-vol">${fmtVol(s.value)}</div>
        </div>
        <div class="stock-price">${fmt(s.price)} ₽</div>
        <div class="stock-chg ${dir}">${sign}${s.change?.toFixed(2) ?? "0.00"}%</div>
      </div>`;
  }).join("");

  // Listeners
  container.querySelectorAll("[data-star]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      toggleStar(btn.dataset.star);
    });
  });
  container.querySelectorAll(".stock-row").forEach(row => {
    row.addEventListener("click", () => openDetail(row.dataset.ticker));
  });
}

function toggleStar(ticker) {
  const i = watchlist.indexOf(ticker);
  if (i >= 0) watchlist.splice(i, 1);
  else watchlist.push(ticker);
  saveWatchlist();
  renderStocks();
}

// ===== RENDER: DETAIL SHEET =====
async function openDetail(ticker) {
  const s = stocks.find(x => x.ticker === ticker);
  if (!s) return;
  const meta = META[ticker] || {};
  const sheet = $("#sheet");
  const content = $("#sheetContent");

  const dir = s.change > 0 ? "up" : "down";
  const sign = s.change > 0 ? "+" : "";

  content.innerHTML = `
    <div class="detail-head">
      <div style="display:flex;gap:12px;align-items:center">
        ${renderLogo(s, 44)}
        <div>
          <div class="detail-ticker">${s.ticker}</div>
          <div class="detail-name">${s.name}${meta.sector ? " · " + meta.sector : ""}</div>
        </div>
      </div>
      <div>
        <div class="detail-price">${fmt(s.price)} ₽</div>
        <div class="stock-chg ${dir}" style="margin-top:4px">${sign}${s.change?.toFixed(2)}%</div>
      </div>
    </div>
    <div class="metric-grid">
      <div class="metric"><div class="metric-label">Оборот</div><div class="metric-val" style="color:var(--text)">${fmtVol(s.value)}</div></div>
      <div class="metric"><div class="metric-label">RSI(14)</div><div class="metric-val" id="rsiVal" style="color:var(--accent)">…</div></div>
      <div class="metric"><div class="metric-label">Сигнал</div><div class="metric-val" id="rsiSignal" style="color:var(--muted);font-size:11px">…</div></div>
    </div>
    <div class="rsi-bar-wrap">
      <div class="rsi-bar-label"><span>Перепродано &lt;30</span><span>Перекуплено &gt;70</span></div>
      <div class="rsi-track"><div class="rsi-dot" id="rsiDot" style="left:50%"></div></div>
    </div>
    <div class="spark" id="sparkChart"><div class="loader" style="padding:10px;flex:1">Загружаю историю цен…</div></div>
    ${meta.note ? `<div class="sheet-note">💬 ${meta.note}</div>` : ""}
    <div class="sheet-note" style="border:none;padding-top:6px;font-size:10px">Данные MOEX ISS, задержка ~15 мин. Не является инвестрекомендацией.</div>
  `;

  sheet.classList.remove("hidden");

  // Load candles + RSI
  try {
    let cached = rsiCache[ticker];
    if (!cached || Date.now() - cached.ts > 30 * 60_000) {
      const closes = await fetchCandles(ticker);
      cached = { rsi: calcRSI(closes), candles: closes.slice(-40), ts: Date.now() };
      rsiCache[ticker] = cached;
    }
    const { rsi, candles } = cached;

    const rsiEl = $("#rsiVal"), sigEl = $("#rsiSignal"), dot = $("#rsiDot");
    if (rsi != null && rsiEl) {
      rsiEl.textContent = rsi;
      rsiEl.style.color = rsi < 30 ? "var(--green)" : rsi > 70 ? "var(--red)" : "var(--accent)";
      sigEl.textContent = rsi < 30 ? "Перепродано" : rsi < 45 ? "Слабость" : rsi > 70 ? "Перекуплено" : rsi > 55 ? "Сила" : "Нейтрально";
      dot.style.left = Math.min(97, Math.max(3, rsi)) + "%";
    }

    // Sparkline
    const spark = $("#sparkChart");
    if (spark && candles.length) {
      const min = Math.min(...candles), max = Math.max(...candles);
      const range = max - min || 1;
      const up = candles[candles.length-1] >= candles[0];
      spark.innerHTML = candles.map((c, i) => {
        const h = 8 + ((c - min) / range) * 50;
        return `<div class="spark-bar" style="height:${h}px;background:${up?"var(--green)":"var(--red)"};opacity:${0.25 + (i/candles.length)*0.75}"></div>`;
      }).join("");
    }
  } catch (e) {
    const rsiEl = $("#rsiVal");
    if (rsiEl) rsiEl.textContent = "н/д";
  }
}

// ===== RENDER: DIVIDENDS =====
function renderDividends() {
  $("#divList").innerHTML = DIVIDENDS.map(d => `
    <div class="div-row">
      <div class="div-left">
        <div class="div-ticker">${d.ticker}</div>
        <div class="div-date">📅 ${d.date}</div>
      </div>
      <div class="div-right">
        <div class="div-amt">${d.amt}</div>
        <div class="div-yield">${d.yield}</div>
      </div>
    </div>
  `).join("");
}

// ===== RENDER: BONDS =====
function renderBonds() {
  const el = $("#bondsList");
  if (!bonds.length) {
    el.innerHTML = `<div class="loader">Загружаю ОФЗ…</div>`;
    return;
  }
  el.innerHTML = bonds.slice(0, 40).map(b => `
    <div class="div-row">
      <div class="div-left">
        <div class="div-ticker">${b.name}</div>
        <div class="div-date">Погашение: ${b.maturity || "—"} · Купон ${b.coupon ?? "—"}%</div>
      </div>
      <div class="div-right">
        <div class="div-amt">${b.price ? fmt(b.price) + "%" : "—"}</div>
        <div class="div-yield">${b.yield ? b.yield.toFixed(2) + "%" : "—"}</div>
      </div>
    </div>
  `).join("");
}

// ===== IMOEX =====
async function updateImoex() {
  try {
    const idx = await fetchImoex();
    if (!idx || idx.value == null) return;
    $("#imoexVal").textContent = fmt(idx.value);
    const chgEl = $("#imoexChg");
    const sign = idx.change > 0 ? "+" : "";
    chgEl.textContent = `${sign}${idx.change?.toFixed(2)}%`;
    chgEl.className = "chip-chg " + (idx.change >= 0 ? "up" : "down");
  } catch {}
}

// ===== MAIN REFRESH =====
async function refresh() {
  try {
    stocks = await fetchStocks();
    renderStocks();
    $("#lastUpdate").textContent = "обновлено " + new Date().toLocaleTimeString("ru-RU", {hour:"2-digit",minute:"2-digit"});
  } catch (e) {
    $("#lastUpdate").textContent = "офлайн · кэш";
  }
  updateImoex();
}

// ===== РОБО-ПОМОЩНИК =====
let advisorProfile = "bal";

function renderAdvisorResult(result) {
  const out = $("#advisorResult");
  if (!result || !result.positions.length) {
    out.innerHTML = `<div class="empty-state">Не удалось собрать портфель.<br>Попробуй сумму побольше или дождись загрузки котировок.</div>`;
    return;
  }
  const { positions, invested, cash, wAvgYield, budget } = result;
  const yearDiv = Math.round(invested * wAvgYield / 100);

  out.innerHTML = `
    <div class="advisor-summary">
      <div class="metric-grid" style="grid-template-columns:repeat(4,1fr)">
        <div class="metric"><div class="metric-label">Вложено</div><div class="metric-val" style="color:#fff">${fmt(invested)} ₽</div></div>
        <div class="metric"><div class="metric-label">Остаток</div><div class="metric-val" style="color:var(--muted)">${fmt(cash)} ₽</div></div>
        <div class="metric"><div class="metric-label">Дивдоходность</div><div class="metric-val" style="color:var(--green)">~${wAvgYield.toFixed(1)}%</div></div>
        <div class="metric"><div class="metric-label">Дивиденды/год</div><div class="metric-val" style="color:var(--yellow)">~${fmt(yearDiv)} ₽</div></div>
      </div>
      <div class="alloc-bar">
        ${positions.map(p => `<div class="alloc-seg" style="flex:${p.cost};background:${avatarColor(p.ticker)}" title="${p.ticker}"></div>`).join("")}
      </div>
    </div>
    ${positions.map(p => {
      const share = (p.cost / invested * 100).toFixed(0);
      return `
      <div class="advisor-row">
        <div class="advisor-row-head">
          ${renderLogo(p.live, 38)}
          <div class="advisor-row-info">
            <div class="advisor-row-top">
              <span class="stock-ticker">${p.ticker}</span>
              <span class="advisor-share" style="color:${avatarColor(p.ticker)}">${share}%</span>
            </div>
            <div class="stock-name">${p.live.name}</div>
          </div>
          <div class="advisor-row-nums">
            <div class="advisor-cost">${fmt(p.cost)} ₽</div>
            <div class="advisor-lots">${p.shares} шт (${p.lots} ${p.lots === 1 ? "лот" : p.lots < 5 ? "лота" : "лотов"})</div>
            ${p.dy ? `<div class="advisor-dy">~${p.dy}% дивиденд</div>` : `<div class="advisor-dy" style="color:var(--purple)">акция роста</div>`}
          </div>
        </div>
        <div class="advisor-role">💬 ${p.role}</div>
      </div>`;
    }).join("")}
    <div class="disclaimer" style="margin-top:14px">
      ⚠ Образовательный пример на основе живых цен и лотности Мосбиржи, а не индивидуальная рекомендация.
      Дивиденды — ориентиры, не гарантированы. Перед покупкой проверь данные у брокера.
    </div>
  `;
}

function runAdvisor() {
  const budget = parseInt($("#advisorAmount").value.replace(/\D/g, ""), 10);
  if (!budget || budget < 500) {
    $("#advisorResult").innerHTML = `<div class="empty-state">Введи сумму от 500 ₽</div>`;
    return;
  }
  if (!stocks.length) {
    $("#advisorResult").innerHTML = `<div class="loader">Жду загрузки котировок…</div>`;
    return;
  }
  renderAdvisorResult(buildPortfolio(budget, advisorProfile));
}

document.querySelectorAll(".profile-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".profile-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    advisorProfile = btn.dataset.profile;
    $("#profileDesc").textContent = PROFILES[advisorProfile].desc;
    if ($("#advisorAmount").value) runAdvisor();
  });
});

$("#advisorGo")?.addEventListener("click", runAdvisor);
$("#advisorAmount")?.addEventListener("keydown", e => { if (e.key === "Enter") runAdvisor(); });

// ===== NAVIGATION =====
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    tab.classList.add("active");
    currentView = tab.dataset.view;
    $(`#view-${currentView}`).classList.add("active");

    if (currentView === "dividends") renderDividends();
    if (currentView === "watchlist") renderStocks();
    if (currentView === "bonds" && !bonds.length) {
      fetchBonds().then(b => { bonds = b; renderBonds(); }).catch(() => {
        $("#bondsList").innerHTML = `<div class="empty-state">Не удалось загрузить ОФЗ.<br>Проверь подключение.</div>`;
      });
    }
  });
});

$("#searchInput").addEventListener("input", e => {
  searchQuery = e.target.value.trim();
  renderStocks();
});

$("#sortSelect").addEventListener("change", e => {
  sortMode = e.target.value;
  renderStocks();
});

$("#sheetBackdrop").addEventListener("click", () => $("#sheet").classList.add("hidden"));

// ===== PWA INSTALL =====
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredPrompt = e;
  if (!localStorage.getItem("installDismissed")) {
    $("#installBanner").classList.remove("hidden");
  }
});
$("#installBtn").addEventListener("click", async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  }
  $("#installBanner").classList.add("hidden");
});
$("#installClose").addEventListener("click", () => {
  localStorage.setItem("installDismissed", "1");
  $("#installBanner").classList.add("hidden");
});

// ===== SERVICE WORKER =====
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// ===== START =====
refresh();
setInterval(refresh, REFRESH_MS);
