/* Земляные работы: модель рельефа площадки (исходная поверхность, проектная планировка, поверхность на дату облёта),
   карта изменения высот, объёмы выемки и насыпи по блокам, ливень с размывом, сваи с подмывом.
   Съёмки высот с дрона в проекте нет: поверхности построены расчётной моделью, все объёмы считаются по ним на сетке 10 м. */
(function () {
  const FENX = (SITE.field.x0 - 102 + SITE.field.x1 + 48) / 2, FENZ = (SITE.field.z0 - 72 + SITE.field.z1 + 56) / 2;
  const BX = [SITE.field.x0 - 102 - FENX, SITE.field.x1 + 48 - FENX], BZ = [SITE.field.z0 - 72 - FENZ, SITE.field.z1 + 56 - FENZ];   // ограждение, местные метры
  const FX = [SITE.field.x0 - FENX, SITE.field.x1 - FENX], FZ = [SITE.field.z0 - FENZ, SITE.field.z1 - FENZ];
  const RD = SITE.roads, RW = RD.west - FENX, RE = RD.east - FENX, RN = RD.north - FENZ, RS = RD.south - FENZ;
  const BAS = { x: BX[0] + 50, z: 150, w: 52, h: 150, depth: 1.6, name: 'Пруд-накопитель ливневых вод' };
  const STORM = 96, STORM_END = 103, FIXED = 124, CELL = 10;
  const cl = v => Math.max(0, Math.min(1, v)), sm = v => v * v * (3 - 2 * v);
  /* исходный рельеф и проектная планировка */
  const base = (x, z) => 62 + 0.004 * x - 0.006 * z, big = (x, z) => 0.45 * Math.sin(x / 140 + 1.3) * Math.cos(z / 170), mid = (x, z) => 0.25 * Math.sin(x / 47 + z / 61), fine = (x, z) => 0.12 * Math.sin(x / 19 - z / 23);
  const z0 = (x, z) => base(x, z) + big(x, z) + mid(x, z) + fine(x, z);
  const road = (x, z) => { const d = Math.min(Math.abs(x - RW), Math.abs(x - RE), Math.abs(z - RN), Math.abs(z - RS)); return d < 3 ? 1 : d < 7 ? 1 - (d - 3) / 4 : 0; };
  const basin = (x, z) => sm(cl((BAS.w / 2 - Math.abs(x - BAS.x)) / 10)) * sm(cl((BAS.h / 2 - Math.abs(z - BAS.z)) / 10));
  const zd = (x, z) => base(x, z) + 0.55 * big(x, z) + 0.15 * mid(x, z) + 0.25 * road(x, z) - BAS.depth * basin(x, z);
  /* размыв после ливня: промоины вдоль уклона и конусы выноса в низинах */
  const CH = [[60, -250, -150, 40, 17, 0.5], [250, -80, 40, 250, 15, 0.42], [-40, 60, -290, 300, 19, 0.55], [300, 150, 180, 372, 14, 0.38], [-200, -300, -340, -120, 15, 0.4]];
  function erosion(x, z) { let e = 0; for (const c of CH) { const dx = c[2] - c[0], dz = c[3] - c[1], L2 = dx * dx + dz * dz, t = cl(((x - c[0]) * dx + (z - c[1]) * dz) / L2), px = c[0] + t * dx, pz = c[1] + t * dz, wob = 6 * Math.sin(t * 9 + c[4]), d = Math.hypot(x - px - wob * dz / Math.sqrt(L2), z - pz + wob * dx / Math.sqrt(L2));
      e -= c[5] * (0.35 + 0.65 * t) * Math.exp(-(d / c[4]) * (d / c[4])); const r = Math.hypot(x - c[2], z - c[3]); e += 0.3 * Math.exp(-(r / 38) * (r / 38)); } return e; }
  const stormK = d => d < STORM ? 0 : d <= STORM_END ? 1 : d >= FIXED ? 0 : 1 - (d - STORM_END) / (FIXED - STORM_END);
  /* зоны: четыре блока станции, остальное — проезды и периметр */
  const ZC = [1, 2, 3, 4].map(k => { const tt = SITE.trackers.filter(t => t[2] === k); return [tt.reduce((s, t) => s + t[0], 0) / tt.length - FENX, tt.reduce((s, t) => s + t[1], 0) / tt.length - FENZ]; }), ORDER = { 1: 0, 3: 1, 2: 2, 4: 3 };
  const zoneOf = (x, z) => { if (basin(x, z) > 0.02) return 5; if (x < FX[0] - 6 || x > FX[1] + 6 || z < FZ[0] - 6 || z > FZ[1] + 6) return 0; let b = 0, bd = 1e9; ZC.forEach((c, i) => { const d = (x - c[0]) * (x - c[0]) + (z - c[1]) * (z - c[1]); if (d < bd) { bd = d; b = i + 1; } }); return b; };
  const inside = (x, z) => x >= BX[0] && x <= BX[1] && z >= BZ[0] && z <= BZ[1];
  let PROG = null;   // доля выполнения планировки по станции на день d — из графика работ
  const zprog = (k, d) => { const f = PROG(d); return k === 5 ? cl((d - 24) / 46) * (f > 0 ? 1 : 0) : k === 0 ? cl(f * 1.15) : cl(f * 4.4 - ORDER[k] * 1.05); };
  const act = (x, z, d) => z0(x, z) + zprog(zoneOf(x, z), d) * (zd(x, z) - z0(x, z)) + stormK(d) * erosion(x, z);
  /* сетка и объёмы */
  const GRID = []; for (let x = BX[0] + CELL / 2; x < BX[1]; x += CELL) for (let z = BZ[0] + CELL / 2; z < BZ[1]; z += CELL) { const a = z0(x, z), b = zd(x, z); GRID.push([x, z, zoneOf(x, z), b - a, erosion(x, z)]); }
  const A = CELL * CELL, ZN = ['Проезды и периметр', 'Блок КТП-1', 'Блок КТП-2', 'Блок КТП-3', 'Блок КТП-4', BAS.name];
  const PLAN = ZN.map((n, k) => { let cut = 0, fill = 0; GRID.forEach(g => { if (g[2] === k) { if (g[3] < 0) cut -= g[3] * A; else fill += g[3] * A; } }); return { cut, fill }; });
  const memo = {};
  function report(d) { if (memo[d]) return memo[d]; const p = ZN.map((n, k) => zprog(k, d)), sk = stormK(d), rows = ZN.map((name, k) => ({ k, name, cut: PLAN[k].cut * p[k], fill: PLAN[k].fill * p[k], pcut: PLAN[k].cut, pfill: PLAN[k].fill, prog: p[k], ecut: 0, efill: 0 }));
    GRID.forEach(g => { const e = g[4] * sk * A; if (e < 0) rows[g[2]].ecut -= e; else rows[g[2]].efill += e; });
    const tot = rows.reduce((s, r) => ({ cut: s.cut + r.cut, fill: s.fill + r.fill, pcut: s.pcut + r.pcut, pfill: s.pfill + r.pfill, ecut: s.ecut + r.ecut, efill: s.efill + r.efill }), { cut: 0, fill: 0, pcut: 0, pfill: 0, ecut: 0, efill: 0 }); tot.prog = (tot.cut + tot.fill) / (tot.pcut + tot.pfill);
    return memo[d] = { rows, tot, storm: sk }; }
  const scour = d => { const sk = stormK(d), out = []; if (sk > 0) SITE.trackers.forEach((t, i) => { const e = -erosion(t[0] - FENX, t[1] - FENZ) * sk; if (e > 0.12) out.push({ t: i, e }); }); return out.sort((a, b) => b.e - a.e); };
  const stormVolume = () => { let v = 0; GRID.forEach(g => v += Math.abs(g[4]) * A); return v; };

  /* ── карта высот ── */
  const BINS = [[-1, '#b3261e', 'ниже 1 м'], [-0.5, '#e5553a', '−1…−0,5 м'], [-0.2, '#f0913f', '−0,5…−0,2 м'], [-0.05, '#ffd43b', '−0,2…−0,05 м'], [0.05, null, 'без изменений'], [0.2, '#8fe3ff', '+0,05…+0,2 м'], [0.5, '#7fb6ff', '+0,2…+0,5 м'], [1, '#3b6fd6', '+0,5…+1 м'], [1e9, '#1f3f9a', 'выше 1 м']];
  const colorOf = v => { for (const b of BINS) if (v < b[0]) return b[1]; return null; };
  const ui = { mode: 'chg', a: null, b: null }; let CTX = null, map = null, heat = null, pins = null;
  const value = (x, z) => ui.mode === 'chg' ? act(x, z, ui.b) - act(x, z, ui.a) : ui.mode === 'dev' ? act(x, z, ui.b) - zd(x, z) : zd(x, z) - z0(x, z);
  function heatLayer() { const G = CTX.G, Lyr = L.GridLayer.extend({ createTile(c) { const cv = document.createElement('canvas'), ts = this.getTileSize(), m = this._map; cv.width = ts.x; cv.height = ts.y; const g = cv.getContext('2d'), S = c.z >= 18 ? 4 : c.z >= 16 ? 3 : 2;
        const corner = (px, py) => { const q = m.unproject(L.point(c.x * ts.x + px, c.y * ts.y + py), c.z); return G.fromLL(q.lat, q.lng); }, p00 = corner(0, 0), p11 = corner(ts.x, ts.y);
        for (let i = 0; i < ts.x; i += S) for (let j = 0; j < ts.y; j += S) { const x = p00[0] + (p11[0] - p00[0]) * (i + S / 2) / ts.x, z = p00[1] + (p11[1] - p00[1]) * (j + S / 2) / ts.y; if (!inside(x, z)) continue; const col = colorOf(value(x, z)); if (col) { g.fillStyle = col; g.fillRect(i, j, S, S); } }
        return cv; } }); return new Lyr({ opacity: 0.82, maxZoom: 21, updateWhenZooming: false, keepBuffer: 1 }); }
  const FL = () => Array.from({ length: Math.floor(EPC.MAXD / 7) + 1 }, (_, i) => i * 7);
  function refresh() {
    const { fmt, fday, fdate, kpi, tName, esc } = CTX, R = report(ui.b), RA = report(ui.a), sc = scour(ui.b), m3 = v => fmt(Math.round(v / 10) * 10);
    if (heat) map.removeLayer(heat); heat = heatLayer().addTo(map); pins.clearLayers();
    L.polygon([[BX[0], BZ[0]], [BX[1], BZ[0]], [BX[1], BZ[1]], [BX[0], BZ[1]]].map(q => CTX.ll(q[0], q[1])), { color: '#f5b544', weight: 2, fill: false, dashArray: '8 5', interactive: false }).addTo(pins);
    L.polygon([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(q => CTX.ll(BAS.x + q[0] * BAS.w / 2, BAS.z + q[1] * BAS.h / 2)), { color: '#fff', weight: 1.5, fill: false, interactive: false }).bindTooltip(BAS.name, { className: 'lbl' }).addTo(pins);
    sc.slice(0, 60).forEach(s => L.circleMarker(CTX.ll(SITE.trackers[s.t][0] - FENX, SITE.trackers[s.t][1] - FENZ), { radius: 5, color: '#fff', weight: 1.5, fillColor: '#ff4fe0', fillOpacity: 1 }).bindTooltip(`${tName(s.t)}: размыв у свай до ${fmt(s.e * 100)} см`, { className: 'lbl' }).addTo(pins));
    const fl = v => FL().map(f => `<option value="${f}" ${f === v ? 'selected' : ''}>${fdate(f)}</option>`).join(''), bas = R.rows[5];
    document.getElementById('cv-kpi').innerHTML = kpi('Планировка', fmt(R.tot.prog * 100, 1), '%', `на ${fday(ui.b)}`) + kpi('Выемка', m3(R.tot.cut), 'м³', `по проекту ${m3(R.tot.pcut)}`) + kpi('Насыпь', m3(R.tot.fill), 'м³', `по проекту ${m3(R.tot.pfill)}`) + kpi('Баланс грунта', (R.tot.fill - R.tot.cut > 0 ? '+' : '−') + m3(Math.abs(R.tot.fill - R.tot.cut)), 'м³', R.tot.fill - R.tot.cut > 0 ? 'нужен привозной грунт' : 'излишек на вывоз') + kpi('Размыв после ливня', R.storm ? m3(R.tot.ecut + R.tot.efill) : '0', 'м³', R.storm ? (R.storm < 1 ? 'идёт восстановление' : 'не устранён') : ui.b < STORM ? 'ливня ещё не было' : 'устранён') + kpi('Столов с подмывом свай', fmt(sc.length), '', sc.length ? `до ${fmt(sc[0].e * 100)} см` : 'нет');
    document.getElementById('cv-bar').innerHTML = `<div class="seg">${[['chg', 'Изменение между облётами'], ['dev', 'Отклонение от проекта'], ['plan', 'Проект: выемка и насыпь']].map(x => `<button class="${ui.mode === x[0] ? 'on' : ''}" data-cv="mode:${x[0]}">${x[1]}</button>`).join('')}</div>
      ${ui.mode === 'chg' ? `<label class="f" style="min-width:140px">Облёт «было»<select id="cv-a">${fl(ui.a)}</select></label>` : ''}${ui.mode !== 'plan' ? `<label class="f" style="min-width:140px">${ui.mode === 'chg' ? 'Облёт «стало»' : 'Облёт'}<select id="cv-b">${fl(ui.b)}</select></label>` : ''}
      <div class="acts"><button class="btn sm" data-cv="preset:91:98">Ливень: до и после</button><button class="btn sm" data-cv="preset:98:126">Восстановление</button><button class="btn sm" data-cv="preset:0:70">Вся планировка</button></div>`;
    document.getElementById('cv-leg').innerHTML = `<b style="font:500 12.5px var(--display)">${ui.mode === 'chg' ? 'Изменение высоты' : ui.mode === 'dev' ? 'Факт минус проект' : 'Проект минус исходная'}</b>` + BINS.filter(b => b[1]).map(b => `<span style="white-space:nowrap"><i style="display:inline-block;width:11px;height:11px;border-radius:3px;background:${b[1]};vertical-align:-1px;margin-right:5px"></i>${b[2]}</span>`).join('') + `<span class="note">красное — срезано или размыто, синее — насыпано</span>`;
    const dA = k => RA.rows[k], row = r => `<tr><td><b>${r.name}</b></td><td class="n">${m3(r.cut)}</td><td class="n">${m3(r.fill)}</td><td class="n">${m3(r.cut + r.fill)}</td><td class="n">${m3(r.cut + r.fill - dA(r.k).cut - dA(r.k).fill)}</td><td class="n">${m3(r.pcut + r.pfill)}</td><td class="n"><span style="display:inline-block;width:70px;height:6px;border-radius:3px;background:rgba(255,255,255,.13);vertical-align:middle;margin-right:6px"><span style="display:block;height:100%;border-radius:3px;background:${r.prog >= 0.999 ? '#62d6a0' : '#f5b544'};width:${(r.prog * 100).toFixed(0)}%"></span></span>${fmt(r.prog * 100)} %</td><td class="n ${r.ecut + r.efill > 1 ? 'bad' : ''}">${r.ecut + r.efill > 1 ? m3(r.ecut + r.efill) : '—'}</td></tr>`;
    document.getElementById('cv-rep').innerHTML = `<h2>Отчёт по земляным работам <small>поверхность на ${fdate(ui.b)} против исходной; период — с ${fday(ui.a)}</small></h2><div class="tw"><table class="t"><thead><tr><th>Зона</th><th class="n">Выемка, м³</th><th class="n">Насыпь, м³</th><th class="n">Всего, м³</th><th class="n">За период, м³</th><th class="n">По проекту, м³</th><th class="n">Готово</th><th class="n">Размыв, м³</th></tr></thead><tbody>${[1, 3, 2, 4, 5, 0].map(k => row(R.rows[k])).join('')}<tr><td><b>Итого</b></td><td class="n"><b>${m3(R.tot.cut)}</b></td><td class="n"><b>${m3(R.tot.fill)}</b></td><td class="n"><b>${m3(R.tot.cut + R.tot.fill)}</b></td><td class="n"><b>${m3(R.tot.cut + R.tot.fill - RA.tot.cut - RA.tot.fill)}</b></td><td class="n"><b>${m3(R.tot.pcut + R.tot.pfill)}</b></td><td class="n"><b>${fmt(R.tot.prog * 100, 1)} %</b></td><td class="n">${R.storm ? m3(R.tot.ecut + R.tot.efill) : '—'}</td></tr></tbody></table></div>
      <p class="note" style="margin-top:8px">Объёмы считаются разностью поверхностей на сетке ${CELL} м. «За период» — объём, перемещённый между двумя выбранными облётами: им проверяется месячный акт подрядчика. Планировка — первая часть работы «Планировка, проезды, ограждение» в графике: там на эту дату ${fmt(PROG(ui.b) * 100)} %, остальное — проезды и ограждение.</p>`;
    document.getElementById('cv-side').innerHTML = `<div class="card"><h2>${BAS.name}</h2><div class="g4" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:8px 0">${kpi('Вынуто', m3(bas.cut), 'м³', `по проекту ${m3(bas.pcut)}`)}${kpi('Готовность', fmt(bas.prog * 100), '%', bas.prog >= 0.999 ? 'готов' : 'в работе')}</div>
        <p class="note ${ui.b >= STORM || bas.prog >= 0.999 ? '' : 'bad'}">${bas.prog >= 0.999 ? `Пруд закончен ${fday(70)}: к ливню ${fday(STORM)} водоотвод работал.` : `Пруд должен быть готов до сезона дождей. Сейчас ${fmt(bas.prog * 100)} %.`}</p></div>
      <div class="card"><h2>Подмыв свай <small>${sc.length ? fmt(sc.length) + ' столов' : ''}</small></h2>${sc.length ? `<table class="t"><thead><tr><th>Стол</th><th>Блок</th><th class="n">Размыв</th></tr></thead><tbody>${sc.slice(0, 8).map(s => `<tr><td><b>${tName(s.t)}</b></td><td>КТП-${SITE.trackers[s.t][2]}</td><td class="n bad">${fmt(s.e * 100)} см</td></tr>`).join('')}</tbody></table>${sc.length > 8 ? `<p class="note" style="margin-top:6px">Показаны 8 из ${fmt(sc.length)}; все отмечены на карте.</p>` : ''}<div class="acts" style="margin-top:8px"><button class="btn sm" data-cv="qc">Завести замечания по первым 8</button></div>` : `<p class="note">${ui.b < STORM ? 'Размывов нет.' : 'Размывы у свай устранены.'}</p>`}</div>
      <div class="card"><h2>Событие</h2><p class="note"><b style="color:var(--text)">Ливень ${fdate(STORM)}.</b> Промоины вдоль уклона и вынос грунта в низины: ${m3(stormVolume())} м³. Восстановление планировки — до ${fday(FIXED)}.</p><div class="acts" style="margin-top:8px"><a class="btn sm" href="#chg" data-go="chg">Изменения и претензии</a><button class="btn sm" data-ev="${STORM - 5}:${STORM + 2}">Снимки до и после</button></div></div>`;
  }
  function view(ctx) {
    CTX = ctx; PROG = d => ctx.prog('civil', d, 0)[1]; Object.keys(memo).forEach(k => delete memo[k]);
    if (ui.b == null) { ui.b = Math.floor(ctx.st.day / 7) * 7; ui.a = Math.max(0, ui.b - 7); }
    document.getElementById('main').innerHTML = `<div class="page">${ctx.head()}<div id="cv-kpi" class="g4" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px"></div>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(250px,320px);gap:12px;align-items:start" class="cv-grid">
        <div><div class="card" style="padding:12px"><div id="cv-bar" style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px"></div>
          <div style="position:relative;height:520px;border-radius:14px;overflow:hidden;border:1px solid var(--line)"><div id="cv-map" style="position:absolute;inset:0"></div></div><div id="cv-leg" style="display:flex;gap:4px 14px;flex-wrap:wrap;align-items:center;font-size:12px;margin-top:10px"></div>
          <p class="note" style="margin-top:8px">Нажмите на карту, чтобы узнать отметки в точке.</p></div><div class="card" id="cv-rep"></div></div>
        <div id="cv-side"></div></div></div>`;
    if (map) { try { map.remove(); } catch (e) {} map = null; heat = null; } if (!window.L) return;
    map = L.map('cv-map', { zoomControl: true, preferCanvas: true, zoomSnap: 0.25, attributionControl: true }); map.attributionControl.setPrefix(false); ctx.U.setBase(map, 'sat'); (map._vieLayers || []).slice(1).forEach(l => map.removeLayer(l));
    pins = L.layerGroup().addTo(map); map.invalidateSize(); map.fitBounds(L.latLngBounds([ctx.ll(BX[0], BZ[0]), ctx.ll(BX[1], BZ[1])]), { padding: [14, 14], animate: false });
    map.on('click', ev => { const p = ctx.G.fromLL(ev.latlng.lat, ev.latlng.lng); if (!inside(p[0], p[1])) return; const a = z0(p[0], p[1]), d = zd(p[0], p[1]), f = act(p[0], p[1], ui.b), k = zoneOf(p[0], p[1]), f2 = v => ctx.fmt(v, 2);
      L.popup({ className: 'cvpop' }).setLatLng(ev.latlng).setContent(`<b>${ZN[k]}</b><br>Исходная отметка: ${f2(a)} м<br>Проектная: ${f2(d)} м<br>На ${ctx.fday(ui.b)}: ${f2(f)} м<br>До проекта: ${f - d > 0 ? 'срезать' : 'досыпать'} ${ctx.fmt(Math.abs(f - d) * 100)} см`).openOn(map); });
    refresh();
  }
  document.addEventListener('click', ev => { const b = ev.target.closest('[data-cv]'); if (!b || !CTX) return; const [a, x, y] = b.dataset.cv.split(':');
    if (a === 'mode') ui.mode = x; else if (a === 'preset') { ui.a = +x; ui.b = +y; ui.mode = 'chg'; }
    else if (a === 'qc') { const sc = scour(ui.b).slice(0, 8); sc.forEach(s => CTX.addQc(s.t, 'piles', `Размыв грунта у свай после ливня, до ${CTX.fmt(s.e * 100)} см: восстановить планировку`)); return CTX.toast(`Заведено замечаний: ${sc.length}`); }
    refresh(); });
  document.addEventListener('change', ev => { const t = ev.target; if (!CTX || (t.id !== 'cv-a' && t.id !== 'cv-b')) return; ui[t.id === 'cv-a' ? 'a' : 'b'] = +t.value; if (ui.mode === 'chg' && ui.a > ui.b) { const k = ui.a; ui.a = ui.b; ui.b = k; } refresh(); });
  window.CIVIL = { view, report: d => { if (!PROG) return null; return report(d); }, scour, stormVolume, STORM, FIXED, z0, zd };
})();
