/* EPC-логика двойника: смета, экономика, график строительства, освоенный объём, склад, ОТК.
   Исходные цифры — из рабочего проекта ALH01-ST1 (сметная документация, ПОС, кабельный журнал, отчёт PVsyst).
   Фактический ход стройки — демонстрационный сценарий: данных со стройплощадки в проекте нет. */
(function () {
  const SITE = window.SITE, M = SITE.meta, NT = SITE.trackers.length, NI = SITE.inverters.length;
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ───────── 1. Смета (тыс. тенге, цены IV кв. 2024) ───────── */
  const SMETA = {
    local: [
      { id: '2-1-6', name: 'Оборудование и монтаж', note: 'модули, трекеры, инверторы, КТП', v: 7289094.378, mh: 792.923 },
      { id: '2-1-7', name: 'Солнечные кабели', note: '223 км кабеля DC', v: 1115778.549, mh: 138.427 },
      { id: '7-1', name: 'Генеральный план', note: 'проезды, ограждение, планировка', v: 738201.259, mh: 52.565 },
      { id: '2-1-3', name: 'Фундаменты и сваи', note: '7 830 свай, фундаменты КТП', v: 309799.303, mh: 36.042 },
      { id: '2-1-2', name: 'Сети 0,8 кВ', note: 'от инверторов до КТП', v: 105758.137, mh: 7.953 },
      { id: '2-1-1', name: 'Сети 35 кВ', note: 'два фидера до ЗРУ-35', v: 101067.024, mh: 1.99 },
      { id: '2-1-4', name: 'Заземление площадки', note: '', v: 34347.912, mh: 5.485 },
      { id: '2-1-5', name: 'Сети связи', note: '', v: 26129.811, mh: 3.155 },
      { id: '3-1', name: 'Маслосборники и заземление КТП', note: '', v: 4549.811, mh: 0.36 },
    ],
    smrBase: 5937699.247,   // СМР по главам 1–7
    equipBase: 3787026.937, // оборудование
    design: 27000,          // проектирование (часть I)
    total: 13266752.282,    // итог сводного сметного расчёта с НДС
  };
  const COST_DEFAULTS = { siteOh: 8.6, profit: 5, cont: 3, index: 6.99, sup: 1.67, vat: 12, kEquip: 0, kSmr: 0 };
  function capex(p) {
    p = Object.assign({}, COST_DEFAULTS, p);
    const smr0 = SMETA.smrBase * (1 + p.kSmr / 100), eq0 = SMETA.equipBase * (1 + p.kEquip / 100);
    const siteOh = smr0 * p.siteOh / 100, smr1 = smr0 + siteOh;
    const profit = smr1 * p.profit / 100, cont = (smr1 + eq0) * p.cont / 100;
    const part2 = smr1 + profit + cont + eq0, idx = part2 * p.index / 100, part2f = part2 + idx;
    const sup = part2f * p.sup / 100, net = part2f + sup + SMETA.design, vat = net * p.vat / 100;
    return { steps: [
        ['Строительно-монтажные работы', smr0], ['Оборудование', eq0], [`Общеплощадочные, ${p.siteOh} %`, siteOh],
        [`Сметная прибыль, ${p.profit} %`, profit], [`Непредвиденные, ${p.cont} %`, cont], [`Индекс цен 2025–2026`, idx],
        ['Надзор и проектирование', sup + SMETA.design], [`НДС, ${p.vat} %`, vat]],
      net, vat, total: net + vat, perW: net * 1000 / (M.dcKw * 1000) };
  }

  /* ───────── 2. Экономика: LCOE, NPV, IRR, окупаемость ───────── */
  const FIN_DEFAULTS = { tariff: 20, index: 0, opex: 1.2, rate: 12, degr: 0.4, years: 25, fx: 520 };
  function finance(capexNetKzt, energyMWh, p) {      // capex в тенге, энергия первого года в МВт·ч
    p = Object.assign({}, FIN_DEFAULTS, p);
    const r = p.rate / 100, cf = [-capexNetKzt]; let dE = 0, dC = capexNetKzt, cum = -capexNetKzt, payback = null;
    for (let y = 1; y <= p.years; y++) {
      const e = energyMWh * 1000 * Math.pow(1 - p.degr / 100, y - 1), opex = capexNetKzt * p.opex / 100;
      const rev = e * p.tariff * Math.pow(1 + p.index / 100, y - 1), net = rev - opex;
      cf.push(net); dE += e / Math.pow(1 + r, y); dC += opex / Math.pow(1 + r, y);
      const prev = cum; cum += net; if (payback === null && cum >= 0) payback = y - 1 + (-prev) / net;
    }
    const npv = q => cf.reduce((s, c, i) => s + c / Math.pow(1 + q, i), 0);
    let lo = -0.9, hi = 1, irr = null;
    if (npv(lo) > 0 && npv(hi) < 0) { for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; npv(mid) > 0 ? lo = mid : hi = mid; } irr = (lo + hi) / 2; }
    return { lcoe: dC / dE, npv: npv(r), irr, payback, rev1: cf[1] + capexNetKzt * p.opex / 100, cf };
  }

  /* ───────── 3. Ведомость объёмов из модели ───────── */
  function boq() {
    let ac = 0; SITE.inverters.forEach(v => { const k = SITE.ktp[v.k - 1]; ac += Math.abs(v.x - k.x) + Math.abs(v.z - k.z) + 6; });
    return [
      ['Фотоэлектрические модули 710 Вт', M.modules, 'шт', 'проект'], ['Трекеры 1×81', M.trackers, 'шт', 'проект'],
      ['Сваи под трекеры', 7830, 'шт', 'смета'], ['Стринги по 27 модулей', M.strings, 'шт', 'проект'],
      ['Инверторы SG320-HX-20', M.inverters, 'шт', 'проект'], ['КТП MVS9000 / MVS4500', '2 + 2', 'шт', 'проект'],
      ['Кабель DC 1×10 мм²', 128.6, 'км', 'журнал'], ['Кабель DC 1×6 мм²', 86.1, 'км', 'журнал'], ['Кабель DC 1×4 мм²', 8.4, 'км', 'журнал'],
      ['Трассы 0,8 кВ до КТП', +(ac / 1000).toFixed(1), 'км', 'геометрия модели'], ['Кабельная линия 35 кВ', 3.1, 'км', 'проект'],
      ['Покрытие проездов', 13198, 'м²', 'генплан'], ['Земельный участок', 65, 'га', 'генплан'],
      ['Трудоёмкость', 83.64, 'тыс. чел·ч', 'ПОС'], ['Рабочих на площадке', 59, 'чел', 'ПОС'],
    ];
  }

  /* ───────── 4. График строительства: план по ПОС (8 месяцев), факт — сценарий ───────── */
  const DAY0 = Date.UTC(2025, 5, 2), PD = 242, MAXD = 300;
  const dateOf = d => new Date(DAY0 + d * 864e5);
  // Веса — трудоёмкость локальных смет; внутри сметы 2-1-6 разбивка принята экспертно.
  const ACT = [
    { id: 'civil', name: 'Планировка, проезды, ограждение', unit: '%', qty: 100, s: 0, e: 70, w: 52.6, f: 0.95 },
    { id: 'piles', name: 'Сваи', unit: 'шт', qty: 7830, s: 18, e: 100, w: 36.0, f: 0.9, late: 4, per: 'tracker' },
    { id: 'track', name: 'Сборка трекеров', unit: 'шт', qty: NT, s: 32, e: 128, w: 277.5, f: 0.96, per: 'tracker', pre: 'piles', lag: 4, stop: [[84, 89]] },
    { id: 'mods', name: 'Монтаж модулей', unit: 'шт', qty: M.modules, s: 50, e: 172, w: 356.8, f: 0.94, per: 'tracker', pre: 'track', lag: 2, stop: [[84, 89], [113, 130]] },
    { id: 'dc', name: 'Подключение стрингов', unit: 'шт', qty: M.strings, s: 64, e: 190, w: 138.4, f: 0.9, per: 'tracker', pre: 'mods', lag: 1 },
    { id: 'inv', name: 'Инверторы', unit: 'шт', qty: NI, s: 95, e: 180, w: 63.4, f: 1, per: 'inv' },
    { id: 'ac', name: 'Кабель 0,8 кВ', unit: 'линий', qty: NI, s: 105, e: 195, w: 8.0, f: 0.95, per: 'inv', pre: 'inv', lag: 2 },
    { id: 'ktp', name: 'Подстанции КТП', unit: 'шт', qty: 4, s: 70, e: 165, w: 55.9, f: 0.9, per: 'ktp' },
    { id: 'mv', name: 'Кабель 35 кВ, заземление, связь', unit: '%', qty: 100, s: 125, e: 205, w: 10.6, f: 0.93 },
    { id: 'pnr', name: 'Пусконаладка', unit: 'инв.', qty: NI, s: 190, e: 238, w: 39.6, f: 0.72, late: 9, per: 'inv', pre: 'ac', lag: 3 },
  ];
  const A = Object.fromEntries(ACT.map(a => [a.id, a])), WSUM = ACT.reduce((s, a) => s + a.w, 0);
  const zoneOrder = { 1: 0, 3: 1, 2: 2, 4: 3 };
  const tOrder = SITE.trackers.map((t, i) => i).sort((a, b) => { const A1 = SITE.trackers[a], B1 = SITE.trackers[b]; return zoneOrder[A1[2]] - zoneOrder[B1[2]] || Math.round(A1[1] / 60) - Math.round(B1[1] / 60) || A1[0] - B1[0]; });
  const iOrder = SITE.inverters.map((v, i) => i).sort((a, b) => zoneOrder[SITE.inverters[a].k] - zoneOrder[SITE.inverters[b].k] || SITE.inverters[a].z - SITE.inverters[b].z || SITE.inverters[a].x - SITE.inverters[b].x);
  const orderOf = a => a.per === 'tracker' ? tOrder : a.per === 'inv' ? iOrder : [0, 2, 1, 3];
  const skipStops = (t0, t1, stops) => { if (stops) for (const [a, b] of stops) { if (t1 > a && t0 < b) { t1 += b - Math.max(a, t0); } } return t1; };

  const plan = {}, fact = {};   // per activity: {s:Float32Array, e:Float32Array} по индексу элемента
  for (const a of ACT) {
    if (!a.per) continue;
    const ord = orderOf(a), n = ord.length, dur = (a.e - a.s) / n;
    const ps = new Float32Array(n), pe = new Float32Array(n), fs = new Float32Array(n), fe = new Float32Array(n);
    let t = a.s + (a.late || 0);
    ord.forEach((el, j) => {
      ps[el] = a.s + j * dur; pe[el] = a.s + (j + 1) * dur;
      let st = t;
      if (a.pre && fact[a.pre] && fact[a.pre].e.length === n) st = Math.max(st, fact[a.pre].e[el] + a.lag);
      if (a.id === 'pnr') st = Math.max(st, fact.ktp.e[SITE.inverters[el].k - 1] + 2, invDcDone(el) + 1);
      if (a.stop) for (const [x, y] of a.stop) if (st >= x && st < y) st = y;
      let en = skipStops(st, st + dur / a.f, a.stop);
      fs[el] = st; fe[el] = en; t = en;
    });
    plan[a.id] = { s: ps, e: pe }; fact[a.id] = { s: fs, e: fe };
  }
  /* факт с площадки (экран «Обмен данными»): даты по элементам заменяют сценарий */
  let factOver = 0; try { const O = JSON.parse(localStorage.getItem('vie-fact-v1') || '{}'); for (const id in O) if (fact[id]) for (const el in O[id]) { const v = O[id][el]; if (+el < fact[id].e.length && v[1] >= v[0]) { fact[id].s[el] = v[0]; fact[id].e[el] = v[1]; factOver++; } } } catch (e) {}
  function invDcDone(ii) { let m = 0; SITE.trackers.forEach((t, i) => { if (t[3] === ii || t[4] === ii || t[5] === ii) m = Math.max(m, fact.dc.e[i]); }); return m; }
  // Пропуски монтажа: блок сдан, а части модулей нет — находит сверка с проектом
  const R = rng(522), missed = {};
  while (Object.keys(missed).length < 4) { const t = tOrder[20 + Math.floor(R() * 150)]; missed[t] = 81 - (3 + Math.floor(R() * 9)); }
  const PUNCH = 214;

  const lin = (a, d, f) => Math.max(0, Math.min(1, (d - (a.s + (f ? (a.late || 0) + 3 : 0))) / ((a.e - a.s) / (f ? a.f : 1))));
  function qty(id, d, isFact) {       // выполненный объём работы на день d
    const a = A[id], src = isFact ? fact[id] : plan[id];
    if (!a.per) return a.qty * lin(a, d, isFact);
    let q = 0; const n = src.e.length, per = a.qty / n;
    for (let i = 0; i < n; i++) {
      let k = d >= src.e[i] ? 1 : d <= src.s[i] ? 0 : (d - src.s[i]) / (src.e[i] - src.s[i]);
      if (isFact && id === 'mods' && missed[i] !== undefined && d < PUNCH) k = Math.min(k, missed[i] / 81);
      q += per * k;
    }
    return q;
  }
  const pct = (d, isFact) => ACT.reduce((s, a) => s + a.w * qty(a.id, d, isFact) / a.qty, 0) / WSUM;
  const curvePlan = [], curveFact = [];
  for (let d = 0; d <= MAXD; d++) { curvePlan.push(pct(d, false)); curveFact.push(pct(d, true)); }
  const factEnd = curveFact.findIndex(v => v > 0.9995);
  // Освоение по смете: 10 / 40 / 35 / 15 % по кварталам II кв. 2025 – I кв. 2026
  const cashPlan = d => { const q = [[0, 28, .10], [28, 120, .40], [120, 212, .35], [212, 242, .15]]; let s = 0; for (const [a, b, w] of q) s += w * Math.max(0, Math.min(1, (d - a) / (b - a))); return s; };

  function trackerState(t, d) {       // что смонтировано на столе t к дню d
    const f = (id) => { const s = fact[id].s[t], e = fact[id].e[t]; return d >= e ? 1 : d <= s ? 0 : (d - s) / (e - s); };
    let mods = Math.round(f('mods') * 81); if (missed[t] !== undefined && d < PUNCH) mods = Math.min(mods, missed[t]);
    const piles = Math.round(f('piles') * 15), tube = d >= fact.track.e[t], dc = d >= fact.dc.e[t];
    const stage = dc ? 5 : mods >= 81 ? 4 : mods > 0 ? 3 : tube ? 2 : piles > 0 ? 1 : 0;
    // отставание: самый ранний плановый шаг, который должен быть закончен, но не закончен
    let late = 0; for (const id of ['piles', 'track', 'mods', 'dc']) { if (d > plan[id].e[t] && d < fact[id].e[t]) { late = Math.max(late, d - plan[id].e[t]); } }
    if (missed[t] !== undefined && d >= fact.mods.e[t] && d < PUNCH) late = Math.max(late, d - plan.mods.e[t]);
    const due = d > plan.piles.s[t];
    return { piles, tube, mods, dc, stage, late, due };
  }
  function steps(t) { return ['piles', 'track', 'mods', 'dc'].map(id => ({ id, name: A[id].name, plan: plan[id].e[t], fact: fact[id].e[t] })); }

  /* склад модулей: поставки контейнерами по 620 шт; в сценарии — срыв поставок на 19 дней */
  const deliveries = []; { let got = 0, d = 40; while (got < M.modules) { if (!(d >= 97 && d < 124)) { const q = Math.min(d < 97 ? 1860 : 3100, M.modules - got); deliveries.push([d, q]); got += q; } d += d < 97 ? 6 : 5; } }
  const delivered = d => deliveries.reduce((s, [day, q]) => s + (day <= d ? q : 0), 0);

  /* замечания ОТК, привязанные к столам */
  const QC_TYPES = { piles: ['Свая отклонена от вертикали больше допуска', 'Свая недобита до проектной отметки'], track: ['Не затянуты хомуты трубы', 'Привод не выставлен по оси'], mods: ['Скол стекла модуля', 'Зажим модуля без шайбы'], dc: ['Разъём не обжат до щелчка', 'Перепутана полярность стринга', 'Кабель лежит на острой кромке'] };
  const qc = [];
  for (let k = 0; k < 64; k++) {
    const id = ['piles', 'track', 'mods', 'mods', 'dc', 'dc'][Math.floor(R() * 6)], t = Math.floor(R() * NT), list = QC_TYPES[id];
    const found = fact[id].e[t] + R() * 5, life = 3 + R() * 22 + (R() < .15 ? 60 : 0);
    qc.push({ n: k + 1, t, id, text: list[Math.floor(R() * list.length)], found, closed: found + life, sev: /полярн|Скол|недобита/.test(list[0]) && R() < .5 ? 'bad' : 'warn' });
  }
  qc.sort((a, b) => a.found - b.found);

  function metrics(d) {
    const pv = curvePlan[Math.min(MAXD, Math.round(d))], ev = curveFact[Math.min(MAXD, Math.round(d))];
    let es = 0; while (es < MAXD && curvePlan[es + 1] <= ev) es++;                       // освоенный срок: когда план давал такой же процент
    if (es < MAXD && curvePlan[es + 1] > curvePlan[es]) es += (ev - curvePlan[es]) / (curvePlan[es + 1] - curvePlan[es]);
    const spiT = d > 3 ? es / d : 1, forecast = ev >= 0.9995 ? factEnd : PD / Math.max(spiT, .2);
    const acts = ACT.map(a => {
      const p = qty(a.id, d, false), f = qty(a.id, d, true), rate = (f - qty(a.id, d - 7, true)) / 7, left = a.qty - f;
      const need = left > 0.5 ? left / Math.max(1, a.e - d) : 0, over = left > 0.5 && d > a.e;
      return { id: a.id, name: a.name, unit: a.unit, qty: a.qty, plan: p, fact: f, rate, need, over, done: left <= 0.5, started: f > 0 };
    });
    const modRate = Math.max(1, acts[3].rate), inst = acts[3].fact, del = delivered(d), stock = Math.max(0, del - inst);
    let front = 0; for (let t = 0; t < NT; t++) if (d >= fact.track.e[t] && d < fact.mods.s[t]) front++;
    const open = qc.filter(q => q.found <= d && q.closed > d);
    const stopped = A.mods.stop.find(([a, b]) => d >= a && d < b), stopWhy = stopped ? (stopped[0] === 84 ? 'Пыльная буря, ветер сильнее 15 м/с' : 'Модули закончились: поставка сорвана') : null;
    return { d, pv, ev, spi: pv > 0.002 ? ev / pv : 1, spiT, es, forecast, delay: forecast - PD, acts, del, stock, stockDays: stock / modRate, front, frontDays: front * 81 / modRate, open, stopped, stopWhy, total: M.modules, inst,
      missing: d < PUNCH ? Object.keys(missed).filter(t => d >= fact.mods.e[t] + 5).map(Number) : [] };
  }

  window.EPC = { factOver, deliveries, SMETA, COST_DEFAULTS, FIN_DEFAULTS, capex, finance, boq, ACT, PD, MAXD, DAY0, dateOf, curvePlan, curveFact, cashPlan, factEnd, trackerState, steps, metrics, qc, missed, delivered, plan, fact,
    pvsyst: { e50: 52135.6, e90: 50930.4, ghi: 1380.0, poa: 1811.6, pr: 95.89, tamb: 9.46 } };
})();
