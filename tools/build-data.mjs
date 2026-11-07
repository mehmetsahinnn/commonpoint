#!/usr/bin/env node
/*
  Ortak Nokta hat verisi üretici.

  OpenStreetMap'ten (Overpass) metro, Marmaray, tramvay, füniküler, vapur, Metrobüs ve
  (İstanbul için) tüm otobüs hatlarını indirir, küçük bir JSON'a çevirir ve index.html içindeki
  <script id="ortak-data"> bloğuna gömer. Uygulama sonra hiçbir hat verisi indirmeden açılır.

  Kullanım (Node 18 veya üstü, ek paket gerekmez):
    node tools/build-data.mjs                     tüm şehirler, index.html'e gömer
    node tools/build-data.mjs --city istanbul     yalnızca İstanbul
    node tools/build-data.mjs --embed-only        indirme yok, data/*.json dosyalarını gömer
    node tools/build-data.mjs --html yol/dosya.html --out data

  Seçenekler: --city istanbul|bursa|all   --html <dosya>   --out <klasör>   --embed-only   --reorder   --endpoint <url>
  --reorder: indirme yapmadan data/*.json içindeki otobüs duraklarını yolculuk sırasına dizer ve gömer.
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CITIES = {
  istanbul: { bb: '40.78,27.95,41.62,30.10', bounds: [40.75, 41.62, 27.95, 30.10], buses: true },
  // Bursa'da OSM'de yalnızca 17 otobüs hattı var, eksik ağ sonucu bozar: otobüs alınmaz
  bursa: { bb: '40.00,28.30,40.60,29.55', bounds: [40.00, 40.60, 28.30, 29.55], buses: false },
};
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const ROUTE_MODE = { subway: 'metro', light_rail: 'metro', tram: 'tram', funicular: 'funicular', ferry: 'ferry', train: 'rail', bus: 'bus' };
const MARK = /<script id="ortak-data" type="application\/json">[\s\S]*?<\/script>/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* Overpass genel ya da kimliksiz User-Agent'ları 406 ile reddeder. Betiği tanıtan benzersiz bir User-Agent gönderilir.
   Gerekirse OVERPASS_UA ortam değişkeniyle değiştirilebilir. */
const UA = process.env.OVERPASS_UA || 'ortak-nokta-data/1.0 (+https://github.com/mehmetsahinnn/commonpoint)';
const log = (...a) => console.log(...a);

/* ---------- Overpass ---------- */
const STOP_NODES =
  'node(r.r:"stop");node(r.r:"stop_entry_only");node(r.r:"stop_exit_only");' +
  'node(r.r:"platform");node(r.r:"platform_entry_only");node(r.r:"platform_exit_only");';

const transitQuery = (bb) =>
  '[out:json][timeout:180];(' +
  `rel["route"~"^(subway|light_rail|tram|funicular|ferry)$"](${bb});` +
  `rel["route"="train"]["network"~"Marmaray|Banliy",i](${bb});` +
  `rel["route"="train"]["name"~"Marmaray",i](${bb});` +
  `rel["route"="bus"]["name"~"^Metrob",i](${bb});` +
  `rel["route"="bus"]["network"~"Metrob",i](${bb});` +
  `)->.r;.r out body;(${STOP_NODES});out;`;
const busIdsQuery = (bb) => `[out:json][timeout:180];rel["route"="bus"](${bb});out ids;`;
const batchQuery = (ids) => `[out:json][timeout:180];rel(id:${ids.join(',')})->.r;.r out body;(${STOP_NODES});out;`;

let endpoints = ENDPOINTS;
async function overpass(query, tries = 6) {
  let lastErr = null;
  for (let a = 0; a < tries; a++) {
    const ep = endpoints[a % endpoints.length];
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 240000);
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': UA },
        body: 'data=' + encodeURIComponent(query),
        signal: ctl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        let snip = '';
        try { snip = (await res.text()).replace(/\s+/g, ' ').slice(0, 120); } catch (e) { /* yok say */ }
        const err = new Error('http ' + res.status + (snip ? ' – ' + snip : ''));
        err.status = res.status;
        err.retryAfter = Number(res.headers.get('retry-after')) || 0;
        throw err;
      }
      const j = await res.json();
      if (j.remark && /error|timed out/i.test(j.remark) && !(j.elements && j.elements.length)) throw new Error(j.remark);
      return j;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      const wait = Math.min(60000, Math.max(e.retryAfter ? e.retryAfter * 1000 : 0, (e.status === 429 ? 15000 : 4000) * (a + 1)));
      log(`  uyarı: ${new URL(ep).host} yanıt vermedi (${e.message}), ${Math.round(wait / 1000)} sn sonra tekrar deneniyor`);
      await sleep(wait);
    }
  }
  throw lastErr || new Error('overpass');
}

