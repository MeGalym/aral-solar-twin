/* Расчётный движок проектирования СЭС: библиотеки оборудования и погоды, почасовой год (8760 ч),
   расстановка столов по границе участка, стоимость и экономика.
   Физика — та же цепочка, что в отчёте о выработке проекта: транспозиция Хея–Дэвиса, слежение с обратным ходом,
   IAM, двусторонность, тепловая и однодиодная модель модуля, потери DC и AC, инвертор со срезом, трансформатор.
   Почасовая погода синтезируется из месячных сумм источника: настоящего почасового файла в проекте нет. */
(function () {
  const RAD = Math.PI / 180, DEG = 180 / Math.PI, EPC = window.EPC, SITE = window.SITE;
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], MON = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const sum = a => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; };

  /* ───────── библиотеки ───────── */
  const MODULES = [
    { id: 'tr710', maker: 'Trina Solar', model: 'Vertex N TSM-NEG21C.20', p: 710, voc: 49.0, isc: 18.40, vmp: 40.9, imp: 17.36, ns: 66, muP: -0.29, muIsc: 0.04, len: 2.384, wid: 1.303, bif: 0.80, tech: 'n-TOPCon, двусторонний', rs: 0.174, src: 'паспорт, принят в проекте' },
    { id: 'm620', maker: 'Демо', model: 'TOPCon 620 Вт, двусторонний', p: 620, voc: 57.2, isc: 13.90, vmp: 47.6, imp: 13.03, ns: 78, muP: -0.30, muIsc: 0.045, len: 2.382, wid: 1.134, bif: 0.80, tech: 'n-TOPCon, двусторонний', src: 'демо-данные' },
    { id: 'm580', maker: 'Демо', model: 'PERC 580 Вт, односторонний', p: 580, voc: 51.6, isc: 14.30, vmp: 43.3, imp: 13.40, ns: 72, muP: -0.34, muIsc: 0.05, len: 2.278, wid: 1.134, bif: 0, tech: 'p-PERC, односторонний', src: 'демо-данные' },
  ];
  const INVERTERS = [
    { id: 'sg320', maker: 'Sungrow', model: 'SG320-HX-20', kw: 320, kind: 'стринговый', eff: 98.5, vdc: 1500, src: 'принят в проекте' },
    { id: 's350', maker: 'Демо', model: 'Стринговый 350 кВт', kw: 350, kind: 'стринговый', eff: 98.6, vdc: 1500, src: 'демо-данные' },
    { id: 'c4400', maker: 'Демо', model: 'Центральный 4 400 кВт', kw: 4400, kind: 'центральный', eff: 98.3, vdc: 1500, src: 'демо-данные' },
  ];
  const mul = (a, k) => a.map((v, i) => +(v * k[i]).toFixed(1)), add = (a, d) => a.map((v, i) => +(v + d[i]).toFixed(2));
  const MN = { ghi: [41.0, 64.4, 112.4, 141.0, 179.8, 196.4, 197.8, 166.7, 125.5, 81.6, 42.3, 31.2], dhi: [18.70, 29.17, 51.68, 70.94, 92.11, 87.16, 79.32, 73.80, 41.95, 39.69, 24.68, 19.08], tamb: [-10.08, -9.26, 1.77, 11.94, 20.05, 25.11, 27.48, 25.79, 17.90, 8.92, -0.15, -7.17] };
  const WEATHER = [
    { id: 'mn', name: 'Meteonorm 8.1', kind: 'типичный год', note: 'принят в проекте, отчёт о выработке', src: 'отчёт проекта', ghi: MN.ghi, dhi: MN.dhi, tamb: MN.tamb },
    { id: 'sat', name: 'Спутниковый ряд', kind: '1994–2023, 30 лет', note: 'почасовые спутниковые данные', src: 'демо-данные',
      ghi: mul(MN.ghi, [1.06, 1.05, 1.03, 1.02, 1.02, 1.03, 1.02, 1.03, 1.02, 1.03, 1.05, 1.07]), dhi: mul(MN.dhi, [1.02, 1.01, 0.99, 0.98, 0.97, 0.98, 0.98, 0.97, 1.0, 0.99, 1.01, 1.02]), tamb: add(MN.tamb, [0.6, 0.5, 0.4, 0.3, 0.2, 0.3, 0.4, 0.3, 0.2, 0.3, 0.5, 0.6]) },
    { id: 're', name: 'Реанализ', kind: '2000–2023, сетка 30 км', note: 'атмосферный реанализ', src: 'демо-данные',
      ghi: mul(MN.ghi, [0.95, 0.96, 0.97, 0.98, 0.99, 0.99, 0.98, 0.98, 0.97, 0.96, 0.95, 0.94]), dhi: mul(MN.dhi, [1.04, 1.04, 1.03, 1.03, 1.02, 1.03, 1.04, 1.03, 1.05, 1.03, 1.04, 1.04]), tamb: add(MN.tamb, [-0.8, -0.6, -0.3, 0.1, 0.2, 0.1, 0, 0.1, -0.1, -0.3, -0.5, -0.7]) },
    { id: 'ms', name: 'Измерения на площадке', kind: '12 месяцев', note: 'пиранометр и метеостанция, приведены к спутниковому ряду', src: 'демо-данные',
      ghi: mul(MN.ghi, [1.03, 1.01, 1.02, 1.0, 1.01, 1.02, 1.01, 1.02, 1.01, 1.0, 1.02, 1.03]), dhi: mul(MN.dhi, [1.0, 1.0, 0.98, 0.99, 0.98, 0.97, 0.98, 0.98, 0.99, 1.0, 1.0, 1.01]), tamb: add(MN.tamb, [0.3, 0.2, 0.4, 0.1, 0.3, 0.2, 0.3, 0.2, 0.1, 0.2, 0.2, 0.3]) },
  ];
  const byId = (list, id) => list.find(x => x.id === id) || list[0];

  /* ───────── солнце и ясное небо ───────── */
  function sunAt(min, doy, lat, lon, tz) {
    const B = 2 * Math.PI * (doy - 81) / 364, eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    const solar = min / 60 + (lon - 15 * tz) / 15 + eot / 60, H = (solar - 12) * 15 * RAD, dec = 23.44 * RAD * Math.sin(2 * Math.PI * (284 + doy) / 365), la = lat * RAD;
    const up = Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H), east = -Math.cos(dec) * Math.sin(H), north = Math.cos(la) * Math.sin(dec) - Math.sin(la) * Math.cos(dec) * Math.cos(H);
    return { x: east, y: up, z: -north, el: Math.asin(up) };
  }
  function clearSky(sun) { if (sun.y <= 0.01) return { dni: 0, dhi: 0 }; const am = 1 / (sun.y + 0.50572 * Math.pow(sun.el * DEG + 6.07995, -1.6364)), dni = 1353 * Math.pow(0.7, Math.pow(am, 0.678)); return { dni, dhi: 0.1 * dni }; }

  /* ───────── почасовой год из месячных сумм ─────────
     Каждому дню даётся своя облачность (случайный ряд с памятью), затем прямая и рассеянная радиация
     подгоняются так, чтобы суммы за месяц совпали с источником. */
  const wxCache = new Map(), CLEAR = (typeof process !== 'undefined' && process.env.CLR) ? +process.env.CLR : 0.25;   // доля ясных дней подобрана под годовую выработку отчёта проекта
  function hourly(w, site) {
    const key = w.id + '|' + site.lat + '|' + site.lon; if (wxCache.has(key)) return wxCache.get(key);
    const N = 8760, ghi = new Float32Array(N), dhi = new Float32Array(N), dni = new Float32Array(N), tamb = new Float32Array(N), sx = new Float32Array(N), sy = new Float32Array(N), sz = new Float32Array(N), R = rng(4680 + w.id.charCodeAt(0) * 31);
    let h0 = 0, doy = 0, prev = 0.5;
    for (let m = 0; m < 12; m++) {
      const nd = DAYS[m], b = [], clr = [], cs = [];
      for (let d = 0; d < nd; d++) for (let h = 0; h < 24; h++) { const s = sunAt(h * 60 + 30, doy + d + 1, site.lat, site.lon, site.tz), c = clearSky(s), i = h0 + d * 24 + h; sx[i] = s.x; sy[i] = s.y; sz[i] = s.z; cs.push(c); }
      const bt = (w.ghi[m] - w.dhi[m]) * 1000, dayBeam = d => { let s = 0; for (let h = 0; h < 24; h++) s += cs[d * 24 + h].dni * Math.max(0, sy[h0 + d * 24 + h]); return s; };   // прямая на горизонталь, Вт·ч/м²
      let csBeam = 0; for (let d = 0; d < nd; d++) csBeam += dayBeam(d);
      const fBeam = Math.min(0.97, bt / csBeam), q = CLEAR * fBeam;                 // доля полностью ясных дней
      for (let d = 0; d < nd; d++) { const pc = prev > 0.9 ? q + 0.35 * (1 - q) : q * 0.8; clr.push(R() < pc); prev = clr[d] ? 1 : 0.2 + 0.9 * R(); b.push(prev); }
      let sc = 0, so = 0; for (let d = 0; d < nd; d++) clr[d] ? sc += dayBeam(d) : so += dayBeam(d) * b[d];
      let k = so > 0 ? Math.max(0, bt - sc) / so : 0, kc = 1; if (so <= 0 || bt < sc) kc = bt / Math.max(sc, 1);
      for (let d = 0; d < nd; d++) b[d] = clr[d] ? kc : Math.min(0.98, b[d] * k);
      for (let it = 0; it < 12; it++) { let s = 0, v = 0; for (let d = 0; d < nd; d++) { const x = dayBeam(d) * b[d]; s += x; if (!clr[d] && b[d] < 0.98) v += x; } if (!v || Math.abs(s - bt) < 1) break; const kk = 1 + (bt - s) / v; for (let d = 0; d < nd; d++) if (!clr[d]) b[d] = Math.min(0.98, b[d] * kk); }
      k = 1;
      let dA = 0, dB = 0; for (let d = 0; d < nd; d++) { const f = b[d]; for (let h = 0; h < 24; h++) { const c = cs[d * 24 + h].dhi; dA += c; dB += c * (1 - Math.min(1, f)); } }
      const beta = 3.2, alpha = Math.max(0.25, (w.dhi[m] * 1000 - beta * dB) / Math.max(dA, 1)), fix = w.dhi[m] * 1000 / Math.max(alpha * dA + beta * dB, 1);
      const tm = w.tamb[m], tp = w.tamb[(m + 11) % 12], tn = w.tamb[(m + 1) % 12];
      for (let d = 0; d < nd; d++) { const f = b[d], fr = (d + 0.5) / nd, tday = fr < 0.5 ? tm + (tp - tm) * (0.5 - fr) * 0.5 : tm + (tn - tm) * (fr - 0.5) * 0.5, amp = 3.5 + 4.5 * Math.min(1, f), dT = (Math.min(1, f) - 0.6) * (tm > 5 ? 3 : -2);
        for (let h = 0; h < 24; h++) { const i = h0 + d * 24 + h, c = cs[d * 24 + h]; dni[i] = c.dni * f; dhi[i] = c.dhi * (alpha + beta * (1 - Math.min(1, f))) * fix; ghi[i] = dni[i] * Math.max(0, sy[i]) + dhi[i]; tamb[i] = tday + dT + amp * Math.cos(2 * Math.PI * (h + 0.5 - 15) / 24); } }
      h0 += nd * 24; doy += nd;
    }
    const out = { ghi, dhi, dni, tamb, sx, sy, sz }; wxCache.set(key, out); return out;
  }

  /* ───────── однодиодная модель модуля из паспортных данных ───────── */
  const KB = 1.380649e-23, QE = 1.602176634e-19, TREF = 298.15, EG = 1.12, modCache = new Map();
  function moduleModel(D) {
    if (modCache.has(D.id)) return modCache.get(D.id);
    const rs = D.rs || 0.373 * (D.voc - D.vmp) / D.imp, rshRef = 1000 * (D.voc / 49) * (18.4 / D.isc), rsh0 = rshRef * 4, vt = D.ns * KB * TREF / QE;
    const iv = (V, iph, i0, a, rsh) => { let I = iph; for (let k = 0; k < 40; k++) { const e = Math.exp((V + I * rs) / a), g = iph - i0 * (e - 1) - (V + I * rs) / rsh - I, dg = -i0 * e * rs / a - rs / rsh - 1, n = I - g / dg; if (Math.abs(n - I) < 1e-7) { I = n; break; } I = n; } return I; };
    const mppOf = (iph, i0, a, rsh) => { const voc = a * Math.log(iph / i0 + 1); let lo = 0.5 * voc, hi = voc; const gr = 0.6180339887; let x1 = hi - gr * (hi - lo), x2 = lo + gr * (hi - lo), f1 = x1 * iv(x1, iph, i0, a, rsh), f2 = x2 * iv(x2, iph, i0, a, rsh);
      for (let k = 0; k < 34; k++) { if (f1 < f2) { lo = x1; x1 = x2; f1 = f2; x2 = lo + gr * (hi - lo); f2 = x2 * iv(x2, iph, i0, a, rsh); } else { hi = x2; x2 = x1; f2 = f1; x1 = hi - gr * (hi - lo); f1 = x1 * iv(x1, iph, i0, a, rsh); } } const v = (lo + hi) / 2; return { p: v * iv(v, iph, i0, a, rsh), v }; };
    const refAt = a => { const i0 = (D.isc * (1 + rs / rshRef) - D.voc / rshRef) / (Math.exp(D.voc / a) - Math.exp(D.isc * rs / a)); return { i0, iph: i0 * (Math.exp(D.voc / a) - 1) + D.voc / rshRef }; };
    let lo = 0.7 * vt, hi = 2.0 * vt; const res = a => { const r = refAt(a); return iv(D.vmp, r.iph, r.i0, a, rshRef) - D.imp; };
    if (res(lo) * res(hi) < 0) for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; res(lo) * res(mid) <= 0 ? hi = mid : lo = mid; }
    const a0 = (lo + hi) / 2, r0 = refAt(a0), gamma0 = a0 / vt, scale = D.p / mppOf(r0.iph, r0.i0, a0, rshRef).p;
    const raw = (G, Tc, mg) => { const Tk = Tc + 273.15, gamma = gamma0 * (1 + mg * (Tc - 25)), a = gamma * D.ns * KB * Tk / QE, iph = G / 1000 * r0.iph * (1 + D.muIsc / 100 * (Tc - 25)), i0 = r0.i0 * Math.pow(Tk / TREF, 3) * Math.exp(QE * EG / (gamma * KB) * (1 / TREF - 1 / Tk)), rsh = rshRef + (rsh0 - rshRef) * Math.exp(-5.5 * G / 1000); const r = mppOf(iph, i0, a, rsh); return { p: r.p * scale, v: r.v }; };
    let mg = 0; { let l = -0.003, h = 0.003; const target = 1 + D.muP / 100 * 25, f = x => raw(1000, 50, x).p / raw(1000, 25, x).p - target; if (f(l) * f(h) < 0) { for (let k = 0; k < 40; k++) { const mid = (l + h) / 2; f(l) * f(mid) <= 0 ? h = mid : l = mid; } mg = (l + h) / 2; } }
    const cache = new Map(), mpp = (G, Tc) => { if (G < 1) return 0; const key = Math.round(G) * 1000 + Math.round((Tc + 60) * 2); let p = cache.get(key); if (p === undefined) { p = raw(Math.round(G), Math.round(Tc * 2) / 2, mg).p; if (cache.size > 80000) cache.clear(); cache.set(key, p); } return p; };
    const M = { mpp, eff: D.p / (1000 * D.len * D.wid) }; modCache.set(D.id, M); return M;
  }
  const IAM = [[0, 1], [30, 1], [50, 0.999], [60, 0.994], [70, 0.969], [75, 0.928], [80, 0.829], [85, 0.588], [90, 0]];
  const iam = deg => { if (deg >= 90) return 0; for (let k = 1; k < IAM.length; k++) if (deg <= IAM[k][0]) { const f = (deg - IAM[k - 1][0]) / (IAM[k][0] - IAM[k - 1][0]); return IAM[k - 1][1] + (IAM[k][1] - IAM[k - 1][1]) * f; } return 0; };
  let iamDiff = 0; for (let d = 0.5; d < 90; d += 1) iamDiff += iam(d) * Math.sin(2 * d * RAD) * RAD;

  /* ───────── расчёт года ─────────
     plant: module, inverter, mods, inv, mount ('track' | 'fixed'), pitch, high (рядов модулей на столе), limit (предел поворота, °), tilt, bt (обратный ход)
     sys: кабели, трансформатор, предел выдачи, готовность; sim: загрязнение, альбедо, деградация, изменчивость; storage: накопитель */
  const SYS0 = { dcOhm: 1.5, acOhm: 2.28, trIron: 0.06, trCu: 0.34, mv: 0.06, kva: 0, poi: 0, avail: 100 };
  const SIM0 = { soil: 0, albedo: 0.2, albedoRear: 0.3, quality: -0.8, mismatch: 2.1, lid: 0, degr: 0.4, sigma: 1.8, uc: 29, rearShade: 5, rearMis: 10 };
  const REAR_CAL = (typeof process !== 'undefined' && process.env.RCAL) ? +process.env.RCAL : 1.0;
  function simulate(plant, site, weatherId, sys, sim, storage) {
    sys = Object.assign({}, SYS0, sys); sim = Object.assign({}, SIM0, sim);
    const D = byId(MODULES, plant.module), V = byId(INVERTERS, plant.inverter), MM = moduleModel(D), W = hourly(byId(WEATHER, weatherId), site);
    const N = 8760, n = plant.mods, ni = plant.inv, width = D.len * (plant.high || 1) + ((plant.high || 1) > 1 ? 0.02 : 0), gcr = width / plant.pitch, fixed = plant.mount === 'fixed', phiMax = (plant.limit || 60) * RAD, tilt = (plant.tilt || 30) * RAD;
    const stcKw = n * D.p / 1000, acCap = ni * V.kw, kva = sys.kva || Math.ceil(acCap / 0.972 / 500) * 500, poi = sys.poi > 0 ? sys.poi * 1000 : Infinity;
    const kQual = 1 - sim.quality / 100, kMis = 1 - sim.mismatch / 100, kSoil = 1 - sim.soil / 100, kLid = 1 - sim.lid / 100, kAv = sys.avail / 100, bif = D.bif;
    const invA = 0.004, invB = 0.011 + (98.5 - V.eff) / 100 * 0.9, invEff = l => l <= 0 ? 0 : l / (l + invA + invB * l * l);
    const H = { ghi: W.ghi, poa: new Float32Array(N), tc: new Float32Array(N), dc: new Float32Array(N), ac: new Float32Array(N), grid: new Float32Array(N), soc: storage ? new Float32Array(N) : null };
    const A = { ghi: 0, inc: 0, shaded: 0, front: 0, soil: 0, rear: 0, stc: 0, irr: 0, temp: 0, qual: 0, rearMis: 0, mis: 0, ohm: 0, inv: 0, clip: 0, acOhm: 0, tr: 0, mv: 0, poi: 0, avail: 0, grid: 0, stor: 0 };
    let e = storage ? storage.e * 0.1 : 0;
    for (let i = 0; i < N; i++) {
      const y = W.sy[i]; if (y <= 0.01) { H.tc[i] = W.tamb[i]; if (storage) e = bess(i, 0, 0); continue; }
      const dni = W.dni[i], dh = W.dhi[i], ghi = W.ghi[i], doy = (i / 24 | 0) + 1; let sxp, a, bs = 0;
      if (fixed) { sxp = W.sz[i]; a = tilt; const tp = Math.atan2(sxp, y), sh = gcr * Math.max(0, Math.cos(a - tp)) / Math.max(Math.cos(tp), 0.02); if (sh > 1) bs = Math.min(1, 1.5 * (1 - 1 / sh)); }
      else { sxp = W.sx[i]; a = Math.atan2(sxp, y); if (plant.bt !== false) { const c = Math.cos(a) / gcr; if (c < 1) a -= Math.sign(a) * Math.acos(c); } a = Math.max(-phiMax, Math.min(phiMax, a));
        if (plant.bt === false) { const tp = Math.atan2(sxp, y), sh = gcr * Math.max(0, Math.cos(a - tp)) / Math.max(Math.cos(tp), 0.02); if (sh > 1) bs = Math.min(1, 1.5 * (1 - 1 / sh)); } }
      const ca = Math.cos(a), cosT = Math.max(0, sxp * Math.sin(a) + y * ca), i0n = 1367 * (1 + 0.033 * Math.cos(2 * Math.PI * doy / 365)), ai = Math.min(1, dni / i0n), rb = cosT / Math.max(y, 0.05);
      const beam = dni * cosT, circ = dh * ai * rb, iso = dh * (1 - ai) * (1 + ca) / 2, alb = sim.albedo * ghi * (1 - ca) / 2, inc = beam + circ + iso + alb;
      const b = Math.abs(a), psi = Math.atan2(Math.sin(b), 1 / gcr - Math.cos(b)), kd = (1 - Math.cos(psi)) / (1 + ca), lit = 1 - bs;
      const isoS = iso * (1 - kd), albS = alb * (1 - Math.min(1, gcr * 2.2)), shaded = (beam + circ) * lit + isoS + albS, thetaDeg = Math.acos(Math.min(1, cosT)) * DEG;
      const front0 = (beam + circ) * lit * iam(thetaDeg) + (isoS + albS) * iamDiff, front = front0 * kSoil;
      let rear = 0; if (bif > 0) { const tp = Math.atan2(sxp, Math.max(y, 1e-3)), fSh = Math.min(1, gcr * Math.abs(Math.cos(a - tp)) / Math.max(Math.cos(tp), 0.05)), skyG = 1 - 0.63 * gcr * ca, ground = dni * Math.max(0, y) * (1 - fSh) + dh * skyG;
        rear = (ground * sim.albedoRear * (1 - skyG) / gcr + 0.7 * dh * (1 - ca) / 2) * (1 - sim.rearShade / 100) * REAR_CAL; }
      const eff = front + bif * rear, rearShare = eff > 0 ? bif * rear / eff : 0, tc = W.tamb[i] + 0.9 * inc * (1 - MM.eff) / sim.uc;
      H.poa[i] = inc; H.tc[i] = tc; A.ghi += ghi; A.inc += inc; A.shaded += shaded; A.front += front0; A.soil += front; A.rear += rear;
      if (eff < 1) { if (storage) e = bess(i, 0, 0); continue; }
      const p25 = MM.mpp(eff, 25), pT = MM.mpp(eff, tc), kRm = 1 - sim.rearMis / 100 * rearShare;
      const pStc = n * D.p * eff / 1e6, pIrr = n * p25 / 1e3, pTemp = n * pT / 1e3, pQual = pTemp * kQual * kLid, pRm = pQual * kRm, dc0 = pRm * kMis;          // кВт
      const ohm = dc0 * sys.dcOhm / 100 * dc0 / stcKw, dcIn = dc0 - ohm, out = ni * (dcIn / ni) * invEff(dcIn / ni / V.kw), ac = Math.min(out, acCap);
      const acOhm = ac * sys.acOhm / 100 * ac / stcKw, p1 = ac - acOhm, tr = sys.trIron / 100 * kva + sys.trCu / 100 * kva * Math.pow(p1 / kva, 2), p2 = Math.max(0, p1 - tr), mv = p2 * sys.mv / 100 * p2 / kva, p3 = Math.max(0, p2 - mv);
      const p4 = p3 * kAv, g = Math.min(p4, poi);
      A.stc += pStc; A.irr += pIrr; A.temp += pTemp; A.qual += pQual; A.rearMis += pRm; A.mis += dc0; A.ohm += dcIn; A.inv += out; A.clip += ac; A.acOhm += p1; A.tr += p2; A.mv += p3; A.avail += p4; A.poi += g;
      H.dc[i] = dcIn; H.ac[i] = ac; H.grid[i] = g; if (storage) e = bess(i, g, (out - ac) + (p4 - g));
      A.grid += H.grid[i];
    }
    function bess(i, g, spill) {             // накопитель: заряд срезанной энергией и дневной, разряд вечером
      const hr = i % 24, S = storage, room = (S.e - e) / 0.94; let p = 0;
      if (spill > 1) p = -Math.min(S.p * 1000, spill, room * 1000);
      else if (S.mode === 'shift' && hr >= 10 && hr < 15 && g > 0) p = -Math.min(S.p * 500, g * 0.5, room * 1000);
      else if (hr >= 18 && hr < 23) p = Math.min(S.p * 500, Math.max(0, e - S.e * 0.1) * 0.94 * 1000, Math.max(0, poi - g));
      if (p < 0) { e += -p / 1000 * 0.94; if (spill <= 1) H.grid[i] = g + p; }
      else if (p > 0) { e -= p / 1000 / 0.94; H.grid[i] = g + p; A.stor += p; }
      H.soc[i] = e / S.e; return e;
    }
    const pc = (x, y) => y ? (x / y - 1) * 100 : 0, kwm = 1 / 1000, gridNoStor = A.poi;
    const tree = [['Приход на горизонталь', null, A.ghi * kwm, 'кВт·ч/м²'], ['Наклон и слежение', pc(A.inc, A.ghi)], ['Затенение соседними рядами', pc(A.shaded, A.inc)], ['Отражение от стекла (IAM)', pc(A.front, A.shaded)], ['Загрязнение', pc(A.soil, A.front)], ['Тыльная сторона модулей', A.soil ? bif * A.rear / A.soil * 100 : 0],
      ['Мощность массива при STC', null, A.stc / 1e6, 'ГВт·ч'], ['Слабая освещённость', pc(A.irr, A.stc)], ['Нагрев модулей', pc(A.temp, A.irr)], ['Качество модулей и LID', pc(A.qual, A.temp)], ['Разброс при тыльной засветке', pc(A.rearMis, A.qual)], ['Разброс модулей и стрингов', pc(A.mis, A.rearMis)], ['Кабели постоянного тока', pc(A.ohm, A.mis)],
      ['Энергия на входе инверторов', null, A.ohm / 1e6, 'ГВт·ч'], ['КПД инверторов', pc(A.inv, A.ohm)], ['Срез по мощности инверторов', pc(A.clip, A.inv)], ['Кабели переменного тока', pc(A.acOhm, A.clip)], ['Трансформаторы', pc(A.tr, A.acOhm)], ['Линия среднего напряжения', pc(A.mv, A.tr)], ['Готовность станции', pc(A.avail, A.mv)], ['Предел выдачи в сеть', pc(A.poi, A.avail)],
      ['Отпуск в сеть', null, gridNoStor / 1e6, 'ГВт·ч']];
    const months = [], mGhi = [], mPoa = []; let h = 0; for (let m = 0; m < 12; m++) { let g = 0, a = 0, p = 0; for (let k = 0; k < DAYS[m] * 24; k++, h++) { g += H.grid[h]; a += W.ghi[h]; p += H.poa[h]; } months.push(g / 1000); mGhi.push(a / 1000); mPoa.push(p / 1000); }
    const energy = sum(months), poaY = A.inc / 1000;
    return { H, tree, months, mGhi, mPoa, energy, ghi: A.ghi / 1000, poa: poaY, spec: energy * 1000 / stcKw, pr: energy * 1000 / (stcKw * poaY) * 100, cf: energy * 1000 / (acCap * 8760) * 100, clip: -pc(A.clip, A.inv), shade: -pc(A.shaded, A.inc), p90: energy * (1 - 1.2816 * sim.sigma / 100),
      dcKw: stcKw, acKw: acCap, ratio: stcKw / acCap, gcr, kva, storOut: A.stor / 1000, peak: Math.max.apply(null, H.grid) };
  }

  /* ───────── геометрия участка и расстановка столов ───────── */
  const polyArea = P => Math.abs(P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  const perimeter = P => P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + Math.hypot(q[0] - p[0], q[1] - p[1]); }, 0);
  const inPoly = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const bbox = P => P.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [1e9, 1e9, -1e9, -1e9]);
  const strip = (pts, half) => { const L = [], Rr = []; pts.forEach((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l; L.push([p[0] + nx * half, p[1] + nz * half]); Rr.unshift([p[0] - nx * half, p[1] - nz * half]); }); return L.concat(Rr); };
  const grow = (P, d) => { if (!d) return P; const c = P.reduce((s, p) => [s[0] + p[0] / P.length, s[1] + p[1] / P.length], [0, 0]); return P.map(p => { const l = Math.hypot(p[0] - c[0], p[1] - c[1]) || 1; return [p[0] + (p[0] - c[0]) / l * d, p[1] + (p[1] - c[1]) / l * d]; }); };
  const zonePoly = z => z.line ? strip(z.pts, z.setback || 10) : grow(z.pts, z.setback || 0);       // зона ограничения вместе с отступом
  function freeArea(B, excl) { const b = bbox(B); let n = 0; for (let x = b[0] + 7.5; x < b[2]; x += 15) for (let z = b[1] + 7.5; z < b[3]; z += 15) if (inPoly(x, z, B) && !excl.some(E => inPoly(x, z, E))) n++; return n * 225 / 1e4; }
  /* plant: module, high, wide (модулей вдоль стола), pitch, mount, road (проезд между полосами), ns (проездов север–юг), inset; target — нужное число модулей */
  function layout(plant, boundary, excl, target) {
    const D = byId(MODULES, plant.module), high = plant.high || 1, wide = plant.wide || 81, w = D.len * high + (high > 1 ? 0.02 : 0), len = wide * D.wid * 1.0146, mpt = wide * high, H = plant.mount === 'fixed';
    const inset = plant.inset ?? 12, road = plant.road ?? 7.2, ns = plant.ns ?? 2, b = bbox(boundary), out = [];
    const u0 = H ? b[1] : b[0], u1 = H ? b[3] : b[2], v0 = H ? b[0] : b[1], v1 = H ? b[2] : b[3];
    const ok = (x, z) => inPoly(x, z, boundary) && !excl.some(E => inPoly(x, z, E));
    const fits = (cu, cv) => { const hw = w / 2 + inset, hl = len / 2 + inset;
      for (const [du, dv] of [[-hw, -hl], [hw, -hl], [-hw, hl], [hw, hl]]) if (!inPoly(H ? cv + dv : cu + du, H ? cu + du : cv + dv, boundary)) return false;
      for (let k = -4; k <= 4; k++) { const dv = k / 4 * (len / 2 + 3); for (const du of [-w / 2 - 3, w / 2 + 3]) if (!ok(H ? cv + dv : cu + du, H ? cu + du : cv + dv)) return false; } return true; };
    const corr = []; if (!H) for (let k = 1; k <= ns; k++) corr.push(u0 + (u1 - u0) * k / (ns + 1));
    const nb = Math.max(0, Math.floor((v1 - v0 - 2 * inset + road) / (len + road))), vs = v0 + (v1 - v0 - nb * (len + road) + road) / 2;
    for (let j = 0; j < nb; j++) { const cv = vs + j * (len + road) + len / 2;
      for (let cu = u0 + inset + w / 2; cu <= u1 - inset - w / 2; cu += plant.pitch) { if (corr.some(c => Math.abs(cu - c) < 11 + w / 2)) continue; if (fits(cu, cv)) out.push(H ? [cv, cu, len, w] : [cu, cv, w, len]); } }
    const cap = out.length, need = target ? Math.ceil(target / mpt) : cap, n = Math.min(cap, need);
    return { tables: out.slice(0, n), n, cap, mpt, mods: n * mpt, capMods: cap * mpt, arrayHa: n * plant.pitch * (len + road) / 1e4, len, w };
  }

  /* ───────── стоимость и экономика: пересчёт локальных смет проекта ───────── */
  const L = Object.fromEntries(EPC.SMETA.local.map(x => [x.id, x.v])), DIRECT0 = EPC.SMETA.local.reduce((s, x) => s + x.v, 0), M0 = SITE.meta;
  const EQ = { mods: 0.50, track: 0.26, inv: 0.07, ktp: 0.17 }, ARRAY0 = M0.trackers * M0.pitch * (M0.trackerLen + 7.2) / 1e4, STRUCT = { track1: [1, 1], track2: [0.96, 0.85], fixed: [0.58, 1.25] };
  function cost(plant, lay, costP, finP, energyMWh) {
    const D = byId(MODULES, plant.module), V = byId(INVERTERS, plant.inverter), dcKw = lay.mods * D.p / 1000, kDc = dcKw / M0.dcKw, kAc = plant.inv * V.kw / (M0.inverters * M0.inverterKw), aRel = lay.arrayHa / ARRAY0;
    const st = STRUCT[plant.mount === 'fixed' ? 'fixed' : (plant.high || 1) > 1 ? 'track2' : 'track1'], gcrRel = (2.384 / M0.pitch) / ((D.len * (plant.high || 1)) / plant.pitch), mW = D.p >= 700 ? 1 : D.bif ? 1.03 : 0.94, iW = V.kind === 'центральный' ? 0.82 : 1;
    const direct = L['2-1-6'] * (EQ.mods * kDc * mW + EQ.track * kDc * st[0] * (710 / D.p) * (D.len * D.wid / (2.384 * 1.303)) + EQ.inv * kAc * iW + EQ.ktp * kAc) + L['2-1-7'] * kDc * (0.55 + 0.45 * gcrRel) * (V.kind === 'центральный' ? 1.25 : 1)
      + L['7-1'] * (0.4 + 0.6 * aRel) + L['2-1-3'] * kDc * st[1] * (710 / D.p) * (D.len * D.wid / (2.384 * 1.303)) + L['2-1-2'] * Math.sqrt(Math.max(aRel, 0.05)) * kAc + L['2-1-1'] + L['2-1-4'] * aRel + L['2-1-5'] + L['3-1'];
    const r = direct / DIRECT0, c0 = Object.assign({}, EPC.COST_DEFAULTS, costP), cap = EPC.capex(Object.assign({}, costP, { kSmr: ((1 + c0.kSmr / 100) * r - 1) * 100, kEquip: ((1 + c0.kEquip / 100) * r - 1) * 100 }));
    const fin = energyMWh ? EPC.finance(cap.net * 1000, energyMWh, finP) : null;
    return { net: cap.net, total: cap.total, perW: cap.net / dcKw, fin, lcoe: fin ? fin.lcoe : null };
  }
  function bom(plant, lay) {
    const D = byId(MODULES, plant.module), V = byId(INVERTERS, plant.inverter), piles = plant.mount === 'fixed' ? 34 : (plant.high || 1) > 1 ? 23 : 15, kDc = lay.mods * D.p / 1000 / M0.dcKw, gcrRel = (2.384 / M0.pitch) / ((D.len * (plant.high || 1)) / plant.pitch);
    return [['Модули ' + D.model, lay.mods, 'шт'], [(plant.mount === 'fixed' ? 'Столы ' : 'Трекеры ') + (plant.high || 1) + '×' + (plant.wide || 81), lay.n, 'шт'], ['Сваи', lay.n * piles, 'шт'], ['Стринги по 27 модулей', Math.floor(lay.mods / 27), 'шт'],
      ['Инверторы ' + V.model, plant.inv, 'шт'], ['Трансформаторные подстанции', Math.max(1, Math.ceil(plant.inv * V.kw / 9000 * 1.33)), 'шт'], ['Кабель постоянного тока', Math.round(223.1 * kDc * (0.55 + 0.45 * gcrRel)), 'км'], ['Кабель 0,8 кВ', +(11 * Math.sqrt(lay.arrayHa / ARRAY0) * plant.inv / M0.inverters).toFixed(1), 'км'],
      ['Площадь массива', +lay.arrayHa.toFixed(1), 'га'], ['Ограждение', Math.round(4 * Math.sqrt(lay.arrayHa * 1e4) * 1.25 / 10) * 10, 'м']];
  }

  window.ENG = { MODULES, INVERTERS, WEATHER, MON, DAYS, byId, sunAt, hourly, simulate, layout, cost, bom, polyArea, perimeter, inPoly, bbox, strip, grow, zonePoly, freeArea, SYS0, SIM0 };
})();
