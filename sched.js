/* Обмен данными раздела «Строительство»: разбор графиков (Primavera P6 XER и XML, MS Project XML, CSV),
   расчёт запаса и критического пути по связям работ, выгрузка плана, загрузка факта с площадки по элементам. */
(function () {
  const KEY = 'vie-sched-v1', FKEY = 'vie-fact-v1', DAY = 864e5;
  const dnum = s => { if (!s) return null; s = String(s).trim(); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY; m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/); if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]) / DAY; return null; };
  const iso = n => new Date(n * DAY).toISOString().slice(0, 10), ru = n => n == null ? '—' : new Date(n * DAY).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(' г.', '');
  const TYPES = { PR_FS: 'FS', PR_SS: 'SS', PR_FF: 'FF', PR_SF: 'SF' };

  /* ── Primavera P6, файл XER: таблицы %T, поля %F, строки %R, разделитель — табуляция ── */
  function parseXER(text) {
    const T = {}; let cur = null, F = null;
    text.split(/\r?\n/).forEach(line => { const c = line.split('\t'); if (c[0] === '%T') { cur = c[1]; T[cur] = []; F = null; } else if (c[0] === '%F') F = c.slice(1); else if (c[0] === '%R' && cur && F) { const r = {}; F.forEach((f, i) => r[f] = c[i + 1] ?? ''); T[cur].push(r); } });
    if (!T.TASK || !T.TASK.length) throw new Error('В файле нет таблицы работ TASK');
    const wbs = Object.fromEntries((T.PROJWBS || []).map(w => [w.wbs_id, w.wbs_name || w.wbs_short_name]));
    const tasks = T.TASK.map(r => { const s = dnum(r.target_start_date) ?? dnum(r.early_start_date) ?? dnum(r.act_start_date), e = dnum(r.target_end_date) ?? dnum(r.early_end_date) ?? dnum(r.act_end_date);
      return { id: r.task_id, code: r.task_code, name: r.task_name, wbs: wbs[r.wbs_id] || '', s, e, as: dnum(r.act_start_date), ae: dnum(r.act_end_date), pct: r.phys_complete_pct === '' || r.phys_complete_pct == null ? null : +r.phys_complete_pct, tf: r.total_float_hr_cnt === '' || r.total_float_hr_cnt == null ? null : +r.total_float_hr_cnt / 8, ms: /Mile/.test(r.task_type || '') }; });
    const rels = (T.TASKPRED || []).map(r => ({ p: r.pred_task_id, s: r.task_id, type: TYPES[r.pred_type] || 'FS', lag: (+r.lag_hr_cnt || 0) / 8 }));
    return { src: 'Primavera P6 (XER)', name: (T.PROJECT && T.PROJECT[0] && T.PROJECT[0].proj_short_name) || '', tasks, rels };
  }
  /* ── XML: Primavera P6 (Activity, Relationship) или MS Project (Task, PredecessorLink) ── */
  function parseXML(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml'); if (doc.getElementsByTagName('parsererror').length) throw new Error('Файл XML повреждён');
    const all = n => [...doc.getElementsByTagName('*')].filter(e => e.localName === n), val = (e, n) => { const c = [...e.children].find(x => x.localName === n); return c ? c.textContent.trim() : ''; };
    const acts = all('Activity').filter(a => val(a, 'Id') || val(a, 'Name'));
    if (acts.length) { const P6T = { 'Finish to Start': 'FS', 'Start to Start': 'SS', 'Finish to Finish': 'FF', 'Start to Finish': 'SF' };
      const tasks = acts.map(a => ({ id: val(a, 'ObjectId') || val(a, 'Id'), code: val(a, 'Id'), name: val(a, 'Name'), wbs: '', s: dnum(val(a, 'PlannedStartDate')) ?? dnum(val(a, 'StartDate')), e: dnum(val(a, 'PlannedFinishDate')) ?? dnum(val(a, 'FinishDate')), as: dnum(val(a, 'ActualStartDate')), ae: dnum(val(a, 'ActualFinishDate')), pct: val(a, 'PercentComplete') === '' ? null : +val(a, 'PercentComplete') * (+val(a, 'PercentComplete') <= 1 ? 100 : 1), tf: null, ms: /Milestone/.test(val(a, 'Type')) }));
      const rels = all('Relationship').map(r => ({ p: val(r, 'PredecessorActivityObjectId'), s: val(r, 'SuccessorActivityObjectId'), type: P6T[val(r, 'Type')] || 'FS', lag: (+val(r, 'Lag') || 0) / 8 }));
      return { src: 'Primavera P6 (XML)', name: (all('Project')[0] && val(all('Project')[0], 'Name')) || '', tasks, rels }; }
    const ts = all('Task').filter(t => val(t, 'UID') && val(t, 'Name') && val(t, 'Summary') !== '1'); if (!ts.length) throw new Error('В XML не найдены работы: ожидаются элементы Activity или Task');
    const MT = ['FF', 'FS', 'SF', 'SS'], tasks = [], rels = [];
    ts.forEach(t => { const id = val(t, 'UID'); tasks.push({ id, code: val(t, 'WBS') || id, name: val(t, 'Name'), wbs: '', s: dnum(val(t, 'Start')), e: dnum(val(t, 'Finish')), as: dnum(val(t, 'ActualStart')), ae: dnum(val(t, 'ActualFinish')), pct: val(t, 'PercentComplete') === '' ? null : +val(t, 'PercentComplete'), tf: null, ms: val(t, 'Milestone') === '1' });
      [...t.children].filter(c => c.localName === 'PredecessorLink').forEach(l => rels.push({ p: val(l, 'PredecessorUID'), s: id, type: MT[+val(l, 'Type')] || 'FS', lag: (+val(l, 'LinkLag') || 0) / 4800 })); });
    return { src: 'MS Project (XML)', name: (all('Project')[0] && (val(all('Project')[0], 'Title') || val(all('Project')[0], 'Name'))) || '', tasks, rels };
  }
  /* ── CSV: код; название; начало; окончание; предшественники (коды через запятую, можно с типом: A100SS+5) ── */
  function parseCSV(text) {
    const rows = text.replace(/^﻿/, '').split(/\r?\n/).filter(r => r.trim()).map(r => r.split(r.includes(';') ? ';' : ',').map(c => c.trim())); if (rows.length < 2) throw new Error('В файле нет строк с работами');
    const tasks = [], rels = []; rows.slice(dnum(rows[0][2]) == null ? 1 : 0).forEach(c => { if (dnum(c[2]) == null || dnum(c[3]) == null) return; tasks.push({ id: c[0], code: c[0], name: c[1], wbs: '', s: dnum(c[2]), e: dnum(c[3]), as: null, ae: null, pct: c[5] ? +c[5] : null, tf: null });
      (c[4] || '').split(/[,\s]+/).filter(Boolean).forEach(p => { const m = p.match(/^(.*?)(FS|SS|FF|SF)?([+-]\d+)?$/); rels.push({ p: m[1], s: c[0], type: m[2] || 'FS', lag: +(m[3] || 0) }); }); });
    if (!tasks.length) throw new Error('Не разобрал даты: нужны столбцы «код; название; начало; окончание; предшественники»');
    return { src: 'CSV', name: '', tasks, rels };
  }
  function parse(name, text) { const sc = /\.xer$/i.test(name) || /^ERMHDR/.test(text) ? parseXER(text) : /\.xml$/i.test(name) || /^\s*</.test(text) ? parseXML(text) : parseCSV(text);
    sc.tasks = sc.tasks.filter(t => t.s != null && t.e != null); sc.tasks.forEach(t => { t.e += 1; if (t.ae != null) t.ae += 1; }); if (!sc.tasks.length) throw new Error('У работ в файле нет дат начала и окончания'); const ids = new Set(sc.tasks.map(t => t.id)); sc.rels = sc.rels.filter(r => ids.has(r.p) && ids.has(r.s) && r.p !== r.s); sc.file = name; return cpm(sc); }
  /* ── запас и критический путь: обратный проход по связям от окончания проекта; даты файла приняты как ранние ── */
  function cpm(sc) {
    const T = Object.fromEntries(sc.tasks.map(t => [t.id, t])), end = Math.max(...sc.tasks.map(t => t.e)), start = Math.min(...sc.tasks.map(t => t.s)), succ = {}; sc.rels.forEach(r => (succ[r.p] = succ[r.p] || []).push(r));
    const memo = {}, state = {}; let cyc = false;
    const lf = id => { if (memo[id] != null) return memo[id]; if (state[id]) { cyc = true; return end; } state[id] = 1; const t = T[id]; let v = end;
      (succ[id] || []).forEach(r => { const s = T[r.s], sl = lf(r.s), ss = sl - (s.e - s.s); v = Math.min(v, r.type === 'FS' ? ss - r.lag : r.type === 'SS' ? ss - r.lag + (t.e - t.s) : r.type === 'FF' ? sl - r.lag : sl - r.lag + (t.e - t.s)); }); state[id] = 0; return memo[id] = v; };
    sc.tasks.forEach(t => { t.lf = lf(t.id); t.f = t.lf - t.e; t.float = t.tf != null ? t.tf : t.f; t.crit = t.float <= 0.5; });
    sc.start = start; sc.end = end; sc.cyc = cyc; sc.nCrit = sc.tasks.filter(t => t.crit).length; sc.own = sc.tasks.some(t => t.tf != null); return sc;
  }
  /* ── сопоставление работ файла с работами платформы по названию ── */
  const MATCH = { civil: /планиров|проезд|огражд|дорог|civil|road|fenc|grading/i, piles: /сва[йяи]|pile|pier/i, track: /трекер|tracker|torque|стол/i, mods: /модул|панел|module|panel/i, dc: /стринг|постоянн|string|\bdc\b/i, inv: /инвертор|inverter/i, ac: /0[.,]8\s*кв|переменн|\bac\b|низковольт/i, ktp: /ктп|подстанц|трансформ|substation|transformer/i, mv: /35\s*кв|заземл|связ|\bmv\b|medium/i, pnr: /пусконалад|пнр|испытан|commission|energiz/i };
  function compare(sc) { return EPC.ACT.map(a => { const m = sc.tasks.filter(t => MATCH[a.id].test(t.name) && !t.ms); if (!m.length) return { a, n: 0 }; const s = Math.min(...m.map(t => t.s)), e = Math.max(...m.map(t => t.e)), ps = EPC.DAY0 / DAY + a.s, pe = EPC.DAY0 / DAY + a.e; return { a, n: m.length, s, e, ds: Math.round(s - ps), de: Math.round(e - pe), crit: m.some(t => t.crit) }; }); }

  /* ── выгрузка плана платформы в XER: работы, связи, факт на дату ── */
  const LOGIC = [['civil', 'piles', 'FF', 0], ['piles', 'track', 'SS', 14], ['track', 'mods', 'SS', 18], ['mods', 'dc', 'SS', 14], ['mods', 'dc', 'FF', 18], ['dc', 'pnr', 'FS', 0], ['inv', 'ac', 'SS', 5], ['inv', 'ac', 'FF', 12], ['ac', 'pnr', 'FF', 38], ['ktp', 'mv', 'FF', 30], ['mv', 'pnr', 'FF', 23]];
  function exportXER(ctx) {
    const d0 = EPC.DAY0 / DAY, dt = (n, h) => iso(d0 + n) + (h ? ' 17:00' : ' 08:00'), row = a => '%R\t' + a.join('\t'), L = [];
    L.push(['ERMHDR', '19.12', iso(Date.now() / DAY), 'Project', 'platform', 'Platforma VIE', 'dbxDatabaseNoName', 'Project Management', 'KZT'].join('\t'));
    L.push('%T\tPROJECT', '%F\tproj_id\tproj_short_name\tplan_start_date\tplan_end_date', row([1, 'ARAL-30', dt(0), dt(EPC.PD, 1)]));
    L.push('%T\tPROJWBS', '%F\twbs_id\tproj_id\twbs_short_name\twbs_name\tparent_wbs_id\tproj_node_flag', row([10, 1, 'ARAL-30', 'СЭС Арал 30 МВт', '', 'Y']));
    L.push('%T\tTASK', '%F\ttask_id\tproj_id\twbs_id\ttask_code\ttask_name\ttask_type\tstatus_code\tphys_complete_pct\ttarget_drtn_hr_cnt\ttarget_start_date\ttarget_end_date\tact_start_date\tact_end_date');
    EPC.ACT.forEach((a, i) => { const sp = ctx.span(a), pc = ctx.prog(a.id, ctx.st.day, 0)[1], st = pc >= 0.9995 ? 'TK_Complete' : ctx.st.day >= sp[0] ? 'TK_Active' : 'TK_NotStart'; L.push(row([100 + i, 1, 10, 'A' + (1000 + i * 10), a.name, 'TT_Task', st, (pc * 100).toFixed(1), Math.round((a.e - a.s) * 8), dt(a.s), dt(a.e - 1, 1), st === 'TK_NotStart' ? '' : dt(Math.round(sp[0])), st === 'TK_Complete' ? dt(Math.round(sp[1]) - 1, 1) : ''])); });
    const ix = Object.fromEntries(EPC.ACT.map((a, i) => [a.id, 100 + i]));
    L.push('%T\tTASKPRED', '%F\ttask_pred_id\ttask_id\tpred_task_id\tproj_id\tpred_proj_id\tpred_type\tlag_hr_cnt'); LOGIC.forEach((r, i) => L.push(row([500 + i, ix[r[1]], ix[r[0]], 1, 1, 'PR_' + r[2], r[3] * 8]))); L.push('%E');
    return L.join('\r\n');
  }
  /* ── факт с площадки по элементам: CSV «работа; элемент; начало; окончание» ── */
  const PER = () => EPC.ACT.filter(a => a.per), elName = (a, i) => a.per === 'tracker' ? 'T-' + String(i + 1).padStart(3, '0') : a.per === 'inv' ? 'INV-' + String(i + 1).padStart(2, '0') : 'KTP-' + (i + 1);
  function factCSV() { const d0 = EPC.DAY0 / DAY, L = ['﻿работа;элемент;начало;окончание']; PER().forEach(a => { const f = EPC.fact[a.id]; for (let i = 0; i < f.e.length; i++) L.push([a.id, elName(a, i), iso(d0 + Math.round(f.s[i])), iso(d0 + Math.round(f.e[i]))].join(';')); }); return L.join('\r\n'); }
  function loadFact(text) { const d0 = EPC.DAY0 / DAY, byName = Object.fromEntries(PER().map(a => [a.name.toLowerCase(), a.id])), cur = JSON.parse(localStorage.getItem(FKEY) || '{}'); let ok = 0, bad = 0, same = 0;
    text.replace(/^﻿/, '').split(/\r?\n/).filter(r => r.trim()).forEach((r, k) => { const c = r.split(r.includes(';') ? ';' : ',').map(x => x.trim()), id = EPC.fact[c[0]] ? c[0] : byName[(c[0] || '').toLowerCase()], m = (c[1] || '').match(/(\d+)\s*$/), s = dnum(c[2]), e = dnum(c[3]); if (k === 0 && s == null && !id) return;
      if (!id || !m || s == null || e == null || e < s) return void bad++; const i = +m[1] - 1, f = EPC.fact[id]; if (i < 0 || i >= f.e.length) return void bad++; const a = Math.max(0, Math.min(EPC.MAXD - 5, s - d0)), b = Math.max(a, Math.min(EPC.MAXD - 5, e - d0));
      if (Math.abs(a - Math.round(f.s[i])) < 0.5 && Math.abs(b - Math.round(f.e[i])) < 0.5) return void same++; (cur[id] = cur[id] || {})[i] = [a, b]; ok++; });
    if (ok) localStorage.setItem(FKEY, JSON.stringify(cur)); return { ok, bad, same }; }
  const factCount = () => { try { return Object.values(JSON.parse(localStorage.getItem(FKEY) || '{}')).reduce((s, o) => s + Object.keys(o).length, 0); } catch (e) { return 0; } };
  /* ── полная выгрузка состояния стройки для внешних систем ── */
  function stateJSON(ctx) { const d = ctx.st.day, o = ctx.overall(d, 0), m = EPC.metrics(d);
    return JSON.stringify({ format: 'vie-construction/1', project: ctx.P.name, date: iso(EPC.DAY0 / DAY + d), progress: { plan_pct: +o.plan.toFixed(2), fact_pct: +o.fact.toFixed(2), spi: +m.spi.toFixed(3), forecast_finish: iso(EPC.DAY0 / DAY + Math.round(m.forecast)) },
      activities: EPC.ACT.map(a => { const r = ctx.prog(a.id, d, 0), sp = ctx.span(a); return { id: a.id, name: a.name, unit: a.unit, qty: a.qty, plan_start: iso(EPC.DAY0 / DAY + a.s), plan_finish: iso(EPC.DAY0 / DAY + a.e), fact_start: iso(EPC.DAY0 / DAY + Math.round(sp[0])), forecast_finish: iso(EPC.DAY0 / DAY + Math.round(sp[1])), plan_pct: +(r[0] * 100).toFixed(1), fact_pct: +(r[1] * 100).toFixed(1) }; }),
      tables: SITE.trackers.map((t, i) => { const s = EPC.trackerState(i, d); return { id: elName({ per: 'tracker' }, i), block: t[2], piles: s.piles, tracker: s.tube, modules: s.mods, strings: s.dc, late_days: Math.round(s.late) }; }),
      qc: ctx.qcList(d).map(q => ({ n: q.n, table: elName({ per: 'tracker' }, q.t), text: q.text, severity: q.sev, status: q.status, assignee: q.who })) }, null, 1); }

  /* ── экран ── */
  const get = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  async function readFile(f) { const buf = await f.arrayBuffer(); let t = new TextDecoder('utf-8').decode(buf); if (t.includes('�')) t = new TextDecoder('windows-1251').decode(buf); return t; }
  let CTX = null, q = '';
  function view(ctx) {
    CTX = ctx; const { esc, fmt } = ctx, sc = get(), nf = factCount(), E = document.getElementById('main');
    const io = (t, d, btn) => `<div class="sec" style="grid-template-columns:minmax(0,1fr) auto"><div><b>${t}</b><div class="note">${d}</div></div><div class="acts">${btn}</div></div>`;
    let imp = '';
    if (sc) { const len = Math.max(1, sc.end - sc.start), x = v => ((v - sc.start) / len * 100).toFixed(2), cmp = compare(sc), list = sc.tasks.filter(t => !q || (t.name + ' ' + t.code + ' ' + t.wbs).toLowerCase().includes(q)).sort((a, b) => a.s - b.s || a.e - b.e), shown = list.slice(0, 150);
      imp = `<div class="card"><h2>Загруженный график <small>${esc(sc.file)} · ${esc(sc.src)}</small></h2>
        <div class="g4" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:10px 0">${[['Работ', fmt(sc.tasks.length), ''], ['Связей', fmt(sc.rels.length), sc.cyc ? 'есть циклы' : ''], ['Начало', ru(sc.start), ''], ['Окончание', ru(sc.end - 1), ''], ['На критическом пути', fmt(sc.nCrit), sc.own ? 'запас из файла' : 'запас посчитан по связям']].map(k => ctx.kpi(k[0], k[1], '', k[2])).join('')}</div>
        ${sc.rels.length ? '' : '<p class="note bad">В файле нет связей между работами: критический путь по нему определить нельзя, запас показан до окончания проекта.</p>'}
        <h3 style="font:500 14px var(--display);margin:14px 0 6px">Сверка с планом платформы</h3>
        <div class="tw"><table class="t"><thead><tr><th>Работа платформы</th><th class="n">Работ в файле</th><th class="n">Начало в файле</th><th class="n">Окончание в файле</th><th class="n">Сдвиг начала</th><th class="n">Сдвиг окончания</th><th>Критический путь</th></tr></thead><tbody>${cmp.map(c => c.n ? `<tr><td><b>${c.a.name}</b></td><td class="n">${c.n}</td><td class="n">${ru(c.s)}</td><td class="n">${ru(c.e - 1)}</td><td class="n ${Math.abs(c.ds) > 2 ? 'bad' : ''}">${c.ds > 0 ? '+' : ''}${c.ds} дн.</td><td class="n ${Math.abs(c.de) > 2 ? 'bad' : ''}">${c.de > 0 ? '+' : ''}${c.de} дн.</td><td>${c.crit ? '<span class="tag bad">да</span>' : '<span class="tag">нет</span>'}</td></tr>` : `<tr><td><b>${c.a.name}</b></td><td class="n">0</td><td colspan="5" class="note">в файле не найдено работ с похожим названием</td></tr>`).join('')}</tbody></table></div>
        <p class="note" style="margin-top:6px">Работы файла привязаны к работам платформы по словам в названии. Сдвиг — разница с базовым планом платформы. План платформы файл не заменяет.</p>
        <h3 style="font:500 14px var(--display);margin:16px 0 6px">Работы из файла</h3><div class="acts" style="margin-bottom:8px"><input id="int-q" placeholder="Поиск по названию, коду, разделу" value="${esc(q)}" style="background:var(--tile);border:1px solid var(--line);border-radius:999px;padding:7px 14px;min-width:260px"><button class="btn sm danger" data-int="drop">Убрать загруженный график</button></div>
        <div class="tw"><table class="t"><thead><tr><th>Код</th><th>Работа</th><th style="width:34%">${ru(sc.start)} — ${ru(sc.end - 1)}</th><th class="n">Начало</th><th class="n">Окончание</th><th class="n">Готово</th><th class="n">Запас</th></tr></thead><tbody>${shown.map(t => `<tr><td>${esc(t.code)}</td><td><b>${esc(t.name)}</b>${t.wbs ? `<div class="note">${esc(t.wbs)}</div>` : ''}</td><td><div style="position:relative;height:18px"><span style="position:absolute;top:5px;height:8px;border-radius:4px;min-width:3px;background:${t.crit ? '#ff6452' : '#7fb6ff'};left:${x(t.s)}%;width:${(x(t.e) - x(t.s)).toFixed(2)}%"></span></div></td><td class="n">${ru(t.s)}</td><td class="n">${ru(t.e - 1)}</td><td class="n">${t.pct == null ? '—' : fmt(t.pct) + ' %'}</td><td class="n ${t.crit ? 'bad' : ''}">${fmt(t.float)} дн.</td></tr>`).join('')}</tbody></table></div>
        ${list.length > shown.length ? `<p class="note" style="margin-top:6px">Показаны первые ${shown.length} из ${fmt(list.length)} работ. Уточните поиск.</p>` : ''}</div>`; }
    E.innerHTML = `<div class="page">${ctx.head()}
      <div class="card"><h2>График работ</h2>
        ${io('Загрузить график', 'Primavera P6 (XER или XML), MS Project (XML) или CSV «код; название; начало; окончание; предшественники». Файл разбирается в браузере и никуда не отправляется.', '<label class="btn sm pri" style="cursor:pointer">Выбрать файл<input type="file" id="int-sched" accept=".xer,.xml,.csv,.txt" hidden></label>')}
        ${io('Выгрузить план платформы в Primavera', `Файл XER: ${EPC.ACT.length} работ, ${LOGIC.length} связей, факт и процент готовности на выбранную дату.`, '<button class="btn sm" data-int="xer">Скачать XER</button>')}
        <p class="note" id="int-msg" style="margin-top:8px"></p></div>
      ${imp}
      <div class="card"><h2>Факт с площадки ${nf ? `<small>загружено правок: ${fmt(nf)}</small>` : ''}</h2>
        ${io('Выгрузить факт по элементам', 'CSV: работа, элемент (стол, инвертор, КТП), дата начала и окончания. Этот же файл служит шаблоном для загрузки.', '<button class="btn sm" data-int="fact-out">Скачать CSV</button>')}
        ${io('Загрузить факт', 'Строки с изменёнными датами заменяют факт по этим элементам: пересчитываются готовность, карта, снимки, освоение и прогноз.', `<label class="btn sm pri" style="cursor:pointer">Выбрать файл<input type="file" id="int-fact" accept=".csv,.txt" hidden></label>${nf ? '<button class="btn sm danger" data-int="fact-drop">Сбросить правки</button>' : ''}`)}
        <p class="note" id="int-fmsg" style="margin-top:8px"></p></div>
      <div class="card"><h2>Данные для других систем</h2>
        ${io('Состояние стройки на дату', 'JSON: готовность по работам, состояние каждого стола, замечания. Подходит для BI, учётной системы или своей отчётности.', '<button class="btn sm" data-int="json">Скачать JSON</button>')}
        ${io('Отчёт по блокам и замечания', 'CSV-выгрузки на экранах «Отчёты» и «Качество».', '')}
        ${io('Геометрия станции', 'KML, DXF и ведомость — в конструкторе раздела «Проектирование».', '<a class="btn sm" href="design.html">Открыть</a>')}</div>
      <div class="card"><h2>Чего пока нет</h2><p class="note">Обмен идёт файлами. Прямых подключений нет: сервер Primavera, учётная система, облачные сервисы съёмки с дронов, SCADA. Для них нужен серверный контур платформы; данные сейчас хранятся в браузере.</p></div></div>`;
  }
  document.addEventListener('change', async ev => { const t = ev.target; if (!CTX || !t.files || !t.files[0]) return;
    if (t.id === 'int-sched') { try { const sc = parse(t.files[0].name, await readFile(t.files[0])); localStorage.setItem(KEY, JSON.stringify(sc)); q = ''; view(CTX); CTX.toast(`График загружен: ${sc.tasks.length} работ`); } catch (e) { document.getElementById('int-msg').innerHTML = `<span class="bad" style="color:var(--bad)">Не удалось разобрать файл: ${CTX.esc(e.message)}</span>`; } }
    if (t.id === 'int-fact') { const r = loadFact(await readFile(t.files[0])); if (r.ok) { CTX.toast(`Факт обновлён по ${r.ok} элементам`); setTimeout(() => { location.hash = 'int'; location.reload(); }, 700); } else document.getElementById('int-fmsg').textContent = `Изменений не найдено: совпадает с текущим фактом ${r.same}, не разобрано строк ${r.bad}.`; } });
  document.addEventListener('input', ev => { if (ev.target.id === 'int-q' && CTX) { q = ev.target.value.trim().toLowerCase(); view(CTX); const el = document.getElementById('int-q'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); } });
  document.addEventListener('click', ev => { const b = ev.target.closest('[data-int]'); if (!b || !CTX) return; const a = b.dataset.int;
    if (a === 'xer') CTX.save('aral-30-plan.xer', exportXER(CTX), 'text/plain'); else if (a === 'fact-out') CTX.save('fakt-po-elementam.csv', factCSV(), 'text/csv'); else if (a === 'json') CTX.save('stroyka-sostoyanie.json', stateJSON(CTX), 'application/json');
    else if (a === 'drop') { localStorage.removeItem(KEY); view(CTX); } else if (a === 'fact-drop') { localStorage.removeItem(FKEY); location.hash = 'int'; location.reload(); } });
  window.SCHED = { parse, parseXER, parseXML, parseCSV, cpm, compare, exportXER, factCSV, loadFact, stateJSON, view, get };
})();