/* ---------- ayrıştırma (uygulamadaki parseTransit ile aynı mantık) ---------- */
const isMetrobus = (t) => /metrob/i.test(t.network || '') || /^metrob/i.test(t.name || '');
export function parseTransit(j, bounds) {
  const inCity = (la, ln) => la >= bounds[0] && la <= bounds[1] && ln >= bounds[2] && ln <= bounds[3];
  const nodes = new Map();
  const lines = [];
  const stat = { seen: 0, skipped: 0 };
  (j.elements || []).forEach((e) => { if (e.type === 'node') nodes.set(e.id, e); });
  (j.elements || []).forEach((e) => {
    if (e.type !== 'relation') return;
    const t = e.tags || {};
    let mode = ROUTE_MODE[t.route];
    if (!mode) return;
    if (t.route === 'bus' && isMetrobus(t)) mode = 'brt';
    if (t.disused === 'yes' || t.abandoned === 'yes') return;
    stat.seen++;
    const pick = (re) => {
      const out = [];
      (e.members || []).forEach((m) => {
        if (m.type !== 'node' || !re.test(m.role || '')) return;
        const n = nodes.get(m.ref);
        if (!n || !inCity(n.lat, n.lon)) return;
        out.push([Math.round(n.lat * 1e5) / 1e5, Math.round(n.lon * 1e5) / 1e5, (n.tags && (n.tags['name:tr'] || n.tags.name)) || '']);
      });
      return out;
    };
    let s = pick(/^stop/);
    if (s.length < 2) s = pick(/^platform/);
    if (s.length < 2) { stat.skipped++; return; }
    lines.push({ id: e.id, m: mode, n: t.name || '', r: t.ref || '', s });
  });
  return { lines, stat };
}

/* ---------- durak sırası ----------
   OpenStreetMap'te otobüs hatlarının çoğunda durak üyeleri yolculuk sırasında değil, karışık sırada tutuluyor (İstanbul'da hatların
   yaklaşık %79'u). Karışık sırayla ardışık duraklar kilometrelerce uzakta çıkar, hat rastgele duraklar arasında atlar.
   Çözüm: durakları aralarındaki toplam yol en kısa olacak şekilde dizmek (en yakın komşu + 2-opt). Durakların ardışık dizilimi doğru
   yolculuk sırasına çok yakındır. Zaten düzenli olan hatlara dokunulmaz (OSM sırası en kısa yoldan %30'dan fazla uzun değilse korunur).
   Raylı hatlar elle düzenlendiği için sıralanmaz, çünkü kıvrımlı hatlarda (T1 gibi) en kısa yol gerçek sıra değildir. */
