/* Общая оболочка разделов: верхняя строка с этапами жизненного цикла станции и общие помощники интерфейса. */
(function () {
  const S = window.STORE, fmt = (v, d = 0) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const SUN = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#16233B" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="9" r="3.2"/><path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4"/></svg>';
  const STAGES = [['design', 'Проектирование', 'design.html'], ['build', 'Строительство', 'construct.html'], ['ops', 'Эксплуатация', 'index.html#ops'], ['cost', 'Смета', 'index.html#cost']];
  function top(cur) {
    const a = S.activeCalc(), el = document.getElementById('top'); if (!el) return;
    el.innerHTML = `<a class="brand glass" href="design.html#/projects"><div class="brand-mark">${SUN}</div><div><b>Платформа ВИЭ</b><span>${a ? esc(a.p.name) : 'Проекты'}</span></div></a>
      <nav class="tabs glass" aria-label="Этап">${STAGES.map(s => `<a href="${s[2]}" class="${s[0] === cur ? 'on' : ''}">${s[1]}</a>`).join('')}</nav>
      ${a ? `<div class="chip glass"><span>Расчёт:</span><b>${esc(a.pr.name)}</b><span>${a.c.res ? fmt(a.c.res.energy / 1000, 1) + ' ГВт·ч' : ''}</span></div>` : ''}`;
  }
  const toast = t => { let el = document.getElementById('toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); } el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 2600); };
  const save = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
  /* графики: растянутый SVG, подписи обычными элементами поверх */
  const X = v => (v * 1000).toFixed(1), Y = v => (100 - v * 100).toFixed(1), path = pts => pts.length ? 'M' + pts.map(p => X(p[0]) + ',' + Y(p[1])).join('L') : '';
  function PL(o) {
    const svg = (o.paths || []).map(p => p.rect ? `<rect x="${X(p.rect[0])}" y="${Y(p.rect[1] + p.rect[3])}" width="${(p.rect[2] * 1000).toFixed(1)}" height="${(Math.max(0, p.rect[3]) * 100).toFixed(1)}" rx="2" fill="${p.fill}"/>` : `<path d="${p.d}${p.area ? `L${X(p.area[1])},100L${X(p.area[0])},100Z` : ''}" fill="${p.fill || 'none'}" stroke="${p.stroke || 'none'}" stroke-width="${p.w || 1.6}" ${p.dash ? `stroke-dasharray="${p.dash}"` : ''} vector-effect="non-scaling-stroke"/>`).join('');
    const grid = (o.grid || [0.25, 0.5, 0.75, 1]).map(g => `<path d="M0,${Y(g * (o.top || 0.92))}L1000,${Y(g * (o.top || 0.92))}" stroke="rgba(19,41,75,.08)" stroke-width="1" vector-effect="non-scaling-stroke"/>`).join('');
    const lab = (o.labels || []).map(l => l.dot ? `<i style="left:${(l.x * 100).toFixed(1)}%;top:${(100 - l.y * 100).toFixed(1)}%;background:${l.dot}"></i>` : `<span class="${l.cls || ''}" style="left:${(l.x * 100).toFixed(1)}%;top:${(100 - l.y * 100).toFixed(1)}%">${l.t}</span>`).join('');
    return `<div class="pl ${o.cls || ''}"><svg viewBox="0 0 1000 100" preserveAspectRatio="none"><path d="M0,100L1000,100" stroke="rgba(19,41,75,.25)" stroke-width="1" vector-effect="non-scaling-stroke"/>${grid}${svg}</svg>${lab}</div>`;
  }
  const xax = (labels, tpl) => `<div class="xax" style="grid-template-columns:${tpl || `repeat(${labels.length},minmax(0,1fr))`}">${labels.map((l, i) => `<span style="text-align:${!tpl ? 'center' : i === 0 ? 'left' : i === labels.length - 1 ? 'right' : 'center'}">${l}</span>`).join('')}</div>`;
  const leg = items => `<div class="leg">${items.map(c => `<span><i style="background:${c[0]}"></i>${c[1]}</span>`).join('')}</div>`;
  const kpi = (l, v, u, s) => `<div class="kpi"><label>${l}</label><b>${v}<small>${u || ''}</small></b>${s ? `<span>${s}</span>` : ''}</div>`;
  /* карта: открытые подложки */
  const BASES = { sat: ['Спутник', 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', 18, 'Снимки: Esri, Maxar, Earthstar Geographics'], osm: ['Схема', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', 19, '© участники OpenStreetMap'], topo: ['Рельеф', 'https://tile.opentopomap.org/{z}/{x}/{y}.png', 17, '© OpenTopoMap, участники OpenStreetMap'], dark: ['Чертёж', '', 0, ''] };
  const REF = ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'];
  function setBase(map, id) { const L = window.L, b = BASES[id]; (map._vieLayers || []).forEach(l => map.removeLayer(l)); map._vieLayers = []; map._vieBase = id; if (!b[1]) return;
    const base = L.tileLayer(b[1], { maxZoom: 20, maxNativeZoom: b[2], attribution: b[3] }).addTo(map); base.bringToBack(); map._vieLayers.push(base);
    if (id === 'sat') REF.forEach((u, i) => map._vieLayers.push(L.tileLayer(u, { maxZoom: 20, maxNativeZoom: 18, opacity: i ? 1 : 0.8 }).addTo(map))); }
  window.UI = { fmt, esc, top, toast, save, PL, xax, leg, kpi, path, BASES, setBase, sg: (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), d) };
})();
