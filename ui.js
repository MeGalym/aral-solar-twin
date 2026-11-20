/* Экраны стадии девелопмента и новые разделы эксплуатации.
   Расчёты лежат в dev.js и oms.js, здесь только интерфейс: правая колонка, нижняя панель, карта. */
window.makeUI = function (A) {
  const { S, $, $$, fmt, fdate, hhmm, spark, gauge, ring, pw, MON, SITE, M, EPC, PV, DEV, OMS, NP, NT, NI } = A;
  const AC = DEV.AC_KW / 1000, DAY = 864e5;
  S.dev = { sel: 'A', site: 's1', src: 'mn', user: [], n: 0, w: {}, custom: null, drawing: null, zones: {}, plot: 'tbl', draft: { type: 't1', pitch: M.pitch, ratio: +(M.dcKw / DEV.AC_KW).toFixed(3), road: 7.2, inset: 12, ns: 2 } };
  S.pf = { period: 'day', group: 'inv' }; S.pred = { sel: null, orders: {} }; S.imp = { p: 0, run: false, done: false, msg: '' }; S.scada = { on: true, n: 0, buf: [], feed: [], c: 0.98 }; S.sens = { sel: null };
  const views = {
    dev: [['sites', 'Площадка'], ['res', 'Ресурс'], ['imp', 'Импорт'], ['layout', 'Компоновка'], ['fin', 'Финмодель']],
    ops: [['now', 'Станция'], ['pf', 'Расчёт и факт'], ['scada', 'SCADA'], ['sens', 'Датчики'], ['pred', 'Диагностика'], ['ctl', 'Управление']],
  };
  const usesMap = v => v === 'layout' || v === 'sites';
  const mapOn = () => S.stage === 'dev' && usesMap(S.view.dev) && S.dmode === 'map' && !!window.L;

  /* ───────── мелкие помощники ───────── */
  const sg = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), d);
  const tile = (l, v, u, s, extra = '') => `<div class="tile"><label>${l}</label><div class="v">${v}<small>${u}</small></div><div class="s">${s}</div>${extra}</div>`;
  const kv = rows => rows.map(r => `<dt>${r[0]}</dt><dd class="${r[2] || ''}">${r[1]}</dd>`).join('');
  const sl = (id, label, min, max, step, val, hint) => `<label class="sl"><span>${label}</span><output id="o-${id}"></output><input type="range" data-sl="${id}" min="${min}" max="${max}" step="${step}" value="${val}">${hint ? `<small>${hint}</small>` : ''}</label>`;
  const card = (title, pill, body, id) => `<section class="card glass"${id ? ` id="${id}"` : ''}><div class="card-head"><h2>${title}</h2>${pill || ''}</div>${body}</section>`;
  const pill = (t, cls = 'off', id) => `<span class="pill ${cls}"${id ? ` id="${id}"` : ''}><i></i><span>${t}</span></span>`;
  const DEMO = '<span class="demo">демо-данные</span>';
  const X = v => (v * 1000).toFixed(1), Y = v => (100 - v * 100).toFixed(1), path = pts => pts.length ? 'M' + pts.map(p => X(p[0]) + ',' + Y(p[1])).join('L') : '';
  /* график: растянутый SVG с линиями и столбцами, подписи и точки — обычными элементами поверх */
  function PL(o) {
    const svg = (o.paths || []).map(p => p.rect ? `<rect x="${X(p.rect[0])}" y="${Y(p.rect[1] + p.rect[3])}" width="${(p.rect[2] * 1000).toFixed(1)}" height="${(p.rect[3] * 100).toFixed(1)}" rx="3" fill="${p.fill}"/>`
      : `<path d="${p.d}${p.area ? `L${X(p.area[1])},100L${X(p.area[0])},100Z` : ''}" fill="${p.fill || 'none'}" stroke="${p.stroke || 'none'}" stroke-width="${p.w || 1.6}" ${p.dash ? `stroke-dasharray="${p.dash}"` : ''} vector-effect="non-scaling-stroke"/>`).join('');
    const lab = (o.labels || []).map(l => l.dot ? `<i style="left:${(l.x * 100).toFixed(1)}%;top:${(100 - l.y * 100).toFixed(1)}%;background:${l.dot}"></i>` : `<span class="${l.cls || ''}" style="left:${(l.x * 100).toFixed(1)}%;top:${(100 - l.y * 100).toFixed(1)}%">${l.t}</span>`).join('');
    return `<div class="pl ${o.cls || ''}"><svg viewBox="0 0 1000 100" preserveAspectRatio="none">${svg}</svg>${lab}</div>`;
  }
  const cap = items => `<span class="cap">${items.map(c => typeof c === 'string' ? `<span>${c}</span>` : `<span><i style="background:${c[0]}"></i>${c[1]}</span>`).join('')}</span>`;
  const xax = (labels, tpl) => `<div class="xax" style="grid-template-columns:${tpl || `repeat(${labels.length},minmax(0,1fr))`}">${labels.map((l, i) => `<span style="text-align:${!tpl ? 'center' : i === 0 ? 'left' : i === labels.length - 1 ? 'right' : 'center'}">${l}</span>`).join('')}</div>`;
  const save = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  const dateIn = d => fdate(new Date(Date.now() + d * DAY - new Date().getTimezoneOffset() * 6e4));

  /* ═════════ ДЕВЕЛОПМЕНТ ═════════ */
  let siteMemo = {};
  function curSite() {           // площадка вместе с зонами, которые пользователь нарисовал сам
    const base = S.dev.custom || DEV.SITES.find(s => s.id === S.dev.site), own = S.dev.zones[base.id] || []; if (!own.length) return base;
    const key = base.id + '|' + own.length + '|' + base.boundary.length; if (siteMemo.key === key) return siteMemo.site;
    const zones = base.zones.concat(own), site = Object.assign({}, base, { zones, excl: zones.map(z => z.poly), freeHa: null }); site.freeHa = DEV.freeArea(site.boundary, site.excl); site.haOk = site.freeHa; siteMemo = { key, site }; return site;
  }
  const defs = () => DEV.PRESETS.concat(S.dev.user);
  function scen() {
    const site = curSite(), list = defs().concat([Object.assign({ id: 'draft', name: 'Свой вариант', user: true }, S.dev.draft)]).map(v => DEV.variant(v, site, S.cost, S.fin));
    if (site.id !== 's1') list[0].name = 'Как в проекте';
    const ok = list.filter(r => !r.empty), best = ok.reduce((b, r) => !b || r.lcoe < b.lcoe ? r : b, null), base = list[0];
    return { site, list, best, base, sel: list.find(r => r.id === S.dev.sel) || base };
  }
  const PITCH = { t1: [4.6, 10, 0.02], t2: [9.4, 20, 0.05], fx: [7, 16, 0.05] }, PITCH0 = { t1: M.pitch, t2: 14, fx: 10.5 };

  const DEV_RIGHT = {
    layout: () => card('Варианты компоновки', pill('', 'off', 'd-pill'), `<div class="tiles" id="r-tiles"></div><dl class="kv sep" id="d-kv"></dl><p class="note-line" id="d-fit"></p>`) +
      card('Свой вариант', `<button class="mini go" data-act="add-var">В сравнение</button>`, `<div class="seg" role="group" aria-label="Тип стола">${[['t1', 'Трекер, 1 ряд'], ['t2', 'Трекер, 2 ряда'], ['fx', 'Столы 30°']].map(t => `<button data-type="${t[0]}" aria-pressed="${S.dev.draft.type === t[0]}">${t[1]}</button>`).join('')}</div>
        <div class="rows">${sl('pitch', 'Шаг рядов', ...PITCH[S.dev.draft.type], S.dev.draft.pitch)}${sl('ratio', 'Отношение DC/AC', 1, 1.6, 0.01, S.dev.draft.ratio)}${sl('road', 'Проезд между полосами столов', 4, 14, 0.2, S.dev.draft.road)}${sl('inset', 'Отступ от границы и зон', 5, 40, 1, S.dev.draft.inset ?? 12)}${S.dev.draft.type === 'fx' ? '' : sl('ns', 'Проездов с севера на юг', 0, 4, 1, S.dev.draft.ns ?? 2)}</div>
        <div class="chips"><button class="mini" data-act="draw" id="d-draw">Нарисовать границу</button><button class="mini" data-act="zone" id="d-zone">Зона исключения</button><button class="mini" data-act="unzone" id="d-unzone" hidden>Убрать свои зоны</button><button class="mini" data-act="undraw" id="d-undraw" hidden>Вернуть участок проекта</button></div><p class="note-line" id="d-drawmsg" hidden></p>`) +
      card('Ведомость варианта', pill('оценка'), `<table class="boq" id="d-bom"><tbody></tbody></table><div class="chips"><button class="mini" data-act="kml">Скачать KML</button><button class="mini" data-act="dxf">Скачать DXF</button></div>`),
    fin: () => card('Финмодель и тариф', pill('', 'off', 'f-pill'), `<div class="tiles" id="r-tiles"></div>`) +
      card('Чувствительность', `<button class="mini" data-act="fin-zero">Сбросить</button>`, `<div class="rows">${sl('tariff', 'Тариф', 8, 45, 0.5, S.fin.tariff ?? EPC.FIN_DEFAULTS.tariff)}${sl('capex', 'Капитальные затраты', -30, 30, 1, S.cost.kSmr ?? 0)}${sl('rate', 'Ставка дисконтирования', 4, 20, 0.5, S.fin.rate ?? EPC.FIN_DEFAULTS.rate)}</div>`) +
      card('CAPEX и OPEX', pill('', 'off', 'f-years'), `<dl class="kv" id="f-kv"></dl>`) +
      card('Что сильнее влияет на NPV', pill('млрд ₸'), `<div class="torn" id="f-torn"></div>`),
    res: () => card('Ресурс по измерениям', pill('', 'off', 'r-pill'), `<div class="tiles" id="r-tiles"></div><dl class="kv sep" id="r-kv"></dl>`) +
      card('Источники данных', pill('4 ряда'), `<div class="rows" id="r-src"></div>`) +
      card('Сходимость источников', DEMO, `<dl class="kv" id="r-conv"></dl><p class="note-line" id="r-note"></p>`),
    sites: () => card('Выбор площадки', pill('', 'off', 's-pill'), `<div class="rows" id="s-rows"></div>`) +
      card('', '', `<div id="s-detail"></div>`, 's-card') +
      card('Веса критериев', `<button class="mini" data-act="w-zero">Сбросить</button>`, `<div class="rows">${DEV.CRIT.map(c => sl('w-' + c[0], c[1], 0, 50, 5, S.dev.w[c[0]] ?? DEV.WEIGHTS[c[0]])).join('')}</div>`),
    imp: () => card('Импорт чертежей', pill('DWG, DXF, KML'), `<label class="drop"><input type="file" id="i-file" accept=".dwg,.dxf,.kml,.kmz"><b>Выберите файл чертежа</b>Генплан в DWG или DXF, границы в KML или KMZ</label>
        <div class="chips"><button class="mini go" data-act="imp-run">Разобрать пример генплана</button><button class="mini" data-act="imp-clear">Очистить модель</button></div><div class="prog"><i id="i-bar"></i></div><p class="note-line" id="i-msg"></p>`) +
      card('Что распознано', pill('', 'off', 'i-pill'), `<div class="steps" id="i-steps" style="margin-top:0;padding-top:0;border-top:0"></div>`) +
      card('Замечания разбора', DEMO, `<div class="rows" id="i-warn"></div>`),
  };

  /* ───── компоновка ───── */
  let fitMemo = {};
  function renderLayout() {
    const sc = scen(), r = sc.sel, b = sc.base, site = sc.site;
    $('#clock').textContent = site.real ? `Участок ${fmt(site.ha, 0)} га` : site.id === 'custom' ? `Своя граница, ${fmt(site.ha, 0)} га` : site.name;
    $('#d-pill').lastElementChild.textContent = r.name;
    if (r.empty) { $('#r-tiles').innerHTML = `<p class="empty" style="grid-column:1/-1">На этом участке при таком шаге не помещается ни один стол.</p>`; $('#d-kv').innerHTML = ''; $('#d-fit').textContent = ''; }
    else {
      $('#r-tiles').innerHTML = tile('Мощность DC', fmt(r.dcKw / 1000, 2), 'МВт', `AC ${fmt(AC, 2)} МВт, DC/AC ${fmt(r.ratio, 2)}`) + tile('Выработка', fmt(r.energy / 1000, 1), 'ГВт·ч', `${fmt(r.spec)} кВт·ч на кВт в год`) +
        tile('Стоимость', fmt(r.capexNet / 1e6, 2), 'млрд ₸', `${fmt(r.perW)} ₸/Вт без НДС`) + tile('LCOE', fmt(r.lcoe, 1), '₸/кВт·ч', r.base || b.empty ? 'база для сравнения' : `${sg((r.lcoe / b.lcoe - 1) * 100)} % к проекту`);
      $('#d-kv').innerHTML = kv([['Шаг рядов и плотность', `${fmt(r.pitch, 2)} м, ${fmt(r.gcr * 100)} %`], ['PR', fmt(r.pr, 1) + ' %'], ['КИУМ', fmt(r.cf, 1) + ' %'], ['Срез по мощности инверторов', fmt(r.clip, 2) + ' %', r.clip > 2 ? 'bad' : ''], ['Затенение соседними рядами', fmt(r.shade, 2) + ' %'], ['Под столами', `${fmt(r.area, 1)} из ${fmt(r.free, 1)} га`]]);
      const f = $('#d-fit'); f.className = 'note-line ' + (r.fit ? 'ok' : 'bad');
      f.textContent = r.fit ? `Помещается. При таком шаге на участок входит до ${fmt(r.capKw / 1000, 1)} МВт.` : `Не помещается: нужно ${fmt(r.target * M.moduleW / 1e6, 1)} МВт, входит ${fmt(r.capKw / 1000, 1)} МВт. Уменьшите шаг рядов или DC/AC.`;
    }
    const d = S.dev.draft, T = DEV.TYPES[d.type], gcr = (2.384 * T.rows) / d.pitch;
    $('#o-pitch').textContent = `${fmt(d.pitch, 2)} м · ${fmt(gcr * 100)} %`; $('#o-ratio').textContent = `${fmt(d.ratio, 2)} · ${fmt(AC * d.ratio, 1)} МВт`; $('#o-road').textContent = `${fmt(d.road, 1)} м`; $('#o-inset').textContent = `${fmt(d.inset ?? 12)} м`; if ($('#o-ns')) $('#o-ns').textContent = fmt(d.ns ?? 2);
    const dr = S.dev.drawing, zn = S.dev.drawMode === 'zone';
    $('#d-undraw').hidden = !S.dev.custom && S.dev.site === 's1'; $('#d-unzone').hidden = !(S.dev.zones[site.id] || []).length;
    $('#d-draw').textContent = dr && !zn ? `Готово, точек: ${dr.length}` : 'Нарисовать границу'; $('#d-zone').textContent = dr && zn ? `Готово, точек: ${dr.length}` : 'Зона исключения';
    const dm = $('#d-drawmsg'); dm.hidden = !dr; dm.textContent = zn ? 'Отметьте на карте линию (две точки и больше) или контур зоны. Линия получит отступ 20 м в обе стороны. Двойной щелчок или «Готово» завершают.' : 'Отмечайте углы участка щелчками по карте. Двойной щелчок или кнопка «Готово» замыкают границу.';
    $('#d-bom').tBodies[0].innerHTML = r.empty ? '' : DEV.bom(r).map(x => `<tr><td>${x[0]}</td><td>${fmt(x[1], x[1] % 1 ? 1 : 0)} ${x[2]}</td></tr>`).join('');
    /* таблица сценариев */
    const row = x => x.empty ? `<tr data-var="${x.id}" class="${x.id === r.id ? 'sel' : ''}"><td>${x.name}</td><td colspan="9" class="bad" style="text-align:left">столы не помещаются</td></tr>` :
      `<tr data-var="${x.id}" class="${x.id === r.id ? 'sel' : ''}"><td>${x.name}${x === sc.best ? '<span class="tag" style="font-size:10px;padding:1px 6px;border-radius:999px;background:var(--ok);color:#0c2418;margin-left:6px">лучший LCOE</span>' : ''} <small>${x.T.short}</small></td><td>${fmt(x.gcr * 100)} %</td><td>${fmt(x.ratio, 2)}</td><td class="${x.fit ? '' : 'bad'}">${fmt(x.dcKw / 1000, 2)}</td><td>${fmt(x.energy / 1000, 1)}</td><td>${fmt(x.spec)}</td><td class="${x.clip > 2 ? 'bad' : ''}">${fmt(x.clip, 2)}</td><td>${fmt(x.perW)}</td><td class="${x === sc.best ? 'best' : ''}">${fmt(x.lcoe, 2)}</td><td>${fmt(x.land)}${x.user && x.id !== 'draft' ? ` <button class="rm" data-rm="${x.id}" aria-label="Убрать вариант">×</button>` : ''}</td></tr>`;
    const tog = `<span style="margin-left:auto;display:flex;gap:4px;pointer-events:auto"><button class="mini ${S.dev.plot === 'tbl' ? 'go' : ''}" data-plot="tbl">Сценарии</button><button class="mini ${S.dev.plot === 'mon' ? 'go' : ''}" data-plot="mon">По месяцам</button></span>`;
    if (S.dev.plot === 'mon' && !r.empty) { const mxm = Math.max(...r.months, ...b.months) * 1.14 / 1000, P2 = [], L2 = [];
      for (let m = 0; m < 12; m++) { const x0 = m / 12; P2.push({ rect: [x0 + 0.012, 0, 0.026, b.months[m] / 1000 / mxm], fill: 'rgba(19,41,75,.3)' }, { rect: [x0 + 0.042, 0, 0.026, r.months[m] / 1000 / mxm], fill: '#f5b544' }); L2.push({ t: fmt(r.months[m] / 1000, 1), x: x0 + 0.042, y: r.months[m] / 1000 / mxm + 0.07, cls: 'hi' }); }
      $('#plot').innerHTML = cap([['rgba(19,41,75,.4)', sc.base.name], ['#f5b544', r.name], `выработка по месяцам, ГВт·ч. За год ${fmt(r.energy / 1000, 1)}`]).replace('</span>$', '') .replace(/<\/span>$/, tog + '</span>') + PL({ paths: P2, labels: L2 }) + xax(MON); }
    else $('#plot').innerHTML = cap(['Сценарии на одном участке. Нажмите строку, чтобы показать вариант на карте']).replace(/<\/span>$/, tog + '</span>') + `<div class="tw"><table class="cmp"><thead><tr><th>Вариант</th><th>Плотность<br>рядов</th><th>DC/AC</th><th>DC,<br>МВт</th><th>Выработка,<br>ГВт·ч</th><th>кВт·ч<br>на кВт</th><th>Срез,<br>%</th><th>Стоимость,<br>₸/Вт</th><th>LCOE,<br>₸/кВт·ч</th><th>Участок,<br>%</th></tr></thead><tbody>${sc.list.map(row).join('')}</tbody></table></div>`;
    /* сколько помещается при разной плотности */
    const key = [r.type, site.id, site.boundary.length, site.boundary[0][0]].join('|'), fc = fitMemo[key] || (fitMemo[key] = DEV.fitCurve(r.type, site));
    const mx = Math.max(...fc.map(p => p[1]), 1) * 1.08, nx = g => (g - 0.25) / 0.35, tg = (r.target || 0) * M.moduleW / 1e6, g0 = Math.max(0.25, Math.min(0.6, r.gcr || 0.33)), i0 = Math.min(fc.length - 2, Math.floor((g0 - 0.25) / 0.025)), y0 = fc[i0][1] + (fc[i0 + 1][1] - fc[i0][1]) * (g0 - fc[i0][0]) / 0.025;
    $('#side').innerHTML = `<div class="card-head"><h2>Сколько помещается</h2><span class="pill off"><span>МВт DC</span></span></div>` + PL({ cls: 'sm', paths: [{ d: path(fc.map(p => [nx(p[0]), p[1] / mx])), stroke: '#f5b544', area: [0, 1], fill: 'url(#gA)' }, { d: path([[0, tg / mx], [1, tg / mx]]), stroke: '#16233B', dash: '5 5', w: 1.2 }, { d: path([[nx(g0), 0], [nx(g0), y0 / mx]]), stroke: 'rgba(19,41,75,.5)', w: 1 }],
      labels: [{ dot: '#16233B', x: nx(g0), y: y0 / mx }, { t: `${fmt(y0, 1)} МВт`, x: nx(g0), y: Math.min(0.92, y0 / mx + 0.14), cls: 'hi' + (nx(g0) > 0.7 ? ' r' : nx(g0) < 0.2 ? ' l' : '') }, { t: `нужно ${fmt(tg, 1)}`, x: 0.99, y: Math.max(0.1, tg / mx - 0.12), cls: 'r' }] }) + xax(['25 %', 'плотность рядов', '60 %'], 'auto 1fr auto');
    drawMap();
  }

  /* ───── финмодель ───── */
  function renderFin() {
    const sc = scen(), r = sc.sel.empty ? sc.base : sc.sel, p = Object.assign({}, EPC.FIN_DEFAULTS, S.fin), f = r.fin, capK = S.cost.kSmr ?? 0;
    $('#clock').textContent = `Срок ${p.years} лет`; $('#f-pill').lastElementChild.textContent = sc.site.id === 's1' ? r.name : `${r.name} · ${sc.site.name}`; $('#f-years').lastElementChild.textContent = `${fmt(r.dcKw / 1000, 2)} МВт`;
    $('#o-tariff').textContent = `${fmt(p.tariff, 1)} ₸/кВт·ч`; $('#o-capex').textContent = capK ? `${sg(capK, 0)} % к смете` : 'по смете'; $('#o-rate').textContent = `${fmt(p.rate, 1)} %`;
    const fin = o => EPC.finance(r.capexNet * 1000 * (o.kc || 1), r.energy * (o.ke || 1), Object.assign({}, S.fin, o.p));
    let lo = 1, hi = 200; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; fin({ p: { tariff: m } }).npv > 0 ? hi = m : lo = m; } const be = (lo + hi) / 2;
    $('#r-tiles').innerHTML = tile('NPV', sg(f.npv / 1e9, 2), 'млрд ₸', `при ставке ${fmt(p.rate, 1)} %`) + tile('IRR', f.irr != null ? fmt(f.irr * 100, 1) : '—', '%', f.irr == null ? 'поток не окупает вложения' : f.irr * 100 >= p.rate ? 'выше ставки дисконтирования' : 'ниже ставки дисконтирования') +
      tile('Окупаемость', f.payback ? fmt(f.payback, 1) : '—', f.payback ? 'лет' : '', f.payback ? 'простая, без дисконта' : `за ${p.years} лет не окупается`) + tile('LCOE', fmt(f.lcoe, 1), '₸/кВт·ч', `тариф ${fmt(p.tariff, 1)} ₸/кВт·ч`);
    const opex = r.capexNet * p.opex / 100;
    $('#f-kv').innerHTML = kv([['CAPEX без НДС', fmt(r.capexNet / 1e6, 2) + ' млрд ₸'], ['CAPEX с НДС', fmt(r.capexTotal / 1e6, 2) + ' млрд ₸'], ['На ватт', `${fmt(r.perW)} ₸ · ${fmt(r.perW / p.fx, 2)} $`], ['OPEX в год', `${fmt(opex / 1e3)} млн ₸ · ${fmt(p.opex, 1)} %`], ['Выработка первого года', fmt(r.energy / 1000, 1) + ' ГВт·ч'], ['Выручка первого года', fmt(f.rev1 / 1e9, 2) + ' млрд ₸'], ['Деградация модулей', fmt(p.degr, 1) + ' % в год'], ['Индексация тарифа', fmt(p.index, 1) + ' % в год']]);
    const T = [['Тариф ±10 %', fin({ p: { tariff: p.tariff * 0.9 } }).npv, fin({ p: { tariff: p.tariff * 1.1 } }).npv], ['CAPEX ±10 %', fin({ kc: 1.1 }).npv, fin({ kc: 0.9 }).npv], ['Выработка ±5 %', fin({ ke: 0.95 }).npv, fin({ ke: 1.05 }).npv], ['Ставка ±2 п.п.', fin({ p: { rate: p.rate + 2 } }).npv, fin({ p: { rate: p.rate - 2 } }).npv], ['OPEX ±20 %', fin({ p: { opex: p.opex * 1.2 } }).npv, fin({ p: { opex: p.opex * 0.8 } }).npv]]
      .map(t => [t[0], (t[1] - f.npv) / 1e9, (t[2] - f.npv) / 1e9]).sort((a, b) => (b[2] - b[1]) - (a[2] - a[1])), mxT = Math.max(...T.map(t => Math.max(-t[1], t[2])), 0.01);
    $('#f-torn').innerHTML = T.map(t => `<span>${t[0]}</span><div class="b"><i class="neg" style="right:50%;width:${(-t[1] / mxT * 48).toFixed(1)}%"></i><i class="pos" style="left:50%;width:${(t[2] / mxT * 48).toFixed(1)}%"></i></div><em>${sg(t[1], 2)} / ${sg(t[2], 2)}</em>`).join('');
    $('#side').innerHTML = `<div class="card-head"><h2>Тариф безубыточности</h2></div><div class="big"><b>${fmt(be, 1)} ₸</b><span>за кВт·ч</span></div><p class="empty">При таком тарифе NPV равен нулю при ставке ${fmt(p.rate, 1)} %. ${p.tariff >= be ? `Текущий тариф выше на ${fmt(p.tariff - be, 1)} ₸.` : `Текущий тариф ниже на ${fmt(be - p.tariff, 1)} ₸.`}</p>`;
    const n = f.cf.length - 1, cum = [], dis = []; let a = 0, d = 0; f.cf.forEach((c, i) => { a += c; d += c / Math.pow(1 + p.rate / 100, i); cum.push(a / 1e9); dis.push(d / 1e9); });
    const lo2 = Math.min(...cum, ...dis), hi2 = Math.max(...cum, ...dis, 0.5), ny = v => (v - lo2) / (hi2 - lo2) * 0.9 + 0.05, nxx = i => i / n, z = ny(0);
    const labels = [{ t: '0', x: 0.004, y: z + 0.07, cls: 'l' }, { t: `${sg(cum[n], 1)} млрд ₸`, x: 0.995, y: Math.min(0.95, ny(cum[n]) + 0.09), cls: 'r hi' }, { t: `${sg(dis[n], 1)} с дисконтом`, x: 0.995, y: Math.max(0.06, ny(dis[n]) - 0.09), cls: 'r' }];
    if (f.payback) labels.push({ dot: '#16233B', x: f.payback / n, y: z }, { t: `окупаемость ${fmt(f.payback, 1)} года`, x: f.payback / n, y: z - 0.1, cls: f.payback / n > 0.75 ? 'r' : '' });
    $('#plot').innerHTML = cap([['#f5b544', 'накопленный денежный поток'], ['#0B6FC1', 'с дисконтированием'], `вариант «${r.name}», млрд ₸`]) + PL({ paths: [{ d: path([[0, z], [1, z]]), stroke: 'rgba(19,41,75,.3)', w: 1 }, { d: path(dis.map((v, i) => [nxx(i), ny(v)])), stroke: '#0B6FC1', w: 1.6 }, { d: path(cum.map((v, i) => [nxx(i), ny(v)])), stroke: '#f5b544', w: 2 }], labels }) + xax(['год 0', `год ${Math.round(n / 2)}`, `год ${n}`], 'auto 1fr auto');
  }

  /* ───── ресурс ───── */
  function renderRes() {
    const all = DEV.SOURCES.map(s => DEV.source(s.id)), s = all.find(x => x.id === S.dev.src), b = all[0];
    $('#clock').textContent = 'Солнечный ресурс'; $('#r-pill').lastElementChild.textContent = s.name;
    $('#r-tiles').innerHTML = tile('Приход на горизонталь', fmt(s.ghiY), 'кВт·ч/м²', s.id === 'mn' ? 'за год, принят в проекте' : `${sg((s.ghiY / b.ghiY - 1) * 100)} % к проектному`) + tile('Температура воздуха', fmt(s.tambY, 1), '°C', 'средняя за год') +
      tile('Выработка P50', fmt(s.energy / 1000, 1), 'ГВт·ч', s.id === 'mn' ? 'расчёт по цепочке потерь' : `${sg((s.energy / b.energy - 1) * 100)} % к проектной`) + tile('Выработка P90', fmt(s.p90 / 1000, 1), 'ГВт·ч', 'с вероятностью 90 %');
    $('#r-kv').innerHTML = kv([['Рассеянная радиация', `${fmt(s.dhiY)} кВт·ч/м² · ${fmt(s.dhiY / s.ghiY * 100)} %`], ['Длина ряда', s.years], ['Самый солнечный месяц', `${MON[s.ghi.indexOf(Math.max(...s.ghi))]}, ${fmt(Math.max(...s.ghi))} кВт·ч/м²`]]);
    $('#r-src').innerHTML = all.map(x => `<button class="row w ${x.id === s.id ? 'sel' : ''}" data-src="${x.id}"><span class="n">${x.name}${x.real ? '' : ' ' + DEMO}</span><span class="p">${fmt(x.ghiY)} <small>кВт·ч/м²</small></span><span class="note">${x.note}</span></button>`).join('');
    const gs = all.map(x => x.ghiY), es = all.map(x => x.energy), sp = a => (Math.max(...a) - Math.min(...a)) / 2 / (a.reduce((q, v) => q + v, 0) / a.length) * 100, ms = all.find(x => x.measured), sat = all.find(x => x.id === 'sat');
    $('#r-conv').innerHTML = kv([['Разброс прихода между источниками', '±' + fmt(sp(gs), 1) + ' %'], ['Разброс выработки', '±' + fmt(sp(es), 1) + ' %'], ['Измерения к спутниковому ряду', `${sg((ms.ghiY / sat.ghiY - 1) * 100)} %, R² 0,97`], ['Измерения к проектному ряду', `${sg((ms.ghiY / b.ghiY - 1) * 100)} %`]]);
    $('#r-note').textContent = 'Проектный ряд осторожнее измерений: год наблюдений на площадке даёт приход выше на ' + fmt((ms.ghiY / b.ghiY - 1) * 100, 1) + ' %.';
    $('#side').innerHTML = `<div class="card-head"><h2>Состав радиации</h2></div>` + ring([['Прямая', s.ghiY - s.dhiY, '#f5b544'], ['Рассеянная', s.dhiY, '#0B6FC1']], fmt(s.ghiY), 'кВт·ч/м²');
    const mx = Math.max(...all.flatMap(x => x.ghi)) * 1.12, tmin = -14, tmax = 32, paths = [], labels = [];
    for (let m = 0; m < 12; m++) { const x0 = m / 12; paths.push({ rect: [x0 + 0.012, 0, 0.026, b.ghi[m] / mx], fill: 'rgba(19,41,75,.3)' }, { rect: [x0 + 0.042, 0, 0.026, s.ghi[m] / mx], fill: '#f5b544' }); labels.push({ t: fmt(s.ghi[m]), x: x0 + 0.042, y: s.ghi[m] / mx + 0.07, cls: 'hi' }); }
    paths.push({ d: path(s.tamb.map((t, m) => [(m + 0.5) / 12, (t - tmin) / (tmax - tmin)])), stroke: '#0B6FC1', w: 1.6 });
    labels.push({ t: `${fmt(Math.max(...s.tamb))} °C`, x: (s.tamb.indexOf(Math.max(...s.tamb)) + 0.5) / 12 + 0.035, y: (Math.max(...s.tamb) - tmin) / (tmax - tmin) + 0.02, cls: 'l' }, { t: `${fmt(s.tamb[0])} °C`, x: 0.5 / 12 + 0.02, y: (s.tamb[0] - tmin) / (tmax - tmin) + 0.16, cls: 'l' });
    $('#plot').innerHTML = cap([['rgba(19,41,75,.4)', 'проектный ряд'], ['#f5b544', s.name], ['#0B6FC1', 'температура воздуха'], 'приход на горизонталь по месяцам, кВт·ч/м²']) + PL({ paths, labels }) + xax(MON);
  }

  /* ───── площадки ───── */
  let fitSite = {};
  const siteFit = s => fitSite[s.id] || (fitSite[s.id] = DEV.layout({ boundary: s.boundary, excl: s.excl }));
  function renderSites() {
    const rk = DEV.rank(S.dev.w), s = rk.find(x => x.id === S.dev.site) || rk[0], w = Object.assign({}, DEV.WEIGHTS, S.dev.w), wt = DEV.CRIT.reduce((a, c) => a + w[c[0]], 0) || 1;
    $('#clock').textContent = `${rk.length} площадки`; $('#s-pill').lastElementChild.textContent = 'оценка из 100';
    DEV.CRIT.forEach(c => { $('#o-w-' + c[0]).textContent = fmt(w[c[0]] / wt * 100) + ' %'; });
    $('#s-rows').innerHTML = rk.map((x, i) => `<button class="row w ${x.id === s.id ? 'sel' : ''}" data-site="${x.id}"><span class="n">${x.name}${i === 0 ? '<span class="tag">лучшая</span>' : ''}${x.real ? '' : ' ' + DEMO}</span><span class="p">${fmt(x.total)}</span><span class="bar"><i style="width:${x.total}%"></i></span></button>`).join('');
    const fit = siteFit(s), mw = fit.capMods * M.moduleW / 1e6;
    $('#s-card').querySelector('h2').textContent = s.name;
    $('#s-detail').innerHTML = `<dl class="kv">${kv([['Площадь участка', fmt(s.ha, 1) + ' га'], ['Пригодно под застройку', fmt(s.haOk, 1) + ' га', s.haOk / s.ha < 0.8 ? 'bad' : ''], ['Помещается при шаге проекта', fmt(mw, 1) + ' МВт', mw < M.dcKw / 1000 ? 'bad' : ''], ['Приход на горизонталь', fmt(s.ghi) + ' кВт·ч/м²'], ['Точка подключения', fmt(s.dist, 1) + ' км'], ['Свободная мощность сети', fmt(s.free) + ' МВт', s.free < 26 ? 'bad' : '']])}</dl>
      <p class="note-line">${s.line}. Земля: ${s.land}.</p>
      <div class="rows" style="margin-top:10px">${s.zones.map(z => `<div class="ev ${z.sev}"><i class="dot"></i><b>${z.name}</b><em>${z.setback ? 'отступ ' + z.setback + ' м' : ''}</em><span>зона исключена из застройки</span></div>`).concat(s.notes.map(n => `<div class="ev ${n[2]}"><i class="dot"></i><b>${n[0]}</b><em></em><span>${n[1]}</span></div>`)).join('') || '<p class="empty">Ограничений в границах участка нет.</p>'}</div>
      <div class="insp-actions"><button class="btn go" data-act="to-layout">Открыть компоновку на этой площадке</button></div>`;
    $('#side').innerHTML = `<div class="card-head"><h2>Итог площадки</h2></div><div class="tiles" style="grid-template-columns:1fr"><div class="tile">${gauge(s.total, fmt(s.total), 'из 100')}</div></div>`;
    const bar = v => `<span style="display:inline-block;width:34px;height:4px;border-radius:2px;background:rgba(19,41,75,.1);vertical-align:middle;margin-right:6px"><span style="display:block;height:100%;border-radius:2px;width:${v}%;background:${v >= 70 ? 'var(--ok)' : v >= 50 ? 'var(--amber)' : 'var(--bad)'}"></span></span>${fmt(v)}`;
    $('#plot').innerHTML = cap(['Сравнение площадок по критериям, баллы из 100. Вес критерия задаётся ползунками справа']) + `<div class="tw"><table class="cmp"><thead><tr><th>Площадка</th>${DEV.CRIT.map(c => `<th>${c[1].replace(' и ', '<br>и ').replace('Солнечный ', 'Солнечный<br>')}</th>`).join('')}<th>Пригодно,<br>га</th><th>Помещается,<br>МВт</th><th>Итог</th></tr></thead><tbody>${rk.map((x, i) => { const m = siteFit(x).capMods * M.moduleW / 1e6;
      return `<tr data-site="${x.id}" class="${x.id === s.id ? 'sel' : ''}"><td>${x.name}</td>${DEV.CRIT.map(c => `<td>${bar(x.score[c[0]])}</td>`).join('')}<td>${fmt(x.haOk, 1)}</td><td class="${m < M.dcKw / 1000 ? 'bad' : ''}">${fmt(m, 1)}</td><td class="${i === 0 ? 'best' : ''}">${fmt(x.total)}</td></tr>`; }).join('')}</tbody></table></div>`;
    drawMap();
  }

  /* ───── импорт чертежей ───── */
  const DRAW = DEV.drawing();
  function renderImp() {
    const p = S.imp.done ? 1 : S.imp.p, started = p > 0;
    $('#clock').textContent = 'Разбор чертежа'; $('#i-bar').style.width = (p * 100).toFixed(1) + '%';
    $('#i-msg').textContent = S.imp.msg || (S.imp.done ? `Готово: «${DRAW.file}» превращён в модель станции.` : started ? `Разбираю «${DRAW.file}», ${DRAW.size}` : 'Модель пуста. Загрузите чертёж или разберите пример генплана проекта.');
    $('#i-msg').className = 'note-line ' + (S.imp.done ? 'ok' : '');
    const done = DRAW.steps.filter(s => p >= s.at).length; $('#i-pill').lastElementChild.textContent = `${done} из ${DRAW.steps.length}`;
    let prev = 0;
    $('#i-steps').innerHTML = DRAW.steps.map(s => { const ok = p >= s.at, now = !ok && p > prev && started; prev = s.at; return `<div class="step ${ok ? 'done' : now ? 'now' : 'wait'}"><i></i><span>${s.name}</span><em>${ok ? (s.qty || 'готово') : now ? 'идёт' : ''}</em><small>${s.layer ? 'слои: ' + s.layer : s.text}</small></div>`; }).join('');
    $('#i-warn').innerHTML = S.imp.done ? DRAW.warn.map(w => `<div class="ev warn"><i class="dot"></i><b style="font-weight:500;grid-column:2/-1">${w}</b></div>`).join('') : `<p class="empty">Замечания появятся после разбора.</p>`;
    const rows = DRAW.steps.filter(s => s.layer);
    $('#plot').innerHTML = cap(['Сопоставление слоёв чертежа с объектами модели']) + `<div class="tw"><table class="cmp"><thead><tr><th>Слой чертежа</th><th>Распознано как</th><th>Объём</th><th>В модели</th></tr></thead><tbody>${rows.map(s => { const ok = p >= s.at; return `<tr><td>${s.layer}</td><td style="font-family:var(--body)">${ok ? s.as : '<small>ожидает</small>'}</td><td>${ok ? s.qty : '—'}</td><td class="${ok ? 'best' : ''}">${ok ? 'да' : '—'}</td></tr>`; }).join('')}</tbody></table></div>`;
    const share = S.imp.done ? (1 - 214 / DRAW.objects) * 100 : p * 99.6;
    $('#side').innerHTML = `<div class="card-head"><h2>Объекты чертежа</h2></div><div class="tiles" style="grid-template-columns:1fr"><div class="tile">${gauge(share, fmt(share, 1) + ' %', 'в модели')}</div></div>`;
  }
  function importKml(text, name) {
    const m = /<coordinates>([\s\S]*?)<\/coordinates>/g, polys = []; let x;
    while ((x = m.exec(text))) { const pts = x[1].trim().split(/\s+/).map(c => c.split(',').map(Number)).filter(c => c.length >= 2 && isFinite(c[0]) && isFinite(c[1])); if (pts.length >= 4) polys.push(pts); }
    if (!polys.length) { S.imp.msg = `В файле «${name}» не найден контур участка: нужен полигон из трёх и более точек.`; return A.refresh(); }
    const P = polys.sort((a, b) => b.length - a.length)[0].map(c => DEV.fromLL(c[1], c[0])); if (Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 1) P.pop();
    setCustom(P, `Граница из файла «${name}»`); S.imp.msg = `Из файла «${name}» взята граница участка: ${P.length} точек, ${fmt(S.dev.custom.ha, 1)} га. Она открыта в разделе «Компоновка».`; A.refresh();
  }
  function setCustom(P, name) { S.dev.custom = { id: 'custom', name: name || 'Своя граница', boundary: P, excl: [], zones: [], notes: [], ha: DEV.polyArea(P) / 1e4 }; fitMemo = {}; mapKey = ''; }

  /* ───── карта ───── */
  let map = null, group = null, mapKey = '';
  function ensureMap() {
    if (map || !window.L) return; const L = window.L;
    map = L.map('map', { zoomControl: false, attributionControl: false, preferCanvas: true, zoomSnap: 0.25, doubleClickZoom: false });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 17 }).addTo(map);
    group = L.layerGroup().addTo(map);
    map.on('click', e => { if (!S.dev.drawing) return; S.dev.drawing.push(DEV.fromLL(e.latlng.lat, e.latlng.lng)); renderLayout(); });
    map.on('dblclick', () => { if (S.dev.drawing) finishDraw(); });
  }
  function finishDraw() { const P = S.dev.drawing, zn = S.dev.drawMode === 'zone'; S.dev.drawing = null; $('#map').classList.remove('draw');
    if (zn && P && P.length >= 2) { const id = curSite().id, n = (S.dev.zones[id] || []).length + 1; (S.dev.zones[id] = S.dev.zones[id] || []).push(P.length === 2 ? { name: `Своя линия ${n}`, kind: 'line', poly: DEV.strip(P, 20), setback: 20, sev: 'bad' } : { name: `Своя зона ${n}`, kind: 'pipe', poly: P, setback: 0, sev: 'bad' }); fitMemo = {}; }
    else if (!zn && P && P.length >= 3) { setCustom(P); S.dev.sel = 'draft'; } A.refresh(); }
  const pads = () => innerWidth <= 760 ? { paddingTopLeft: [16, 96], paddingBottomRight: [16, 64] } : { paddingTopLeft: [200, $('#top').getBoundingClientRect().bottom + 16], paddingBottomRight: [innerWidth - $('#right').getBoundingClientRect().left + 16, innerHeight - $('#bot').getBoundingClientRect().top + 16] };
  const ZC = { line: '#ff6452', pipe: '#ff9f43', eco: '#62d6a0', water: '#0B6FC1', road: '#c9a26b' };
  function drawMap() {
    if (!mapOn()) return; ensureMap(); const L = window.L, ll = P => P.map(p => DEV.toLL(p[0], p[1])), view = S.view.dev; group.clearLayers();
    const zones = s => (s.zones || []).forEach(z => L.polygon(ll(z.poly), { color: ZC[z.kind] || '#ff6452', weight: 1.5, fillOpacity: 0.3, dashArray: '5 4' }).bindTooltip(`${z.name}${z.setback ? ', отступ ' + z.setback + ' м' : ''}`, { sticky: true }).addTo(group));
    const tables = (T, col) => { if (T.length) L.polygon(T.map(t => ll([[t[0] - t[2] / 2, t[1] - t[3] / 2], [t[0] + t[2] / 2, t[1] - t[3] / 2], [t[0] + t[2] / 2, t[1] + t[3] / 2], [t[0] - t[2] / 2, t[1] + t[3] / 2]])), { color: col, weight: 0.6, fillColor: '#14265c', fillOpacity: 0.86, interactive: false }).addTo(group); };
    let fit, key;
    if (view === 'layout') {
      const sc = scen(), s = sc.site; zones(s);
      L.polygon(ll(s.boundary), { color: '#f5b544', weight: 2.5, fill: false, interactive: false }).addTo(group);
      if (!sc.sel.empty) tables(sc.sel.lay.tables, '#9fc0ff');
      if (S.dev.drawing && S.dev.drawing.length) { L.polyline(ll(S.dev.drawing), { color: '#fff', weight: 2, dashArray: '6 5' }).addTo(group); S.dev.drawing.forEach(p => L.circleMarker(DEV.toLL(p[0], p[1]), { radius: 4, color: '#fff', fillColor: '#f5b544', fillOpacity: 1, weight: 1.5 }).addTo(group)); }
      fit = s.boundary; key = 'l|' + s.id + '|' + s.boundary.length + '|' + s.boundary[0][0];
    } else {
      DEV.SITES.forEach(s => { const on = s.id === S.dev.site; zones(s);
        L.polygon(ll(s.boundary), { color: on ? '#f5b544' : '#fff', weight: on ? 2.5 : 1.5, fillColor: '#fff', fillOpacity: on ? 0 : 0.08 }).bindTooltip(s.name, { permanent: true, direction: 'top', offset: [0, -4] }).on('click', () => { S.dev.site = s.id; S.dev.custom = null; A.refresh(); }).addTo(group);
        if (on) tables(s.real ? DEV.variant(DEV.PRESETS[0]).lay.tables : siteFit(s).tables, '#9fc0ff'); });
      const s = DEV.SITES.find(x => x.id === S.dev.site); fit = S.dev.showAll ? DEV.SITES.flatMap(x => x.boundary) : s.boundary; key = 's|' + (S.dev.showAll ? 'all' : s.id);
    }
    if (key !== mapKey) { const first = !mapKey; mapKey = key; map.invalidateSize(); const b = window.L.latLngBounds(ll(fit)); first ? map.fitBounds(b, pads()) : map.flyToBounds(b, Object.assign({ duration: 0.9 }, pads())); }
  }

  /* ═════════ ЭКСПЛУАТАЦИЯ ═════════ */
  const OPS_RIGHT = {
    pf: () => card('Расчёт и факт', pill('', 'off', 'pf-pill'), `<div class="seg" role="group" aria-label="Период">${[['day', 'Сутки'], ['m30', '30 дней']].map(x => `<button data-pfp="${x[0]}" aria-pressed="${S.pf.period === x[0]}">${x[1]}</button>`).join('')}</div><div class="tiles" id="r-tiles"></div><p class="note-line" id="pf-note"></p>`) +
      card('Отклонение от расчёта', `<div class="seg" style="margin:0" role="group" aria-label="Группировка">${[['inv', 'Инверторы'], ['ktp', 'КТП']].map(x => `<button data-pfg="${x[0]}" aria-pressed="${S.pf.group === x[0]}">${x[1]}</button>`).join('')}</div>`, `<div id="pf-bars"></div>`) +
      card('Отстающие', pill('', 'warn', 'pf-n'), `<div class="rows" id="pf-rows"></div>`),
    scada: () => card('Подключение SCADA', `<span class="pill off"><span><i class="live"></i>имитация потока</span></span>`, `<dl class="kv" id="sc-kv"></dl><div class="chips"><button class="mini" data-act="sc-toggle" id="sc-btn"></button></div>`) +
      card('Сейчас по телеметрии', pill('раз в секунду'), `<div class="tiles" id="r-tiles"></div><div id="sc-plot"></div>`) +
      card('Лента показаний', pill('', 'off', 'sc-n'), `<div class="feed" id="sc-feed"></div>`),
    sens: () => card('Метеостанции и датчики', pill('', 'warn', 'sn-pill'), `<div class="tiles" id="r-tiles"></div><dl class="kv sep" id="sn-kv"></dl>`) +
      card('Показания', DEMO, `<div class="rows" id="sn-rows"></div>`),
    pred: () => card('Предиктивная диагностика', pill('', 'warn', 'pr-pill'), `<div class="rows" id="pr-rows"></div>`) +
      card('', DEMO, `<div id="pr-detail"></div>`, 'pr-card'),
    ctl: () => card('Ограничение мощности', pill('', 'off', 'ct-pill'), `<div class="rows">${sl('cap', 'Уставка диспетчера', 0, 100, 5, S.ctl.cap)}</div><div class="chips">${[100, 75, 50, 25].map(v => `<button class="mini" data-cap="${v}">${v} %</button>`).join('')}</div><div class="tiles" id="r-tiles" style="margin-top:10px"></div>`) +
      card('Накопитель', pill(`${OMS.BESS.p} МВт · ${OMS.BESS.e} МВт·ч`), `<div class="seg" role="group" aria-label="Режим накопителя">${[['off', 'Выключен'], ['cut', 'Заряд от излишков'], ['shift', 'Сдвиг на вечер']].map(x => `<button data-bess="${x[0]}" aria-pressed="${S.ctl.bess === x[0]}">${x[1]}</button>`).join('')}</div><div class="tiles" id="ct-bess"></div><div id="ct-plot"></div><p class="note-line" id="ct-note"></p>`),
  };

  /* ───── расчёт и факт ───── */
  const hashN = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  function pfData() {
    const month = S.pf.period === 'm30', ev = A.events(), rows = [];
    for (let ii = 0; ii < NI; ii++) {
      const id = SITE.inverters[ii].id; let exp = A.invX[ii], fact = A.invE[ii], why = '';
      if (month) { const h = OMS.HISTORY[id]; exp = A.invX[ii] * 30 * 0.86; fact = exp * (A.invMS[ii] / A.invN[ii]) * (1 - (h ? h.days / 30 * h.depth : 0)) * (1 + (hashN(ii) - 0.5) * 0.008); why = h ? h.why : ''; }
      else { const e = ev.find(x => x.sel && ((x.sel.level === 'inv' && x.sel.ii === ii) || (x.sel.level === 'string' && A.strInv[x.sel.sid] === ii) || (x.sel.level === 'tracker' && [0, 1, 2].some(k => A.strInv[x.sel.t * 3 + k] === ii)))); why = e ? e.title : ''; }
      rows.push({ ii, k: SITE.inverters[ii].k, name: A.invName(ii), exp, fact, why });
    }
    let out = rows;
    if (S.pf.group === 'ktp') out = SITE.ktp.map(k => { const r = rows.filter(x => x.k === k.id), bad = r.filter(x => x.exp > 0 && x.fact / x.exp - 1 < -0.05); return { k: k.id, name: k.name, exp: r.reduce((s, x) => s + x.exp, 0), fact: r.reduce((s, x) => s + x.fact, 0), why: bad.length ? `отстают: ${bad.map(x => x.name).slice(0, 3).join(', ')}` : '' }; });
    out.forEach(r => { r.dev = r.exp > 0.5 ? (r.fact / r.exp - 1) * 100 : 0; r.lost = Math.max(0, r.exp - r.fact); });
    return { rows: out, exp: rows.reduce((s, x) => s + x.exp, 0), fact: rows.reduce((s, x) => s + x.fact, 0), month };
  }
  function renderPf() {
    const d = pfData(), thr = S.pf.group === 'ktp' ? -3 : -5, lag = d.rows.filter(r => r.dev < thr).sort((a, b) => a.dev - b.dev), dev = d.exp > 0 ? (d.fact / d.exp - 1) * 100 : 0, u = d.month ? ['МВт·ч', 1e3] : ['МВт·ч', 1e3];
    $('#pf-pill').lastElementChild.textContent = d.month ? 'последние 30 дней' : 'за сутки';
    if (d.exp < 1) { $('#r-tiles').innerHTML = `<p class="empty" style="grid-column:1/-1">За эти сутки выработки нет.</p>`; $('#pf-bars').innerHTML = ''; $('#pf-rows').innerHTML = ''; return; }
    $('#r-tiles').innerHTML = tile('Расчёт', fmt(d.exp / u[1], d.month ? 0 : 1), u[0], 'чистая исправная станция') + tile('Факт', fmt(d.fact / u[1], d.month ? 0 : 1), u[0], 'по счётчикам инверторов') +
      tile('Отклонение', sg(dev), '%', `недобор ${fmt((d.exp - d.fact) / 1e3, 1)} МВт·ч`) + tile('Отстающих', fmt(lag.length), S.pf.group === 'ktp' ? 'КТП' : 'инв.', `порог −${-thr} % от расчёта`);
    const nt = $('#pf-note'); nt.innerHTML = (d.month ? `${DEMO} Простои за 30 дней заданы сценарием. ` : '') + (S.ctl.cap < 100 ? `Действует ограничение диспетчера ${S.ctl.cap} %: расчёт взят с тем же ограничением.` : ''); nt.hidden = !nt.textContent.trim();
    const sorted = d.rows.slice().sort((a, b) => a.dev - b.dev), n = sorted.length, lo = -15, w = 1 / n;
    $('#pf-bars').innerHTML = PL({ cls: 'sm', paths: sorted.map((r, i) => ({ rect: [i * w + w * 0.12, 1 - Math.min(1, -Math.min(0, r.dev) / -lo) , w * 0.76, Math.max(0.012, Math.min(1, -Math.min(0, r.dev) / -lo))], fill: r.dev < thr ? '#ff6452' : 'rgba(19,41,75,.34)' })).concat([{ d: path([[0, 1 - thr / lo], [1, 1 - thr / lo]]), stroke: '#f5b544', dash: '4 4', w: 1.2 }]),
      labels: [{ t: `порог −${-thr} %`, x: 0.99, y: 1 - thr / lo - 0.1, cls: 'r' }, { t: `${sg(sorted[0].dev, 0)} %`, x: 0.02 + w, y: 0.08, cls: 'l hi' }, { t: '0', x: 0.995, y: 0.93, cls: 'r' }] }) + xax([sorted[0].name, 'от худшего к лучшему', sorted[n - 1].name], 'auto 1fr auto');
    $('#pf-n').lastElementChild.textContent = lag.length;
    $('#pf-rows').innerHTML = lag.length ? lag.slice(0, 8).map(r => `<button class="row" ${r.ii != null ? `data-inv="${r.ii}"` : `data-ktp="${r.k}"`}><span class="n">${r.name}</span><span class="t">−${fmt(r.lost / (r.lost > 2000 ? 1000 : 1), r.lost > 2000 ? 1 : 0)} ${r.lost > 2000 ? 'МВт·ч' : 'кВт·ч'}</span><span class="p" style="color:var(--bad)">${sg(r.dev)} %</span><span class="note">${r.why || 'причина не определена: проверить стринги и загрязнение'}</span></button>`).join('') : `<p class="empty">Все ${S.pf.group === 'ktp' ? 'подстанции' : 'инверторы'} в пределах ${-thr} % от расчёта.</p>`;
  }

  /* ───── SCADA: имитация потока ───── */
  let timer = null;
  const hms = () => new Date().toLocaleTimeString('ru-RU');
  function scadaTick() {
    const L = A.live(), sc = S.scada, rnd = Math.random; if (!sc.on) return;
    if (!sc.buf.length) { let c = 0.97; for (let i = 0; i < 70; i++) { c = Math.max(0.9, Math.min(1, c + (rnd() - 0.48) * 0.015)); sc.buf.push(L.pac / 1000 * (L.day ? c : 1)); } sc.c = c; }   // хвост графика до подключения
    sc.c = Math.max(0.9, Math.min(1, sc.c + (rnd() - 0.48) * 0.015)); sc.n++;
    const p = L.pac / 1000 * (L.day ? sc.c : 1) * (1 + (rnd() - 0.5) * 0.004), g = L.ghi * (L.day ? sc.c : 1) * (1 + (rnd() - 0.5) * 0.006);
    sc.cur = { p, g, f: 50 + (rnd() - 0.5) * 0.04, u: 35.2 + (rnd() - 0.5) * 0.3, lag: 180 + Math.round(rnd() * 240) }; sc.buf.push(p); if (sc.buf.length > 120) sc.buf.shift();
    const t = hms(), ii = Math.floor(rnd() * NI), jj = Math.floor(rnd() * NI), k = 1 + Math.floor(rnd() * 4), tr = Math.floor(rnd() * NT);
    sc.feed.unshift([t, `КТП-${k}.P`, fmt(A.ktpAC[k] / 1000 * sc.c, 3) + ' МВт'], [t, `${A.invName(ii)}.P_AC`, fmt(A.invAC[ii] * sc.c, 1) + ' кВт'], [t, `${A.invName(jj)}.U_DC`, fmt(L.day ? 1080 + rnd() * 60 : 0) + ' В'], [t, `${A.tName(tr)}.УГОЛ`, fmt(A.live().aT * 57.3 + (rnd() - 0.5) * 0.4, 1) + '°'], [t, 'МС-1.GHI', fmt(g) + ' Вт/м²']);
    sc.feed.length = Math.min(sc.feed.length, 40);
    if (S.stage === 'ops' && S.view.ops === 'scada') renderScada();
  }
  function renderScada() {
    const sc = S.scada, L = A.live(), c = sc.cur || { p: L.pac / 1000, g: L.ghi, f: 50, u: 35.2, lag: 0 }, tags = NI * 14 + 4 * 22 + NT * 3 + OMS.SENSORS.length * 4;
    $('#sc-kv').innerHTML = kv([['Источник', 'имитатор потока, демо'], ['Протокол на станции', 'МЭК 60870-5-104'], ['Сигналов в потоке', fmt(tags)], ['Период опроса', '1 с'], ['Принято посылок', fmt(sc.n)], ['Задержка', sc.on ? fmt(c.lag) + ' мс' : 'поток остановлен', sc.on ? '' : 'bad']]);
    $('#sc-btn').textContent = sc.on ? 'Остановить поток' : 'Возобновить поток';
    $('#r-tiles').innerHTML = tile('В сеть', fmt(c.p, 2), 'МВт', 'узел учёта 35 кВ') + tile('Облучённость', fmt(c.g), 'Вт/м²', 'метеостанция МС-1') + tile('Частота', fmt(c.f, 2), 'Гц', 'шины 35 кВ') + tile('Напряжение', fmt(c.u, 1), 'кВ', 'шины 35 кВ');
    const b = sc.buf, mx = Math.max(...b, 0.1) * 1.05, mn = Math.min(...b, mx) * 0.98, rg = Math.max(mx - mn, 0.05);
    $('#sc-plot').innerHTML = b.length > 2 ? PL({ cls: 'sm', paths: [{ d: path(b.map((v, i) => [i / 119, (v - mn) / rg * 0.9 + 0.05])), stroke: '#f5b544', w: 1.8 }], labels: [{ t: `${fmt(b[b.length - 1], 2)} МВт`, x: Math.min(0.99, (b.length - 1) / 119), y: (b[b.length - 1] - mn) / rg * 0.9 + 0.2, cls: 'r hi' }] }) + xax(['2 минуты назад', '', 'сейчас'], 'auto 1fr auto') : `<p class="empty" style="margin-top:10px">Поток запускается…</p>`;
    $('#sc-n').lastElementChild.textContent = `${fmt(sc.n * 5)} значений`;
    $('#sc-feed').innerHTML = sc.feed.slice(0, 10).map(f => `<div><span>${f[0]}</span><b>${f[1]}</b><span>${f[2]}</span></div>`).join('');
  }

  /* ───── метеостанции и датчики ───── */
  const nearest = OMS.SENSORS.map(s => { let bt = 0, bd = 1e9; for (let t = 0; t < NT; t++) { const d = Math.abs(A.tX[t] - s.x) + Math.abs(A.tZ[t] - s.z) / 6; if (d < bd) { bd = d; bt = t; } } return bt; });
  function reading(s, i) {
    const L = A.live(), t = nearest[i], doy = A.doy(), bias = 1 + (hashN(i + 3) - 0.5) * 0.02;
    if (s.lost) return { text: 'нет данных', lost: true, sub: 'молчит 2 ч 10 мин, последнее значение устарело' };
    if (s.type === 'meteo') return { text: fmt(L.ghi * bias) + ' Вт/м²', sub: `воздух ${fmt(L.tamb + (i ? 0.4 : 0), 1)} °C, ветер ${fmt(OMS.wind(S.min, doy) * (i ? 1.08 : 1), 1)} м/с` };
    if (s.type === 'poa') return { text: fmt(A.tPoa[t] * bias) + ' Вт/м²', sub: `в плоскости стола ${A.tName(t)}`, v: A.tPoa[t] * bias };
    if (s.type === 'tmod') return { text: fmt(A.tTc[t] + (bias - 1) * 60, 1) + ' °C', sub: `тыльная сторона модуля, ${A.tName(t)}` };
    if (s.type === 'soil') { let a = 0; for (let k = 0; k < NP; k++) a += A.soil[t * NP + k]; return { text: fmt(a / NP * 100, 1) + ' %', sub: 'потери от пыли рядом с датчиком' }; }
    return { text: fmt(OMS.wind(S.min, doy) * bias * 1.05, 1) + ' м/с', sub: 'порог штормового положения 15 м/с' };
  }
  const sensorLabels = () => OMS.SENSORS.map((s, i) => { const r = reading(s, i); return { id: s.id, x: s.x, z: s.z, h: s.h, text: r.text, lost: r.lost }; });
  function pickSensor(id) { S.sens.sel = id; const s = OMS.SENSORS.find(x => x.id === id); A.fly([s.x - 60, 55, s.z + 90], [s.x, 2, s.z], 1000); if (S.view.ops === 'sens') renderSens(); }
  function renderSens() {
    const L = A.live(), doy = A.doy(), R = OMS.SENSORS.map((s, i) => Object.assign({ s }, reading(s, i))), lost = R.filter(r => r.lost).length, poa = R.filter(r => r.s.type === 'poa'), avg = poa.reduce((a, r) => a + r.v, 0) / poa.length, w = OMS.wind(S.min, doy);
    $('#sn-pill').className = 'pill ' + (lost ? 'warn' : ''); $('#sn-pill').lastElementChild.textContent = `${R.length - lost} на связи, ${lost} молчит`;
    $('#r-tiles').innerHTML = tile('Приход на горизонталь', fmt(L.ghi), 'Вт/м²', 'МС-1, у ОПУ') + tile('Воздух', fmt(L.tamb, 1), '°C', `влажность ${fmt(OMS.humidity(S.min, doy))} %`) + tile('Ветер', fmt(w, 1), 'м/с', w > 15 ? 'столы в штормовом положении' : 'до порога ' + fmt(15 - w, 1) + ' м/с') + tile('В плоскости столов', fmt(avg), 'Вт/м²', 'среднее по 4 пиранометрам');
    $('#sn-kv').innerHTML = kv([['Расчёт по модели', fmt(L.poa) + ' Вт/м²'], ['Датчики к расчёту', L.poa > 20 ? sg((avg / L.poa - 1) * 100) + ' %' : '—'], ['Опрос', 'раз в минуту']]);
    $('#sn-rows').innerHTML = R.map(r => `<button class="row ${r.s.id === S.sens.sel ? 'sel' : ''}" data-sens="${r.s.id}"><span class="n">${r.s.id}</span><span class="t">${r.s.name}</span><span class="p" ${r.lost ? 'style="color:var(--bad)"' : ''}>${r.text}</span><span class="note ${r.lost ? 'bad' : ''}">${r.sub.charAt(0).toUpperCase() + r.sub.slice(1)}</span></button>`).join('');
  }

  /* ───── предиктивная диагностика ───── */
  const PRED = OMS.predict();
  const predName = p => p.kind === 'inv' ? 'Inv-' + p.ref : p.kind === 'tracker' ? A.tName(p.ref) : 'КТП-' + p.ref;
  const predSel = p => p.kind === 'inv' ? { level: 'inv', ii: A.invIdx[p.ref] } : p.kind === 'tracker' ? { level: 'tracker', t: p.ref } : { level: 'ktp', k: p.ref };
  function renderPred() {
    const p = PRED.find(x => x.id === S.pred.sel) || PRED[0], H = OMS.HIST;
    $('#pr-pill').lastElementChild.textContent = `${PRED.filter(x => x.sev).length} требуют внимания`;
    $('#pr-rows').innerHTML = PRED.map(x => `<div class="ev ${x.sev || 'ok'} ${x.id === p.id ? 'sel' : ''}" data-pred="${x.id}"><i class="dot"></i><b>${x.title}</b><em>через ${fmt(x.left)} дн.</em><span>${predName(x)}. Порог будет достигнут ${dateIn(x.left)}${S.pred.orders[x.id] ? '. Наряд ' + S.pred.orders[x.id] + ' запланирован' : ''}</span></div>`).join('');
    $('#pr-card').querySelector('h2').textContent = predName(p);
    const horizon = Math.min(60, Math.max(14, p.left + 8)), n = H + horizon, vals = p.hist.concat([p.thr, p.a + p.b * n]), lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.12, ny = v => (v - lo + pad) / (hi - lo + 2 * pad), nx = d => d / n;
    const order = S.pred.orders[p.id];
    $('#pr-detail').innerHTML = `<div class="insp-sub" style="margin-bottom:2px">${p.title}. ${p.param}, ${p.unit}</div>` +
      PL({ cls: 'sm', paths: [{ d: path([[0, ny(p.thr)], [1, ny(p.thr)]]), stroke: '#ff6452', dash: '5 4', w: 1.3 }, { d: path([[nx(H), 0], [nx(H), 1]]), stroke: 'rgba(19,41,75,.25)', w: 1 }, { d: path(p.hist.map((v, d) => [nx(d), ny(v)])), stroke: '#f5b544', w: 1.6 }, { d: path([[nx(H), ny(p.now)], [nx(H + p.left), ny(p.thr)]]), stroke: '#16233B', dash: '3 4', w: 1.4 }],
        labels: [{ t: `порог ${fmt(p.thr, p.dec)}`, x: 0.01, y: ny(p.thr) + (p.b > 0 ? -0.1 : 0.1), cls: 'l' }, { dot: '#ff6452', x: nx(H + p.left), y: ny(p.thr) }, { dot: '#16233B', x: nx(H), y: ny(p.now) }, { t: dateIn(p.left), x: nx(H + p.left), y: ny(p.thr) + (p.b > 0 ? 0.12 : -0.12), cls: 'hi r' }] }) + xax(['60 дней назад', 'сегодня', `+${horizon} дн.`], `${H - 8}fr ${horizon + 8}fr auto`) +
      `<dl class="kv sep">${kv([['Сейчас', `${fmt(p.now, p.dec)} ${p.unit}`], ['Порог', `${fmt(p.thr, p.dec)} ${p.unit}`], ['Тренд', `${sg(p.b * 7, p.dec + 1)} ${p.unit} в неделю`], ['Порог будет достигнут', dateIn(p.left), p.sev === 'bad' ? 'bad' : ''], ['Уверенность прогноза', p.conf + ' %']])}</dl>
      <p class="note-line">Если не вмешаться: ${p.then}. Что сделать: ${p.action.charAt(0).toLowerCase() + p.action.slice(1)}, около ${p.hours} ч работы.</p>
      <div class="insp-actions">${order ? `<button class="btn" disabled style="flex:1 1 100%;text-align:center;color:var(--ok)">Наряд ${order} запланирован на ${dateIn(Math.max(1, p.left - 4))}</button>` : `<button class="btn go" data-act="pred-order">Запланировать наряд до отказа</button>`}<button class="btn" data-act="pred-fly">Показать в сцене</button></div>`;
  }

  /* ───── управление и накопитель ───── */
  function renderCtl() {
    const L = A.live(), c = A.curve(), c0 = A.curve0(), cap = S.ctl.cap, set = AC * cap / 100, k = Math.min(c.length - 1, Math.floor(S.min / 10));
    const E = a => a.reduce((s, v, i) => i ? s + (v + a[i - 1]) / 2 / 6 : 0, 0), lostDay = E(c0) - E(c);
    $('#o-cap').textContent = cap >= 100 ? '100 % · без ограничения' : `${cap} % · ${fmt(set, 1)} МВт`;
    $('#ct-pill').className = 'pill ' + (cap < 100 ? 'warn' : ''); $('#ct-pill').lastElementChild.textContent = cap < 100 ? 'команда диспетчера' : 'ограничений нет';
    $$('[data-cap]').forEach(b => b.classList.toggle('go', +b.dataset.cap === cap));
    $('#r-tiles').innerHTML = tile('В сеть сейчас', fmt(L.pac / 1000, 2), 'МВт', cap < 100 ? `уставка на инверторах ${fmt(set, 1)} МВт` : 'по погоде и состоянию') + tile('Не выдано сейчас', fmt(L.curt / 1000, 2), 'МВт', L.curt > 1 ? 'срезано уставкой' : 'уставка не мешает') +
      tile('Не выдано за сутки', fmt(lostDay, 1), 'МВт·ч', cap < 100 ? `${fmt(E(c0) > 0 ? lostDay / E(c0) * 100 : 0)} % возможной выработки` : 'ограничения не было') + tile('Отклик на команду', '2', 'с', 'инверторы снижают мощность');
    const B = OMS.bess(S.ctl.bess, c, c0), on = S.ctl.bess !== 'off', pb = B.pb[k];
    $('#ct-bess').innerHTML = on ? tile('Заряд', fmt(B.soc[k] * 100), '%', `${fmt(B.soc[k] * OMS.BESS.e, 1)} из ${OMS.BESS.e} МВт·ч`) + tile(pb < -0.01 ? 'Заряжается' : pb > 0.01 ? 'Отдаёт в сеть' : 'Ждёт', fmt(Math.abs(pb), 1), 'МВт', pb < -0.01 ? 'от солнечной станции' : pb > 0.01 ? 'вечерний разряд' : 'нет заряда и разряда') +
      tile('Отдано вечером', fmt(B.given, 1), 'МВт·ч', 'с 18:30 до 23:00') + tile(S.ctl.bess === 'cut' ? 'Спасено от ограничения' : 'Перенесено с дня', fmt(B.charged, 1), 'МВт·ч', S.ctl.bess === 'cut' ? (lostDay > 0.1 ? `${fmt(Math.min(100, B.charged / lostDay * 100))} % срезанной энергии` : 'ограничения нет, заряжать нечем') : 'заряд с 10:00 до 15:00') : '';
    const mx = 27, n = c.length - 1, P = a => path(a.map((v, i) => [i / n, Math.min(v, mx) / mx * 0.94]));
    $('#ct-plot').innerHTML = PL({ cls: 'sm', paths: [{ d: P(c0), stroke: 'rgba(19,41,75,.45)', dash: '3 4', w: 1.2 }].concat(on ? [{ d: path(B.soc.map((v, i) => [i / n, v * 0.94])), stroke: '#0B6FC1', w: 1.2 }] : [], [{ d: P(on ? B.out : c), stroke: '#f5b544', w: 1.8 }, { d: path([[S.min / 1440, 0], [S.min / 1440, 1]]), stroke: '#16233B', w: 1 }]),
      labels: cap < 100 ? [{ t: `уставка ${fmt(set, 1)} МВт`, x: 0.01, y: Math.min(0.92, set / mx * 0.94 + 0.1), cls: 'l' }] : [] }) + xax(['00:00', '12:00', '24:00'], 'auto 1fr auto') +
      `<div class="keys" style="flex-direction:row;flex-wrap:wrap;gap:4px 14px"><span><i style="background:rgba(19,41,75,.45)"></i>возможная выдача</span><span><i style="background:#f5b544"></i>${on ? 'в сеть с накопителем' : 'в сеть'}</span>${on ? '<span><i style="background:#0B6FC1"></i>заряд накопителя</span>' : ''}</div>`;
    $('#ct-note').innerHTML = `${DEMO} В проекте первой очереди накопителя нет: показан сценарий работы станции с накопителем ${OMS.BESS.p} МВт на ${OMS.BESS.e} МВт·ч.`;
  }

  /* ═════════ общий вход ═════════ */
  const R = { layout: renderLayout, fin: renderFin, res: renderRes, sites: renderSites, imp: renderImp, pf: renderPf, scada: renderScada, sens: renderSens, pred: renderPred, ctl: renderCtl };
  const SRC = {
    layout: 'Граница участка взята из файла локации проекта. Столы расставляются автоматически по границе, выработка считается той же цепочкой потерь, что и проектный вариант. Стоимость вариантов — пересчёт смет проекта по укрупнённым долям, это оценка. Снимки: Esri, Maxar.',
    fin: 'Стоимость взята из сметы проекта, выработка — из расчёта выбранного варианта компоновки. Тариф, ставка, OPEX и срок — допущения; они общие с вкладкой «Смета».',
    res: 'Проектный ряд — Meteonorm 8.1 из отчёта о выработке. Остальные три источника — демо-данные для показа сравнения; выработка по каждому пересчитана моделью станции.',
    sites: 'Участок проекта показан по настоящим координатам. Три другие площадки, их зоны ограничений и баллы — демо-данные. Пригодная площадь и вместимость считаются расстановкой столов по границе. Снимки: Esri, Maxar.',
    imp: 'Разбор показан на заложенном примере: количества объектов совпадают с рабочим проектом, имена слоёв и замечания — демо-данные. Файл KML разбирается по-настоящему: его контур становится границей участка в «Компоновке».',
    pf: 'Расчёт — мощность чистой исправной станции при той же погоде. Факт за сутки считается моделью с отказами и загрязнением; ряд за 30 дней — демо-сценарий простоев, не данные счётчиков.',
    scada: 'Это имитация потока: значения берутся из расчётной модели и получают шум и облачность раз в секунду. Действующая станция к сайту не подключена.',
    sens: 'Состав и расположение датчиков — демо-данные. Показания рассчитаны моделью для выбранного времени, ветер и влажность заданы сценарием.',
    pred: 'Ряды за 60 дней и пороги — демо-данные: телеметрии с действующей станции в проекте нет. Прогноз даты — линейный тренд по последним 30 дням до порога.',
    ctl: 'Ограничение применяется к расчётной модели: уставка делится между инверторами поровну, потери в кабелях и трансформаторах считаются после неё. Накопитель — сценарий, в проекте его нет.',
  };
  const right = (st, v) => (st === 'dev' ? DEV_RIGHT : OPS_RIGHT)[v]() + '<p class="foot" id="src"></p>';
  function setup(st, v) {
    document.body.classList.toggle('map', mapOn()); if (mapOn()) { ensureMap(); mapKey = ''; }
    if (st !== 'dev' || v !== 'layout') { S.dev.drawing = null; $('#map').classList.remove('draw'); }
    const wantTimer = st === 'ops' && v === 'scada'; if (wantTimer && !timer) timer = setInterval(scadaTick, 1000); if (!wantTimer && timer) { clearInterval(timer); timer = null; }
    if (st === 'dev' && v === 'imp') { const f = $('#i-file'); if (f) f.onchange = () => { const file = f.files[0]; if (!file) return; const kb = file.size / 1024, size = kb > 1024 ? fmt(kb / 1024, 1) + ' МБ' : fmt(kb) + ' КБ';
      if (/\.kml$/i.test(file.name)) { const rd = new FileReader(); rd.onload = () => importKml(String(rd.result), file.name); rd.readAsText(file); }
      else { S.imp = { p: 0.001, run: true, done: false, msg: `Файл «${file.name}», ${size}, принят. В демонстрации разбирается заложенный пример генплана проекта.` }; A.refresh(); } }; }
  }
  const render = (st, v) => R[v] && R[v]();
  function click(e) {
    const q = s => e.target.closest(s); let b;
    if ((b = q('[data-rm]'))) { S.dev.user = S.dev.user.filter(v => v.id !== b.dataset.rm); if (S.dev.sel === b.dataset.rm) S.dev.sel = 'A'; return A.refresh(), true; }
    if ((b = q('[data-plot]'))) { S.dev.plot = b.dataset.plot; return renderLayout(), true; }
    if ((b = q('[data-var]'))) { S.dev.sel = b.dataset.var; const v = defs().find(x => x.id === S.dev.sel); if (v) { S.dev.draft = { type: v.type, pitch: v.pitch, ratio: +v.ratio.toFixed(3), road: v.road ?? 7.2, inset: v.inset ?? 12, ns: v.ns ?? 2 }; A.setView('layout'); } else A.refresh(); return true; }
    if ((b = q('[data-type]'))) { S.dev.draft.type = b.dataset.type; S.dev.draft.pitch = PITCH0[b.dataset.type]; S.dev.sel = 'draft'; return A.setView('layout'), true; }
    if ((b = q('[data-src]'))) { S.dev.src = b.dataset.src; return A.refresh(), true; }
    if ((b = q('[data-site]'))) { S.dev.site = b.dataset.site; S.dev.custom = null; S.dev.showAll = false; return A.refresh(), true; }
    if ((b = q('[data-pfp]'))) { S.pf.period = b.dataset.pfp; return A.setView('pf'), true; }
    if ((b = q('[data-pfg]'))) { S.pf.group = b.dataset.pfg; return A.setView('pf'), true; }
    if ((b = q('[data-inv]'))) return A.select({ level: 'inv', ii: +b.dataset.inv }, true), true;
    if ((b = q('[data-sens]'))) return pickSensor(b.dataset.sens), true;
    if ((b = q('[data-pred]'))) { S.pred.sel = b.dataset.pred; renderPred(); return true; }
    if ((b = q('[data-cap]'))) { S.ctl.cap = +b.dataset.cap; const i = $('[data-sl="cap"]'); if (i) i.value = S.ctl.cap; return A.rebuild(), true; }
    if ((b = q('[data-bess]'))) { S.ctl.bess = b.dataset.bess; $$('[data-bess]').forEach(x => x.setAttribute('aria-pressed', x === b)); return renderCtl(), true; }
    if (!(b = q('[data-act]')) || ['clear', 'fly'].includes(b.dataset.act)) return false;
    const act = b.dataset.act, sc = S.stage === 'dev' ? scen() : null;
    if (act === 'add-var') { const d = S.dev.draft, id = 'U' + (++S.dev.n); S.dev.user.push(Object.assign({ id, name: `Свой ${S.dev.n}`, user: true }, d)); S.dev.sel = id; A.refresh(); }
    else if (act === 'draw' || act === 'zone') { const mode = act === 'zone' ? 'zone' : 'bound'; if (S.dev.drawing && S.dev.drawMode === mode) finishDraw(); else { if (!mapOn()) { S.dmode = 'map'; A.setView('layout'); } S.dev.drawMode = mode; S.dev.drawing = []; $('#map').classList.add('draw'); A.refresh(); } }
    else if (act === 'unzone') { S.dev.zones[curSite().id] = []; siteMemo = {}; fitMemo = {}; A.refresh(); }
    else if (act === 'undraw') { S.dev.custom = null; S.dev.site = 's1'; S.dev.drawing = null; fitMemo = {}; A.refresh(); }
    else if (act === 'kml' && !sc.sel.empty) save(`aral-${sc.sel.id}.kml`, DEV.toKml(`Арал 30, вариант «${sc.sel.name}»`, sc.site.boundary, sc.sel.lay.tables), 'application/vnd.google-earth.kml+xml');
    else if (act === 'dxf' && !sc.sel.empty) save(`aral-${sc.sel.id}.dxf`, DEV.toDxf(sc.site.boundary, sc.sel.lay.tables), 'application/dxf');
    else if (act === 'fin-zero') { delete S.fin.tariff; delete S.fin.rate; delete S.cost.kSmr; delete S.cost.kEquip; A.setView('fin'); }
    else if (act === 'w-zero') { S.dev.w = {}; A.setView('sites'); }
    else if (act === 'to-layout') { S.dev.sel = S.dev.site === 's1' ? 'A' : 'draft'; A.setView('layout'); }
    else if (act === 'imp-run') { S.imp = { p: 0.001, run: true, done: false, msg: '' }; A.refresh(); }
    else if (act === 'imp-clear') { S.imp = { p: 0, run: false, done: false, msg: '' }; A.refresh(); }
    else if (act === 'sc-toggle') { S.scada.on = !S.scada.on; renderScada(); }
    else if (act === 'pred-order') { const p = PRED.find(x => x.id === S.pred.sel) || PRED[0]; S.pred.orders[p.id] = 2300 + Object.keys(S.pred.orders).length + 1; renderPred(); }
    else if (act === 'pred-fly') { const p = PRED.find(x => x.id === S.pred.sel) || PRED[0]; A.select(predSel(p), true); }
    else return false;
    return true;
  }
  function input(e) {
    const i = e.target.closest('input[data-sl]'); if (!i) return false; const id = i.dataset.sl, v = parseFloat(i.value);
    if (['pitch', 'ratio', 'road', 'inset', 'ns'].includes(id)) { S.dev.draft[id] = v; S.dev.sel = 'draft'; renderLayout(); }
    else if (id === 'tariff' || id === 'rate') { S.fin[id] = v; renderFin(); }
    else if (id === 'capex') { S.cost.kSmr = v; S.cost.kEquip = v; renderFin(); }
    else if (id.startsWith('w-')) { S.dev.w[id.slice(2)] = v; renderSites(); }
    else if (id === 'cap') { S.ctl.cap = v; A.refresh(); }
    return true;
  }
  function change(e) { const i = e.target.closest('input[data-sl="cap"]'); if (i) A.rebuild(); }
  function tick(dt) {
    if (!S.imp.run || S.stage !== 'dev' || S.view.dev !== 'imp') return;
    S.imp.p = Math.min(1, S.imp.p + dt / 9); A.reveal(S.imp.p);
    if (S.imp.p >= 1) { S.imp.run = false; S.imp.done = true; }
    renderImp();
  }
  const legend = v => usesMap(v) && mapOn() ? `<h2>${v === 'layout' ? 'Участок и расстановка' : 'Площадки на карте'}</h2><div class="keys"><span><i style="background:#f5b544"></i>граница участка</span><span><i style="background:#14265c;outline:1px solid #9fc0ff"></i>столы с модулями</span><span><i style="background:#ff6452"></i>зоны ограничений с отступом</span></div>${v === 'sites' ? '<div class="chips"><button class="mini" id="s-all">Показать все площадки</button></div>' : ''}` : '';
  document.addEventListener('click', e => { if (e.target.id === 's-all') { S.dev.showAll = true; mapKey = ''; drawMap(); } });
  addEventListener('resize', () => { if (map) map.invalidateSize(); });

  return { views, usesMap, right, src: (st, v) => SRC[v], setup, render, click, input, change, tick, legend, sensorLabels, pickSensor, importProgress: () => S.imp.done ? 1 : S.imp.p, scen };
};
