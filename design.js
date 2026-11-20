/* Проектирование СЭС: проекты → расчёты → конструктор станции на карте → почасовой расчёт → результаты → сценарии.
   Расчёты выполняет engine.js. Данные проектов хранятся в браузере (localStorage). */
(function () {
  const E = window.ENG, EPC = window.EPC, SITE = window.SITE, M0 = SITE.meta, RAD = Math.PI / 180;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const fmt = (v, d = 0) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
  const sg = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), d);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 8);
  const now = () => new Date().toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const toast = t => { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 2600); };
  const save = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); };

  /* ───────── данные ───────── */
  const KEY = 'vie-design-v3', FENX = (SITE.field.x0 - 102 + SITE.field.x1 + 48) / 2, FENZ = (SITE.field.z0 - 72 + SITE.field.z1 + 56) / 2;
  const geo = p => { const mLon = 111320 * Math.cos(p.lat * RAD); return { toLL: (x, z) => [p.lat - z / 111200, p.lon + x / mLon], fromLL: (la, lo) => [(lo - p.lon) * mLon, (p.lat - la) * 111200] }; };
  const rect = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  const PLANT0 = { module: 'tr710', inverter: 'sg320', mount: 'track', high: 1, wide: 81, pitch: 7.22, limit: 60, tilt: 30, bt: true, ratio: +(M0.dcKw / (M0.inverters * M0.inverterKw)).toFixed(3), inv: 82, road: 7.2, ns: 2, inset: 12 };
  function seed() {
    const aral = { id: 'aral', name: 'СЭС Арал 30 МВт', place: 'г. Аральск, Кызылординская область', lat: 46.7881403, lon: 61.726166, tz: 5, status: 'Рабочий проект', real: true, grid: 'ЗРУ 35 кВ, кабель 3,1 км', gridMw: 30, land: 'земли запаса, уклон до 1°', zones: [], preds: [] };
    const g = geo(aral); aral.boundary = [[46.7917889, 61.7207917], [46.7916722, 61.7315417], [46.7845056, 61.7315111], [46.7845944, 61.7208028]].map(p => g.fromLL(p[0], p[1]).map(v => +v.toFixed(1)));
    aral.preds.push({ id: 'base', name: 'Рабочий проект ALH01-ST1', status: 'done', weather: 'mn', plant: Object.assign({}, PLANT0, { real: true }), sys: { kva: 27000 }, sim: {}, storage: null, ran: 'из проекта' });
    const mk = (id, name, dx, dz, w, h, extra, zones) => { const c = g.toLL(dx, dz); return Object.assign({ id, name, place: 'Аральский район, площадка-кандидат', lat: +c[0].toFixed(6), lon: +c[1].toFixed(6), tz: 5, status: 'Кандидат', demo: true, boundary: rect(w, h), zones, preds: [] }, extra); };
    const z = (name, line, pts, setback) => ({ id: uid(), name, line, pts, setback, on: true });
    return { v: 3, projects: [aral,
      mk('north', 'Участок севернее города', -3400, -7200, 1000, 900, { grid: 'ВЛ 110 кВ, нужна своя подстанция, 11,4 км', gridMw: 40, land: 'пастбища, нужен перевод категории' }, [z('Скотопрогон', true, [[-550, -220], [0, -130], [550, -180]], 15)]),
      mk('road', 'Участок у автотрассы', 5600, 2100, 780, 745, { grid: 'ПС 35 кВ, 6,2 км', gridMw: 12, land: 'земли запаса, уклон до 2°' }, [z('Охранная зона ВЛ 110 кВ', true, [[-450, -300], [0, -90], [450, 0]], 20), z('Газопровод', true, [[270, -450], [290, 450]], 100)]),
      mk('bay', 'Участок на бывшем дне залива', -9800, 3300, 1200, 1000, { grid: 'ВЛ 110 кВ, нужна линия 22 км', gridMw: 60, land: 'солончак, риск подтопления' }, [z('Природоохранная зона', false, [[-700, -600], [-100, -600], [-250, -150], [-700, 0]], 0), z('Подтопление весной', false, [[-650, 260], [100, 340], [500, 200], [650, 550], [-650, 550]], 0)]),
    ], cost: {}, fin: {}, log: [{ t: 'из проекта', p: 'СЭС Арал 30 МВт', n: 'Рабочий проект ALH01-ST1', s: 'готов', ms: 0 }], scen: {} };
  }
  let DB; try { DB = JSON.parse(localStorage.getItem(KEY)); } catch (e) { DB = null; } if (!DB || DB.v !== 3) DB = seed();
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { /* хранилище недоступно: работаем в памяти */ } };
  const proj = id => DB.projects.find(p => p.id === id), pred = (p, id) => p && p.preds.find(x => x.id === id);
  const REAL = p => { const tables = SITE.trackers.map(t => [t[0] - FENX, t[1] - FENZ, 2.384, M0.trackerLen]); return { tables, n: tables.length, cap: tables.length, mpt: 81, mods: M0.modules, capMods: M0.modules, arrayHa: tables.length * M0.pitch * (M0.trackerLen + 7.2) / 1e4 }; };

  /* ───────── расчёт варианта: расстановка → почасовой год → стоимость ───────── */
  const memo = new Map();
  const exclOf = p => p.zones.filter(z => z.on !== false).map(E.zonePoly);
  function calc(p, pr, noSim) {
    const key = JSON.stringify([p.boundary, p.zones, pr.plant, pr.sys, pr.sim, pr.storage, pr.weather, DB.cost, DB.fin, noSim ? 1 : 0, p.lat]); if (memo.has(key)) return memo.get(key);
    const D = E.byId(E.MODULES, pr.plant.module), V = E.byId(E.INVERTERS, pr.plant.inverter), ex = exclOf(p), target = Math.round(pr.plant.inv * V.kw * pr.plant.ratio * 1000 / D.p / 27) * 27;
    const full = E.layout(pr.plant, p.boundary, ex), lay = pr.plant.real && p.real && !ex.length ? REAL(p) : E.layout(pr.plant, p.boundary, ex, target);
    const free = E.freeArea(p.boundary, ex), out = { D, V, lay, target, fit: lay.mods >= target, capKw: full.capMods * D.p / 1000, free, area: E.polyArea(p.boundary) / 1e4, perim: E.perimeter(p.boundary), dcKw: lay.mods * D.p / 1000, acKw: pr.plant.inv * V.kw };
    if (lay.mods && !noSim) { const t0 = performance.now(); out.res = E.simulate(Object.assign({}, pr.plant, { mods: lay.mods }), p, pr.weather, pr.sys, pr.sim, pr.storage); out.ms = performance.now() - t0; out.cost = E.cost(pr.plant, lay, DB.cost, DB.fin, out.res.energy); }
    if (memo.size > 60) memo.clear(); memo.set(key, out); return out;
  }
  const touch = pr => { if (pr.status === 'done') pr.status = 'draft'; persist(); };

  /* ───────── графики ───────── */
  const X = v => (v * 1000).toFixed(1), Y = v => (100 - v * 100).toFixed(1), path = pts => pts.length ? 'M' + pts.map(p => X(p[0]) + ',' + Y(p[1])).join('L') : '';
  function PL(o) {
    const svg = (o.paths || []).map(p => p.rect ? `<rect x="${X(p.rect[0])}" y="${Y(p.rect[1] + p.rect[3])}" width="${(p.rect[2] * 1000).toFixed(1)}" height="${(p.rect[3] * 100).toFixed(1)}" fill="${p.fill}"/>` : `<path d="${p.d}${p.area ? `L${X(p.area[1])},100L${X(p.area[0])},100Z` : ''}" fill="${p.fill || 'none'}" stroke="${p.stroke || 'none'}" stroke-width="${p.w || 1.6}" ${p.dash ? `stroke-dasharray="${p.dash}"` : ''} vector-effect="non-scaling-stroke"/>`).join('');
    const grid = (o.grid || [0.25, 0.5, 0.75, 1]).map(g => `<path d="M0,${Y(g * (o.top || 0.92))}L1000,${Y(g * (o.top || 0.92))}" stroke="#EDF1F6" stroke-width="1" vector-effect="non-scaling-stroke"/>`).join('');
    const lab = (o.labels || []).map(l => l.dot ? `<i style="left:${(l.x * 100).toFixed(1)}%;top:${(100 - l.y * 100).toFixed(1)}%;background:${l.dot}"></i>` : `<span class="${l.cls || ''}" style="left:${(l.x * 100).toFixed(1)}%;top:${(100 - l.y * 100).toFixed(1)}%">${l.t}</span>`).join('');
    return `<div class="pl ${o.cls || ''}"><svg viewBox="0 0 1000 100" preserveAspectRatio="none"><path d="M0,100L1000,100" stroke="#C5D0DD" stroke-width="1" vector-effect="non-scaling-stroke"/>${grid}${svg}</svg>${lab}</div>`;
  }
  const xax = (labels, tpl) => `<div class="xax" style="grid-template-columns:${tpl || `repeat(${labels.length},minmax(0,1fr))`}">${labels.map((l, i) => `<span style="text-align:${!tpl ? 'center' : i === 0 ? 'left' : i === labels.length - 1 ? 'right' : 'center'}">${l}</span>`).join('')}</div>`;
  const leg = items => `<div class="leg">${items.map(c => `<span><i style="background:${c[0]}"></i>${c[1]}</span>`).join('')}</div>`;
  const kpi = (l, v, u, s) => `<div class="kpi"><label>${l}</label><b>${v}<small>${u || ''}</small></b>${s ? `<span>${s}</span>` : ''}</div>`;
  const opt = (list, cur, lab) => list.map(x => `<option value="${x.id}" ${x.id === cur ? 'selected' : ''}>${esc(lab(x))}</option>`).join('');
  const fnum = (k, label, v, step, extra = '') => `<label class="f">${label}<input type="number" data-k="${k}" value="${v}" step="${step || 'any'}" ${extra}></label>`;

  /* ───────── навигация ───────── */
  let map = null, R = { name: 'projects' }, ui = { tab: 'sum', inc: 'm', day: 172, vars: { grid: true, poa: true }, pop: null, draw: null, base: 'sat', run: null, fin: {} };
  const go = h => { location.hash = h; };
  function nav() {
    const p = R.pid && proj(R.pid), a = (h, t, cls = '') => `<a href="#${h}" class="${cls} ${location.hash === '#' + h || (h === '/projects' && R.name === 'projects') ? 'on' : ''}">${t}</a>`;
    $('#nav').innerHTML = `<div class="brand">Платформа ВИЭ<small>Проектирование СЭС</small></div>
      <a href="index.html">← Дашборд станции</a>
      <h4>Работа</h4>${a('/projects', 'Проекты')}${p ? a('/project/' + p.id, esc(p.name), 'sub') + a('/scen/' + p.id, 'Сценарии', 'sub') : ''}
      <h4>Библиотеки</h4>${a('/lib/weather', 'Погода')}${a('/lib/modules', 'Модули')}${a('/lib/inverters', 'Инверторы')}
      <h4>Журнал</h4>${a('/log', 'Журнал расчётов')}
      <div class="foot">Расчёт — почасовой год, 8760 часов. Данные проектов хранятся в этом браузере.<br><a href="#/reset" style="display:inline;padding:0;color:#93A4BC;text-decoration:underline">Вернуть исходные данные</a></div>`;
  }
  function route() {
    if (map) { map.remove(); map = null; } ui.pop = null; ui.draw = null;
    const h = location.hash.replace(/^#\/?/, '').split('/'), n = h[0] || 'projects'; R = { name: n, pid: h[1], id: h[2] };
    if (n === 'reset') { if (confirm('Удалить свои проекты и расчёты и вернуть исходные данные?')) { DB = seed(); persist(); memo.clear(); } return go('/projects'); }
    if (n === 'lib' || n === 'log' || n === 'projects') R.pid = null; if (n === 'lib') R.id = h[1];
    const p = R.pid && proj(R.pid); if (['project', 'pred', 'builder', 'results', 'scen'].includes(n) && !p) return go('/projects');
    if (['pred', 'builder', 'results'].includes(n) && !pred(p, R.id)) return go('/project/' + p.id);
    nav(); ({ projects: vProjects, project: vProject, pred: vPred, builder: vBuilder, results: vResults, scen: vScen, lib: vLib, log: vLog }[n] || vProjects)(p, p && pred(p, R.id)); $('#main').scrollTop = 0;
  }
  addEventListener('hashchange', route);
  const page = html => { $('#main').innerHTML = `<div class="page">${html}</div>`; };

  /* ───────── проекты ───────── */
  function vProjects() {
    const rows = DB.projects.map(p => { const c = calc(p, { plant: PLANT0, sys: {}, sim: {}, weather: 'mn' }, true), best = p.preds.find(x => x.status === 'done');
      return `<tr class="click" data-go="/project/${p.id}"><td><b>${esc(p.name)}</b> ${p.demo ? '<span class="tag demo">демо-данные</span>' : ''}<small>${esc(p.place || '')}</small></td><td class="n">${fmt(p.lat, 4)}°, ${fmt(p.lon, 4)}°</td><td class="n">${fmt(c.area, 1)}</td><td class="n ${c.free / c.area < 0.8 ? 'bad' : ''}">${fmt(c.free, 1)}</td><td class="n">${fmt(c.capKw / 1000, 1)}</td><td>${esc(p.grid || '—')}</td><td class="n">${p.preds.length}</td><td><span class="tag ${best ? 'ok' : ''}">${esc(p.status || 'Черновик')}</span></td></tr>`; }).join('');
    page(`<div class="head"><div><h1>Проекты</h1><p>Площадки и станции. Откройте проект, чтобы собрать станцию на карте и посчитать выработку</p></div><div class="acts"><button class="btn pri" data-act="new-project">Новый проект</button></div></div>
      <div class="card"><div class="tw"><table class="t"><thead><tr><th>Проект</th><th class="n">Координаты</th><th class="n">Участок, га</th><th class="n">Пригодно, га</th><th class="n">Помещается,<br>МВт DC</th><th>Подключение к сети</th><th class="n">Расчётов</th><th>Статус</th></tr></thead><tbody>${rows}</tbody></table></div></div>
      <p class="note">«Помещается» — сколько мощности входит на пригодную площадь при шаге рядов рабочего проекта (7,22 м, трекер в один ряд). Участок Арала стоит по координатам из файла локации проекта; три площадки-кандидата и их ограничения — демо-данные.</p>
      <div class="card" id="np" hidden><h2>Новый проект</h2><div class="form"><label class="f w">Название<input id="np-name" value="Новая площадка"></label><label class="f">Широта<input id="np-lat" type="number" step="any" value="46.80"></label><label class="f">Долгота<input id="np-lon" type="number" step="any" value="61.75"></label><label class="f">Сторона участка, м<input id="np-size" type="number" value="800"></label><label class="f">Часовой пояс, UTC+<input id="np-tz" type="number" value="5"></label></div><div class="acts" style="margin-top:12px"><button class="btn pri" data-act="create-project">Создать</button><span class="note">Границу потом можно нарисовать на карте или загрузить из KML</span></div></div>`);
  }

  /* ───────── проект и его расчёты ───────── */
  function vProject(p) {
    const rows = p.preds.map(pr => { const c = calc(p, pr), r = c.res;
      return `<tr class="click" data-go="/pred/${p.id}/${pr.id}"><td><b>${esc(pr.name)}</b><small>${esc(c.D.model)} · ${esc(c.V.model)} · ${pr.plant.mount === 'fixed' ? 'неподвижные столы' : 'трекер'}</small></td><td class="n">${fmt(c.dcKw / 1000, 2)}</td><td class="n">${fmt(c.acKw / 1000, 2)}</td><td class="n">${r ? fmt(r.ratio, 2) : '—'}</td><td class="n">${r && pr.status === 'done' ? fmt(r.energy / 1000, 1) : '—'}</td><td class="n">${r && pr.status === 'done' ? fmt(r.spec) : '—'}</td><td class="n">${r && pr.status === 'done' ? fmt(c.cost.lcoe, 1) : '—'}</td><td><span class="tag ${pr.status === 'done' ? 'ok' : 'warn'}">${pr.status === 'done' ? 'рассчитан' : 'черновик'}</span></td>
        <td class="n"><button class="btn sm" data-clone="${pr.id}">Копия</button> ${pr.plant.real ? '' : `<button class="btn sm danger" data-del="${pr.id}">Удалить</button>`}</td></tr>`; }).join('');
    page(`<div class="crumbs"><a href="#/projects">Проекты</a> /</div><div class="head"><div><h1>${esc(p.name)}</h1><p>${esc(p.place || '')} · ${fmt(p.lat, 4)}° с. ш., ${fmt(p.lon, 4)}° в. д. · UTC+${p.tz}</p></div><div class="acts"><a class="btn" href="#/scen/${p.id}">Сценарии</a><button class="btn pri" data-act="new-pred">Новый расчёт</button></div></div>
      <div class="grid g3"><div class="card"><h2>Расчёты <small>${p.preds.length}</small></h2>${rows ? `<div class="tw"><table class="t"><thead><tr><th>Расчёт</th><th class="n">DC, МВт</th><th class="n">AC, МВт</th><th class="n">DC/AC</th><th class="n">Выработка,<br>ГВт·ч</th><th class="n">кВт·ч<br>на кВт</th><th class="n">LCOE,<br>₸/кВт·ч</th><th>Статус</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="note">Расчётов пока нет. Создайте первый: выберите погоду, соберите станцию на карте и запустите расчёт.</p>'}</div>
      <div class="card"><h2>Площадка</h2><div id="pmap" style="height:230px;border-radius:8px;overflow:hidden;margin-bottom:10px"></div><table class="t"><tbody><tr><td>Площадь участка</td><td class="n">${fmt(E.polyArea(p.boundary) / 1e4, 1)} га</td></tr><tr><td>Зон ограничений</td><td class="n">${p.zones.length}</td></tr><tr><td>Подключение</td><td class="n" style="white-space:normal">${esc(p.grid || '—')}</td></tr><tr><td>Свободная мощность сети</td><td class="n">${p.gridMw ? fmt(p.gridMw) + ' МВт' : '—'}</td></tr><tr><td>Земля</td><td class="n" style="white-space:normal">${esc(p.land || '—')}</td></tr></tbody></table>${p.demo ? '<p class="note" style="margin-top:8px"><span class="tag demo">демо-данные</span> Площадка-кандидат для сравнения.</p>' : ''}</div></div>`);
    miniMap('pmap', p);
  }

  /* ───────── страница расчёта ───────── */
  function vPred(p, pr) {
    const c = calc(p, pr), W = E.byId(E.WEATHER, pr.weather), s = Object.assign({}, E.SYS0, pr.sys), m = Object.assign({}, E.SIM0, pr.sim), ready = c.lay.mods > 0, done = pr.status === 'done';
    const sec = (ok, title, sub, btn) => `<div class="sec ${ok ? 'done' : ''}"><i>${ok ? '✓' : ''}</i><b>${title}</b><span>${sub}</span>${btn}</div>`;
    page(`<div class="crumbs"><a href="#/projects">Проекты</a> / <a href="#/project/${p.id}">${esc(p.name)}</a> /</div>
      <div class="head"><div><h1><input id="pr-name" value="${esc(pr.name)}" style="font:inherit;color:inherit;border:0;border-bottom:1px dashed var(--line);background:none;width:min(520px,70vw)"></h1><p>Расчёт выработки. Заполните три раздела и запустите расчёт</p></div><div class="acts"><button class="btn" data-clone="${pr.id}">Копия</button></div></div>
      <div class="grid g3"><div>
        <div class="card"><h2>Условия площадки</h2>
          ${sec(true, 'Погодные данные', `${esc(W.name)}, ${esc(W.kind)}. Приход ${fmt(W.ghi.reduce((a, b) => a + b, 0))} кВт·ч/м² в год`, `<select class="btn" id="pr-wx">${opt(E.WEATHER, pr.weather, x => x.name)}</select>`)}
        </div>
        <div class="card"><h2>Состав станции</h2>
          ${sec(ready, 'Массивы и блоки', ready ? `${fmt(c.dcKw / 1000, 2)} МВт DC, ${fmt(c.acKw / 1000, 2)} МВт AC. ${fmt(c.lay.mods)} модулей, ${fmt(c.lay.n)} столов, шаг ${fmt(pr.plant.pitch, 2)} м` : 'Станция не собрана', `<a class="btn pri" href="#/builder/${p.id}/${pr.id}">Конструктор на карте</a>`)}
          ${sec(!!pr.storage, 'Накопитель', pr.storage ? `${pr.storage.p} МВт на ${pr.storage.e} МВт·ч, ${pr.storage.mode === 'shift' ? 'сдвиг выдачи на вечер' : 'заряд срезанной энергией'}` : 'Не задан', `<button class="btn" data-act="tog-stor">${pr.storage ? 'Убрать' : 'Добавить'}</button>`)}
          ${pr.storage ? `<div class="form" style="margin:4px 0 12px 40px">${fnum('st.p', 'Мощность, МВт', pr.storage.p, 1)}${fnum('st.e', 'Ёмкость, МВт·ч', pr.storage.e, 1)}<label class="f w">Режим<select data-k="st.mode"><option value="cut" ${pr.storage.mode === 'cut' ? 'selected' : ''}>Заряд срезанной и ограниченной энергией</option><option value="shift" ${pr.storage.mode === 'shift' ? 'selected' : ''}>Сдвиг дневной выработки на вечер</option></select></label></div>` : ''}
          ${sec(true, 'Сеть и подстанция', `Трансформаторы ${fmt(s.kva || c.res?.kva || 0)} кВА, предел выдачи ${s.poi ? fmt(s.poi, 1) + ' МВт' : 'не задан'}, готовность ${fmt(s.avail, 1)} %`, `<button class="btn" data-act="tog-sys">Изменить</button>`)}
          <div class="form" id="sys-form" style="margin:4px 0 4px 40px" hidden>${fnum('sys.poi', 'Предел выдачи в сеть, МВт (0 — нет)', s.poi, 0.5)}${fnum('sys.avail', 'Готовность станции, %', s.avail, 0.1)}${fnum('sys.dcOhm', 'Потери в кабелях DC при STC, %', s.dcOhm, 0.1)}${fnum('sys.acOhm', 'Потери в кабелях AC при STC, %', s.acOhm, 0.01)}${fnum('sys.trCu', 'Трансформатор, нагрузочные, %', s.trCu, 0.01)}${fnum('sys.trIron', 'Трансформатор, холостой ход, %', s.trIron, 0.01)}</div>
        </div>
        <div class="card"><h2>Настройки модели</h2>
          ${sec(true, 'Допущения расчёта', `Загрязнение ${fmt(m.soil, 1)} %, альбедо ${fmt(m.albedo, 2)}, разброс модулей ${fmt(m.mismatch, 1)} %, изменчивость года ${fmt(m.sigma, 1)} %`, `<button class="btn" data-act="tog-sim">Изменить</button>`)}
          <div class="form" id="sim-form" style="margin:4px 0 4px 40px" hidden>${fnum('sim.soil', 'Загрязнение модулей, %', m.soil, 0.1)}${fnum('sim.albedo', 'Альбедо земли', m.albedo, 0.01)}${fnum('sim.mismatch', 'Разброс модулей и стрингов, %', m.mismatch, 0.1)}${fnum('sim.lid', 'Световая деградация (LID), %', m.lid, 0.1)}${fnum('sim.quality', 'Допуск мощности модулей, % (минус — запас)', m.quality, 0.1)}${fnum('sim.sigma', 'Межгодовая изменчивость, %', m.sigma, 0.1)}</div>
          <p class="note" style="margin-top:8px">Модель: транспозиция Хея–Дэвиса, слежение с обратным ходом, однодиодная модель модуля по паспорту, тепловая модель с Uc = 29 Вт/м²·К. Шаг расчёта — час.</p>
        </div></div>
        <div><div class="card" id="runbox"><h2>${done ? 'Расчёт готов' : ready ? 'Готов к запуску' : 'Соберите станцию'}</h2>
          <p class="note">${done ? `Выполнен ${esc(pr.ran || '')}. Параметры с тех пор не менялись.` : ready ? 'Все обязательные разделы заполнены. Расчёт пройдёт 8760 часов года.' : 'Откройте конструктор на карте и расставьте столы.'}</p>
          <div class="prog" hidden><i></i></div><p class="note" id="run-msg"></p>
          <div class="acts" style="margin-top:12px"><button class="btn pri" data-act="run" ${ready ? '' : 'disabled'}>${done ? 'Пересчитать' : 'Запустить расчёт'}</button>${done ? `<a class="btn" href="#/results/${p.id}/${pr.id}">Смотреть результаты</a>` : ''}</div></div>
          ${done && c.res ? `<div class="card"><h2>Итог</h2><table class="t"><tbody><tr><td>Выработка за год</td><td class="n"><b>${fmt(c.res.energy / 1000, 2)} ГВт·ч</b></td></tr><tr><td>На кВт установленной</td><td class="n">${fmt(c.res.spec)} кВт·ч</td></tr><tr><td>PR</td><td class="n">${fmt(c.res.pr, 1)} %</td></tr><tr><td>КИУМ</td><td class="n">${fmt(c.res.cf, 1)} %</td></tr><tr><td>LCOE</td><td class="n">${fmt(c.cost.lcoe, 1)} ₸/кВт·ч</td></tr></tbody></table></div>` : ''}
        </div></div>`);
  }
  function runPred(p, pr) {
    const box = $('#runbox'), bar = box.querySelector('.prog'), msg = $('#run-msg'), steps = ['Читаю погодный ряд: 8760 часов', 'Расставляю столы и считаю затенение', 'Модули: облучённость, нагрев, однодиодная модель', 'Инверторы, кабели, трансформаторы', 'Собираю дерево потерь и отчёты'];
    bar.hidden = false; let i = 0; box.querySelector('[data-act=run]').disabled = true;
    const tick = () => { if (i < steps.length) { msg.textContent = steps[i]; bar.firstElementChild.style.width = ((i + 1) / steps.length * 100) + '%'; i++; return setTimeout(tick, 260); }
      const c = calc(p, pr); pr.status = 'done'; pr.ran = now(); DB.log.unshift({ t: pr.ran, p: p.name, n: pr.name, s: 'готов', ms: Math.round(c.ms || 0), e: c.res ? c.res.energy : 0 }); DB.log.length = Math.min(DB.log.length, 60); persist(); go(`/results/${p.id}/${pr.id}`); };
    tick();
  }

  /* ───────── карта ───────── */
  const BASES = { sat: ['Спутник', 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', 18, 'Снимки: Esri, Maxar, Earthstar Geographics'], osm: ['Схема', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', 19, '© участники OpenStreetMap'], topo: ['Рельеф', 'https://tile.opentopomap.org/{z}/{x}/{y}.png', 17, '© OpenTopoMap, участники OpenStreetMap'] };
  const LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', ROADS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}';
  let baseLayer = null, refLayers = [], group = null;
  function setBase(id) { const L = window.L, b = BASES[id]; ui.base = id; if (baseLayer) map.removeLayer(baseLayer); refLayers.forEach(l => map.removeLayer(l)); refLayers = [];
    baseLayer = L.tileLayer(b[1], { maxZoom: 20, maxNativeZoom: b[2], attribution: b[3] }).addTo(map); baseLayer.bringToBack();
    if (id === 'sat') refLayers = [L.tileLayer(ROADS, { maxZoom: 20, maxNativeZoom: 18, opacity: 0.8 }).addTo(map), L.tileLayer(LABELS, { maxZoom: 20, maxNativeZoom: 18 }).addTo(map)]; }
  function miniMap(id, p) { if (!window.L) return; const L = window.L, g = geo(p), m = L.map(id, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false });
    L.tileLayer(BASES.sat[1], { maxNativeZoom: 18, maxZoom: 20 }).addTo(m); const ll = P => P.map(q => g.toLL(q[0], q[1]));
    p.zones.forEach(z => L.polygon(ll(E.zonePoly(z)), { color: '#D23B2F', weight: 1, fillOpacity: 0.35 }).addTo(m)); const b = L.polygon(ll(p.boundary), { color: '#F2B705', weight: 2.5, fill: false }).addTo(m); m.fitBounds(b.getBounds(), { padding: [18, 18] }); map = m; }

  /* ───────── конструктор станции на карте ───────── */
  function vBuilder(p, pr) {
    $('#main').innerHTML = `<div class="builder"><div class="b-top"><b>${esc(pr.name)}</b>
        <span class="seg" id="b-base">${Object.entries(BASES).map(([k, v]) => `<button data-base="${k}" class="${ui.base === k ? 'on' : ''}">${v[0]}</button>`).join('')}</span>
        <button class="btn sm" data-pop="layers">Слои и ограничения</button><button class="btn sm" data-act="draw-b">Граница</button><button class="btn sm" data-act="draw-z">Ограничение</button>
        <label class="btn sm" style="cursor:pointer">Загрузить KML<input type="file" id="b-kml" accept=".kml" hidden></label>
        <button class="btn sm" data-pop="bom">Ведомость</button><button class="btn sm" data-act="kml">KML</button><button class="btn sm" data-act="dxf">DXF</button><button class="btn sm" data-act="print">Схема PDF</button>
        <a class="btn sm pri" href="#/pred/${p.id}/${pr.id}">Сохранить и закрыть</a></div>
      <div class="b-side" id="b-side"></div><div id="bmap"></div><div class="b-stats" id="b-stats"></div></div>`;
    const L = window.L; if (!L) { $('#bmap').innerHTML = '<p class="note" style="padding:20px">Карта не загрузилась: нужен доступ в интернет.</p>'; bSide(p, pr); return; }
    map = L.map('bmap', { zoomControl: true, preferCanvas: true, zoomSnap: 0.25, doubleClickZoom: false }); map.attributionControl.setPrefix(false); L.control.scale({ imperial: false }).addTo(map); setBase(ui.base); group = L.layerGroup().addTo(map);
    const g = geo(p); map.fitBounds(L.latLngBounds(p.boundary.map(q => g.toLL(q[0], q[1]))), { padding: [40, 40] });
    map.on('click', e => { if (!ui.draw) return; ui.draw.pts.push(geo(p).fromLL(e.latlng.lat, e.latlng.lng).map(v => +v.toFixed(1))); bDraw(p, pr); bSide(p, pr); });
    map.on('dblclick', () => { if (ui.draw) finishDraw(p, pr); });
    $('#b-kml').onchange = ev => { const f = ev.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { const m = /<coordinates>([\s\S]*?)<\/coordinates>/g, polys = []; let x; while ((x = m.exec(String(rd.result)))) { const pts = x[1].trim().split(/\s+/).map(c => c.split(',').map(Number)).filter(c => isFinite(c[0]) && isFinite(c[1])); if (pts.length >= 4) polys.push(pts); }
      if (!polys.length) return toast('В файле нет контура участка'); const P = polys.sort((a, b) => b.length - a.length)[0].map(c => geo(p).fromLL(c[1], c[0]).map(v => +v.toFixed(1))); if (Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 1) P.pop();
      p.boundary = P; pr.plant.real = false; touch(pr); bAll(p, pr); map.fitBounds(L.latLngBounds(P.map(q => geo(p).toLL(q[0], q[1]))), { padding: [40, 40] }); toast(`Граница из файла: ${P.length} точек, ${fmt(E.polyArea(P) / 1e4, 1)} га`); }; rd.readAsText(f); };
    bAll(p, pr);
  }
  const bAll = (p, pr) => { bSide(p, pr); bDraw(p, pr); bStats(p, pr); bPop(p, pr); };
  function bSide(p, pr) {
    const P = pr.plant, c = calc(p, pr, true), D = c.D, w = D.len * P.high, gcr = w / P.pitch, fx = P.mount === 'fixed';
    $('#b-side').innerHTML = (ui.draw ? `<div class="card" style="border-color:var(--amber);background:#FFFBEA"><b>${ui.draw.kind === 'b' ? 'Рисую границу участка' : 'Рисую ограничение'}</b><p class="note" style="margin:4px 0 8px">Щёлкайте по карте, чтобы ставить точки. ${ui.draw.kind === 'z' ? 'Две точки и больше без замыкания — линия с отступом, «Замкнуть» — зона.' : 'Нужно не меньше трёх точек.'} Точек: ${ui.draw.pts.length}</p><div class="acts">${ui.draw.kind === 'z' ? '<button class="btn sm pri" data-act="fin-line">Готово, линия</button><button class="btn sm" data-act="fin-poly">Замкнуть в зону</button>' : '<button class="btn sm pri" data-act="fin-poly">Готово</button>'}<button class="btn sm" data-act="fin-cancel">Отмена</button></div></div>` : '') +
      `<h3>Оборудование</h3><div class="form"><label class="f w">Инвертор<select data-k="inverter">${opt(E.INVERTERS, P.inverter, x => `${x.model}, ${fmt(x.kw)} кВт`)}</select></label><label class="f w">Модуль<select data-k="module">${opt(E.MODULES, P.module, x => `${x.model}`)}</select></label></div>
      <h3>Мощность</h3><div class="form">${fnum('inv', 'Инверторов, шт', P.inv, 1, 'min="1"')}<label class="f">AC, МВт<input value="${fmt(c.acKw / 1000, 2)}" disabled></label>${fnum('ratio', 'Отношение DC/AC', P.ratio, 0.01, 'min="0.8" max="2"')}<label class="f">Нужно DC, МВт<input value="${fmt(c.target * D.p / 1e6, 2)}" disabled></label></div>
      <h3>Ряды</h3><div class="form">${fnum('gcr', 'Плотность рядов, %', +(gcr * 100).toFixed(1), 0.5, 'min="15" max="80"')}${fnum('pitch', 'Шаг рядов, м', +P.pitch.toFixed(2), 0.05, 'min="3"')}
        <label class="f w">Крепление<select data-k="mount"><option value="track" ${fx ? '' : 'selected'}>Одноосный трекер, ось север–юг</option><option value="fixed" ${fx ? 'selected' : ''}>Неподвижные столы лицом на юг</option></select></label>
        ${fx ? fnum('tilt', 'Наклон, °', P.tilt, 1, 'min="5" max="50"') : fnum('limit', 'Предел поворота, ±°', P.limit, 1, 'min="30" max="65"')}${fx ? '<span></span>' : `<label class="f c" style="align-self:end;padding-bottom:6px"><input type="checkbox" data-k="bt" ${P.bt !== false ? 'checked' : ''}>Обратный ход</label>`}
        <label class="f">Модулей по высоте<select data-k="high"><option value="1" ${P.high === 1 ? 'selected' : ''}>1</option><option value="2" ${P.high === 2 ? 'selected' : ''}>2</option></select></label><label class="f">Модулей вдоль стола<select data-k="wide">${[27, 54, 81, 108].map(v => `<option ${P.wide === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
      <h3>Отступы и проезды</h3><div class="form">${fnum('inset', 'Отступ от границы, м', P.inset, 1, 'min="0"')}${fnum('road', 'Проезд между полосами, м', P.road, 0.2, 'min="2"')}${fx ? '' : fnum('ns', 'Проездов север–юг', P.ns, 1, 'min="0" max="6"')}</div>
      <p class="note ${c.fit ? 'ok' : 'bad'}" style="margin-top:12px">${c.lay.mods ? (c.fit ? `Помещается. На участок при таких параметрах входит до ${fmt(c.capKw / 1000, 1)} МВт DC.` : `Не помещается: нужно ${fmt(c.target * D.p / 1e6, 1)} МВт, входит ${fmt(c.capKw / 1000, 1)} МВт. Увеличьте плотность рядов или уменьшите DC/AC.`) : 'Ни один стол не помещается на участке.'}</p>
      ${P.real && p.real ? '<p class="note" style="margin-top:6px">Показана расстановка из рабочего проекта. При изменении параметров столы будут расставлены заново автоматически.</p>' : ''}`;
  }
  function bStats(p, pr) { const c = calc(p, pr, true); $('#b-stats').innerHTML = [['Периметр', fmt(c.perim) + ' м'], ['Участок', fmt(c.area, 1) + ' га'], ['Пригодно', fmt(c.free, 1) + ' га'], ['Массив', fmt(c.lay.arrayHa, 1) + ' га'], ['DC', fmt(c.dcKw / 1000, 2) + ' МВт', !c.fit], ['AC', fmt(c.acKw / 1000, 2) + ' МВт'], ['Вместимость участка', fmt(c.capKw / 1000, 1) + ' МВт'], ['Занято', fmt(c.free ? c.lay.arrayHa / c.free * 100 : 0) + ' %'], ['Столов', fmt(c.lay.n)], ['Модулей', fmt(c.lay.mods)]].map(s => `<div class="${s[2] ? 'bad' : ''}"><label>${s[0]}</label>${s[1]}</div>`).join(''); }
  function bDraw(p, pr) {
    if (!map || !group) return; const L = window.L, g = geo(p), ll = P => P.map(q => g.toLL(q[0], q[1])), c = calc(p, pr, true), show = ui.layers || (ui.layers = { b: true, z: true, t: true }); group.clearLayers();
    if (show.z) p.zones.forEach(z => { if (z.on === false) return; L.polygon(ll(E.zonePoly(z)), { color: '#D23B2F', weight: 1.5, fillOpacity: 0.3, dashArray: '5 4' }).bindTooltip(`${esc(z.name)}${z.setback ? ', отступ ' + z.setback + ' м' : ''}`, { sticky: true, className: 'lbl' }).addTo(group); if (z.line) L.polyline(ll(z.pts), { color: '#D23B2F', weight: 2 }).addTo(group); });
    if (show.t && c.lay.tables.length) L.polygon(c.lay.tables.map(t => ll([[t[0] - t[2] / 2, t[1] - t[3] / 2], [t[0] + t[2] / 2, t[1] - t[3] / 2], [t[0] + t[2] / 2, t[1] + t[3] / 2], [t[0] - t[2] / 2, t[1] + t[3] / 2]])), { color: '#BFD4FF', weight: 0.6, fillColor: '#16306E', fillOpacity: 0.88, interactive: false }).addTo(group);
    if (show.b) L.polygon(ll(p.boundary), { color: '#F2B705', weight: 3, fill: false, dashArray: '8 5', interactive: false }).addTo(group);
    if (ui.draw && ui.draw.pts.length) { L.polyline(ll(ui.draw.pts), { color: '#fff', weight: 2.5, dashArray: '6 5' }).addTo(group); ui.draw.pts.forEach(q => L.circleMarker(g.toLL(q[0], q[1]), { radius: 5, color: '#13294B', fillColor: '#F2B705', fillOpacity: 1, weight: 2 }).addTo(group)); }
    $('#bmap').classList.toggle('draw', !!ui.draw);
  }
  function finishDraw(p, pr, mode) {
    const d = ui.draw; ui.draw = null; if (!d) return;
    if (d.kind === 'b' && d.pts.length >= 3) { p.boundary = d.pts; pr.plant.real = false; toast(`Новая граница: ${fmt(E.polyArea(d.pts) / 1e4, 1)} га`); }
    else if (d.kind === 'z' && d.pts.length >= 2 && mode !== 'cancel') { const line = mode === 'line' || d.pts.length === 2; p.zones.push({ id: uid(), name: line ? 'Линия ' + (p.zones.length + 1) : 'Зона ' + (p.zones.length + 1), line, pts: d.pts, setback: line ? 20 : 0, on: true }); ui.pop = 'layers'; }
    touch(pr); bAll(p, pr);
  }
  function bPop(p, pr) {
    const old = $('.pop'); if (old) old.remove(); if (!ui.pop || !$('#bmap')) return; const el = document.createElement('div'); el.className = 'pop'; const show = ui.layers || (ui.layers = { b: true, z: true, t: true });
    if (ui.pop === 'layers') el.innerHTML = `<h3>Слои карты <button class="x" data-pop="">×</button></h3>${[['b', 'Граница участка'], ['t', 'Столы с модулями'], ['z', 'Зоны ограничений']].map(l => `<label class="f c" style="margin-bottom:6px"><input type="checkbox" data-layer="${l[0]}" ${show[l[0]] ? 'checked' : ''}>${l[1]}</label>`).join('')}
      <h3 style="margin-top:12px">Ограничения</h3>${p.zones.length ? p.zones.map(z => `<div class="z"><input type="checkbox" data-zon="${z.id}" ${z.on !== false ? 'checked' : ''} title="Учитывать"><input type="text" data-zname="${z.id}" value="${esc(z.name)}"><input type="number" data-zset="${z.id}" value="${z.setback || 0}" min="0" step="5" title="Отступ, м"><button class="x" data-zdel="${z.id}" title="Удалить">×</button></div>`).join('') + '<p class="note" style="margin-top:6px">Число — отступ в метрах. Столы не ставятся в зону и ближе отступа.</p>' : '<p class="note">Ограничений нет. Нажмите «Ограничение» и отметьте на карте линию (ЛЭП, трубопровод, дорогу) или зону.</p>'}
      ${p.demo ? '<p class="note" style="margin-top:8px"><span class="tag demo">демо-данные</span> Зоны этой площадки заданы для примера.</p>' : ''}`;
    if (ui.pop === 'bom') { const c = calc(p, pr, true); el.innerHTML = `<h3>Ведомость объёмов <button class="x" data-pop="">×</button></h3><table class="t"><tbody>${E.bom(pr.plant, c.lay).map(r => `<tr><td>${esc(r[0])}</td><td class="n">${fmt(r[1], r[1] % 1 ? 1 : 0)} ${r[2]}</td></tr>`).join('')}</tbody></table><div class="acts" style="margin-top:10px"><button class="btn sm" data-act="bom-csv">Скачать CSV</button></div><p class="note" style="margin-top:8px">Укрупнённая оценка: длины кабеля пересчитаны от кабельного журнала проекта.</p>`; }
    $('#bmap').appendChild(el); L.DomEvent.disableClickPropagation(el); L.DomEvent.disableScrollPropagation(el);
  }
  const corners = t => [[t[0] - t[2] / 2, t[1] - t[3] / 2], [t[0] + t[2] / 2, t[1] - t[3] / 2], [t[0] + t[2] / 2, t[1] + t[3] / 2], [t[0] - t[2] / 2, t[1] + t[3] / 2]];
  function toKml(p, pr, lay) { const g = geo(p), ring = P => P.concat([P[0]]).map(q => { const l = g.toLL(q[0], q[1]); return l[1].toFixed(7) + ',' + l[0].toFixed(7) + ',0'; }).join(' '), pm = (n, P, st) => `<Placemark><name>${esc(n)}</name><styleUrl>#${st}</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>${ring(P)}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;
    return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(p.name + ' — ' + pr.name)}</name><Style id="b"><LineStyle><color>ff05b7f2</color><width>3</width></LineStyle><PolyStyle><fill>0</fill></PolyStyle></Style><Style id="z"><LineStyle><color>ff2f3bd2</color><width>2</width></LineStyle><PolyStyle><color>552f3bd2</color></PolyStyle></Style><Style id="t"><LineStyle><color>ff6e3016</color><width>1</width></LineStyle><PolyStyle><color>cc6e3016</color></PolyStyle></Style>` + pm('Граница участка', p.boundary, 'b') + p.zones.map(z => pm(z.name, E.zonePoly(z), 'z')).join('') + `<Folder><name>Столы</name>` + lay.tables.map((t, i) => pm('T-' + String(i + 1).padStart(3, '0'), corners(t), 't')).join('') + `</Folder></Document></kml>`; }
  function toDxf(p, lay) { const pl = (P, layer) => `0\nLWPOLYLINE\n8\n${layer}\n90\n${P.length}\n70\n1\n` + P.map(q => `10\n${q[0].toFixed(2)}\n20\n${(-q[1]).toFixed(2)}\n`).join(''); return `0\nSECTION\n2\nENTITIES\n` + pl(p.boundary, 'GP_BOUNDARY') + p.zones.map(z => pl(E.zonePoly(z), 'GP_CONSTRAINTS')).join('') + lay.tables.map(t => pl(corners(t), 'PV_TABLES')).join('') + `0\nENDSEC\n0\nEOF\n`; }

  /* ───────── результаты ───────── */
  function vResults(p, pr) {
    const c = calc(p, pr), r = c.res; if (!r) return go(`/pred/${p.id}/${pr.id}`);
    const tabs = [['sum', 'Обзор'], ['loss', 'Потери'], ['charts', 'Графики'], ['fin', 'Финмодель'], ['rep', 'Отчёты']];
    let body = '';
    if (ui.tab === 'sum') { const mx = Math.max(...r.months) * 1.14, P = [], Lb = []; r.months.forEach((v, m) => { P.push({ rect: [m / 12 + 0.018, 0, 0.047, v / mx], fill: '#0B6FC1' }); Lb.push({ t: fmt(v / 1000, 1), x: m / 12 + 0.041, y: v / mx + 0.05, cls: 'hi' }); });
      body = `<div class="kpis">${kpi('Выработка за год', fmt(r.energy / 1000, 2), 'ГВт·ч', 'P50, отпуск в сеть')}${kpi('P90', fmt(r.p90 / 1000, 2), 'ГВт·ч', 'с вероятностью 90 %')}${kpi('На кВт установленной', fmt(r.spec), 'кВт·ч', 'удельная выработка')}${kpi('Приход в плоскости модулей', fmt(r.poa), 'кВт·ч/м²', `на горизонталь ${fmt(r.ghi)}`)}${kpi('PR', fmt(r.pr, 1), '%', 'коэффициент эффективности')}${kpi('КИУМ', fmt(r.cf, 1), '%', 'по мощности AC')}</div>
        <div class="grid g3"><div class="card"><h2>Выработка по месяцам <small>ГВт·ч</small></h2>${PL({ paths: P, labels: Lb })}${xax(E.MON)}</div>
        <div class="card"><h2>Станция</h2><table class="t"><tbody><tr><td>Мощность DC</td><td class="n">${fmt(r.dcKw / 1000, 2)} МВт</td></tr><tr><td>Мощность AC</td><td class="n">${fmt(r.acKw / 1000, 2)} МВт</td></tr><tr><td>DC/AC</td><td class="n">${fmt(r.ratio, 2)}</td></tr><tr><td>Плотность рядов</td><td class="n">${fmt(r.gcr * 100)} %</td></tr><tr><td>Модули</td><td class="n">${fmt(c.lay.mods)} шт</td></tr><tr><td>Инверторы</td><td class="n">${pr.plant.inv} шт</td></tr><tr><td>Срез инверторами</td><td class="n">${fmt(r.clip, 2)} %</td></tr><tr><td>Пик выдачи</td><td class="n">${fmt(r.peak / 1000, 2)} МВт</td></tr>${pr.storage ? `<tr><td>Отдано накопителем</td><td class="n">${fmt(r.storOut / 1000, 2)} ГВт·ч</td></tr>` : ''}<tr><td>Стоимость без НДС</td><td class="n">${fmt(c.cost.net / 1e6, 2)} млрд ₸</td></tr><tr><td>LCOE</td><td class="n">${fmt(c.cost.lcoe, 1)} ₸/кВт·ч</td></tr></tbody></table></div></div>
        ${pr.plant.real ? `<p class="note">Сверка с отчётом о выработке проекта: расчёт ${fmt(r.energy / 1000, 2)} ГВт·ч, в отчёте ${fmt(EPC.pvsyst.e50 / 1000, 2)} ГВт·ч (P90 ${fmt(EPC.pvsyst.e90 / 1000, 2)}). Почасовой ряд погоды синтезирован из месячных сумм источника.</p>` : ''}`; }
    if (ui.tab === 'loss') { const mxl = Math.max(...r.tree.filter(t => t[1] != null).map(t => Math.abs(t[1])), 1);
      body = `<div class="card"><h2>Дерево потерь <small>от прихода солнца до отпуска в сеть</small></h2><div class="tree">${r.tree.map(t => t[1] == null ? `<div class="tot">${t[0]}</div><div class="tot v">${fmt(t[2], 1)} ${t[3]}</div><div class="tot"></div>` : `<div>${t[0]}</div><div class="v" style="color:${t[1] > 0.005 ? 'var(--ok)' : t[1] < -0.005 ? 'var(--bad)' : 'var(--faint)'}">${sg(t[1], 2)} %</div><div class="bar"><u style="width:${Math.min(100, Math.abs(t[1]) / mxl * 100).toFixed(1)}%;background:${t[1] >= 0 ? 'var(--ok)' : 'var(--bad)'}"></u></div>`).join('')}</div></div>`; }
    if (ui.tab === 'charts') body = chartsTab(r, pr);
    if (ui.tab === 'fin') body = finTab(c, r);
    if (ui.tab === 'rep') body = `<div class="grid g2"><div class="card"><h2>Сводка расчёта</h2><p class="note">Двухстраничная сводка: состав станции, итоги года, выработка по месяцам, дерево потерь. Откроется окно печати — выберите «Сохранить как PDF».</p><div class="acts" style="margin-top:10px"><button class="btn pri" data-act="rep-print">Сводка в PDF</button></div></div>
      <div class="card"><h2>Почасовой ряд, 8760 строк</h2><p class="note">Каждый час года: приход на горизонталь и в плоскости модулей, температура модуля, мощность DC, AC и отпуск в сеть. Формат CSV, открывается в Excel.</p><div class="acts" style="margin-top:10px"><button class="btn pri" data-act="rep-8760">Скачать 8760 CSV</button></div></div>
      <div class="card"><h2>Ведомость объёмов</h2><p class="note">Модули, столы, сваи, стринги, инверторы, подстанции, кабель.</p><div class="acts" style="margin-top:10px"><button class="btn" data-act="bom-csv">Скачать CSV</button></div></div>
      <div class="card"><h2>Расстановка</h2><p class="note">Граница, ограничения и столы для карт и для чертежа.</p><div class="acts" style="margin-top:10px"><button class="btn" data-act="kml">KML</button><button class="btn" data-act="dxf">DXF</button></div></div></div>`;
    page(`<div class="crumbs"><a href="#/projects">Проекты</a> / <a href="#/project/${p.id}">${esc(p.name)}</a> / <a href="#/pred/${p.id}/${pr.id}">${esc(pr.name)}</a> /</div>
      <div class="head"><div><h1>Результаты расчёта</h1><p>${esc(pr.name)} · ${esc(E.byId(E.WEATHER, pr.weather).name)} · ${pr.status === 'done' ? 'рассчитан ' + esc(pr.ran || '') : 'параметры изменены, расчёт не перезапущен'}</p></div><div class="acts"><a class="btn" href="#/builder/${p.id}/${pr.id}">Конструктор</a><a class="btn" href="#/pred/${p.id}/${pr.id}">Параметры</a></div></div>
      <div class="tabs">${tabs.map(t => `<button data-tab="${t[0]}" class="${ui.tab === t[0] ? 'on' : ''}">${t[1]}</button>`).join('')}</div>${body}`);
  }
  const VARS = { grid: ['Отпуск в сеть', '#0B6FC1', 'МВт', 'ГВт·ч'], ac: ['Выход инверторов', '#7FB6FF', 'МВт', 'ГВт·ч'], poa: ['В плоскости модулей', '#F2B705', 'Вт/м²', 'кВт·ч/м²'], ghi: ['На горизонталь', '#C9A26B', 'Вт/м²', 'кВт·ч/м²'], tc: ['Температура модуля', '#D23B2F', '°C', '°C'] };
  function chartsTab(r, pr) {
    const H = r.H, inc = ui.inc, on = Object.keys(VARS).filter(k => ui.vars[k]), paths = [], labels = []; let ax = '', cap = '';
    const series = k => { if (inc === 'h') { const a = [], s = (ui.day - 1) * 24; for (let i = 0; i < 168; i++) { const j = (s + i) % 8760; a.push(k === 'grid' || k === 'ac' ? H[k][j] / 1000 : H[k][j]); } return a; }
      const n = inc === 'd' ? 365 : 12, a = new Array(n).fill(0), cnt = new Array(n).fill(0); let h = 0; for (let m = 0; m < 12; m++) for (let d = 0; d < E.DAYS[m]; d++) for (let q = 0; q < 24; q++, h++) { const i = inc === 'd' ? (h / 24 | 0) : m; if (k === 'tc') { if (H.poa[h] > 50) { a[i] += H.tc[h]; cnt[i]++; } } else a[i] += H[k][h] / (k === 'grid' || k === 'ac' ? (inc === 'd' ? 1e3 : 1e6) : 1e3); }
      return k === 'tc' ? a.map((v, i) => cnt[i] ? v / cnt[i] : 0) : a; };
    on.forEach((k, idx) => { const a = series(k), mx = Math.max(...a, 1e-6) * 1.1, mn = k === 'tc' ? Math.min(...a, 0) : 0, n = a.length;
      if (inc === 'm') { const bw = 0.07 / on.length; a.forEach((v, m) => paths.push({ rect: [m / 12 + 0.007 + idx * bw, 0, bw * 0.9, Math.max(0, (v - mn) / (mx - mn)) * 0.92], fill: VARS[k][1] })); }
      else paths.push({ d: path(a.map((v, i) => [i / (n - 1), (v - mn) / (mx - mn) * 0.92])), stroke: VARS[k][1], w: 1.5 });
      labels.push({ t: `${fmt(Math.max(...a), Math.max(...a) < 20 ? 1 : 0)} ${inc === 'h' ? VARS[k][2] : inc === 'd' && (k === 'grid' || k === 'ac') ? 'МВт·ч' : VARS[k][3]}`, x: 0.005, y: 0.97 - idx * 0.07, cls: 'l hi' }); });
    if (inc === 'h') { const d0 = new Date(Date.UTC(2025, 0, ui.day)); ax = xax(Array.from({ length: 7 }, (_, i) => new Date(d0.getTime() + i * 864e5).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }))); cap = `<label class="f" style="flex:1 1 260px">Неделя с ${d0.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' })}<input type="range" id="ch-day" min="1" max="359" value="${ui.day}"></label>`; }
    else ax = inc === 'd' ? xax(E.MON) : xax(E.MON);
    return `<div class="card"><div class="acts" style="margin-bottom:12px;align-items:flex-end"><span class="seg">${[['h', 'По часам'], ['d', 'По дням'], ['m', 'По месяцам']].map(x => `<button data-inc="${x[0]}" class="${inc === x[0] ? 'on' : ''}">${x[1]}</button>`).join('')}</span>${Object.entries(VARS).map(([k, v]) => `<label class="f c"><input type="checkbox" data-var="${k}" ${ui.vars[k] ? 'checked' : ''}><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${v[1]}"></i>${v[0]}</label>`).join('')}${cap}</div>
      ${on.length ? PL({ paths, labels }) + ax : '<p class="note">Выберите хотя бы одну величину.</p>'}<p class="note" style="margin-top:10px">Каждая величина показана в своём масштабе; слева вверху — её максимум на графике. ${inc === 'h' ? 'Мощность — средняя за час.' : inc === 'd' ? 'Суммы за сутки; температура — средняя в светлое время.' : 'Суммы за месяц; температура — средняя в светлое время.'}</p></div>`;
  }
  function finTab(c, r) {
    const p = Object.assign({}, EPC.FIN_DEFAULTS, DB.fin), f = c.cost.fin, fin = o => EPC.finance(c.cost.net * 1000 * (o.kc || 1), r.energy * (o.ke || 1), Object.assign({}, DB.fin, o.p));
    let lo = 1, hi = 200; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; fin({ p: { tariff: m } }).npv > 0 ? hi = m : lo = m; } const be = (lo + hi) / 2;
    const n = f.cf.length - 1, cum = [], dis = []; let a = 0, d = 0; f.cf.forEach((v, i) => { a += v; d += v / Math.pow(1 + p.rate / 100, i); cum.push(a / 1e9); dis.push(d / 1e9); });
    const l2 = Math.min(...cum, ...dis), h2 = Math.max(...cum, ...dis, 0.5), ny = v => (v - l2) / (h2 - l2) * 0.9 + 0.04, z = ny(0), labels = [{ t: `${sg(cum[n], 1)} млрд ₸`, x: 0.995, y: Math.min(0.96, ny(cum[n]) + 0.06), cls: 'r hi' }, { t: `${sg(dis[n], 1)} с дисконтом`, x: 0.995, y: Math.max(0.05, ny(dis[n]) - 0.06), cls: 'r' }];
    if (f.payback) labels.push({ dot: '#13294B', x: f.payback / n, y: z }, { t: `окупаемость ${fmt(f.payback, 1)} года`, x: f.payback / n, y: z - 0.07 });
    const T = [['Тариф ±10 %', fin({ p: { tariff: p.tariff * 0.9 } }).npv, fin({ p: { tariff: p.tariff * 1.1 } }).npv], ['CAPEX ±10 %', fin({ kc: 1.1 }).npv, fin({ kc: 0.9 }).npv], ['Выработка ±5 %', fin({ ke: 0.95 }).npv, fin({ ke: 1.05 }).npv], ['Ставка ±2 п.п.', fin({ p: { rate: p.rate + 2 } }).npv, fin({ p: { rate: p.rate - 2 } }).npv], ['OPEX ±20 %', fin({ p: { opex: p.opex * 1.2 } }).npv, fin({ p: { opex: p.opex * 0.8 } }).npv]].map(t => [t[0], (t[1] - f.npv) / 1e9, (t[2] - f.npv) / 1e9]).sort((x, y) => (y[2] - y[1]) - (x[2] - x[1]));
    return `<div class="kpis">${kpi('NPV', sg(f.npv / 1e9, 2), 'млрд ₸', `при ставке ${fmt(p.rate, 1)} %`)}${kpi('IRR', f.irr != null ? fmt(f.irr * 100, 1) : '—', '%', f.irr == null ? 'не окупается' : f.irr * 100 >= p.rate ? 'выше ставки' : 'ниже ставки')}${kpi('Окупаемость', f.payback ? fmt(f.payback, 1) : '—', f.payback ? 'лет' : '', 'простая')}${kpi('LCOE', fmt(f.lcoe, 1), '₸/кВт·ч', '')}${kpi('Тариф безубыточности', fmt(be, 1), '₸/кВт·ч', 'NPV = 0')}${kpi('CAPEX без НДС', fmt(c.cost.net / 1e6, 2), 'млрд ₸', `${fmt(c.cost.perW)} ₸/Вт`)}</div>
      <div class="grid g3"><div class="card"><h2>Денежный поток <small>млрд ₸, ${p.years} лет</small></h2>${leg([['#F2B705', 'накопленный'], ['#0B6FC1', 'с дисконтированием']])}${PL({ paths: [{ d: path([[0, z], [1, z]]), stroke: '#8A95A5', w: 1 }, { d: path(dis.map((v, i) => [i / n, ny(v)])), stroke: '#0B6FC1' }, { d: path(cum.map((v, i) => [i / n, ny(v)])), stroke: '#F2B705', w: 2.2 }], labels, grid: [] })}${xax(['год 0', 'год ' + Math.round(n / 2), 'год ' + n], 'auto 1fr auto')}</div>
      <div class="card"><h2>Допущения</h2><div class="form">${fnum('fin.tariff', 'Тариф, ₸/кВт·ч', p.tariff, 0.5)}${fnum('fin.rate', 'Ставка дисконта, %', p.rate, 0.5)}${fnum('fin.opex', 'OPEX, % от CAPEX в год', p.opex, 0.1)}${fnum('fin.index', 'Индексация тарифа, %', p.index, 0.5)}${fnum('fin.degr', 'Деградация, % в год', p.degr, 0.05)}${fnum('fin.years', 'Срок, лет', p.years, 1)}${fnum('cost.k', 'CAPEX к смете, ±%', DB.cost.kSmr ?? 0, 1)}${fnum('fin.fx', 'Курс, ₸ за $', p.fx, 1)}</div><p class="note" style="margin-top:8px">Допущения общие для всех расчётов и сценариев.</p></div></div>
      <div class="card"><h2>Что сильнее влияет на NPV <small>изменение, млрд ₸</small></h2><table class="t"><tbody>${T.map(t => `<tr><td>${t[0]}</td><td class="n" style="color:var(--bad)">${sg(t[1], 2)}</td><td class="n" style="color:var(--ok)">${sg(t[2], 2)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function csv8760(r) { const H = r.H, out = ['час;дата;время;GHI, Вт/м2;POA, Вт/м2;T модуля, C;DC, кВт;AC, кВт;В сеть, кВт']; for (let i = 0; i < 8760; i++) { const d = new Date(Date.UTC(2025, 0, 1, i)); out.push([i + 1, d.toISOString().slice(0, 10), String(i % 24).padStart(2, '0') + ':00', H.ghi[i].toFixed(0), H.poa[i].toFixed(0), H.tc[i].toFixed(1), H.dc[i].toFixed(0), H.ac[i].toFixed(0), H.grid[i].toFixed(0)].join(';')); } return '﻿' + out.join('\n'); }
  function printSummary(p, pr) { const c = calc(p, pr), r = c.res, w = window.open('', '_blank'); if (!w) return toast('Браузер заблокировал окно печати');
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(p.name)} — ${esc(pr.name)}</title><style>body{font:13px/1.45 system-ui,sans-serif;color:#1D2939;max-width:760px;margin:24px auto;padding:0 20px}h1{font-size:20px;color:#13294B;margin:0}h2{font-size:14px;color:#13294B;margin:22px 0 6px;border-bottom:2px solid #F2B705;padding-bottom:3px}table{width:100%;border-collapse:collapse}td,th{padding:4px 6px;border-bottom:1px solid #E3E8EF;text-align:left}td:last-child,th:last-child{text-align:right}p{color:#5B6878}@media print{h2{break-after:avoid}}</style>
      <h1>${esc(p.name)}</h1><p>${esc(pr.name)} · ${esc(p.place || '')} · ${fmt(p.lat, 4)}°, ${fmt(p.lon, 4)}° · расчёт ${esc(pr.ran || '')}</p>
      <h2>Итоги года</h2><table><tr><td>Выработка P50</td><td>${fmt(r.energy / 1000, 2)} ГВт·ч</td></tr><tr><td>Выработка P90</td><td>${fmt(r.p90 / 1000, 2)} ГВт·ч</td></tr><tr><td>Удельная выработка</td><td>${fmt(r.spec)} кВт·ч/кВт</td></tr><tr><td>PR</td><td>${fmt(r.pr, 1)} %</td></tr><tr><td>КИУМ</td><td>${fmt(r.cf, 1)} %</td></tr><tr><td>Приход на горизонталь / в плоскости модулей</td><td>${fmt(r.ghi)} / ${fmt(r.poa)} кВт·ч/м²</td></tr></table>
      <h2>Станция</h2><table><tr><td>Мощность DC / AC</td><td>${fmt(r.dcKw / 1000, 2)} / ${fmt(r.acKw / 1000, 2)} МВт, DC/AC ${fmt(r.ratio, 2)}</td></tr><tr><td>Модуль</td><td>${esc(c.D.model)}, ${fmt(c.lay.mods)} шт</td></tr><tr><td>Инвертор</td><td>${esc(c.V.model)}, ${pr.plant.inv} шт</td></tr><tr><td>Крепление</td><td>${pr.plant.mount === 'fixed' ? 'неподвижные столы, наклон ' + pr.plant.tilt + '°' : 'одноосный трекер, ±' + pr.plant.limit + '°'}</td></tr><tr><td>Шаг рядов, плотность</td><td>${fmt(pr.plant.pitch, 2)} м, ${fmt(r.gcr * 100)} %</td></tr><tr><td>Погода</td><td>${esc(E.byId(E.WEATHER, pr.weather).name)}</td></tr><tr><td>Стоимость без НДС, LCOE</td><td>${fmt(c.cost.net / 1e6, 2)} млрд ₸, ${fmt(c.cost.lcoe, 1)} ₸/кВт·ч</td></tr></table>
      <h2>Выработка по месяцам, МВт·ч</h2><table><tr>${E.MON.map(m => `<th style="text-align:right">${m}</th>`).join('')}</tr><tr>${r.months.map(v => `<td style="text-align:right">${fmt(v)}</td>`).join('')}</tr></table>
      <h2>Дерево потерь</h2><table>${r.tree.map(t => `<tr><td>${t[1] == null ? '<b>' + t[0] + '</b>' : t[0]}</td><td>${t[1] == null ? '<b>' + fmt(t[2], 1) + ' ' + t[3] + '</b>' : sg(t[1], 2) + ' %'}</td></tr>`).join('')}</table>
      <p>Платформа ВИЭ. Почасовой расчёт, 8760 часов; погодный ряд синтезирован из месячных сумм источника.</p>`); w.document.close(); setTimeout(() => w.print(), 300); }

  /* ───────── сценарии ───────── */
  function scenOf(p) { return DB.scen[p.id] || (DB.scen[p.id] = { base: (p.preds[0] || {}).id, ac: 26.24, rows: [{ id: uid(), ratio: 1.14, gcr: 33 }, { id: uid(), ratio: 1.2, gcr: 33 }, { id: uid(), ratio: 1.25, gcr: 36 }, { id: uid(), ratio: 1.3, gcr: 38 }, { id: uid(), ratio: 1.35, gcr: 40 }], ran: false }); }
  function scenRun(p, S) { const base = pred(p, S.base) || { plant: PLANT0, sys: {}, sim: {}, weather: 'mn' }, V = E.byId(E.INVERTERS, base.plant.inverter), D = E.byId(E.MODULES, base.plant.module), inv = Math.max(1, Math.round(S.ac * 1000 / V.kw));
    return S.rows.map(row => { const plant = Object.assign({}, base.plant, { real: false, inv, ratio: row.ratio, pitch: D.len * base.plant.high / (row.gcr / 100) }), c = calc(p, { plant, sys: Object.assign({}, base.sys, { kva: 0 }), sim: base.sim, storage: null, weather: base.weather }); return { row, plant, c }; }); }
  function vScen(p) {
    const S = scenOf(p), base = pred(p, S.base), res = S.ran ? scenRun(p, S) : null, ok = res && res.filter(x => x.c.res), best = ok && ok.reduce((b, x) => !b || x.c.cost.lcoe < b.c.cost.lcoe ? x : b, null);
    const D = E.byId(E.MODULES, (base || { plant: PLANT0 }).plant.module), high = (base || { plant: PLANT0 }).plant.high, ex = exclOf(p), curve = []; for (let g = 25; g <= 60; g += 2.5) curve.push([g, E.layout(Object.assign({}, (base || { plant: PLANT0 }).plant, { pitch: D.len * high / (g / 100) }), p.boundary, ex).capMods * D.p / 1e6]);
    const mx = Math.max(...curve.map(q => q[1]), 1) * 1.1, nx = g => (g - 25) / 35, pts = S.rows.map(r => ({ dot: '#D23B2F', x: nx(Math.max(25, Math.min(60, r.gcr))), y: Math.min(1, S.ac * r.ratio / mx) * 0.92 }));
    page(`<div class="crumbs"><a href="#/projects">Проекты</a> / <a href="#/project/${p.id}">${esc(p.name)}</a> /</div>
      <div class="head"><div><h1>Сценарии</h1><p>Пакет вариантов на одном участке: для каждого строится своя расстановка, считаются выработка, стоимость и LCOE</p></div><div class="acts"><button class="btn pri" data-act="scen-run">Рассчитать все</button></div></div>
      <div class="grid g2"><div class="card"><h2>Задание</h2><div class="form"><label class="f w">Оборудование и допущения взять из расчёта<select id="sc-base">${p.preds.length ? opt(p.preds, S.base, x => x.name) : '<option>типовые: трекер, модуль 710 Вт</option>'}</select></label>${fnum('sc.ac', 'Целевая мощность AC, МВт', S.ac, 0.5)}</div>
        <table class="t" style="margin-top:12px"><thead><tr><th>№</th><th>DC/AC</th><th>Плотность рядов, %</th><th class="n">DC, МВт</th><th></th></tr></thead><tbody>${S.rows.map((r, i) => `<tr><td>${i + 1}</td><td><input type="number" data-sr="${r.id}" data-f="ratio" value="${r.ratio}" step="0.01" style="width:80px;border:1px solid var(--line);border-radius:6px;padding:4px 6px"></td><td><input type="number" data-sr="${r.id}" data-f="gcr" value="${r.gcr}" step="1" style="width:80px;border:1px solid var(--line);border-radius:6px;padding:4px 6px"></td><td class="n">${fmt(S.ac * r.ratio, 2)}</td><td class="n"><button class="x" data-srdel="${r.id}">×</button></td></tr>`).join('')}</tbody></table>
        <div class="acts" style="margin-top:10px"><button class="btn sm" data-act="scen-add">Добавить сценарий</button></div></div>
      <div class="card"><h2>Сколько помещается на участке <small>МВт DC</small></h2>${leg([['#0B6FC1', 'вместимость участка'], ['#D23B2F', 'сценарии']])}${PL({ cls: 'sm', paths: [{ d: path(curve.map(q => [nx(q[0]), q[1] / mx * 0.92])), stroke: '#0B6FC1', w: 2 }], labels: pts.concat([{ t: fmt(curve[curve.length - 1][1], 1) + ' МВт', x: 0.99, y: curve[curve.length - 1][1] / mx * 0.92 + 0.07, cls: 'r hi' }, { t: fmt(curve[0][1], 1), x: 0.01, y: curve[0][1] / mx * 0.92 + 0.08, cls: 'l' }]) })}${xax(['25 %', 'плотность рядов', '60 %'], 'auto 1fr auto')}<p class="note" style="margin-top:8px">Точка выше линии — столько на участок не войдёт: мощность будет меньше заданной.</p></div></div>
      <div class="card"><h2>Результаты ${res ? `<small>рассчитано ${res.length}</small>` : ''}</h2>${res ? `<div class="tw"><table class="t"><thead><tr><th>№</th><th class="n">Плотность,<br>%</th><th class="n">DC/AC</th><th class="n">DC,<br>МВт</th><th class="n">AC,<br>МВт</th><th class="n">Выработка,<br>ГВт·ч</th><th class="n">кВт·ч<br>на кВт</th><th class="n">Срез,<br>%</th><th class="n">Стоимость,<br>₸/Вт</th><th class="n">LCOE,<br>₸/кВт·ч</th><th class="n">Участок,<br>%</th><th></th></tr></thead><tbody>${res.map((x, i) => { const c = x.c, r = c.res; return r ? `<tr class="${x === best ? 'sel' : ''}"><td>${i + 1} ${x === best ? '<span class="tag best">лучший LCOE</span>' : ''}</td><td class="n">${fmt(r.gcr * 100)}</td><td class="n">${fmt(r.ratio, 2)}</td><td class="n" style="${c.fit ? '' : 'color:var(--bad)'}">${fmt(r.dcKw / 1000, 2)}</td><td class="n">${fmt(r.acKw / 1000, 2)}</td><td class="n">${fmt(r.energy / 1000, 1)}</td><td class="n">${fmt(r.spec)}</td><td class="n">${fmt(r.clip, 2)}</td><td class="n">${fmt(c.cost.perW)}</td><td class="n"><b>${fmt(c.cost.lcoe, 2)}</b></td><td class="n">${fmt(c.free ? c.lay.arrayHa / c.free * 100 : 0)}</td><td class="n"><button class="btn sm" data-mk="${i}">В расчёты</button></td></tr>` : `<tr><td>${i + 1}</td><td colspan="11" style="color:var(--bad)">столы не помещаются на участке</td></tr>`; }).join('')}</tbody></table></div><div class="acts" style="margin-top:10px"><button class="btn sm" data-act="scen-csv">Скачать таблицу CSV</button></div><p class="note" style="margin-top:8px">Красная мощность DC — на участок вошло меньше, чем задано. Стоимость — пересчёт смет проекта по укрупнённым долям, это оценка.</p>` : '<p class="note">Задайте сценарии и нажмите «Рассчитать все».</p>'}</div>`);
    ui.scenRes = res;
  }

  /* ───────── библиотеки и журнал ───────── */
  function vLib() {
    const k = R.id || 'weather'; let body = '';
    if (k === 'weather') { const mx = Math.max(...E.WEATHER.flatMap(w => w.ghi)) * 1.1, cols = ['#13294B', '#0B6FC1', '#8A95A5', '#F2B705'], paths = []; E.WEATHER.forEach((w, i) => w.ghi.forEach((v, m) => paths.push({ rect: [m / 12 + 0.008 + i * 0.018, 0, 0.016, v / mx * 0.92], fill: cols[i] })));
      const base = E.WEATHER[0], bs = base.ghi.reduce((a, b) => a + b, 0);
      body = `<div class="card"><div class="tw"><table class="t"><thead><tr><th>Источник</th><th>Период</th><th class="n">Приход на горизонталь,<br>кВт·ч/м² в год</th><th class="n">К проектному</th><th class="n">Рассеянная,<br>%</th><th class="n">Температура,<br>°C</th><th>Происхождение</th></tr></thead><tbody>${E.WEATHER.map(w => { const g = w.ghi.reduce((a, b) => a + b, 0), d = w.dhi.reduce((a, b) => a + b, 0), t = w.tamb.reduce((a, b, i) => a + b * E.DAYS[i], 0) / 365; return `<tr><td><b>${esc(w.name)}</b><small>${esc(w.note)}</small></td><td>${esc(w.kind)}</td><td class="n">${fmt(g)}</td><td class="n">${w === base ? '—' : sg((g / bs - 1) * 100) + ' %'}</td><td class="n">${fmt(d / g * 100)}</td><td class="n">${fmt(t, 1)}</td><td><span class="tag ${w.src === 'демо-данные' ? 'demo' : 'ok'}">${esc(w.src)}</span></td></tr>`; }).join('')}</tbody></table></div></div>
        <div class="card"><h2>Приход на горизонталь по месяцам <small>кВт·ч/м²</small></h2>${leg(E.WEATHER.map((w, i) => [cols[i], w.name]))}${PL({ paths })}${xax(E.MON)}</div><p class="note">Источник выбирается на странице расчёта. Почасовой ряд на 8760 часов строится из месячных сумм: каждому дню назначается своя облачность, суммы за месяц сохраняются.</p>`; }
    if (k === 'modules') body = `<div class="card"><div class="tw"><table class="t"><thead><tr><th>Модуль</th><th>Технология</th><th class="n">Мощность,<br>Вт</th><th class="n">Voc / Vmp,<br>В</th><th class="n">Isc / Imp,<br>А</th><th class="n">Темп. коэф.,<br>%/°C</th><th class="n">Размер,<br>мм</th><th class="n">Двусторон-<br>ность</th><th>Происхождение</th></tr></thead><tbody>${E.MODULES.map(m => `<tr><td><b>${esc(m.model)}</b><small>${esc(m.maker)}</small></td><td>${esc(m.tech)}</td><td class="n">${m.p}</td><td class="n">${fmt(m.voc, 1)} / ${fmt(m.vmp, 1)}</td><td class="n">${fmt(m.isc, 2)} / ${fmt(m.imp, 2)}</td><td class="n">${fmt(m.muP, 2)}</td><td class="n">${fmt(m.len * 1000)} × ${fmt(m.wid * 1000)}</td><td class="n">${m.bif ? fmt(m.bif * 100) + ' %' : 'нет'}</td><td><span class="tag ${m.src === 'демо-данные' ? 'demo' : 'ok'}">${esc(m.src)}</span></td></tr>`).join('')}</tbody></table></div></div><p class="note">По паспортным точкам для каждого модуля подбирается однодиодная модель: она даёт мощность при любой освещённости и температуре.</p>`;
    if (k === 'inverters') body = `<div class="card"><div class="tw"><table class="t"><thead><tr><th>Инвертор</th><th>Тип</th><th class="n">Мощность AC,<br>кВт</th><th class="n">Макс. КПД,<br>%</th><th class="n">Напряжение DC,<br>В</th><th>Происхождение</th></tr></thead><tbody>${E.INVERTERS.map(m => `<tr><td><b>${esc(m.model)}</b><small>${esc(m.maker)}</small></td><td>${esc(m.kind)}</td><td class="n">${fmt(m.kw)}</td><td class="n">${fmt(m.eff, 1)}</td><td class="n">${fmt(m.vdc)}</td><td><span class="tag ${m.src === 'демо-данные' ? 'demo' : 'ok'}">${esc(m.src)}</span></td></tr>`).join('')}</tbody></table></div></div>`;
    page(`<div class="head"><div><h1>Библиотека: ${{ weather: 'погода', modules: 'модули', inverters: 'инверторы' }[k]}</h1><p>Оборудование и погодные ряды, из которых собираются расчёты</p></div></div>${body}`);
  }
  function vLog() { page(`<div class="head"><div><h1>Журнал расчётов</h1><p>Запуски почасового расчёта на этом компьютере</p></div></div><div class="card"><table class="t"><thead><tr><th>Когда</th><th>Проект</th><th>Расчёт</th><th class="n">Выработка, ГВт·ч</th><th class="n">Время счёта</th><th>Статус</th></tr></thead><tbody>${DB.log.map(l => `<tr><td>${esc(l.t)}</td><td>${esc(l.p)}</td><td>${esc(l.n)}</td><td class="n">${l.e ? fmt(l.e / 1000, 2) : '—'}</td><td class="n">${l.ms ? fmt(l.ms) + ' мс' : '—'}</td><td><span class="tag ok">${esc(l.s)}</span></td></tr>`).join('')}</tbody></table></div>`); }

  /* ───────── события ───────── */
  document.addEventListener('click', ev => {
    const q = s => ev.target.closest(s), p = R.pid && proj(R.pid), pr = p && pred(p, R.id); let b;
    if ((b = q('[data-clone]'))) { ev.stopPropagation(); const src = pred(p, b.dataset.clone), n = JSON.parse(JSON.stringify(src)); n.id = uid(); n.name = src.name + ', копия'; n.plant.real = false; n.status = 'draft'; p.preds.push(n); persist(); return go(`/pred/${p.id}/${n.id}`); }
    if ((b = q('[data-del]'))) { ev.stopPropagation(); if (confirm('Удалить расчёт?')) { p.preds = p.preds.filter(x => x.id !== b.dataset.del); persist(); route(); } return; }
    if ((b = q('[data-go]'))) return go(b.dataset.go);
    if ((b = q('[data-tab]'))) { ui.tab = b.dataset.tab; return vResults(p, pr); }
    if ((b = q('[data-inc]'))) { ui.inc = b.dataset.inc; return vResults(p, pr); }
    if ((b = q('[data-base]'))) { setBase(b.dataset.base); $$('#b-base button').forEach(x => x.classList.toggle('on', x === b)); return; }
    if ((b = q('[data-pop]'))) { ui.pop = ui.pop === b.dataset.pop ? null : (b.dataset.pop || null); return bPop(p, pr); }
    if ((b = q('[data-zdel]'))) { p.zones = p.zones.filter(z => z.id !== b.dataset.zdel); touch(pr); return bAll(p, pr); }
    if ((b = q('[data-srdel]'))) { const S = scenOf(p); S.rows = S.rows.filter(r => r.id !== b.dataset.srdel); persist(); return vScen(p); }
    if ((b = q('[data-mk]'))) { const x = ui.scenRes[+b.dataset.mk], base = pred(p, scenOf(p).base) || { sys: {}, sim: {}, weather: 'mn' }, n = { id: uid(), name: `Сценарий DC/AC ${fmt(x.row.ratio, 2)}, плотность ${fmt(x.row.gcr)} %`, status: 'done', ran: now(), weather: base.weather, plant: x.plant, sys: Object.assign({}, base.sys, { kva: 0 }), sim: base.sim, storage: null }; p.preds.push(n); persist(); return go(`/pred/${p.id}/${n.id}`); }
    if (!(b = q('[data-act]'))) return; const act = b.dataset.act;
    if (act === 'new-project') { $('#np').hidden = false; $('#np-name').focus(); }
    else if (act === 'create-project') { const s = +$('#np-size').value || 800, n = { id: uid(), name: $('#np-name').value || 'Новая площадка', place: 'Свой проект', lat: +$('#np-lat').value, lon: +$('#np-lon').value, tz: +$('#np-tz').value || 5, status: 'Черновик', boundary: rect(s, s), zones: [], preds: [] }; if (!isFinite(n.lat) || !isFinite(n.lon)) return toast('Проверьте координаты'); DB.projects.push(n); persist(); go('/project/' + n.id); }
    else if (act === 'new-pred') { const n = { id: uid(), name: 'Расчёт ' + (p.preds.length + 1), status: 'draft', weather: 'mn', plant: Object.assign({}, PLANT0), sys: {}, sim: {}, storage: null }; p.preds.push(n); persist(); go(`/pred/${p.id}/${n.id}`); }
    else if (act === 'run') runPred(p, pr);
    else if (act === 'tog-stor') { pr.storage = pr.storage ? null : { p: 10, e: 20, mode: 'cut' }; touch(pr); vPred(p, pr); }
    else if (act === 'tog-sys') $('#sys-form').hidden = !$('#sys-form').hidden;
    else if (act === 'tog-sim') $('#sim-form').hidden = !$('#sim-form').hidden;
    else if (act === 'draw-b' || act === 'draw-z') { ui.draw = { kind: act === 'draw-b' ? 'b' : 'z', pts: [] }; ui.pop = null; bAll(p, pr); }
    else if (act === 'fin-line') finishDraw(p, pr, 'line'); else if (act === 'fin-poly') finishDraw(p, pr, 'poly'); else if (act === 'fin-cancel') { ui.draw = null; bAll(p, pr); }
    else if (act === 'kml') { const c = calc(p, pr, true); save(`${p.id}-${pr.id}.kml`, toKml(p, pr, c.lay), 'application/vnd.google-earth.kml+xml'); }
    else if (act === 'dxf') { const c = calc(p, pr, true); save(`${p.id}-${pr.id}.dxf`, toDxf(p, c.lay), 'application/dxf'); }
    else if (act === 'bom-csv') { const c = calc(p, pr, true); save(`vedomost-${pr.id}.csv`, '﻿Позиция;Количество;Ед.\n' + E.bom(pr.plant, c.lay).map(r => r.join(';')).join('\n'), 'text/csv'); }
    else if (act === 'print') window.print();
    else if (act === 'rep-print') printSummary(p, pr);
    else if (act === 'rep-8760') save(`8760-${pr.id}.csv`, csv8760(calc(p, pr).res), 'text/csv');
    else if (act === 'scen-add') { const S = scenOf(p), l = S.rows[S.rows.length - 1] || { ratio: 1.2, gcr: 35 }; S.rows.push({ id: uid(), ratio: +(l.ratio + 0.05).toFixed(2), gcr: l.gcr }); persist(); vScen(p); }
    else if (act === 'scen-run') { scenOf(p).ran = true; persist(); vScen(p); toast('Сценарии рассчитаны'); }
    else if (act === 'scen-csv') save(`scenarii-${p.id}.csv`, '﻿№;Плотность, %;DC/AC;DC, МВт;AC, МВт;Выработка, ГВт·ч;кВт·ч на кВт;Срез, %;Стоимость, тг/Вт;LCOE, тг/кВт·ч\n' + ui.scenRes.filter(x => x.c.res).map((x, i) => [i + 1, (x.c.res.gcr * 100).toFixed(0), x.c.res.ratio.toFixed(2), (x.c.res.dcKw / 1000).toFixed(2), (x.c.res.acKw / 1000).toFixed(2), (x.c.res.energy / 1000).toFixed(2), x.c.res.spec.toFixed(0), x.c.res.clip.toFixed(2), x.c.cost.perW.toFixed(0), x.c.cost.lcoe.toFixed(2)].join(';')).join('\n'), 'text/csv');
  });
  const setIn = (ev) => {
    const t = ev.target, p = R.pid && proj(R.pid), pr = p && pred(p, R.id);
    if (t.id === 'pr-name') { pr.name = t.value; persist(); return; }
    if (t.id === 'pr-wx') { pr.weather = t.value; touch(pr); return vPred(p, pr); }
    if (t.id === 'ch-day') { ui.day = +t.value; return vResults(p, pr); }
    if (t.id === 'sc-base') { scenOf(p).base = t.value; persist(); return vScen(p); }
    if (t.dataset.var) { ui.vars[t.dataset.var] = t.checked; return vResults(p, pr); }
    if (t.dataset.layer) { ui.layers[t.dataset.layer] = t.checked; return bDraw(p, pr); }
    if (t.dataset.zon) { p.zones.find(z => z.id === t.dataset.zon).on = t.checked; touch(pr); bSide(p, pr); bDraw(p, pr); return bStats(p, pr); }
    if (t.dataset.zname) { p.zones.find(z => z.id === t.dataset.zname).name = t.value; persist(); return; }
    if (t.dataset.zset) { p.zones.find(z => z.id === t.dataset.zset).setback = Math.max(0, +t.value || 0); touch(pr); bSide(p, pr); bDraw(p, pr); return bStats(p, pr); }
    if (t.dataset.sr) { const row = scenOf(p).rows.find(r => r.id === t.dataset.sr), v = parseFloat(t.value); if (isFinite(v)) { row[t.dataset.f] = v; persist(); if (ev.type === 'change') vScen(p); } return; }
    const k = t.dataset.k; if (!k) return; const v = t.type === 'checkbox' ? t.checked : t.tagName === 'SELECT' && isNaN(+t.value) ? t.value : parseFloat(t.value); if (t.type === 'number' && !isFinite(v)) return;
    if (k === 'sc.ac') { scenOf(p).ac = v; persist(); if (ev.type === 'change') vScen(p); return; }
    if (k.startsWith('fin.')) { DB.fin[k.slice(4)] = v; persist(); memo.clear(); if (ev.type === 'change') vResults(p, pr); return; }
    if (k === 'cost.k') { DB.cost.kSmr = v; DB.cost.kEquip = v; persist(); memo.clear(); if (ev.type === 'change') vResults(p, pr); return; }
    if (k.startsWith('sys.')) { pr.sys[k.slice(4)] = v; touch(pr); if (ev.type === 'change') { vPred(p, pr); $('#sys-form').hidden = false; } return; }
    if (k.startsWith('sim.')) { pr.sim[k.slice(4)] = v; touch(pr); if (ev.type === 'change') { vPred(p, pr); $('#sim-form').hidden = false; } return; }
    if (k.startsWith('st.')) { pr.storage[k.slice(3)] = v; touch(pr); if (ev.type === 'change') vPred(p, pr); return; }
    /* параметры станции в конструкторе */
    const P = pr.plant, D = E.byId(E.MODULES, P.module);
    if (k === 'gcr') P.pitch = +(D.len * P.high / (v / 100)).toFixed(3);
    else if (k === 'high') { const g = D.len * P.high / P.pitch; P.high = +v; P.pitch = +(D.len * P.high / g).toFixed(3); }
    else if (k === 'module') { const g = D.len * P.high / P.pitch; P.module = v; P.pitch = +(E.byId(E.MODULES, v).len * P.high / g).toFixed(3); }
    else if (k === 'inverter') { const ac = P.inv * E.byId(E.INVERTERS, P.inverter).kw; P.inverter = v; P.inv = Math.max(1, Math.round(ac / E.byId(E.INVERTERS, v).kw)); }
    else if (k === 'mount') { P.mount = v; if (v === 'fixed') { P.high = 2; P.pitch = +(D.len * 2 / 0.45).toFixed(2); } else { P.high = 1; P.pitch = +(D.len / 0.33).toFixed(2); } }
    else P[k] = ['wide', 'inv', 'ns'].includes(k) ? Math.round(+v) : v;
    P.real = false; touch(pr);
    if (ev.type === 'change' || t.tagName === 'SELECT' || t.type === 'checkbox') bSide(p, pr); bDraw(p, pr); bStats(p, pr);
  };
  document.addEventListener('input', setIn); document.addEventListener('change', setIn);
  addEventListener('resize', () => { if (map) map.invalidateSize(); });
  if (!location.hash) location.hash = '/projects'; route();
  window.__design = { DB: () => DB, calc, proj, pred, go, ui };
})();
