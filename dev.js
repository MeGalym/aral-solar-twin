/* Стадия девелопмента: варианты компоновки, источники солнечного ресурса, сравнение площадок, разбор чертежа.
   Выработка вариантов считается той же цепочкой, что и проектный вариант (pv.js), стоимость — пересчётом локальных смет проекта (epc.js).
   Доли внутри сметы оборудования, коэффициенты по типам столов, альтернативные источники погоды и площадки-кандидаты — демо-данные. */
(function () {
  const SITE = window.SITE, M = SITE.meta, EPC = window.EPC, PV = window.PV;
  const AREA = M.siteHa, W1 = 2.384, GCR0 = W1 / M.pitch, AC_KW = M.inverters * M.inverterKw, KVA0 = SITE.ktp.reduce((s, k) => s + k.kva, 0);

  /* ───────── 0. Привязка к местности и расстановка столов ─────────
     Модель в метрах: x на восток, z на юг. Углы участка — из файла локации проекта (4 точки границы). */
  const FEN = { x0: SITE.field.x0 - 102, x1: SITE.field.x1 + 48, z0: SITE.field.z0 - 72, z1: SITE.field.z1 + 56 };
  const GEO = { lat0: 46.7881403, lon0: 61.7261660, xc: (FEN.x0 + FEN.x1) / 2, zc: (FEN.z0 + FEN.z1) / 2, mLat: 111200, mLon: 76190 };
  const toLL = (x, z) => [GEO.lat0 - (z - GEO.zc) / GEO.mLat, GEO.lon0 + (x - GEO.xc) / GEO.mLon];
  const fromLL = (lat, lon) => [GEO.xc + (lon - GEO.lon0) * GEO.mLon, GEO.zc - (lat - GEO.lat0) * GEO.mLat];
  const BOUND = [[46.7917889, 61.7207917], [46.7916722, 61.7315417], [46.7845056, 61.7315111], [46.7845944, 61.7208028]].map(p => fromLL(p[0], p[1]));
  const polyArea = P => Math.abs(P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  const inPoly = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const bbox = P => P.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [1e9, 1e9, -1e9, -1e9]);
  const strip = (pts, half) => { const L = [], Rr = []; pts.forEach((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l; L.push([p[0] + nx * half, p[1] + nz * half]); Rr.unshift([p[0] - nx * half, p[1] - nz * half]); }); return L.concat(Rr); };
  function freeArea(B, excl) {            // пригодная площадь, га: участок без зон ограничений, сетка 15 м
    const b = bbox(B); let n = 0; for (let x = b[0] + 7.5; x < b[2]; x += 15) for (let z = b[1] + 7.5; z < b[3]; z += 15) if (inPoly(x, z, B) && !excl.some(E => inPoly(x, z, E))) n++;
    return n * 225 / 1e4;
  }

  const TYPES = {
    t1: { name: 'Трекер, один ряд модулей', short: 'трекер 1P', rows: 1, fixed: false, kTrack: 1, kPile: 1, piles: 15 },
    t2: { name: 'Трекер, два ряда модулей', short: 'трекер 2P', rows: 2, fixed: false, kTrack: 0.96, kPile: 0.85, piles: 23 },
    fx: { name: 'Неподвижные столы, 30° на юг', short: 'столы 30°', rows: 2, fixed: true, tilt: 30, kTrack: 0.58, kPile: 1.25, piles: 34 },
  };
  const LEN = M.trackerLen, MPT = M.panelsPerTracker, widthOf = T => W1 * T.rows + (T.rows > 1 ? 0.02 : 0);
  /* Расстановка: столы длиной 107 м ставятся полосами с проездами между ними, шаг рядов задаёт плотность.
     Стол остаётся, если целиком лежит внутри границы с отступом и не задевает зоны ограничений. */
  function layout(o) {
    o = Object.assign({ type: 't1', pitch: M.pitch, road: 7.2, ns: 2, inset: 12, boundary: BOUND, excl: [], target: Infinity }, o);
    const T = TYPES[o.type], w = widthOf(T), mpt = MPT * T.rows, b = bbox(o.boundary), out = [], H = T.fixed;      // H: столы вытянуты с запада на восток
    const u0 = H ? b[1] : b[0], u1 = H ? b[3] : b[2], v0 = H ? b[0] : b[1], v1 = H ? b[2] : b[3];                   // u — поперёк рядов, v — вдоль стола
    const ok = (x, z) => inPoly(x, z, o.boundary) && !o.excl.some(E => inPoly(x, z, E));
    const fits = (cu, cv) => { const hw = w / 2 + o.inset, hl = LEN / 2 + o.inset;
      for (const [du, dv] of [[-hw, -hl], [hw, -hl], [-hw, hl], [hw, hl]]) if (!inPoly(H ? cv + dv : cu + du, H ? cu + du : cv + dv, o.boundary)) return false;
      for (let k = -4; k <= 4; k++) { const dv = k / 4 * (LEN / 2 + 3); for (const du of [-w / 2 - 3, w / 2 + 3]) if (!ok(H ? cv + dv : cu + du, H ? cu + du : cv + dv)) return false; } return true; };
    const corr = []; if (!H) for (let k = 1; k <= o.ns; k++) corr.push(u0 + (u1 - u0) * k / (o.ns + 1));
    const nb = Math.max(0, Math.floor((v1 - v0 - 2 * o.inset + o.road) / (LEN + o.road))), vs = v0 + (v1 - v0 - nb * (LEN + o.road) + o.road) / 2;
    for (let j = 0; j < nb; j++) { const cv = vs + j * (LEN + o.road) + LEN / 2;
      for (let cu = u0 + o.inset + w / 2; cu <= u1 - o.inset - w / 2; cu += o.pitch) { if (corr.some(c => Math.abs(cu - c) < 11 + w / 2)) continue; if (fits(cu, cv)) out.push(H ? [cv, cu, LEN, w] : [cu, cv, w, LEN]); } }
    const cap = out.length, need = Math.ceil(o.target / mpt), n = Math.min(cap, need);
    return { tables: out.slice(0, n), n, cap, mpt, mods: n * mpt, capMods: cap * mpt, usedHa: n * o.pitch * (LEN + o.road) / 1e4, w };
  }
  const REAL = { tables: SITE.trackers.map(t => [t[0], t[1], W1, LEN]), n: SITE.trackers.length, cap: SITE.trackers.length, mpt: MPT, mods: M.modules, capMods: M.modules, usedHa: SITE.trackers.length * M.pitch * (LEN + 7.2) / 1e4, w: W1 };

  /* ───────── 1. Варианты компоновки ───────── */
  const PRESETS = [
    { id: 'A', name: 'Рабочий проект', type: 't1', pitch: M.pitch, ratio: M.dcKw / AC_KW, base: true },
    { id: 'B', name: 'DC/AC 1,25', type: 't1', pitch: M.pitch, ratio: 1.25 },
    { id: 'C', name: 'DC/AC 1,35, плотные ряды', type: 't1', pitch: 6.2, ratio: 1.35 },
    { id: 'D', name: 'Двухрядный трекер', type: 't2', pitch: 14.0, ratio: 1.2 },
    { id: 'E', name: 'Неподвижные столы', type: 'fx', pitch: 10.5, ratio: 1.2 },
  ];
  const EQ_SHARE = { mods: 0.50, track: 0.26, inv: 0.07, ktp: 0.17 };   // состав сметы 2-1-6, оценка
  const L = Object.fromEntries(EPC.SMETA.local.map(x => [x.id, x.v])), DIRECT0 = EPC.SMETA.local.reduce((s, x) => s + x.v, 0);
  const cache = new Map();

  /* v: тип стола, шаг рядов, DC/AC; site: граница и зоны ограничений; cost, fin — допущения сметы и финмодели */
  function variant(v, site, cost, fin) {
    site = site || { boundary: BOUND, excl: [] };
    const T = TYPES[v.type], target = Math.round(AC_KW * v.ratio * 1000 / M.moduleW / 27) * 27;
    const lay = v.base && site.boundary === BOUND && !site.excl.length ? REAL : layout({ type: v.type, pitch: v.pitch, road: v.road ?? 7.2, ns: v.ns ?? 2, inset: v.inset ?? 12, boundary: site.boundary, excl: site.excl, target });
    const mods = lay.mods, dcKw = mods * M.moduleW / 1000, width = widthOf(T), gcr = width / v.pitch, key = [v.type, v.pitch, mods].join('|');
    if (!mods) return { id: v.id, name: v.name, type: v.type, T, pitch: v.pitch, gcr, mods: 0, dcKw: 0, lay, fit: false, target, empty: true, user: !!v.user, base: !!v.base, ratio: 0 };
    let y = cache.get(key);
    if (!y) { y = PV.yearCalc({ pitch: v.pitch, width, npan: mods, ni: M.inverters, kva: KVA0, fixed: T.fixed, tilt: T.tilt || 0 }); cache.set(key, y); }
    const m = mods / M.modules, areaRel = lay.usedHa / REAL.usedHa;
    const direct = L['2-1-6'] * (EQ_SHARE.mods * m + EQ_SHARE.track * m * T.kTrack + EQ_SHARE.inv + EQ_SHARE.ktp) + L['2-1-7'] * m * (0.55 + 0.45 * GCR0 / gcr)
      + L['7-1'] * (0.4 + 0.6 * areaRel) + L['2-1-3'] * m * T.kPile + L['2-1-2'] * Math.sqrt(areaRel) + L['2-1-1'] + L['2-1-4'] * areaRel + L['2-1-5'] + L['3-1'];
    const r = direct / DIRECT0, c0 = Object.assign({}, EPC.COST_DEFAULTS, cost);
    const cap = EPC.capex(Object.assign({}, cost, { kSmr: ((1 + c0.kSmr / 100) * r - 1) * 100, kEquip: ((1 + c0.kEquip / 100) * r - 1) * 100 }));
    const f = EPC.finance(cap.net * 1000, y.total, fin), free = site.freeHa || (site.freeHa = freeArea(site.boundary, site.excl));
    return { id: v.id, name: v.name, type: v.type, T, pitch: v.pitch, width, gcr, mods, target, lay, dcKw, acKw: AC_KW, ratio: dcKw / AC_KW, area: lay.usedHa, free, land: lay.usedHa / free * 100, fit: lay.mods >= target, capKw: (lay === REAL ? layout({ type: v.type, pitch: v.pitch, boundary: site.boundary, excl: site.excl }).capMods : lay.capMods) * M.moduleW / 1000,
      energy: y.total, months: y.months, spec: y.total * 1000 / dcKw, pr: y.pr, cf: y.total / (AC_KW / 1000 * 8760) * 100, clip: y.clip, shade: y.shade, capexNet: cap.net, capexTotal: cap.total, perW: cap.net / dcKw, fin: f, lcoe: f.lcoe, user: !!v.user, base: !!v.base };
  }
  /* ведомость основных объёмов варианта; длины кабеля — пересчёт кабельного журнала проекта */
  function bom(r) {
    const m = r.mods / M.modules, k = 0.55 + 0.45 * GCR0 / r.gcr;
    return [['Модули 710 Вт', r.mods, 'шт'], [r.T.fixed ? 'Столы 2×81' : r.T.rows > 1 ? 'Трекеры 2×81' : 'Трекеры 1×81', r.lay.n, 'шт'], ['Сваи', r.lay.n * r.T.piles, 'шт'], ['Стринги по 27 модулей', r.mods / 27, 'шт'],
      ['Инверторы SG320-HX-20', M.inverters, 'шт'], ['Подстанции КТП', 4, 'шт'], ['Кабель DC', Math.round(223.1 * m * k), 'км'], ['Площадь под столами', +r.area.toFixed(1), 'га']];
  }
  /* выгрузка расстановки: KML для карт и DXF для чертежа */
  const corners = t => [[t[0] - t[2] / 2, t[1] - t[3] / 2], [t[0] + t[2] / 2, t[1] - t[3] / 2], [t[0] + t[2] / 2, t[1] + t[3] / 2], [t[0] - t[2] / 2, t[1] + t[3] / 2]];
  function toKml(name, boundary, tables) {
    const ring = P => P.concat([P[0]]).map(p => { const q = toLL(p[0], p[1]); return q[1].toFixed(7) + ',' + q[0].toFixed(7) + ',0'; }).join(' ');
    const pm = (n, P, st) => `<Placemark><name>${n}</name><styleUrl>#${st}</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>${ring(P)}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;
    return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${name}</name><Style id="b"><LineStyle><color>ff44b5f5</color><width>3</width></LineStyle><PolyStyle><fill>0</fill></PolyStyle></Style><Style id="t"><LineStyle><color>ff7a3a12</color><width>1</width></LineStyle><PolyStyle><color>cc7a3a12</color></PolyStyle></Style>`
      + pm('Граница участка', boundary, 'b') + `<Folder><name>Столы</name>` + tables.map((t, i) => pm('T-' + String(i + 1).padStart(3, '0'), corners(t), 't')).join('') + `</Folder></Document></kml>`;
  }
  function toDxf(boundary, tables) {
    const pl = (P, layer) => `0\nLWPOLYLINE\n8\n${layer}\n90\n${P.length}\n70\n1\n` + P.map(p => `10\n${p[0].toFixed(2)}\n20\n${(-p[1]).toFixed(2)}\n`).join('');
    return `0\nSECTION\n2\nENTITIES\n` + pl(boundary, 'GP_BOUNDARY') + tables.map(t => pl(corners(t), 'PV_TABLES')).join('') + `0\nENDSEC\n0\nEOF\n`;
  }
  /* сколько МВт помещается на участке при разном шаге рядов: кривая для графика подбора плотности */
  function fitCurve(type, site) {
    const T = TYPES[type], w = widthOf(T), out = [];
    for (let g = 0.25; g <= 0.6001; g += 0.025) { const lay = layout({ type, pitch: w / g, boundary: site.boundary, excl: site.excl }); out.push([g, lay.capMods * M.moduleW / 1e6]); }
    return out;
  }

  /* ───────── 2. Источники солнечного ресурса ───────── */
  const MN = PV.C.month, mul = (a, k) => a.map((v, i) => +(v * k[i]).toFixed(1)), add = (a, d) => a.map((v, i) => +(v + d[i]).toFixed(2));
  const SOURCES = [
    { id: 'mn', name: 'Meteonorm 8.1', note: 'принят в проекте, отчёт о выработке', real: true, years: 'типичный год', sigma: 5.0, ghi: MN.ghi, dhi: MN.dhi, tamb: MN.tamb },
    { id: 'sat', name: 'Спутниковый ряд', note: 'почасовые данные, 1994–2023', years: '30 лет', sigma: 4.0,
      ghi: mul(MN.ghi, [1.06, 1.05, 1.03, 1.02, 1.02, 1.03, 1.02, 1.03, 1.02, 1.03, 1.05, 1.07]), dhi: mul(MN.dhi, [1.02, 1.01, 0.99, 0.98, 0.97, 0.98, 0.98, 0.97, 1.0, 0.99, 1.01, 1.02]), tamb: add(MN.tamb, [0.6, 0.5, 0.4, 0.3, 0.2, 0.3, 0.4, 0.3, 0.2, 0.3, 0.5, 0.6]) },
    { id: 're', name: 'Реанализ', note: 'сетка 30 км, 2000–2023', years: '24 года', sigma: 7.0,
      ghi: mul(MN.ghi, [0.95, 0.96, 0.97, 0.98, 0.99, 0.99, 0.98, 0.98, 0.97, 0.96, 0.95, 0.94]), dhi: mul(MN.dhi, [1.04, 1.04, 1.03, 1.03, 1.02, 1.03, 1.04, 1.03, 1.05, 1.03, 1.04, 1.04]), tamb: add(MN.tamb, [-0.8, -0.6, -0.3, 0.1, 0.2, 0.1, 0, 0.1, -0.1, -0.3, -0.5, -0.7]) },
    { id: 'ms', name: 'Измерения на площадке', note: 'пиранометр и метеостанция, 12 месяцев, приведены к спутниковому ряду', years: '12 мес.', sigma: 2.5, measured: true,
      ghi: mul(MN.ghi, [1.03, 1.01, 1.02, 1.0, 1.01, 1.02, 1.01, 1.02, 1.01, 1.0, 1.02, 1.03]), dhi: mul(MN.dhi, [1.0, 1.0, 0.98, 0.99, 0.98, 0.97, 0.98, 0.98, 0.99, 1.0, 1.0, 1.01]), tamb: add(MN.tamb, [0.3, 0.2, 0.4, 0.1, 0.3, 0.2, 0.3, 0.2, 0.1, 0.2, 0.2, 0.3]) },
  ];
  const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], sum = a => a.reduce((s, v) => s + v, 0);
  function source(id) {
    const s = SOURCES.find(x => x.id === id);
    if (!s.out) {
      const y = s.id === 'mn' ? PV.year() : PV.yearCalc({ ghi: s.ghi, dhi: s.dhi, tamb: s.tamb });
      s.out = { ghiY: sum(s.ghi), dhiY: sum(s.dhi), tambY: sum(s.tamb.map((t, i) => t * DAYS[i])) / 365, energy: y.total, months: y.months, p90: y.total * EPC.pvsyst.e90 / EPC.pvsyst.e50 };   // P90 — по соотношению P90/P50 из отчёта проекта
     
    }
    return Object.assign({}, s, s.out);
  }

  /* ───────── 3. Площадки-кандидаты ───────── */
  const CRIT = [['res', 'Солнечный ресурс'], ['grid', 'Сети и выдача мощности'], ['land', 'Земля и рельеф'], ['lim', 'Ограничения']];
  const rect = (cx, cz, w, h) => [[cx - w / 2, cz - h / 2], [cx + w / 2, cz - h / 2], [cx + w / 2, cz + h / 2], [cx - w / 2, cz + h / 2]];
  const zone = (name, kind, poly, setback, sev) => ({ name, kind, poly, setback, sev });
  const SITES = [
    { id: 's1', name: 'Арал, участок проекта', real: true, boundary: BOUND, ghi: 1380, dist: 3.1, free: 30, line: 'ЗРУ 35 кВ, кабель 3,1 км', land: 'земли запаса, уклон до 1°',
      score: { res: 74, grid: 90, land: 86, lim: 72 }, zones: [], notes: [['Пыльные бури', 'чаще мойка модулей', 'warn'], ['Засоленный грунт', 'защита свай от коррозии', 'warn']] },
    { id: 's2', name: 'Участок севернее города', boundary: rect(-3400, -7200, 1000, 900), ghi: 1372, dist: 11.4, free: 40, line: 'ВЛ 110 кВ, нужна своя подстанция', land: 'пастбища, нужен перевод категории',
      score: { res: 72, grid: 55, land: 68, lim: 88 }, zones: [zone('Скотопрогон', 'road', strip([[-3950, -7420], [-3400, -7330], [-2850, -7380]], 15), 15, 'warn')], notes: [['Перевод земель', '8–10 месяцев до начала работ', 'warn']] },
    { id: 's3', name: 'Участок у автотрассы', boundary: rect(5600, 2100, 780, 745), ghi: 1391, dist: 6.2, free: 12, line: 'ПС 35 кВ, свободно 12 МВт', land: 'земли запаса, уклон до 2°',
      score: { res: 78, grid: 48, land: 60, lim: 52 }, zones: [zone('Охранная зона ВЛ 110 кВ', 'line', strip([[5150, 1800], [5600, 2010], [6050, 2100]], 20), 20, 'bad'), zone('Газопровод', 'pipe', strip([[5870, 1650], [5890, 2550]], 100), 100, 'bad')], notes: [] },
    { id: 's4', name: 'Участок на бывшем дне залива', boundary: rect(-9800, 3300, 1200, 1000), ghi: 1402, dist: 22.0, free: 60, line: 'ВЛ 110 кВ, нужна линия 22 км', land: 'солончак, риск подтопления',
      score: { res: 82, grid: 30, land: 42, lim: 38 }, zones: [zone('Природоохранная зона', 'eco', [[-10500, 2700], [-9900, 2700], [-10050, 3150], [-10500, 3300]], 500, 'bad'), zone('Подтопление весной', 'water', [[-10450, 3560], [-9700, 3640], [-9300, 3500], [-9150, 3850], [-10450, 3850]], 0, 'bad')], notes: [['Солончак', 'усиленная защита свай', 'warn']] },
  ];
  SITES.forEach(s => { s.excl = s.zones.map(z => z.poly); s.ha = polyArea(s.boundary) / 1e4; s.haOk = freeArea(s.boundary, s.excl); s.freeHa = s.haOk; const b = bbox(s.boundary); s.center = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; });
  const WEIGHTS = { res: 25, grid: 35, land: 20, lim: 20 };
  function rank(w) {
    w = Object.assign({}, WEIGHTS, w); const tot = CRIT.reduce((s, c) => s + w[c[0]], 0) || 1;
    return SITES.map(s => Object.assign({}, s, { total: CRIT.reduce((a, c) => a + s.score[c[0]] * w[c[0]], 0) / tot })).sort((a, b) => b.total - a.total);
  }

  /* ───────── 4. Разбор чертежа генплана ───────── */
  function drawing() {
    const F = SITE.field, fence = 2 * ((F.x1 - F.x0 + 150) + (F.z1 - F.z0 + 128));
    let ac = 0; SITE.inverters.forEach(v => { const k = SITE.ktp[v.k - 1]; ac += Math.abs(v.x - k.x) + Math.abs(v.z - k.z) + 6; });
    return {
      file: 'ALH01-ST1-ГП. Генеральный план.dwg', size: '18,4 МБ', objects: 61840,
      steps: [
        { id: 'read', name: 'Чтение файла', at: 0.06, text: '61 840 объектов, 43 слоя, система координат проекта' },
        { id: 'site', name: 'Граница участка и проезды', at: 0.16, layer: 'ГП_Граница, ГП_Проезды', as: 'граница, проезды', qty: `${AREA} га, 13 198 м² проездов` },
        { id: 'fence', name: 'Ограждение', at: 0.22, layer: 'ГП_Ограждение', as: 'ограждение', qty: `${Math.round(fence / 10) * 10} м` },
        { id: 'track', name: 'Столы и модули', at: 0.62, layer: 'ЭС_Трекеры', as: 'трекер 1×81', qty: `${M.trackers} стола, ${M.modules.toLocaleString('ru-RU')} модулей` },
        { id: 'inv', name: 'Инверторы', at: 0.74, layer: 'ЭС_Инверторы', as: 'инвертор', qty: `${M.inverters} шт., привязка 1 566 стрингов` },
        { id: 'ktp', name: 'Подстанции КТП', at: 0.82, layer: 'ЭС_КТП', as: 'КТП 0,8/35 кВ', qty: '4 шт., 27 МВА' },
        { id: 'cab', name: 'Кабельные трассы', at: 0.94, layer: 'ЭС_Кабель_0.8, ЭС_Кабель_35', as: 'трассы 0,8 и 35 кВ', qty: `${(ac / 1000).toFixed(1).replace('.', ',')} км и 3,1 км` },
        { id: 'check', name: 'Сверка с ведомостью', at: 1, text: 'количество столов, инверторов и КТП совпало с ведомостью объёмов' },
      ],
      warn: ['7 блоков столов без номера в атрибутах: номера присвоены по порядку в ряду', '214 объектов служебных слоёв не имеют назначения и пропущены', 'Высотные отметки в файле не найдены: рельеф принят плоским'],
    };
  }

  window.DEV = { TYPES, PRESETS, variant, layout, strip, bbox, bom, toKml, toDxf, fitCurve, GEO, toLL, fromLL, BOUND, FEN, polyArea, freeArea, AREA, AC_KW, SOURCES, source, CRIT, SITES, WEIGHTS, rank, drawing };
})();