const KXS = Math.cos(41 * Math.PI / 180);
const dmeter = (a, b) => Math.hypot((b[1] - a[1]) * KXS, b[0] - a[0]) * 111000;
const pathMeters = (P) => { let t = 0; for (let i = 0; i + 1 < P.length; i++) t += dmeter(P[i], P[i + 1]); return t; };
export function seriate(P) {
  const n = P.length;
  const id = P.map((_, i) => i);
  if (n < 3) return id;
  const D = P.map(() => new Float64Array(n));
  let bi = 0, bj = 1, bd = -1;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const d = dmeter(P[i], P[j]);
    D[i][j] = D[j][i] = d;
    if (d > bd) { bd = d; bi = i; bj = j; }
  }
  let best = id, bl = Infinity;
  for (const st of [bi, bj]) {
    const used = new Uint8Array(n), ord = [st];
    used[st] = 1;
    for (let k = 1; k < n; k++) {
      const l = ord[ord.length - 1];
      let c = -1, cd = Infinity;
      for (let j = 0; j < n; j++) if (!used[j] && D[l][j] < cd) { cd = D[l][j]; c = j; }
      used[c] = 1; ord.push(c);
    }
    let improved = true, rounds = 0;
    while (improved && rounds++ < 80) {
      improved = false;
      for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
        const a = i > 0 ? ord[i - 1] : -1, b = ord[i], c = ord[j], e = j < n - 1 ? ord[j + 1] : -1;
        const before = (a >= 0 ? D[a][b] : 0) + (e >= 0 ? D[c][e] : 0);
        const after = (a >= 0 ? D[a][c] : 0) + (e >= 0 ? D[b][e] : 0);
        if (after < before - 1e-6) { for (let l = i, r = j; l < r; l++, r--) { const t = ord[l]; ord[l] = ord[r]; ord[r] = t; } improved = true; }
      }
    }
    let L = 0;
    for (let i = 0; i + 1 < n; i++) L += D[ord[i]][ord[i + 1]];
    if (L < bl) { bl = L; best = ord.slice(); }
  }
  return best;
}
/* Otobüs hattının duraklarını gerekiyorsa yeniden dizer. Döner: { s, changed } */
export function orderBusStops(s) {
  if (s.length < 3) return { s, changed: false };
  const ord = seriate(s);
  const re = ord.map((i) => s[i]);
  if (pathMeters(s) > pathMeters(re) * 1.3) return { s: re, changed: true };
  return { s, changed: false };
}
export function fixOrder(lines) {
  let changed = 0, buses = 0;
  const out = lines.map((l) => {
    if (l.m !== 'bus') return l;
    buses++;
    const r = orderBusStops(l.s);
    if (!r.changed) return l;
    changed++;
    return Object.assign({}, l, { s: r.s });
  });
  return { lines: out, changed, buses };
}
/* data/<şehir>.json içindeki sıkıştırılmış hatları açar (encode'un tersi) */
export function decode(d) {
  const names = d.names || [];
  return (d.lines || []).map((l) => {
    const f = l.s || [], s = [];
    let la = 0, ln = 0;
    for (let i = 0; i + 2 < f.length; i += 3) { la += f[i]; ln += f[i + 1]; s.push([la / 1e5, ln / 1e5, f[i + 2] >= 0 ? names[f[i + 2]] || '' : '']); }
    return { id: l.id, m: l.m, n: l.n || '', r: l.r || '', s };
  });
}

/* ---------- sıkıştırma: enlem, boylam art arda farklarla (1e5 katı), ad sıra numarasıyla ---------- */
export function encode(city, lines, date) {
  const names = [];
  const idx = new Map();
  const nameIdx = (n) => {
    if (!n) return -1;
    let i = idx.get(n);
    if (i === undefined) { i = names.length; idx.set(n, i); names.push(n); }
    return i;
  };
  const out = lines.map((l) => {
    const f = [];
    let la = 0, ln = 0;
    let prev = null;
    l.s.forEach((p) => {
      const a = Math.round(p[0] * 1e5), b = Math.round(p[1] * 1e5);
      if (prev && prev[0] === a && prev[1] === b) return; // art arda aynı durak
      f.push(a - la, b - ln, nameIdx(p[2]));
      la = a; ln = b; prev = [a, b];
    });
    const o = { m: l.m, id: l.id, s: f };
    if (l.r) o.r = l.r;
    if (l.n) o.n = l.n.slice(0, 50);
    return o;
  });
  return { v: 1, city, t: date, names, lines: out };
}

