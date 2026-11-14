/* Модель фотоэлектрической части по цепочке расчёта PVsyst.
   Параметры потерь — из отчёта PVsyst «Aralsk 30 MW, вариант Trina+Huawei_86» (V7.4.8, 06.11.2024),
   электрические данные модуля — из паспорта Trina Vertex N TSM-NEG21C.20 на 710 Вт.
   Отличия от PVsyst: транспозиция по Хею–Дэвису вместо Переса, затенение рассеянного света и двусторонность —
   упрощённые двумерные формулы, погода года — средние сутки месяца, подогнанные под месячные суммы отчёта. */
(function () {
  const SITE = window.SITE, M = SITE.meta, RAD = Math.PI / 180, DEG = 180 / Math.PI;
  const C = {
    width: 2.384, pitch: M.pitch, gcr: 2.384 / M.pitch, phiMax: 60 * RAD,          // геометрия — рабочий проект; предел поворота — отчёт
    albedoFront: 0.20, albedoGround: 0.30, bifaciality: 0.80, rearShade: 0.05, rearMismatch: 0.10, rearCal: (typeof process !== 'undefined' && process.env.RC) ? +process.env.RC : 0.81,   // rearCal — поправка упрощённой модели тыла под отчёт
    uc: 29.0, absorb: 0.9, effStc: 0.2256,                                         // тепловая модель: Uc = 29 Вт/м²К, Uv = 0
    quality: -0.008, mismatch: 0.020, stringMismatch: 0.001,                       // качество модулей, разброс модулей и стрингов
    dcOhmic: 0.015, acOhmic: 0.0228, mvLine: 0.0006, trIron: 0.0006, trCopper: 0.0034,
    iam: [[0, 1], [30, 1], [50, 0.999], [60, 0.994], [70, 0.969], [75, 0.928], [80, 0.829], [85, 0.588], [90, 0]],
    month: {                                                                       // месячные данные отчёта (Meteonorm 8.1)
      ghi: [41.0, 64.4, 112.4, 141.0, 179.8, 196.4, 197.8, 166.7, 125.5, 81.6, 42.3, 31.2],
      dhi: [18.70, 29.17, 51.68, 70.94, 92.11, 87.16, 79.32, 73.80, 41.95, 39.69, 24.68, 19.08],
      tamb: [-10.08, -9.26, 1.77, 11.94, 20.05, 25.11, 27.48, 25.79, 17.90, 8.92, -0.15, -7.17],
      inc: [57.3, 86.0, 147.6, 179.0, 228.5, 255.0, 260.9, 219.7, 174.2, 107.8, 55.5, 40.1],
      eArray: [1861.054, 2791.270, 4619.840, 5417.076, 6730.750, 7319.795, 7407.253, 6322.171, 5109.203, 3311.879, 1772.123, 1301.666],
    },
    report: { produced: 52135.634, p90: 50930.426, array: 53965.502, invOut: 53135.438, ghi: 1380.0, inc: 1811.6, pr: 95.89,
      loss: { inc: 31.3, shade: -2.21, iam: -0.40, rear: 8.25, irr: 0.31, temp: -2.53, quality: 0.75, mismatch: -2.10, rearMis: -0.62, ohmic: -1.06, inv: -1.53, clip: 0, acOhmic: -1.36, transfo: -0.49, mvLine: -0.04 } },
  };

  /* ───────── однодиодная модель модуля ───────── */
  const KB = 1.380649e-23, Q = 1.602176634e-19, TREF = 298.15, EG = 1.12;
  const D = { pnom: 710, isc: 18.40, voc: 49.0, imp: 17.36, vmp: 40.9, ns: 66, muIsc: 0.0004, muPmax: -0.0029, rsh: 1000, rsh0: 4000, rshExp: 5.5, rs: (typeof process !== 'undefined' && process.env.RS) ? +process.env.RS : 0.174 };
  const iv = (V, iph, i0, a, rs, rsh) => { let I = iph; for (let k = 0; k < 40; k++) { const e = Math.exp((V + I * rs) / a), g = iph - i0 * (e - 1) - (V + I * rs) / rsh - I, dg = -i0 * e * rs / a - rs / rsh - 1, n = I - g / dg; if (Math.abs(n - I) < 1e-7) { I = n; break; } I = n; } return I; };
  function mppOf(iph, i0, a, rs, rsh) {
    const voc = a * Math.log(iph / i0 + 1); let lo = 0.5 * voc, hi = voc; const gr = 0.6180339887;
    let x1 = hi - gr * (hi - lo), x2 = lo + gr * (hi - lo), f1 = x1 * iv(x1, iph, i0, a, rs, rsh), f2 = x2 * iv(x2, iph, i0, a, rs, rsh);
    for (let k = 0; k < 34; k++) { if (f1 < f2) { lo = x1; x1 = x2; f1 = f2; x2 = lo + gr * (hi - lo); f2 = x2 * iv(x2, iph, i0, a, rs, rsh); } else { hi = x2; x2 = x1; f2 = f1; x1 = hi - gr * (hi - lo); f1 = x1 * iv(x1, iph, i0, a, rs, rsh); } }
    const v = (lo + hi) / 2, i = iv(v, iph, i0, a, rs, rsh); return { p: v * i, v, i };
  }
  const refAt = (rs, a) => { const i0 = (D.isc * (1 + rs / D.rsh) - D.voc / D.rsh) / (Math.exp(D.voc / a) - Math.exp(D.isc * rs / a)); return { i0, iph: i0 * (Math.exp(D.voc / a) - 1) + D.voc / D.rsh }; };
  const vt = D.ns * KB * TREF / Q; let best = null;
  for (const rs of [D.rs]) {                               // Rs задаёт поведение при слабом свете (подобран под отчёт), коэффициент идеальности — под паспортный ток в точке Vmp
    let lo = 0.7 * vt, hi = 2.0 * vt;
    const res = a => { const r = refAt(rs, a); return iv(D.vmp, r.iph, r.i0, a, rs, D.rsh) - D.imp; };
    if (res(lo) * res(hi) > 0) continue;
    for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; res(lo) * res(mid) <= 0 ? hi = mid : lo = mid; }
    const a = (lo + hi) / 2, r = refAt(rs, a), m = mppOf(r.iph, r.i0, a, rs, D.rsh), err = Math.abs(m.v - D.vmp);
    best = { rs, a, gamma: a / vt, iph: r.iph, i0: r.i0, err, p: m.p, scale: D.pnom / m.p };
  }
  const MOD = Object.assign({}, D, best, { muGamma: 0 });
  function mppRaw(G, Tc, muGamma) {
    const Tk = Tc + 273.15, gamma = MOD.gamma * (1 + muGamma * (Tc - 25)), a = gamma * D.ns * KB * Tk / Q;
    const iph = G / 1000 * MOD.iph * (1 + D.muIsc * (Tc - 25)), i0 = MOD.i0 * Math.pow(Tk / TREF, 3) * Math.exp(Q * EG / (gamma * KB) * (1 / TREF - 1 / Tk));
    const rsh = D.rsh + (D.rsh0 - D.rsh) * Math.exp(-D.rshExp * G / 1000);
    const r = mppOf(iph, i0, a, MOD.rs, rsh); r.p *= MOD.scale; r.i *= MOD.scale; return r;
  }
  { let lo = -0.003, hi = 0.003; const target = 1 + D.muPmax * 25, f = mg => mppRaw(1000, 50, mg).p / mppRaw(1000, 25, mg).p - target;   // температурный коэффициент мощности −0,29 %/°C
    if (f(lo) * f(hi) < 0) { for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; f(lo) * f(mid) <= 0 ? hi = mid : lo = mid; } MOD.muGamma = (lo + hi) / 2; } }
  const cache = new Map();
  function mpp(G, Tc) {
    if (G < 1) return { p: 0, v: 0, i: 0 };
    const key = Math.round(G) * 1000 + Math.round((Tc + 60) * 2); let r = cache.get(key);
    if (!r) { r = mppRaw(Math.round(G), Math.round(Tc * 2) / 2, MOD.muGamma); if (cache.size > 60000) cache.clear(); cache.set(key, r); }
    return r;
  }

  /* ───────── солнце, слежение, ясное небо ───────── */
  function sunAt(min, doy) {
    const B = 2 * Math.PI * (doy - 81) / 364, eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    const solar = min / 60 + (M.lon - 15 * M.tz) / 15 + eot / 60, H = (solar - 12) * 15 * RAD, dec = 23.44 * RAD * Math.sin(2 * Math.PI * (284 + doy) / 365), lat = M.lat * RAD;
    const up = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H), east = -Math.cos(dec) * Math.sin(H), north = Math.cos(lat) * Math.sin(dec) - Math.sin(lat) * Math.cos(dec) * Math.cos(H);
    return { x: east, y: up, z: -north, el: Math.asin(up) };
  }
  function trackAngle(sun) {                      // астрономическое слежение с обратным ходом против взаимного затенения
    if (sun.y <= 0.01) return 0; let a = Math.atan2(sun.x, sun.y); const c = Math.cos(a) * C.pitch / C.width;
    if (c < 1) a -= Math.sign(a) * Math.acos(c); return Math.max(-C.phiMax, Math.min(C.phiMax, a));
  }
  function clearSky(sun) {
    if (sun.y <= 0.01) return { dni: 0, dhi: 0 };
    const am = 1 / (sun.y + 0.50572 * Math.pow(sun.el * DEG + 6.07995, -1.6364)), dni = 1353 * Math.pow(0.7, Math.pow(am, 0.678)); return { dni, dhi: 0.1 * dni };
  }
  const iam = deg => { const t = C.iam; if (deg >= 90) return 0; for (let k = 1; k < t.length; k++) if (deg <= t[k][0]) { const f = (deg - t[k - 1][0]) / (t[k][0] - t[k - 1][0]); return t[k - 1][1] + (t[k][1] - t[k - 1][1]) * f; } return 0; };
  let iamDiff = 0; for (let d = 0.5; d < 90; d += 1) iamDiff += iam(d) * Math.sin(2 * d * RAD) * RAD;   // IAM для рассеянного света: интеграл по полусфере

  /* ───────── облучённость плоскости стола и мощность модуля ───────── */
  function plane(sun, dni, dhi, a, tamb, doy) {
    const ca = Math.cos(a), cosT = Math.max(0, sun.x * Math.sin(a) + sun.y * ca), ghi = dni * Math.max(0, sun.y) + dhi;
    const i0n = 1367 * (1 + 0.033 * Math.cos(2 * Math.PI * doy / 365)), ai = Math.min(1, dni / i0n), rb = cosT / Math.max(sun.y, 0.05);
    const beam = dni * cosT, circ = dhi * ai * rb, iso = dhi * (1 - ai) * (1 + ca) / 2, alb = C.albedoFront * ghi * (1 - ca) / 2;
    const inc = beam + circ + iso + alb;
    const b = Math.abs(a), psi = Math.atan2(Math.sin(b), 1 / C.gcr - Math.cos(b)), kd = (1 - Math.cos(psi)) / (1 + ca);   // доля неба, закрытая соседним рядом
    const isoS = iso * (1 - kd), albS = alb * (1 - Math.min(1, C.gcr * 2.2)), shaded = beam + circ + isoS + albS;
    const thetaDeg = Math.acos(Math.min(1, cosT)) * DEG, front = (beam + circ) * iam(thetaDeg) + (isoS + albS) * iamDiff;
    // тыльная сторона: отражение от земли и рассеянный свет неба
    const tp = Math.atan2(sun.x, Math.max(sun.y, 1e-3)), fShadow = Math.min(1, C.gcr * Math.abs(Math.cos(a - tp)) / Math.max(Math.cos(tp), 0.05));
    const skyG = 1 - 0.63 * C.gcr * ca, ground = dni * Math.max(0, sun.y) * (1 - fShadow) + dhi * skyG;
    const rear = (ground * C.albedoGround * (1 - skyG) / C.gcr + 0.7 * dhi * (1 - ca) / 2) * (1 - C.rearShade) * C.rearCal;
    const eff = front + C.bifaciality * rear, rearShare = eff > 0 ? C.bifaciality * rear / eff : 0;
    const tc = tamb + C.absorb * inc * (1 - C.effStc) / C.uc;
    const k = (1 - C.quality) * (1 - C.rearMismatch * rearShare), m = mpp(eff, tc), m25 = mpp(eff, 25);
    return { ghi, inc, shaded, front, rear, eff, ground, tc, p: m.p * k, v: m.v, i: m.i, p25: m25.p * k, pStc: D.pnom * eff / 1000, k, rearShare };
  }

  /* ───────── электрическая часть: от стрингов до сети ───────── */
  const stringLoss = 1 - (1 - C.mismatch) * (1 - C.stringMismatch);
  const invEff = load => load <= 0 ? 0 : load / (load + 0.004 + 0.011 * load * load);          // кривая КПД инвертора, максимум около 98,5 %
  function inverter(dcKw, nPanels, capKw) {      // dcKw — мощность стрингов инвертора до потерь в кабеле
    if (dcKw <= 0) return { ac: 0, ohm: 0, inv: 0, clip: 0 };
    const stc = nPanels * D.pnom / 1000, ohm = dcKw * C.dcOhmic * dcKw / stc, dcIn = dcKw - ohm;
    const out = dcIn * invEff(dcIn / M.inverterKw), ac = Math.min(out, capKw);
    return { ac, ohm, inv: dcIn - out, clip: out - ac };
  }
  function toGrid(acKw, nPanels, kva) {          // кабель 0,8 кВ, трансформатор, линия 35 кВ
    if (acKw <= 0) return { grid: 0, acOhm: 0, tr: 0, mv: 0 };
    const stc = nPanels * D.pnom / 1000, acOhm = acKw * C.acOhmic * acKw / stc, p1 = acKw - acOhm;
    const tr = C.trIron * kva + C.trCopper * kva * Math.pow(p1 / kva, 2), p2 = Math.max(0, p1 - tr), mv = p2 * C.mvLine * p2 / kva;
    return { grid: Math.max(0, p2 - mv), acOhm, tr, mv };
  }

  /* ───────── расчёт года исправной станции и диаграмма потерь ───────── */
  const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], NPAN = M.modules, NI = M.inverters, KVA = SITE.ktp.reduce((s, k) => s + k.kva, 0);
  const LAMBDA = (typeof process !== 'undefined' && process.env.LAM) ? +process.env.LAM : 0.3;   // доля прямой радиации, приходящая в полностью ясные дни
  let YEAR = null;
  function year() {
    if (YEAR) return YEAR;
    const A = { ghi: 0, inc: 0, shaded: 0, front: 0, rear: 0, eff: 0, ground: 0, stc: 0, irr: 0, temp: 0, qual: 0, rearMis: 0, mis: 0, ohm: 0, inv: 0, clip: 0, acOhm: 0, tr: 0, mv: 0, grid: 0 }, months = [];
    for (let m = 0; m < 12; m++) {
      const doy = Math.round(15 + m * 30.4), steps = []; let bh = 0, dh = 0;
      for (let t = 0; t < 1440; t += 10) { const sun = sunAt(t, doy), cs = clearSky(sun); steps.push([t, sun, cs]); bh += cs.dni * Math.max(0, sun.y) / 6000; dh += cs.dhi / 6000; }
      // месяц = ясные дни + пасмурные дни: доля ясных задаёт прямую радиацию, пасмурные добирают рассеянную до суммы отчёта
      const fBeam = Math.min(0.97, (C.month.ghi[m] - C.month.dhi[m]) / DAYS[m] / bh), fClear = fBeam * LAMBDA, kHazy = fBeam * (1 - LAMBDA) / (1 - fClear), dOver = Math.max(0, (C.month.dhi[m] / DAYS[m] - fClear * dh) / (1 - fClear)) / dh;
      const mo = { ghi: 0, inc: 0, grid: 0, array: 0 };
      for (const [f, kb, kdif, amp, dT] of [[fClear, 1, 1, 7, 1.5], [1 - fClear, kHazy, dOver, 5, -1.5 * fClear / (1 - fClear)]]) {
        const w = DAYS[m] * f / 6;
        for (const [t, sun, cs] of steps) {
          if (sun.y <= 0.01) continue;
          const a = trackAngle(sun), tamb = C.month.tamb[m] + dT + amp * Math.cos(2 * Math.PI * (t / 60 - 15) / 24), P = plane(sun, cs.dni * kb, cs.dhi * kdif, a, tamb, doy);
          if (P.eff < 1) continue;
          const dc = NPAN * P.p / 1000 * (1 - stringLoss), I = inverter(dc / NI, NPAN / NI, M.inverterKw), G = toGrid(I.ac * NI, NPAN, KVA);
          A.ghi += P.ghi * w / 1000; A.inc += P.inc * w / 1000; A.shaded += P.shaded * w / 1000; A.front += P.front * w / 1000; A.rear += P.rear * w / 1000; A.eff += P.eff * w / 1000; A.ground += P.ground * w / 1000;
          A.stc += NPAN * P.pStc * w / 1e6; A.irr += NPAN * P.p25 / P.k * w / 1e6; A.temp += NPAN * P.p / P.k * w / 1e6;
          A.qual += NPAN * P.p / P.k * (1 - C.quality) * w / 1e6; A.rearMis += NPAN * P.p * w / 1e6;
          A.mis += dc * w / 1000; A.ohm += (dc - I.ohm * NI) * w / 1000; A.inv += (dc - (I.ohm + I.inv) * NI) * w / 1000; A.clip += I.ac * NI * w / 1000;
          A.acOhm += (I.ac * NI - G.acOhm) * w / 1000; A.tr += (I.ac * NI - G.acOhm - G.tr) * w / 1000; A.grid += G.grid * w / 1000;
          mo.ghi += P.ghi * w / 1000; mo.inc += P.inc * w / 1000; mo.grid += G.grid * w / 1000; mo.array += (dc - I.ohm * NI) * w / 1000;
        }
      }
      months.push(mo);
    }
    const pc = (a, b) => (a / b - 1) * 100, R = C.report.loss;
    const diagram = [
      ['Поворот к солнцу, трекер', pc(A.inc, A.ghi), R.inc], ['Затенение соседними рядами', pc(A.shaded, A.inc), R.shade], ['Отражение от стекла (IAM)', pc(A.front, A.shaded), R.iam],
      ['Тыльная сторона модулей', A.rear / A.front * 100, R.rear], ['Слабая освещённость', pc(A.irr, A.stc), R.irr], ['Нагрев модулей', pc(A.temp, A.irr), R.temp],
      ['Качество модулей', pc(A.qual, A.temp), R.quality], ['Разброс при тыльной засветке', pc(A.rearMis, A.qual), R.rearMis], ['Разброс модулей и стрингов', pc(A.mis, A.rearMis), R.mismatch],
      ['Кабели постоянного тока', pc(A.ohm, A.mis), R.ohmic], ['КПД инверторов', pc(A.inv, A.ohm), R.inv], ['Срез по мощности инвертора', pc(A.clip, A.inv), R.clip],
      ['Кабели 0,8 кВ', pc(A.acOhm, A.clip), R.acOhmic], ['Трансформаторы', pc(A.tr, A.acOhm), R.transfo], ['Линия 35 кВ', pc(A.grid, A.tr), R.mvLine],
    ];
    return YEAR = { months: months.map(m => m.grid), monthInc: months.map(m => m.inc), total: A.grid, inc: A.inc, ghi: A.ghi, pr: A.grid * 1000 / (M.dcKw * A.inc) * 100, diagram, acc: A };
  }

  window.PV = { C, MOD, mpp, sunAt, trackAngle, clearSky, iam, iamDiff, plane, inverter, toGrid, invEff, stringLoss, year };
})();
