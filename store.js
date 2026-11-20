/* Общий слой данных Платформы ВИЭ: проекты, расчёты, библиотеки, стройка. Им пользуются все разделы —
   проектирование, строительство и дашборд станции, поэтому цифры в них одни и те же.
   Хранение — в браузере (localStorage). Функции сгруппированы как ресурсы API (проекты, расчёты, результаты),
   чтобы хранилище можно было заменить сервером без переписывания экранов. */
(function () {
  const E = window.ENG, EPC = window.EPC, SITE = window.SITE, M0 = SITE.meta, RAD = Math.PI / 180, KEY = 'vie-platform-v4';
  const uid = () => Math.random().toString(36).slice(2, 8), clone = o => JSON.parse(JSON.stringify(o));
  const now = () => new Date().toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const FENX = (SITE.field.x0 - 102 + SITE.field.x1 + 48) / 2, FENZ = (SITE.field.z0 - 72 + SITE.field.z1 + 56) / 2;
  const geo = p => { const mLon = 111320 * Math.cos(p.lat * RAD); return { toLL: (x, z) => [p.lat - z / 111200, p.lon + x / mLon], fromLL: (la, lo) => [(lo - p.lon) * mLon, (p.lat - la) * 111200] }; };
  const rect = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];

  /* параметры станции в конструкторе на карте; из них строится иерархия блок → массив → инвертор → DC-поле */
  const MAP0 = { module: 'tr710', inverter: 'sg320', inv: 82, setKw: 320, ratio: +(M0.dcKw / (M0.inverters * M0.inverterKw)).toFixed(3), arrays: 4,
    mount: 'track', track: 'back', limit: 60, tilt: 30, az: 180, high: 1, wide: 81, orient: 'port', pitch: 7.22, post: 1.75, setback: 12, roadEW: 7.2, roadNS: 22, ns: 2,
    mvOn: true, mvNl: 0.06, mvFl: 0.34, coll: 0.06, das: 0, cool: 0, acOhm: 2.28, quality: -0.8, mismatch: 2.1, lid: 0, wiring: 1.5, health: 0, trackLoad: 0, uc: 29, uv: 0, structShade: 5, backMis: 10 };
  const newPred = (name, map) => ({ id: uid(), name, status: 'draft', stage: 'Черновик', fav: false, note: '', env: clone(E.ENV0), sim: clone(E.SIM0), unc: clone(E.UNC0), mode: 'map', map: Object.assign({}, MAP0, map), plant: { blocks: [], sys: clone(E.SYS0), ess: Object.assign({ on: false }, E.ESS0) } });

  function seed() {
    const aral = { id: 'aral', name: 'СЭС Арал 30 МВт', place: 'г. Аральск, Кызылординская область', lat: 46.7881403, lon: 61.726166, tz: 5, alt: 60, status: 'Действующий', stage: 'Рабочий проект', real: true, grid: 'ЗРУ 35 кВ, кабель 3,1 км', gridMw: 30, land: 'земли запаса, уклон до 1°', zones: [], preds: [], notes: [] };
    const g = geo(aral); aral.boundary = [[46.7917889, 61.7207917], [46.7916722, 61.7315417], [46.7845056, 61.7315111], [46.7845944, 61.7208028]].map(q => g.fromLL(q[0], q[1]).map(v => +v.toFixed(1)));
    const base = newPred('Рабочий проект ALH01-ST1', { real: true, arrCfg: [{ rep: 2, inv: 28, kva: 9000 }, { rep: 2, inv: 13, kva: 4500 }] }); base.id = 'base'; base.status = 'done'; base.stage = 'Проект'; base.ran = 'из проекта'; base.note = 'Состав станции и расстановка — из рабочего проекта.'; aral.preds.push(base);
    const mk = (id, name, dx, dz, w, h, extra, zones) => { const c = g.toLL(dx, dz); return Object.assign({ id, name, place: 'Аральский район, площадка-кандидат', lat: +c[0].toFixed(6), lon: +c[1].toFixed(6), tz: 5, alt: 60, status: 'Действующий', stage: 'Кандидат', demo: true, boundary: rect(w, h), zones, preds: [], notes: [] }, extra); };
    const z = (name, line, pts, setback) => ({ id: uid(), name, line, pts, setback, on: true });
    return { v: 4, projects: [aral,
      mk('north', 'Участок севернее города', -3400, -7200, 1000, 900, { grid: 'ВЛ 110 кВ, нужна своя подстанция, 11,4 км', gridMw: 40, land: 'пастбища, нужен перевод категории' }, [z('Скотопрогон', true, [[-550, -220], [0, -130], [550, -180]], 15)]),
      mk('road', 'Участок у автотрассы', 5600, 2100, 780, 745, { grid: 'ПС 35 кВ, 6,2 км', gridMw: 12, land: 'земли запаса, уклон до 2°' }, [z('Охранная зона ВЛ 110 кВ', true, [[-450, -300], [0, -90], [450, 0]], 20), z('Газопровод', true, [[270, -450], [290, 450]], 100)]),
      mk('bay', 'Участок на бывшем дне залива', -9800, 3300, 1200, 1000, { grid: 'ВЛ 110 кВ, нужна линия 22 км', gridMw: 60, land: 'солончак, риск подтопления' }, [z('Природоохранная зона', false, [[-700, -600], [-100, -600], [-250, -150], [-700, 0]], 0), z('Подтопление весной', false, [[-650, 260], [100, 340], [500, 200], [650, 550], [-650, 550]], 0)]),
    ], libs: { modules: [], inverters: [], weather: [] }, cost: {}, fin: {}, log: [{ t: 'из проекта', p: 'СЭС Арал 30 МВт', n: 'Рабочий проект ALH01-ST1', s: 'готов', ms: 0 }], scen: {}, recent: [], active: { pid: 'aral', prid: 'base' }, qc: null };
  }
  let DB; try { DB = JSON.parse(localStorage.getItem(KEY)); } catch (e) { DB = null; } if (!DB || DB.v !== 4) DB = seed();
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { /* хранилище недоступно или переполнено: работаем в памяти */ } };
  /* пользовательские записи библиотек подключаются к движку */
  function syncLibs() { for (const k of ['modules', 'inverters']) { E.LIB[k] = E.LIB[k].filter(x => !x.user).concat((DB.libs[k] || []).map(x => Object.assign({ user: true }, x))); }
    E.LIB.weather = E.LIB.weather.filter(x => !x.user); (DB.libs.weather || []).forEach(w => { try { E.LIB.weather.push(Object.assign(E.weatherFromRows(w.rows.map(r => ({ ghi: r[0], dhi: r[1], dni: r[2], tamb: r[3], wind: r[4] })), {}), w.meta, { user: true, solar: !!w.meta.solar, rows: undefined })); } catch (e) { /* повреждённая запись пропускается */ } }); }
  syncLibs();
  const proj = id => DB.projects.find(p => p.id === id), pred = (p, id) => p && p.preds.find(x => x.id === id);
  const REAL = () => { const tables = SITE.trackers.map(t => [t[0] - FENX, t[1] - FENZ, 2.384, M0.trackerLen, 0]); return { tables, n: tables.length, cap: tables.length, mpt: 81, mods: M0.modules, capMods: M0.modules, arrayHa: tables.length * M0.pitch * (M0.trackerLen + 7.2) / 1e4, len: M0.trackerLen, w: 2.384, bands: 6 }; };
  const exclOf = p => p.zones.filter(z => z.on !== false).map(E.zonePoly);

  /* конструктор на карте → иерархия станции */
  function plantFromMap(p, pr, lay) {
    const m = pr.map, D = E.byId(E.LIB.modules, m.module), V = E.byId(E.LIB.inverters, m.inverter), strings = lay.mods / 27;
    const fld = n => ({ module: m.module, mount: m.mount, track: m.track, limit: m.limit, tilt: m.tilt, az: m.az, high: m.high, wide: m.wide, orient: m.orient, series: 27, strings: n, pitch: m.pitch, post: m.post, rows: Math.max(2, Math.round(lay.n / Math.max(lay.bands, 1))), rowLen: 0,
      quality: m.quality, mismatch: m.mismatch, lid: m.lid, wiring: m.wiring, health: m.health, trackLoad: m.trackLoad, uc: m.uc, uv: m.uv, structShade: m.structShade, backMis: m.backMis });
    const arr = (rep, inv, kva) => ({ name: '', rep, mvOn: m.mvOn, mvKva: kva || 0, mvKv: 35, mvNl: m.mvNl, mvFl: m.mvFl, coll: m.coll, das: m.das, cool: m.cool, acOhm: m.acOhm, inverters: [{ inverter: m.inverter, rep: inv, setKw: m.setKw || V.kw, fields: [fld(strings / m.inv)] }] });
    const arrays = m.arrCfg && m.real ? m.arrCfg.map(a => arr(a.rep, a.inv, a.kva)) : [arr(Math.max(1, m.arrays | 0), m.inv / Math.max(1, m.arrays | 0), 0)];
    return { blocks: [{ name: 'Блок 1', rep: 1, arrays }], sys: pr.plant.sys, ess: pr.plant.ess };
  }
  /* расчёт варианта: расстановка → почасовой год → стоимость и экономика */
  const memo = new Map();
  function calc(p, pr, noSim) {
    const key = JSON.stringify([p.boundary, p.zones, pr.mode, pr.map, pr.plant, pr.env, pr.sim, DB.cost, DB.fin, noSim ? 1 : 0, p.lat, p.lon, E.LIB.modules.length, E.LIB.inverters.length]); if (memo.has(key)) return memo.get(key);
    const ex = exclOf(p), out = { free: E.freeArea(p.boundary, ex), area: E.polyArea(p.boundary) / 1e4, perim: E.perimeter(p.boundary) }; let plant;
    if (pr.mode === 'map') { const m = pr.map, D = E.byId(E.LIB.modules, m.module), V = E.byId(E.LIB.inverters, m.inverter); out.target = Math.round(m.inv * (m.setKw || V.kw) * m.ratio * 1000 / D.p / 27) * 27;
      const full = E.layout(m, p.boundary, ex); out.lay = m.real && p.real && !ex.length ? REAL() : E.layout(m, p.boundary, ex, out.target); out.fit = out.lay.mods >= out.target; out.capKw = full.capMods * D.p / 1000; plant = plantFromMap(p, pr, out.lay); }
    else { plant = pr.plant; out.lay = null; out.fit = true; }
    out.plant = plant; out.cap = E.capacity(plant); out.dcKw = out.cap.dcKw; out.acKw = out.cap.acKw;
    if (out.cap.mods > 0 && !noSim) { const t0 = performance.now(); out.res = E.simulate({ plant, env: pr.env, sim: pr.sim }, p); out.ms = performance.now() - t0; out.cost = cost(pr, out); out.pv = E.pvalues(out.res.energy, pr.unc, 1); }
    if (memo.size > 80) memo.clear(); memo.set(key, out); return out;
  }
  /* стоимость: пересчёт локальных смет проекта по мощности, площади и типу конструкции; оценка */
  const L = Object.fromEntries(EPC.SMETA.local.map(x => [x.id, x.v])), DIRECT0 = EPC.SMETA.local.reduce((s, x) => s + x.v, 0), EQ = { mods: 0.50, track: 0.26, inv: 0.07, ktp: 0.17 }, ARRAY0 = M0.trackers * M0.pitch * (M0.trackerLen + 7.2) / 1e4, STRUCT = { track1: [1, 1], track2: [0.96, 0.85], fixed: [0.58, 1.25] };
  function firstField(plant) { for (const b of plant.blocks) for (const a of b.arrays) for (const v of a.inverters) for (const f of v.fields) return { f, v }; return null; }
  function cost(pr, c, energy) {
    const ff = firstField(c.plant); if (!ff) return null; const f = Object.assign({}, E.FIELD0, ff.f), D = E.byId(E.LIB.modules, f.module), V = E.byId(E.LIB.inverters, ff.v.inverter), dcKw = c.cap.dcKw, kDc = dcKw / M0.dcKw, kAc = c.cap.acKw / (M0.inverters * M0.inverterKw);
    const lm = D.len * (f.high || 1), arrayHa = c.lay ? c.lay.arrayHa : c.cap.area / (lm / f.pitch) / 1e4 * 1.07, aRel = arrayHa / ARRAY0, st = STRUCT[f.mount === 'fixed' ? 'fixed' : (f.high || 1) > 1 ? 'track2' : 'track1'], gcrRel = (2.384 / M0.pitch) / (lm / f.pitch), mW = D.p >= 700 ? 1 : D.bif ? 1.03 : 0.94, iW = V.kind === 'центральный' ? 0.82 : 1, sz = (710 / D.p) * (D.len * D.wid / (2.384 * 1.303));
    const ess = c.plant.ess && c.plant.ess.on ? c.plant.ess.mwh * 115000 + c.plant.ess.mw * 38000 : 0;       // тыс. ₸, оценка
    const direct = L['2-1-6'] * (EQ.mods * kDc * mW + EQ.track * kDc * st[0] * sz + EQ.inv * kAc * iW + EQ.ktp * kAc) + L['2-1-7'] * kDc * (0.55 + 0.45 * gcrRel) * (V.kind === 'центральный' ? 1.25 : 1) + L['7-1'] * (0.4 + 0.6 * aRel) + L['2-1-3'] * kDc * st[1] * sz + L['2-1-2'] * Math.sqrt(Math.max(aRel, 0.05)) * kAc + L['2-1-1'] + L['2-1-4'] * aRel + L['2-1-5'] + L['3-1'];
    const r = direct / DIRECT0, c0 = Object.assign({}, EPC.COST_DEFAULTS, DB.cost), cap = EPC.capex(Object.assign({}, DB.cost, { kSmr: ((1 + c0.kSmr / 100) * r - 1) * 100, kEquip: ((1 + c0.kEquip / 100) * r - 1) * 100 }));
    const net = cap.net + ess, en = energy ?? (c.res ? c.res.energy : 0), fin = en ? EPC.finance(net * 1000, en, Object.assign({}, DB.fin, { degr: pr.sim && pr.sim.degModel !== 'none' ? pr.sim.degRate : 0 })) : null;
    return { net, total: cap.total + ess * 1.12, perW: net / dcKw, fin, lcoe: fin ? fin.lcoe : null, ess, arrayHa };
  }
  function bom(c) {
    const ff = firstField(c.plant); if (!ff) return []; const f = Object.assign({}, E.FIELD0, ff.f), D = E.byId(E.LIB.modules, f.module), V = E.byId(E.LIB.inverters, ff.v.inverter), mods = c.cap.mods, mpt = (f.wide || 81) * (f.high || 1), tables = c.lay ? c.lay.n : Math.ceil(mods / mpt), piles = f.mount === 'fixed' ? 34 : (f.high || 1) > 1 ? 23 : 15, kDc = c.cap.dcKw / M0.dcKw, gcrRel = (2.384 / M0.pitch) / (D.len * (f.high || 1) / f.pitch), strings = Math.round(c.cap.strings), central = V.kind === 'центральный';
    const aHa = c.lay ? c.lay.arrayHa : c.cap.area / (D.len * (f.high || 1) / f.pitch) / 1e4;
    return [['Модули ' + D.model, mods, 'шт'], [(f.mount === 'fixed' ? 'Столы ' : 'Трекеры ') + (f.high || 1) + '×' + (f.wide || 81), tables, 'шт'], ['Сваи', tables * piles, 'шт'], ['Стринги по ' + (f.series || 27) + ' модулей', strings, 'шт'], ['Инверторы ' + V.model, Math.round(c.cap.inv), 'шт'],
      [central ? 'Сборные коробки' : 'Щиты объединения стрингов', central ? Math.ceil(strings / 24) : 0, 'шт'], ['Пары стринговых жгутов', strings, 'шт'], ['Магистральный кабель DC', Math.round(223.1 * kDc * (0.55 + 0.45 * gcrRel) * 0.42 * 1000), 'м'], ['Кабель постоянного тока, всего', Math.round(223.1 * kDc * (0.55 + 0.45 * gcrRel)), 'км'], ['Кабель 0,8 кВ', +(11 * Math.sqrt(aHa / ARRAY0) * c.cap.inv / M0.inverters).toFixed(1), 'км'],
      ['Трансформаторные подстанции', Math.round(c.cap.arrays), 'шт'], ['Площадь массива', +aHa.toFixed(1), 'га']].filter(r => r[1]);
  }
  const touch = pr => { if (pr.status === 'done') pr.status = 'draft'; persist(); };
  const setActive = (pid, prid) => { DB.active = { pid, prid }; DB.recent = [{ pid, prid }].concat((DB.recent || []).filter(r => !(r.pid === pid && r.prid === prid))).slice(0, 5); persist(); };
  const activeCalc = () => { const p = proj(DB.active.pid) || DB.projects[0], pr = pred(p, DB.active.prid) || p.preds[0]; return pr ? { p, pr, c: calc(p, pr) } : null; };
  const reset = () => { DB = seed(); persist(); memo.clear(); syncLibs(); };

  window.STORE = { get DB() { return DB; }, persist, proj, pred, geo, rect, uid, now, clone, calc, cost, bom, exclOf, touch, newPred, MAP0, REAL, setActive, activeCalc, reset, syncLibs, plantFromMap, firstField, memo };
})();