/* ---------- gömme ---------- */
export function embed(html, byCity) {
  if (!MARK.test(html)) throw new Error('HTML içinde <script id="ortak-data" type="application/json"> bloğu yok');
  let cur = {};
  try {
    const m = html.match(MARK)[0];
    cur = JSON.parse(m.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')) || {};
  } catch (e) { cur = {}; }
  const merged = Object.assign({}, cur, byCity);
  const json = JSON.stringify(merged).replace(/</g, '\\u003c');
  return html.replace(MARK, () => '<script id="ortak-data" type="application/json">' + json + '</script>');
}

/* ---------- indirme ---------- */
async function fetchCity(name, cfg) {
  log(`\n== ${name} ==`);
  log('Raylı hatlar, vapur ve Metrobüs indiriliyor…');
  const all = new Map();
  const total = { seen: 0, skipped: 0 };
  const add = (j) => {
    const { lines, stat } = parseTransit(j, cfg.bounds);
    total.seen += stat.seen; total.skipped += stat.skipped;
    lines.forEach((l) => { if (!all.has(l.id)) all.set(l.id, l); });
  };
  add(await overpass(transitQuery(cfg.bb)));
  log(`  ${all.size} hat`);
  if (cfg.buses) {
    log('Otobüs hatlarının listesi alınıyor…');
    const idsJ = await overpass(busIdsQuery(cfg.bb));
    const ids = (idsJ.elements || []).filter((e) => e.type === 'relation').map((e) => e.id).filter((id) => !all.has(id));
    log(`  ${ids.length} otobüs hattı bulundu, 40'ar 40'ar indiriliyor (birkaç dakika sürebilir)`);
    const fetchBatch = async (part) => {
      try { add(await overpass(batchQuery(part), 3)); }
      catch (e) {
        if (part.length <= 5) throw e;
        log(`  ${part.length} hatlık grup indirilemedi, ikiye bölünüyor`);
        const h = part.length >> 1;
        await fetchBatch(part.slice(0, h));
        await fetchBatch(part.slice(h));
      }
    };
    for (let i = 0; i < ids.length; i += 40) {
      await fetchBatch(ids.slice(i, i + 40));
      log(`  ${Math.min(i + 40, ids.length)}/${ids.length} (toplam ${all.size} hat)`);
      await sleep(1500);
    }
  }
  const fixed = fixOrder([...all.values()]);
  const lines = fixed.lines;
  if (cfg.buses) log(`Durak sırası karışık olduğu için yeniden dizilen otobüs hattı: ${fixed.changed} / ${fixed.buses}`);
  const byMode = {};
  lines.forEach((l) => { byMode[l.m] = (byMode[l.m] || 0) + 1; });
  log('Hat sayıları:', JSON.stringify(byMode), `| 2'den az durağı olduğu için atlanan: ${total.skipped}`);
  const rails = lines.filter((l) => l.m !== 'bus').length;
  if (rails < 3) throw new Error(`${name}: yalnızca ${rails} raylı/vapur hattı bulundu, veri bozuk görünüyor, dosya yazılmadı`);
  if (cfg.buses && !(byMode.bus > 100)) throw new Error(`${name}: yalnızca ${byMode.bus || 0} otobüs hattı bulundu, veri eksik görünüyor, dosya yazılmadı`);
  return lines;
}

/* ---------- ana akış ---------- */
function args(argv) {
  const o = { city: 'all', html: null, out: 'data', embedOnly: false, endpoint: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--city') o.city = argv[++i];
    else if (a === '--html') o.html = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--endpoint') o.endpoint = argv[++i];
    else if (a === '--embed-only') o.embedOnly = true;
    else if (a === '--reorder') { o.embedOnly = true; o.reorder = true; }
    else if (a === '--help' || a === '-h') { log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace('#!/usr/bin/env node\n/*', '')); process.exit(0); }
    else { console.error('Bilinmeyen seçenek: ' + a); process.exit(2); }
  }
  return o;
}

async function main() {
  const o = args(process.argv.slice(2));
  if (typeof fetch !== 'function') { console.error('Node 18 veya üstü gerekir.'); process.exit(1); }
  if (o.endpoint) endpoints = [o.endpoint];
  const cities = o.city === 'all' ? Object.keys(CITIES) : [o.city];
  for (const c of cities) if (!CITIES[c]) { console.error('Bilinmeyen şehir: ' + c); process.exit(2); }
  fs.mkdirSync(o.out, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const byCity = {};
  for (const c of cities) {
    const file = path.join(o.out, c + '.json');
    if (o.embedOnly) {
      let data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (o.reorder) {
        const fixed = fixOrder(decode(data));
        data = encode(c, fixed.lines, data.t || date);
        fs.writeFileSync(file, JSON.stringify(data));
        log(`${c}: durak sırası yeniden dizilen otobüs hattı ${fixed.changed} / ${fixed.buses} (${file} güncellendi)`);
      }
      byCity[c] = data;
      continue;
    }
    const lines = await fetchCity(c, CITIES[c]);
    const data = encode(c, lines, date);
    fs.writeFileSync(file, JSON.stringify(data));
    byCity[c] = data;
    log(`${file} yazıldı (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
  }
  const htmlPath = o.html || (fs.existsSync('index.html') ? 'index.html' : null);
  if (htmlPath) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    fs.writeFileSync(htmlPath, embed(html, byCity));
    log(`\n${htmlPath} içine gömüldü (${(fs.statSync(htmlPath).size / 1024).toFixed(0)} KB). Şimdi commit edip pushlayabilirsin.`);
  } else {
    log('\nindex.html bulunamadı, yalnızca data/*.json yazıldı. --html ile dosya yolu verebilirsin.');
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((e) => { console.error('\nHata: ' + e.message); process.exit(1); });
