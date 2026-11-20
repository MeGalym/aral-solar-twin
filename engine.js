/* Расчётный движок Платформы ВИЭ, версия 2. Почасовой расчёт по иерархии станции:
   площадка → блок → массив → инвертор → DC-поле, с суммированием снизу вверх.
   Цепочка и формулы — общепринятые в отрасли модели (их же реализует открытая библиотека pvlib):
   1. облучённость: положение солнца, воздушная масса, разложение GHI (Эрбс, Рейндл, DISC), слежение и обратный ход,
      транспозиция (Хей–Дэвис, Перес), затенение неба, земли и рядов, загрязнение, IAM, спектр, тыльная сторона;
   2. фотоэлектрическое преобразование: тепловой баланс, потери DC, однодиодная модель с переносом параметров;
   3. инвертор: деградация, ограничение, КПД; 4. сеть: собственные нужды, трансформаторы, линии, готовность, предел выдачи;
   5. накопитель. Отличия от полноразмерных пакетов: упрощённое положение солнца (без SPA), DISC вместо DIRINT,
      тыльная сторона и затенение земли считаются по двумерной модели рядов без рельефа. */
(function () {
  const RAD = Math.PI / 180, DEG = 180 / Math.PI;
  const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], MON = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const MONTH_OF = new Uint8Array(8760); { let h = 0; for (let m = 0; m < 12; m++) for (let k = 0; k < DAYS[m] * 24; k++) MONTH_OF[h++] = m; }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v, byId = (list, id) => list.find(x => x.id === id) || list[0];

  /* ───────── библиотеки по умолчанию ───────── */
  const MODULES = [
    { id: 'tr710', maker: 'Trina Solar', model: 'Vertex N TSM-NEG21C.20', p: 710, voc: 49.0, isc: 18.40, vmp: 40.9, imp: 17.36, ns: 66, muP: -0.29, muIsc: 0.04, len: 2.384, wid: 1.303, bif: 0.80, tech: 'n-TOPCon', cells: 'половинные', glass: 'стекло-стекло', rs: 0.174, src: 'паспорт, принят в проекте', status: 'Действующий' },
    { id: 'm620', maker: 'Демо', model: 'TOPCon 620 Вт, двусторонний', p: 620, voc: 57.2, isc: 13.90, vmp: 47.6, imp: 13.03, ns: 78, muP: -0.30, muIsc: 0.045, len: 2.382, wid: 1.134, bif: 0.80, tech: 'n-TOPCon', cells: 'половинные', glass: 'стекло-стекло', src: 'демо-данные', status: 'Действующий' },
    { id: 'm580', maker: 'Демо', model: 'PERC 580 Вт, односторонний', p: 580, voc: 51.6, isc: 14.30, vmp: 43.3, imp: 13.40, ns: 72, muP: -0.34, muIsc: 0.05, len: 2.278, wid: 1.134, bif: 0, tech: 'p-PERC', cells: 'половинные', glass: 'стекло-плёнка', src: 'демо-данные', status: 'Действующий' },
  ];
  const INVERTERS = [
    { id: 'sg320', maker: 'Sungrow', model: 'SG320-HX-20', kw: 320, kva: 352, kind: 'стринговый', eff: 98.5, vdc: 1500, mppLo: 500, mppHi: 1500, vac: 800, src: 'принят в проекте', status: 'Действующий' },
    { id: 's350', maker: 'Демо', model: 'Стринговый 350 кВт', kw: 350, kva: 385, kind: 'стринговый', eff: 98.6, vdc: 1500, mppLo: 500, mppHi: 1500, vac: 800, src: 'демо-данные', status: 'Действующий' },
    { id: 'c4400', maker: 'Демо', model: 'Центральный 4 400 кВт', kw: 4400, kva: 4840, kind: 'центральный', eff: 98.3, vdc: 1500, mppLo: 915, mppHi: 1300, vac: 630, src: 'демо-данные', status: 'Действующий' },
  ];
  const LIB = { modules: MODULES.slice(), inverters: INVERTERS.slice(), weather: [] };

  /* ───────── погода ─────────
     Файл погоды: почасовые GHI, DHI, DNI, температура, ветер. solar = true — время местное солнечное. */
  const MN = { ghi: [41.0, 64.4, 112.4, 141.0, 179.8, 196.4, 197.8, 166.7, 125.5, 81.6, 42.3, 31.2], dhi: [18.70, 29.17, 51.68, 70.94, 92.11, 87.16, 79.32, 73.80, 41.95, 39.69, 24.68, 19.08], tamb: [-10.08, -9.26, 1.77, 11.94, 20.05, 25.11, 27.48, 25.79, 17.90, 8.92, -0.15, -7.17] };
  const mul = (a, k) => a.map((v, i) => +(v * k[i]).toFixed(1)), add = (a, d) => a.map((v, i) => +(v + d[i]).toFixed(2));
  function monthly(w) { const g = new Array(12).fill(0), d = new Array(12).fill(0), t = new Array(12).fill(0); for (let i = 0; i < 8760; i++) { const m = MONTH_OF[i]; g[m] += w.ghi[i] / 1000; d[m] += w.dhi[i] / 1000; t[m] += w.tamb[i] / (DAYS[m] * 24); } return { ghi: g, dhi: d, tamb: t }; }
  /* Ряд по месячным суммам источника: форма суток и чередование ясных и пасмурных дней берутся из настоящего почасового ряда,
     каждый месяц масштабируется до сумм источника, температура сдвигается до его месячных средних. */
  function scaled(base, m, meta) {
    const b = monthly(base), N = 8760, w = Object.assign({ ghi: new Float32Array(N), dhi: new Float32Array(N), dni: null, tamb: new Float32Array(N), wind: base.wind, rh: base.rh, solar: base.solar, synth: true }, meta);
    for (let i = 0; i < N; i++) { const k = MONTH_OF[i], kg = m.ghi[k] / b.ghi[k], kd = m.dhi[k] / b.dhi[k]; w.dhi[i] = base.dhi[i] * kd; w.ghi[i] = Math.max(w.dhi[i], base.ghi[i] * kg); w.tamb[i] = base.tamb[i] + (m.tamb[k] - b.tamb[k]); }
    for (let k = 0; k < 12; k++) { let s = 0, d = 0; for (let i = 0; i < N; i++) if (MONTH_OF[i] === k) { s += w.ghi[i]; d += w.dhi[i]; } const f = (m.ghi[k] * 1000 - d) / Math.max(s - d, 1); for (let i = 0; i < N; i++) if (MONTH_OF[i] === k) w.ghi[i] = w.dhi[i] + (w.ghi[i] - w.dhi[i]) * f; }
    return w;
  }
  if (window.WX_ARAL) {
    const X = window.WX_ARAL, nasa = { id: 'nasa23', name: 'NASA POWER, 2023', kind: 'почасовой ряд, спутник и реанализ', type: 'Спутниковые', note: 'настоящий почасовой ряд для точки у Аральска', src: 'открытые данные', lat: 46.79, lon: 61.73,
      ghi: Float32Array.from(X.ghi), dhi: Float32Array.from(X.dhi), dni: Float32Array.from(X.dni), tamb: Float32Array.from(X.tamb), wind: Float32Array.from(X.wind), rh: Float32Array.from(X.rh), solar: true };
    const mk = (id, name, kind, type, note, src, m) => scaled(nasa, m, { id, name, kind, type, note, src, lat: 46.79, lon: 61.73 });
    LIB.weather.push(
      mk('mn', 'Meteonorm 8.1', 'типичный год, месячные суммы', 'Типичный год', 'принят в проекте; почасовой ряд построен из месячных сумм отчёта', 'отчёт проекта', MN),
      nasa,
      mk('sat', 'Спутниковый ряд, 1994–2023', 'среднее за 30 лет', 'Спутниковые', 'почасовой ряд из месячных сумм', 'демо-данные', { ghi: mul(MN.ghi, [1.06, 1.05, 1.03, 1.02, 1.02, 1.03, 1.02, 1.03, 1.02, 1.03, 1.05, 1.07]), dhi: mul(MN.dhi, [1.02, 1.01, 0.99, 0.98, 0.97, 0.98, 0.98, 0.97, 1.0, 0.99, 1.01, 1.02]), tamb: add(MN.tamb, [0.6, 0.5, 0.4, 0.3, 0.2, 0.3, 0.4, 0.3, 0.2, 0.3, 0.5, 0.6]) }),
      mk('ms', 'Измерения на площадке', '12 месяцев', 'Измерения', 'пиранометр и метеостанция, приведены к спутниковому ряду', 'демо-данные', { ghi: mul(MN.ghi, [1.03, 1.01, 1.02, 1.0, 1.01, 1.02, 1.01, 1.02, 1.01, 1.0, 1.02, 1.03]), dhi: mul(MN.dhi, [1.0, 1.0, 0.98, 0.99, 0.98, 0.97, 0.98, 0.98, 0.99, 1.0, 1.0, 1.01]), tamb: add(MN.tamb, [0.3, 0.2, 0.4, 0.1, 0.3, 0.2, 0.3, 0.2, 0.1, 0.2, 0.2, 0.3]) }));
  }
  function weatherFromRows(rows, meta) {            // rows: [{ghi, dhi?, dni?, tamb, wind?}] × 8760
    const N = 8760, w = Object.assign({ ghi: new Float32Array(N), dhi: new Float32Array(N), dni: null, tamb: new Float32Array(N), wind: new Float32Array(N).fill(2), solar: false, noDhi: false }, meta);
    let hasD = 0, hasN = 0; rows.forEach(r => { if (r.dhi > 0) hasD++; if (r.dni > 0) hasN++; }); if (hasN > 500) w.dni = new Float32Array(N); w.noDhi = hasD < 500;
    for (let i = 0; i < N; i++) { const r = rows[i] || {}; w.ghi[i] = Math.max(0, +r.ghi || 0); w.dhi[i] = Math.max(0, +r.dhi || 0); if (w.dni) w.dni[i] = Math.max(0, +r.dni || 0); w.tamb[i] = +r.tamb || 0; if (r.wind != null) w.wind[i] = Math.max(0, +r.wind || 0); }
    return w;
  }

  /* ───────── солнце ───────── */
  function sunAt(hour, doy, site, solar) {
    const B = 2 * Math.PI * (doy - 81) / 364, eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    const st = solar ? hour : hour + (site.lon - 15 * site.tz) / 15 + eot / 60, H = (st - 12) * 15 * RAD, dec = 23.44 * RAD * Math.sin(2 * Math.PI * (284 + doy) / 365), la = site.lat * RAD;
    const up = Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H), east = -Math.cos(dec) * Math.sin(H), north = Math.cos(la) * Math.sin(dec) - Math.sin(la) * Math.cos(dec) * Math.cos(H);
    return { x: east, y: up, z: -north };
  }
  const extra = doy => { const z = 2 * Math.PI * (doy - 1) / 365.25; return 1361 * (1.00011 + 0.034221 * Math.cos(z) + 0.00128 * Math.sin(z) + 0.000719 * Math.cos(2 * z) + 0.000077 * Math.sin(2 * z)); };
  const AMC = { bird: [0.15, 93.885, 1.253], kasten: [0.50572, 96.07995, 1.6364] };
  const airmass = (zen, model) => { if (zen >= 89) return 0; const c = AMC[model] || AMC.bird; return 1 / (Math.cos(zen * RAD) + c[0] * Math.pow(c[1] - zen, -c[2])); };
  const geoCache = new Map();
  function geometry(w, site, amModel) {
    const key = w.id + '|' + site.lat + '|' + site.lon + '|' + amModel; if (geoCache.has(key)) return geoCache.get(key);
    const N = 8760, g = { sx: new Float32Array(N), sy: new Float32Array(N), sz: new Float32Array(N), am: new Float32Array(N), ext: new Float32Array(N) }, press = Math.pow(1 - (site.alt || 60) * 2.25577e-5, 5.25588);
    for (let i = 0; i < N; i++) { const doy = (i / 24 | 0) + 1, s = sunAt(i % 24 + 0.5, doy, site, w.solar); g.sx[i] = s.x; g.sy[i] = s.y; g.sz[i] = s.z; g.ext[i] = extra(doy); g.am[i] = airmass(Math.acos(clamp(s.y, -1, 1)) * DEG, amModel) * press; }
    if (geoCache.size > 12) geoCache.clear(); geoCache.set(key, g); return g;
  }

  /* ───────── разложение GHI на прямую и рассеянную ───────── */
  function decompose(model, ghi, cosZ, ext, am, tamb, rh) {
    if (ghi <= 0 || cosZ <= 0.01) return ghi > 0 ? ghi : 0;
    const kt = clamp(ghi / (ext * cosZ), 0, 1.2); let fd;
    if (model === 'reindl') { const R = rh == null ? null : rh / 100;
      if (kt <= 0.3) fd = Math.min(1, R == null ? 1.02 - 0.254 * kt + 0.0123 * cosZ : 1 - 0.232 * kt + 0.0239 * cosZ - 0.000682 * tamb + 0.0195 * R);
      else if (kt < 0.78) fd = clamp(R == null ? 1.4 - 1.749 * kt + 0.177 * cosZ : 1.329 - 1.716 * kt + 0.267 * cosZ - 0.00357 * tamb + 0.106 * R, 0.1, 0.97);
      else fd = Math.max(0.1, R == null ? 0.486 * kt - 0.182 * cosZ : 0.426 * kt - 0.256 * cosZ + 0.00349 * tamb + 0.0734 * R); }
    else if (model === 'disc') { const a = am || 1, knc = 0.866 - 0.122 * a + 0.0121 * a * a - 0.000653 * a ** 3 + 0.000014 * a ** 4; let A, Bc, C;
      if (kt > 0.6) { A = -5.743 + 21.77 * kt - 27.49 * kt * kt + 11.56 * kt ** 3; Bc = 41.4 - 118.5 * kt + 66.05 * kt * kt + 31.9 * kt ** 3; C = -47.01 + 184.2 * kt - 222 * kt * kt + 73.81 * kt ** 3; }
      else { A = 0.512 - 1.56 * kt + 2.286 * kt * kt - 2.222 * kt ** 3; Bc = 0.37 + 0.962 * kt; C = -0.28 + 0.932 * kt - 2.048 * kt * kt; }
      const dni = clamp((knc - (A + Bc * Math.exp(C * a))) * ext, 0, ext); return clamp(ghi - dni * cosZ, 0.05 * ghi, ghi); }
    else fd = kt <= 0.22 ? 1 - 0.09 * kt : kt <= 0.8 ? 0.9511 - 0.1604 * kt + 4.388 * kt * kt - 16.638 * kt ** 3 + 12.336 * kt ** 4 : 0.165;   // Эрбс
    return fd * ghi;
  }

  /* ───────── транспозиция Переса: коэффициенты «все площадки, 1990» ───────── */
  const PEREZ = [[-0.008, 0.588, -0.062, -0.06, 0.072, -0.022], [0.13, 0.683, -0.151, -0.019, 0.066, -0.029], [0.33, 0.487, -0.221, 0.055, -0.064, -0.026], [0.568, 0.187, -0.295, 0.109, -0.152, -0.014], [0.873, -0.392, -0.362, 0.226, -0.462, 0.001], [1.132, -1.237, -0.412, 0.288, -0.823, 0.056], [1.06, -1.6, -0.359, 0.264, -1.127, 0.131], [0.678, -0.327, -0.25, 0.156, -1.377, 0.251]];
  const PBIN = [1.065, 1.23, 1.5, 1.95, 2.8, 4.5, 6.2];

  /* ───────── IAM ───────── */
  const IAM_TAB = [[0, 1], [30, 1], [50, 0.999], [60, 0.994], [70, 0.969], [75, 0.928], [80, 0.829], [85, 0.588], [90, 0]];
  function iamBeam(model, deg, b0) {
    if (model === 'none') return 1; if (deg >= 90) return 0;
    if (model === 'ashrae') return Math.max(0, 1 - b0 * (1 / Math.cos(deg * RAD) - 1));
    if (model === 'physical') { const n = 1.526, K = 4, Lg = 0.002, f = t => { if (t < 1e-4) return Math.pow((n - 1) / (n + 1), 2); const tr = Math.asin(Math.sin(t) / n); return 0.5 * (Math.pow(Math.sin(tr - t) / Math.sin(tr + t), 2) + Math.pow(Math.tan(tr - t) / Math.tan(tr + t), 2)); }, t = deg * RAD, tg = Math.asin(Math.sin(t) / n);
      return Math.max(0, (1 - f(t)) / (1 - f(0)) * Math.exp(-K * Lg * (1 / Math.cos(tg) - 1))); }
    for (let k = 1; k < IAM_TAB.length; k++) if (deg <= IAM_TAB[k][0]) { const q = (deg - IAM_TAB[k - 1][0]) / (IAM_TAB[k][0] - IAM_TAB[k - 1][0]); return IAM_TAB[k - 1][1] + (IAM_TAB[k][1] - IAM_TAB[k - 1][1]) * q; } return 0;
  }
  const iamDifCache = new Map();
  function iamDiffuse(model, tiltDeg, b0) {          // небо и земля: интеграл IAM по видимой полусфере с весом cos
    if (model === 'none') return ONE2; const t = Math.round(tiltDeg), key = model + t + b0; if (iamDifCache.has(key)) return iamDifCache.get(key);
    const b = t * RAD; let sN = 0, sD = 0, gN = 0, gD = 0;
    for (let el = -88; el <= 88; el += 4) for (let az = 0; az < 360; az += 8) { const ce = Math.cos(el * RAD), c = ce * Math.cos(az * RAD) * Math.sin(b) + Math.sin(el * RAD) * Math.cos(b); if (c <= 0) continue; const v = iamBeam(model, Math.acos(Math.min(1, c)) * DEG, b0) * c * ce; if (el > 0) { sN += v; sD += c * ce; } else { gN += v; gD += c * ce; } }
    const out = [sD ? sN / sD : 1, model === 'ashrae' ? 1 : gD ? gN / gD : 1]; iamDifCache.set(key, out); return out;
  }
  const ONE2 = [1, 1];

  /* ───────── однодиодная модель модуля: 5 параметров из паспорта, перенос по освещённости и температуре ───────── */
  const KB = 1.380649e-23, QE = 1.602176634e-19, TREF = 298.15, EG = 1.12, modCache = new Map(), ZERO = { p: 0, v: 0 };
  function moduleModel(D, rWire) {
    const key = D.id + '|' + D.p + '|' + D.voc + '|' + D.vmp + '|' + (rWire || 0).toFixed(5); if (modCache.has(key)) return modCache.get(key);
    const rs0 = D.rs || 0.373 * (D.voc - D.vmp) / D.imp, rshRef = D.rsh || 1000 * (D.voc / 49) * (18.4 / D.isc), rsh0 = rshRef * 4, vt = D.ns * KB * TREF / QE;
    const mk = rs => { const iv = (V, iph, i0, a, rsh) => { let I = iph; for (let k = 0; k < 40; k++) { const e = Math.exp((V + I * rs) / a), g = iph - i0 * (e - 1) - (V + I * rs) / rsh - I, dg = -i0 * e * rs / a - rs / rsh - 1, n = I - g / dg; if (Math.abs(n - I) < 1e-7) { I = n; break; } I = n; } return I; };
      const mpp = (iph, i0, a, rsh) => { const voc = a * Math.log(iph / i0 + 1); let lo = 0.5 * voc, hi = voc; const gr = 0.6180339887; let x1 = hi - gr * (hi - lo), x2 = lo + gr * (hi - lo), f1 = x1 * iv(x1, iph, i0, a, rsh), f2 = x2 * iv(x2, iph, i0, a, rsh);
        for (let k = 0; k < 32; k++) { if (f1 < f2) { lo = x1; x1 = x2; f1 = f2; x2 = lo + gr * (hi - lo); f2 = x2 * iv(x2, iph, i0, a, rsh); } else { hi = x2; x2 = x1; f2 = f1; x1 = hi - gr * (hi - lo); f1 = x1 * iv(x1, iph, i0, a, rsh); } } const v = (lo + hi) / 2; return { p: v * iv(v, iph, i0, a, rsh), v }; };
      return { iv, mpp }; };
    const F0 = mk(rs0), refAt = a => { const i0 = (D.isc * (1 + rs0 / rshRef) - D.voc / rshRef) / (Math.exp(D.voc / a) - Math.exp(D.isc * rs0 / a)); return { i0, iph: i0 * (Math.exp(D.voc / a) - 1) + D.voc / rshRef }; };
    let lo = 0.7 * vt, hi = 2.0 * vt; const res = a => { const r = refAt(a); return F0.iv(D.vmp, r.iph, r.i0, a, rshRef) - D.imp; };
    if (res(lo) * res(hi) < 0) for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; res(lo) * res(mid) <= 0 ? hi = mid : lo = mid; }
    const a0 = (lo + hi) / 2, r0 = refAt(a0), gamma0 = a0 / vt, scale = D.p / F0.mpp(r0.iph, r0.i0, a0, rshRef).p, FW = mk(rs0 + (rWire || 0));
    const par = (G, Tc, mg) => { const Tk = Tc + 273.15, gamma = gamma0 * (1 + mg * (Tc - 25)); return { a: gamma * D.ns * KB * Tk / QE, iph: G / 1000 * r0.iph * (1 + D.muIsc / 100 * (Tc - 25)), i0: r0.i0 * Math.pow(Tk / TREF, 3) * Math.exp(QE * EG / (gamma * KB) * (1 / TREF - 1 / Tk)), rsh: rshRef + (rsh0 - rshRef) * Math.exp(-5.5 * G / 1000) }; };
    const raw = (F, G, Tc, mg) => { const q = par(G, Tc, mg), r = F.mpp(q.iph, q.i0, q.a, q.rsh); return { p: r.p * scale, v: r.v }; };
    let mg = 0; { let l = -0.003, h = 0.003; const target = 1 + D.muP / 100 * 25, f = x => raw(F0, 1000, 50, x).p / raw(F0, 1000, 25, x).p - target; if (f(l) * f(h) < 0) { for (let k = 0; k < 40; k++) { const mid = (l + h) / 2; f(l) * f(mid) <= 0 ? h = mid : l = mid; } mg = (l + h) / 2; } }
    const c0 = new Map(), cw = new Map(), get = (cache, F) => (G, Tc) => { if (G < 1) return ZERO; const k = Math.round(G) * 1000 + Math.round((Tc + 60) * 2); let r = cache.get(k); if (!r) { r = raw(F, Math.round(G), Math.round(Tc * 2) / 2, mg); if (cache.size > 90000) cache.clear(); cache.set(k, r); } return r; };
    const M = { mpp: get(c0, F0), mppW: rWire ? get(cw, FW) : null, eff: D.p / (1000 * D.len * D.wid), gamma: gamma0, rs: rs0, rsh: rshRef, iph: r0.iph, i0: r0.i0,
      curve: (G, Tc) => { const q = par(G, Tc, mg), voc = q.a * Math.log(q.iph / q.i0 + 1), pts = []; for (let k = 0; k <= 60; k++) { const v = voc * k / 60; pts.push([v, Math.max(0, F0.iv(v, q.iph, q.i0, q.a, q.rsh)) * scale]); } return pts; } };
    if (modCache.size > 40) modCache.clear(); modCache.set(key, M); return M;
  }

  /* ───────── значения по умолчанию ───────── */
  const FIELD0 = { module: 'tr710', mount: 'track', track: 'back', limit: 60, tilt: 30, az: 180, axisAz: 0, high: 1, wide: 81, series: 27, pitch: 7.22, post: 1.75, rows: 0, rowLen: 0,
    quality: -0.8, mismatch: 2.1, lid: 0, wiring: 1.5, health: 0, trackLoad: 0, uc: 29, uv: 0, structShade: 5, backMis: 10 };
  const ARRAY0 = { rep: 1, mvOn: true, mvKva: 0, mvKv: 35, mvNl: 0.06, mvFl: 0.34, coll: 0.06, das: 0, cool: 0, acOhm: 2.28 };
  const SYS0 = { avail: 0, poiOn: false, poi: 0, nightDisc: false, hv: [] };
  const ENV0 = { weather: 'mn', airmass: 'bird', soilModel: 'none', spectralModel: 'none', monthly: Array.from({ length: 12 }, () => ({ albedo: 0.2, soil: 0, spectral: 0 })), albedoRear: 0.3 };
  const SIM0 = { decomp: 'none', transp: 'perez', circum: 'direct', iam: 'table', b0: 0.05, tempModel: 'heat', direct: 'linear', fracN: 3, diffuse: true, years: 25, degModel: 'linearDC', degRate: 0.4, firstYear: false };
  const UNC0 = { iav: 1.8, resource: 0, model: 0, soiling: 0, other: 0 };
  const ESS0 = { mwh: 20, usable: 0.9, mw: 10, rte: 88, invEff: 97.5, calDeg: 1.5, cycDeg: 0.005, algo: 'lgia', hours: [18, 19, 20, 21, 22], hvac: 0.2 };
  const REAR_K = (typeof process !== 'undefined' && process.env.RK) ? +process.env.RK : 0.62;   // двумерная модель тыла завышает приход; множитель подобран под отчёт проекта (8,25 % от фронта)

  /* ───────── DC-поле: почасовая облучённость и мощность одного модуля ───────── */
  function fieldRun(f, W, G, env, sim) {
    const D = byId(LIB.modules, f.module), N = 8760, high = f.high || 1, lm = (f.orient === 'land' ? D.wid : D.len) * high + (high > 1 ? 0.02 : 0), p = f.pitch, gcr = lm / p, fixed = f.mount === 'fixed', bif = D.bif || 0;
    const lim = (f.limit || 60) * RAD, tilt0 = (f.tilt || 30) * RAD, az = (fixed ? (f.az ?? 180) : (f.axisAz || 0) + 90) * RAD, ux = Math.sin(az), uz = -Math.cos(az);   // u — горизонтальная ось поперёк рядов
    const nRows = f.rows > 1 ? f.rows : 40, rowLen = f.rowLen > 0 ? f.rowLen : 0, post = f.post || 1.75;
    const ccomb = (1 - f.mismatch / 100) * (1 - f.quality / 100) * (1 - f.lid / 100) * (1 - f.health / 100), MM0 = moduleModel(D, 0), rw = f.wiring > 0 ? f.wiring / 100 * D.p / (D.imp * D.imp) : 0, MM = moduleModel(D, rw);
    const o = { D, lm, gcr, area: D.len * D.wid, poa: new Float32Array(N), eff: new Float32Array(N), rear: new Float32Array(N), tc: new Float32Array(N), p: new Float32Array(N), v: new Float32Array(N), ang: new Float32Array(N),
      S: { ghi: 0, poa: 0, near: 0, soil: 0, iam: 0, eff: 0, rearRaw: 0, bifLost: 0, struct: 0, rearEff: 0, backMis: 0, pStc: 0, elec: 0, irr: 0, temp: 0, mis: 0, lid: 0, qual: 0, health: 0, wire: 0, pmp: 0 } }, S = o.S;
    const useDni = !!W.dni && sim.decomp === 'none', needDec = W.noDhi || sim.decomp !== 'none', NG = 24, gnd = new Float32Array(NG), lossSum = f.mismatch + f.quality + f.lid + f.health;
    for (let i = 0; i < N; i++) {
      const sy = G.sy[i], ghi = W.ghi[i]; o.tc[i] = W.tamb[i]; if (sy <= 0.012 || ghi <= 0.5) continue;
      const mf = env.monthly[MONTH_OF[i]], ext = G.ext[i]; let dhi = needDec ? decompose(sim.decomp === 'none' ? 'erbs' : sim.decomp, ghi, sy, ext, G.am[i], W.tamb[i], W.rh ? W.rh[i] : null) : Math.min(W.dhi[i], ghi);
      let dni = useDni ? W.dni[i] : Math.max(0, (ghi - dhi) / Math.max(sy, 0.035)); if (dni > ext) dni = ext; if (useDni) dhi = clamp(ghi - dni * sy, 0, ghi);
      /* ориентация */
      const su = G.sx[i] * ux + G.sz[i] * uz, sAlong = -G.sx[i] * uz + G.sz[i] * ux; let a;
      if (fixed) a = tilt0; else { a = Math.atan2(su, sy); if (f.track !== 'true') { const c = Math.abs(Math.cos(a)) / gcr; if (c < 1) a -= Math.sign(a) * Math.acos(c); } a = clamp(a, -lim, lim); }
      const ab = Math.abs(a), ca = Math.cos(a), sa = Math.sin(ab), cosT = Math.max(0, su * Math.sin(a) + sy * ca), zen = Math.acos(clamp(sy, 0, 1)), aoi = Math.acos(Math.min(1, cosT)) * DEG; o.ang[i] = a * DEG;
      /* транспозиция */
      let iso, circ, hor = 0; const rb = cosT / Math.max(sy, 0.0872);
      if (sim.transp === 'hay') { const ai = Math.min(1, dni / ext); circ = dhi * ai * rb; iso = dhi * (1 - ai) * (1 + ca) / 2; }
      else { const z3 = 1.041 * zen * zen * zen, eps = dhi > 0 ? ((dhi + dni) / dhi + z3) / (1 + z3) : 99, dl = dhi * (G.am[i] || 1 / Math.max(sy, 0.05)) / ext; let b = 0; while (b < 7 && eps >= PBIN[b]) b++; const c = PEREZ[b], F1 = Math.max(0, c[0] + c[1] * dl + c[2] * zen), F2 = c[3] + c[4] * dl + c[5] * zen;
        iso = dhi * (1 - F1) * (1 + ca) / 2; circ = dhi * F1 * rb; hor = dhi * F2 * sa; if (iso + circ + hor < 0) { iso = 0; circ = 0; hor = 0; } }
      const direct = sim.circum === 'direct', beam = dni * cosT + (direct ? circ : 0), sky = iso + hor + (direct ? 0 : circ), grd = mf.albedo * ghi * (1 - ca) / 2, poa = beam + sky + grd;
      /* затенение: небо, земля, ряды */
      const psi = Math.atan2(lm * sa, 2 * p - lm * ca), uD = sim.diffuse ? (1 + Math.cos(ab + psi)) / (1 + ca) : 1;
      const tp = Math.atan2(su, sy), shFrac = clamp(gcr * Math.abs(Math.cos(a - tp)) / Math.max(Math.cos(tp), 0.03), 0, 1), uG = sim.diffuse ? clamp(((1 - 0.63 * gcr * ca) * dhi + (1 - shFrac) * dni * sy) / Math.max(ghi, 1), 0, 1) : 1;
      let uB = 1; if (sim.direct !== 'none' && (fixed || f.track === 'true' || ab >= lim - 1e-4)) { const q = (a >= 0 ? su : -su) / sy, den = ca + sa * q; let hs = den > 0 ? 1 - p / (lm * den) : 0, ls = 1; if (hs < 0 || hs > 1) hs = 0; if (rowLen > 0 && hs > 0) { ls = 1 - p * sa * Math.abs(sAlong) / sy / (rowLen * den); if (ls < 0 || ls > 1) ls = 0; } uB = 1 - hs * ls * (nRows - 1) / nRows; }
      let uBe = uB; if (uB < 0.995) { if (sim.direct === 'step') { const n = Math.max(1, sim.fracN | 0); uBe = 1 - Math.ceil(n * (1 - uB)) / n; } else if (sim.direct === 'fractional') { const Mh = Math.max(1, high * 3); uBe = (Mh - Math.ceil(Mh * (1 - uB))) / Mh; } }
      const bS = beam * uB, sS = sky * uD, gS = grd * uG, near = bS + sS + gS;
      /* загрязнение, IAM, спектр */
      const uSoil = env.soilModel === 'none' ? 1 : 1 - mf.soil / 100, dIam = iamDiffuse(sim.iam, ab * DEG, sim.b0), ib = iamBeam(sim.iam, aoi, sim.b0), afterSoil = near * uSoil, afterIam = (bS * ib + sS * dIam[0] + gS * dIam[1]) * uSoil;
      const uSp = env.spectralModel === 'monthly' ? 1 - mf.spectral / 100 : 1, front = afterIam * uSp, frontElec = (beam * uBe * ib + sS * dIam[0] + gS * dIam[1]) * uSoil * uSp;
      /* тыльная сторона: облучённость земли между рядами (тень стола, вид неба) и её вид с шести точек тыла по высоте стола */
      let rear = 0;
      if (bif > 0) { const lv = lm * sa, lh = lm * ca, c = Math.max(0.2, post - lv / 2), q = su / sy, sgn = a >= 0 ? 1 : -1, xL = -sgn * lh / 2, xH = sgn * lh / 2, s1 = xL - c * q, s2 = xH - (c + lv) * q, sA = Math.min(s1, s2), sB = Math.max(s1, s2), bh = dni * sy;
        for (let k = 0; k < NG; k++) { const x = -p / 2 + (k + 0.5) * p / NG; let sh = 0; for (let r = -3; r <= 3; r++) if (x >= sA + r * p && x <= sB + r * p) { sh = 1; break; }
          const e1 = Math.atan2(c + lv / 2, Math.abs(x) + lh / 2 + 0.05), e2 = Math.atan2(c + lv / 2, Math.abs(p - Math.abs(x)) + lh / 2 + 0.05), fs = clamp(1 - gcr * ca * 0.5 * (Math.sin(e1) + Math.sin(e2)), 0.15, 1); gnd[k] = dhi * fs + bh * (1 - sh); }
        let acc = 0; for (let j = 0; j < 6; j++) { const fr = (j + 0.5) / 6, xj = xL + (xH - xL) * fr, yj = c + lv * fr; let gj = 0;
          for (let d = -86; d <= 86; d += 4) { const th = d * RAD, w = Math.cos(th - sgn * ab * 0) * Math.cos(th + sgn * ab) ; if (w <= 0) continue; const xg = xj + yj * Math.tan(th), xr = ((xg + p / 2) % p + p) % p; gj += w * gnd[Math.min(NG - 1, xr / p * NG | 0)] * 4 * RAD; }
          acc += gj / 2; }
        const skyRear = dhi * (1 - ca) / 2 * 0.6;
        rear = Math.max(0, (acc / 6 * (env.albedoRear ?? mf.albedo) + skyRear) * REAR_K); }
      const rearStruct = rear * (1 - f.structShade / 100), rearEff = bif * rearStruct * (1 - f.backMis / 100), effTot = front + rearEff, effElec = frontElec + rearEff;
      /* температура и модуль */
      const wind = W.wind ? W.wind[i] : 1, tc = sim.tempModel === 'noct' ? W.tamb[i] + front / 800 * 25 * (1 - MM0.eff / 0.9) : sim.tempModel === 'sandia' ? front * Math.exp(-3.56 - 0.075 * wind) + W.tamb[i] + front / 1000 * 3 : W.tamb[i] + 0.9 * front * (1 - MM0.eff) / (f.uc + f.uv * wind);
      const gE = effElec * ccomb, pStc = D.p * effTot / 1000, p25 = MM0.mpp(effTot, 25).p, pT0 = MM0.mpp(effTot, tc).p, pTe = MM0.mpp(effElec, tc).p, r0 = MM0.mpp(gE, tc), rW = MM.mppW ? MM.mppW(gE, tc) : r0;
      o.poa[i] = poa; o.eff[i] = effTot; o.rear[i] = rearEff; o.tc[i] = tc; o.p[i] = rW.p; o.v[i] = rW.v;
      S.ghi += ghi; S.poa += poa; S.near += near; S.soil += afterSoil; S.iam += afterIam; S.eff += front; S.rearRaw += rear; S.bifLost += rearStruct * (1 - bif); S.struct += rear - rearStruct; S.backMis += bif * rearStruct * f.backMis / 100; S.rearEff += rearEff;
      S.pStc += pStc; S.irr += pStc - p25; S.temp += p25 - pT0; S.elec += pT0 - pTe; const loss = pTe - r0.p; if (lossSum) { S.mis += loss * f.mismatch / lossSum; S.qual += loss * f.quality / lossSum; S.lid += loss * f.lid / lossSum; S.health += loss * f.health / lossSum; } S.wire += r0.p - rW.p; S.pmp += rW.p;
    }
    return o;
  }

  /* ───────── трансформатор и инвертор ───────── */
  function trafo(pin, rated, nl, fl) {       // потери, кВт: холостой ход плюс нагрузочные, квадратично от мощности
    if (!(rated > 0)) return 0; const NL = nl / 100 * rated, FL = fl / 100; if (FL <= 0 || pin <= NL) return NL;
    return clamp((rated + 2 * FL * pin - Math.sqrt(rated * rated + 4 * FL * rated * (pin - NL))) / (2 * FL), NL, pin);
  }
  function invAc(V, pdc) { if (pdc <= 0) return 0; const paco = V.kw, pso = 0.0025 * paco, pdco = paco / (V.eff / 100 - 0.002), C = -0.012 / pdco, d = pdco - pso, x = pdc - pso; return Math.max(0, (paco / d - C * d) * x + C * x * x); }

  /* ───────── станция целиком ───────── */
  function capacity(plant) {
    let dc = 0, ac = 0, mods = 0, inv = 0, area = 0, strings = 0, arrays = 0;
    (plant.blocks || []).forEach(b => (b.arrays || []).forEach(a => { arrays += (b.rep || 1) * (a.rep || 1); (a.inverters || []).forEach(v => { const V = byId(LIB.inverters, v.inverter), n = (b.rep || 1) * (a.rep || 1) * (v.rep || 1); ac += n * (v.setKw || V.kw); inv += n;
      (v.fields || []).forEach(f => { const D = byId(LIB.modules, f.module), nm = (f.strings || 0) * (f.series || 27) * (f.rep || 1); dc += n * nm * D.p / 1000; mods += n * nm; strings += n * (f.strings || 0) * (f.rep || 1); area += n * nm * D.len * D.wid; }); }); }));
    return { dcKw: dc, acKw: ac, mods, inv, area, strings, arrays, ratio: ac ? dc / ac : 0 };
  }
  function simulate(pred, site) {
    const env = Object.assign({}, ENV0, pred.env), sim = Object.assign({}, SIM0, pred.sim), sys = Object.assign({}, SYS0, pred.plant.sys), W = byId(LIB.weather, env.weather), G = geometry(W, site, env.airmass), N = 8760, cap = capacity(pred.plant);
    env.monthly = (env.monthly && env.monthly.length === 12 ? env.monthly : ENV0.monthly).map(m => Object.assign({ albedo: 0.2, soil: 0, spectral: 0 }, m));
    const fcache = new Map(), runF = f => { const F = Object.assign({}, FIELD0, f), key = JSON.stringify([F.module, F.mount, F.track, F.limit, F.tilt, F.az, F.axisAz, F.high, F.orient, F.pitch, F.post, F.rows, F.rowLen, F.quality, F.mismatch, F.lid, F.wiring, F.health, F.uc, F.uv, F.structShade, F.backMis]); if (!fcache.has(key)) fcache.set(key, fieldRun(F, W, G, env, sim)); return fcache.get(key); };
    const H = { ghi: W.ghi, poa: new Float32Array(N), tc: new Float32Array(N), dcMpp: new Float32Array(N), dc: new Float32Array(N), ac: new Float32Array(N), mv: new Float32Array(N), grid: new Float32Array(N), gen: new Float32Array(N), ess: null, soc: null };
    const A = { area: 0, ghi: 0, poa: 0, near: 0, soil: 0, iam: 0, eff: 0, rearRaw: 0, bifLost: 0, struct: 0, backMis: 0, rearEff: 0, pStc: 0, elec: 0, irr: 0, temp: 0, mis: 0, lid: 0, qual: 0, health: 0, wire: 0, pmp: 0, deg: 0, lim: 0, invIn: 0, invOut: 0, cool: 0, track: 0, das: 0, mvT: 0, coll: 0, acOhm: 0, hvIn: 0, hvT: 0, line: 0, hvOut: 0, avail: 0, lgia: 0 };
    const degY1 = sim.firstYear && /DC/.test(sim.degModel) ? sim.degRate / 100 * 0.5 : 0;
    const blocks = (pred.plant.blocks || []).map(b => ({ rep: b.rep || 1, arrays: (b.arrays || []).map(a0 => { const a = Object.assign({}, ARRAY0, a0); let acRated = 0;
      const invs = (a.inverters || []).map(v => { const V = byId(LIB.inverters, v.inverter), set = v.setKw || V.kw, fields = (v.fields || []).map(f0 => { const F = Object.assign({}, FIELD0, f0), R = runF(f0), n = (F.strings || 0) * (F.series || 27) * (F.rep || 1); return { R, n, F }; });
        const stc = fields.reduce((s, x) => s + x.n * x.R.D.p / 1000, 0); acRated += (v.rep || 1) * set; return { V, set, rep: v.rep || 1, fields, stc }; });
      const kva = a.mvOn ? (a.mvKva > 0 ? a.mvKva : acRated / 0.972) : 0, trackKw = invs.reduce((s, v) => s + v.rep * v.fields.reduce((q, x) => q + (x.F.mount === 'fixed' ? 0 : x.F.trackLoad * x.n * x.R.D.p / 1e6 * 1000 / 4400), 0), 0);
      return { a, invs, rep: a.rep || 1, kva, acRated, trackKw }; }) }));
    blocks.forEach(b => b.arrays.forEach(ar => ar.invs.forEach(v => v.fields.forEach(x => { const k = b.rep * ar.rep * v.rep * x.n, S = x.R.S, ka = k * x.R.area; A.area += ka;
      for (const q of ['ghi', 'poa', 'near', 'soil', 'iam', 'eff', 'rearRaw', 'bifLost', 'struct', 'backMis', 'rearEff']) A[q] += S[q] * ka; for (const q of ['pStc', 'elec', 'irr', 'temp', 'mis', 'lid', 'qual', 'health', 'wire', 'pmp']) A[q] += S[q] * k / 1000; }))));
    const totMods = cap.mods || 1, poiKw = sys.poiOn && sys.poi > 0 ? sys.poi * 1000 : Infinity, hvList = sys.hv || [];
    const plantFlow = (pIn, acc) => { let p = pIn; for (const c of hvList) { if (c.type === 'line') { const I = p * 1000 / (Math.sqrt(3) * (c.kv || 35) * 1000), l = clamp(3 * I * I * (c.km * 1000 / 304.8 * (c.r || 0.1)) / (c.n || 1) / 1000, 0, Math.abs(p)); if (acc) A.line += l; p -= l; } else { const l = (p <= 0 && sys.nightDisc) ? 0 : trafo(p, (c.mva || 30) * 1000, c.nl ?? 0.05, c.fl ?? 0.35); if (acc) A.hvT += l; p -= l; } }
      const pa = p > 0 ? p * (1 - sys.avail / 100) : p, g = Math.min(pa, poiKw); if (acc) { A.hvOut += p; A.avail += p - pa; A.lgia += pa - g; } return { g, spill: pa - g }; };
    for (let i = 0; i < N; i++) {
      let plant = 0, poaW = 0, tcW = 0;
      for (const b of blocks) { let pb = 0;
        for (const ar of b.arrays) { let pAr = 0;
          for (const v of ar.invs) { let pd = 0, vW = 0; for (const x of v.fields) { const pw = x.R.p[i] * x.n / 1000; pd += pw; vW += x.R.v[i] * x.F.series * pw; const k = b.rep * ar.rep * v.rep * x.n; poaW += x.R.poa[i] * k; tcW += x.R.tc[i] * k; }
            const k = b.rep * ar.rep * v.rep; H.dcMpp[i] += pd * k; if (pd <= 0) continue;
            const pdD = pd * (1 - degY1), vS = vW / pd; let pIn = pdD, lim = 0; if (vS > v.V.mppHi || vS < v.V.mppLo) { const dv = vS > v.V.mppHi ? (vS - v.V.mppHi) / vS : (v.V.mppLo - vS) / vS; lim += pIn * Math.min(1, 3 * dv * dv + dv * 0.5); pIn -= lim; }
            let ac = invAc(v.V, pIn); if (ac > v.set) { const pNeed = pIn * v.set / ac; lim += pIn - pNeed; pIn = pNeed; ac = v.set; }
            const acO = ac * (ar.a.acOhm / 100) * ac / Math.max(v.stc, 1);
            A.deg += (pd - pdD) * k; A.lim += lim * k; A.invIn += pIn * k; A.invOut += ac * k; A.acOhm += acO * k; H.dc[i] += pIn * k; H.ac[i] += ac * k; pAr += (ac - acO) * v.rep; }
          const day = pAr > 0, tk = day ? ar.trackKw : 0, pAux = pAr - (ar.a.das + ar.a.cool) / 1000 - tk, mvL = ar.kva > 0 ? ((!day && sys.nightDisc) ? 0 : trafo(pAux, ar.kva, ar.a.mvNl, ar.a.mvFl)) : 0, pMv = pAux - mvL, cl = Math.abs(pMv * pMv / Math.max(ar.acRated, 1) * ar.a.coll / 100), k = b.rep * ar.rep;
          A.das += ar.a.das / 1000 * k; A.cool += ar.a.cool / 1000 * k; A.track += tk * k; A.mvT += mvL * k; A.coll += cl * k; pb += (pMv - cl) * ar.rep; }
        plant += pb * b.rep; }
      H.mv[i] = plant; A.hvIn += plant; const r = plantFlow(plant, true); H.grid[i] = r.g; H.gen[i] = Math.max(0, plant); H.poa[i] = poaW / totMods; H.tc[i] = tcW / totMods;
    }
    /* накопитель: расчёт по сохранённым результатам СЭС, затем повторно только плантовый участок */
    let ess = null;
    if (pred.plant.ess && pred.plant.ess.on) { const E = Object.assign({}, ESS0, pred.plant.ess), cap0 = E.mwh * E.usable * 1000, hrs = new Set(E.hours || []), eta = E.rte / 100, ie = E.invEff / 100, pMax = E.mw * 1000; let soc = 0, dCyc = 0; H.soc = new Float32Array(N); H.ess = new Float32Array(N); ess = { charged: 0, out: 0, cycles: 0, lossRte: 0, hvac: 0, base: 0 };
      for (let i = 0; i < N; i++) { const emax = cap0 * (1 - dCyc - E.calDeg / 100 * i / 8760), base = plantFlow(H.mv[i], false), disch = hrs.has(i % 24); let pb = 0; ess.base += base.g;
        const avail = E.algo === 'lgia' ? Math.max(0, base.spill) : (!disch && H.mv[i] > 0 ? H.mv[i] : 0);
        if (avail > 1 && soc < emax - 1) { const pc = Math.min(avail, pMax), e = Math.min(pc * ie * eta, emax - soc); soc += e; pb = -e / (ie * eta); ess.charged += -pb; ess.lossRte += -pb - e; }
        else if (disch && soc > 1) { const head = poiKw === Infinity ? pMax : Math.max(0, poiKw - base.g), e = Math.min(pMax / ie, soc, head / ie); soc -= e; pb = e * ie; ess.out += pb; dCyc += e / Math.max(emax, 1) * E.cycDeg / 100; }
        const hv = E.hvac * E.mwh; ess.hvac += hv; H.ess[i] = pb; H.soc[i] = emax > 0 ? soc / emax : 0;
        H.grid[i] = E.algo === 'lgia' && pb < 0 ? base.g - hv : plantFlow(H.mv[i] + pb - hv, false).g; }
      ess.cycles = ess.out / Math.max(cap0, 1); }
    /* итоги */
    let net = 0, gross = 0, peak = 0; const months = new Array(12).fill(0), mGhi = new Array(12).fill(0), mPoa = new Array(12).fill(0);
    for (let i = 0; i < N; i++) { const m = MONTH_OF[i]; net += H.grid[i]; gross += H.gen[i]; if (H.grid[i] > peak) peak = H.grid[i]; months[m] += H.grid[i] / 1000; mGhi[m] += W.ghi[i] / 1000; mPoa[m] += H.poa[i] / 1000; }
    const poaIns = A.area ? A.poa / A.area / 1000 : 0, ghiIns = A.area ? A.ghi / A.area / 1000 : 0, sy = cap.dcKw ? net / cap.dcKw : 0, pc = (x, y) => y ? 100 * x / y : 0;
    const tree = [
      ['g', 'Облучённость'], ['Приход на горизонталь', null, ghiIns, 'кВт·ч/м²'], ['Транспозиция на плоскость модулей', pc(A.poa - A.ghi, A.ghi)], ['Ближнее затенение', pc(A.near - A.poa, A.poa)], ['Загрязнение', pc(A.soil - A.near, A.poa)], ['Угол падения (IAM)', pc(A.iam - A.soil, A.poa)], ['Спектр', pc(A.eff - A.iam, A.poa)],
      ['Тыльная сторона', pc(A.rearRaw, A.poa)], ['Коэффициент двусторонности', -pc(A.bifLost, A.poa)], ['Затенение конструкцией с тыла', -pc(A.struct, A.poa)], ['Разброс при тыльной засветке', -pc(A.backMis, A.poa)],
      ['g', 'Мощность постоянного тока'], ['Мощность массива при STC', null, A.pStc / 1e6, 'ГВт·ч'], ['Электрический эффект затенения', -pc(A.elec, A.pStc)], ['Уровень освещённости', -pc(A.irr, A.pStc)], ['Температура модулей', -pc(A.temp, A.pStc)], ['Разброс модулей', -pc(A.mis, A.pStc)], ['Световая деградация (LID)', -pc(A.lid, A.pStc)], ['Качество модулей', -pc(A.qual, A.pStc)], ['Состояние DC', -pc(A.health, A.pStc)], ['Кабели постоянного тока', -pc(A.wire, A.pStc)],
      ['Деградация', -pc(A.deg, A.pStc)], ['Ограничение инвертором', -pc(A.lim, A.pStc)], ['КПД инверторов', pc(A.invOut - A.invIn, A.pStc)],
      ['g', 'Сеть переменного тока'], ['Выход инверторов', null, A.invOut / 1e6, 'ГВт·ч'], ['Кабели 0,8 кВ', -pc(A.acOhm, A.invOut)], ['Собственные нужды', -pc(A.cool + A.das + A.track, A.invOut)], ['Трансформаторы массивов', -pc(A.mvT, A.invOut)], ['Сборные линии', -pc(A.coll, A.invOut)],
      ['g', 'Станция'], ['Высоковольтные трансформаторы', -pc(A.hvT, A.hvIn)], ['Линии электропередачи', -pc(A.line, A.hvIn)], ['Готовность', -pc(A.avail, A.hvOut)], ['Предел выдачи в сеть', -pc(A.lgia, A.hvIn)],
      ['Отпуск в сеть', null, net / 1e6, 'ГВт·ч']];
    const years = []; for (let y = 1; y <= (sim.years || 25); y++) { const t = sim.firstYear ? y - 0.5 : y - 1, k = sim.degModel === 'none' ? 1 : sim.degModel === 'steppedAC' ? 1 - sim.degRate / 100 * Math.floor(t) : 1 - sim.degRate / 100 * t; years.push(net / 1000 * k / (1 - (sim.firstYear && sim.degModel !== 'none' ? sim.degRate / 100 * 0.5 : 0))); }
    return { H, tree, months, mGhi, mPoa, years, energy: net / 1000, gross: gross / 1000, ghi: ghiIns, poa: poaIns, spec: sy, pr: poaIns ? sy / poaIns * 100 : 0, cf: cap.acKw ? net / cap.acKw / 8760 * 100 : 0, peak, cap, ess,
      clip: pc(A.lim, A.pStc), shade: -pc(A.near - A.poa, A.poa), rearGain: pc(A.rearEff, A.poa), A, fields: [...fcache.values()], weather: W };
  }
  /* уровни вероятности: суммарная неопределённость по корню из суммы квадратов */
  const ZP = { 50: 0, 75: 0.6745, 90: 1.2816, 95: 1.6449, 99: 2.3263 };
  function pvalues(energy, unc, years) { const u = Object.assign({}, UNC0, unc), sig = Math.sqrt(u.iav * u.iav / (years || 1) + u.resource * u.resource + u.model * u.model + u.soiling * u.soiling + u.other * u.other); return { sigma: sig, p: Object.fromEntries(Object.entries(ZP).map(([k, z]) => [k, energy * (1 - z * sig / 100)])) }; }
  /* узловые данные: почасовые ряды по уровням для выгрузки */
  function nodal(res, level) {
    const H = res.H, F = res.fields[0], rows = [], t = i => { const d = new Date(Date.UTC(2025, 0, 1, i)); return d.toISOString().slice(0, 10) + ';' + String(i % 24).padStart(2, '0') + ':00'; };
    const cols = level === 'dc' ? ['GHI, Вт/м2', 'POA, Вт/м2', 'Эффективная POA, Вт/м2', 'Тыльная эффективная, Вт/м2', 'Угол стола, град', 'T ячейки, C', 'Мощность модуля, Вт', 'Напряжение MPP модуля, В'] : level === 'inv' ? ['DC в точке MPP, кВт', 'DC на входе, кВт', 'Ограничение, кВт', 'AC, кВт'] : level === 'ess' ? ['Мощность накопителя, кВт', 'Заряд, доля'] : ['GHI, Вт/м2', 'POA, Вт/м2', 'После трансформаторов массивов, кВт', 'В сеть, кВт'];
    rows.push('дата;время;' + cols.join(';'));
    for (let i = 0; i < 8760; i++) rows.push(t(i) + ';' + (level === 'dc' ? [H.ghi[i].toFixed(0), F.poa[i].toFixed(1), F.eff[i].toFixed(1), F.rear[i].toFixed(1), F.ang[i].toFixed(1), F.tc[i].toFixed(1), F.p[i].toFixed(1), F.v[i].toFixed(2)] : level === 'inv' ? [H.dcMpp[i].toFixed(1), H.dc[i].toFixed(1), Math.max(0, H.dcMpp[i] - H.dc[i]).toFixed(1), H.ac[i].toFixed(1)] : level === 'ess' ? [(H.ess ? H.ess[i] : 0).toFixed(1), (H.soc ? H.soc[i] : 0).toFixed(3)] : [H.ghi[i].toFixed(0), H.poa[i].toFixed(1), H.mv[i].toFixed(1), H.grid[i].toFixed(1)]).join(';'));
    return '﻿' + rows.join('\n');
  }

  /* ───────── геометрия участка и расстановка столов ───────── */
  const polyArea = P => Math.abs(P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  const perimeter = P => P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + Math.hypot(q[0] - p[0], q[1] - p[1]); }, 0);
  const inPoly = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const bbox = P => P.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [1e9, 1e9, -1e9, -1e9]);
  const strip = (pts, half) => { const L = [], Rr = []; pts.forEach((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l; L.push([p[0] + nx * half, p[1] + nz * half]); Rr.unshift([p[0] - nx * half, p[1] - nz * half]); }); return L.concat(Rr); };
  const grow = (P, d) => { if (!d) return P; const c = P.reduce((s, p) => [s[0] + p[0] / P.length, s[1] + p[1] / P.length], [0, 0]); return P.map(p => { const l = Math.hypot(p[0] - c[0], p[1] - c[1]) || 1; return [p[0] + (p[0] - c[0]) / l * d, p[1] + (p[1] - c[1]) / l * d]; }); };
  const zonePoly = z => z.line ? strip(z.pts, Math.max(z.setback || 0, 2)) : grow(z.pts, z.setback || 0);
  function freeArea(B, excl) { const b = bbox(B); let n = 0; for (let x = b[0] + 7.5; x < b[2]; x += 15) for (let z = b[1] + 7.5; z < b[3]; z += 15) if (inPoly(x, z, B) && !excl.some(E => inPoly(x, z, E))) n++; return n * 225 / 1e4; }
  /* L: module, mount, high, wide, pitch, setback, roadEW, roadNS, ns; target — нужное число модулей */
  function layout(L, boundary, excl, target) {
    const D = byId(LIB.modules, L.module), high = L.high || 1, wide = L.wide || 81, w = D.len * high + (high > 1 ? 0.02 : 0), len = wide * D.wid * 1.0146, mpt = wide * high, Hh = L.mount === 'fixed';
    const inset = L.setback ?? 12, road = L.roadEW ?? 7.2, nsW = L.roadNS ?? 22, ns = L.ns ?? 2, b = bbox(boundary), out = [];
    const u0 = Hh ? b[1] : b[0], u1 = Hh ? b[3] : b[2], v0 = Hh ? b[0] : b[1], v1 = Hh ? b[2] : b[3], ok = (x, z) => inPoly(x, z, boundary) && !excl.some(E => inPoly(x, z, E));
    const fits = (cu, cv) => { const hw = w / 2 + inset, hl = len / 2 + inset; for (const [du, dv] of [[-hw, -hl], [hw, -hl], [-hw, hl], [hw, hl]]) if (!inPoly(Hh ? cv + dv : cu + du, Hh ? cu + du : cv + dv, boundary)) return false;
      for (let k = -4; k <= 4; k++) { const dv = k / 4 * (len / 2 + 3); for (const du of [-w / 2 - 3, w / 2 + 3]) if (!ok(Hh ? cv + dv : cu + du, Hh ? cu + du : cv + dv)) return false; } return true; };
    const corr = []; if (!Hh && nsW > 0) for (let k = 1; k <= ns; k++) corr.push(u0 + (u1 - u0) * k / (ns + 1));
    const nb = Math.max(0, Math.floor((v1 - v0 - 2 * inset + road) / (len + road))), vs = v0 + (v1 - v0 - nb * (len + road) + road) / 2;
    for (let j = 0; j < nb; j++) { const cv = vs + j * (len + road) + len / 2; for (let cu = u0 + inset + w / 2; cu <= u1 - inset - w / 2; cu += L.pitch) { if (corr.some(c => Math.abs(cu - c) < nsW / 2 + w / 2)) continue; if (fits(cu, cv)) out.push(Hh ? [cv, cu, len, w, j] : [cu, cv, w, len, j]); } }
    const cap = out.length, need = target ? Math.ceil(target / mpt) : cap, n = Math.min(cap, need);
    return { tables: out.slice(0, n), n, cap, mpt, mods: n * mpt, capMods: cap * mpt, arrayHa: n * L.pitch * (len + road) / 1e4, len, w, bands: nb };
  }

  window.ENG = { LIB, MON, DAYS, MONTH_OF, byId, MN, monthly, scaled, weatherFromRows, sunAt, moduleModel, simulate, capacity, pvalues, nodal, layout, polyArea, perimeter, inPoly, bbox, strip, grow, zonePoly, freeArea, invAc, trafo, iamBeam, FIELD0, ARRAY0, SYS0, ENV0, SIM0, UNC0, ESS0 };
})();
