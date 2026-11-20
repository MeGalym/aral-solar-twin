/* Стадия эксплуатации: ранние признаки отказов, датчики и метеостанции, накопитель, история простоев за 30 дней.
   Всё в этом файле — демо-данные и сценарии: рядов с действующей станции в проекте нет. */
(function () {
  const SITE = window.SITE, F = SITE.field;
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ───────── ранние признаки отказов: ряд за 60 дней, линейный тренд, порог, дата ───────── */
  const HIST = 60;
  const PRED = [
    { id: 'p2', kind: 'tracker', ref: 213, title: 'Привод трекера изнашивается', param: 'Ток привода при повороте', unit: 'А', dec: 2, base: 2.3, slope: 0.0282, noise: 0.09, thr: 4.5, conf: 78,
      then: 'стол остановится и перестанет следить за солнцем', action: 'Осмотреть редуктор, смазать, проверить затяжку опор', hours: 3 },
    { id: 'p3', kind: 'inv', ref: '4.3', title: 'Падает сопротивление изоляции', param: 'Сопротивление изоляции утром', unit: 'МОм', dec: 2, base: 6.0, slope: -0.0625, noise: 0.2, thr: 1.0, conf: 81,
      then: 'инвертор отключится защитой', action: 'Найти стринг с повреждённым кабелем или разъёмом', hours: 6 },
    { id: 'p1', kind: 'inv', ref: '2.9', title: 'Перегревается силовой модуль', param: 'Температура радиатора при полной нагрузке', unit: '°C', dec: 1, base: 61.5, slope: 0.205, noise: 0.8, thr: 78, conf: 86,
      then: 'инвертор ограничит мощность до 60 %', action: 'Заменить вентилятор охлаждения, прочистить радиатор', hours: 2 },
    { id: 'p5', kind: 'inv', ref: '1.8', title: 'Вентилятор теряет обороты', param: 'Обороты вентилятора на полной скорости', unit: 'об/мин', dec: 0, base: 5480, slope: -9.6, noise: 45, thr: 4500, conf: 72,
      then: 'начнётся перегрев силового модуля', action: 'Заменить вентилятор при плановом осмотре', hours: 1 },
    { id: 'p4', kind: 'ktp', ref: 2, title: 'Трансформатор греется сильнее нормы', param: 'Перегрев масла на 1 МВт нагрузки', unit: '°C', dec: 1, base: 11.8, slope: 0.034, noise: 0.28, thr: 16, conf: 64,
      then: 'сработает предупредительная сигнализация', action: 'Проверить вентиляцию отсека и уровень масла', hours: 4 },
  ];
  function predict() {
    return PRED.map((p, k) => {
      const R = rng(9100 + k * 77), g = () => (R() + R() + R() + R() - 2) / 0.577, h = [];
      for (let d = 0; d <= HIST; d++) h.push(p.base + p.slope * d * (0.75 + 0.25 * d / HIST) / 0.875 + g() * p.noise);
      const n = 30, xs = h.slice(-n); let sx = 0, sy = 0, sxx = 0, sxy = 0;                       // тренд по последним 30 дням
      xs.forEach((y, i) => { const x = HIST - n + 1 + i; sx += x; sy += y; sxx += x * x; sxy += x * y; });
      const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n, now = a + b * HIST, left = Math.max(1, Math.round((p.thr - now) / b));
      return Object.assign({}, p, { hist: h, a, b, now, left, sev: left <= 14 ? 'bad' : left <= 35 ? 'warn' : '' });
    }).sort((x, y) => x.left - y.left);
  }

  /* ───────── метеостанции и датчики ───────── */
  const near = k => { const q = SITE.ktp[k - 1]; return [q.x + (q.x < 0 ? -70 : 70), q.z - 46]; };
  const SENSORS = [
    { id: 'МС-1', type: 'meteo', name: 'Метеостанция у ОПУ', x: F.x0 - 30, z: F.z0 - 20, h: 6 },
    { id: 'МС-2', type: 'meteo', name: 'Метеостанция, юго-восток поля', x: F.x1 + 22, z: F.z1 + 22, h: 6 },
    ...[1, 2, 3, 4].map(k => ({ id: 'ПР-' + k, type: 'poa', name: `Пиранометр в плоскости модулей, блок КТП-${k}`, x: near(k)[0], z: near(k)[1], h: 3, k })),
    ...[1, 2, 3, 4].map(k => ({ id: 'ТМ-' + k, type: 'tmod', name: `Температура модуля, блок КТП-${k}`, x: near(k)[0] + (k % 2 ? 60 : -60), z: near(k)[1] + 120 * (k % 2 ? 1 : -1) * (k > 2 ? -1 : 1) * 0 + 58, h: 2.4, k, lost: k === 3 })),
    { id: 'ДЗ-1', type: 'soil', name: 'Датчик загрязнения у проезда', x: SITE.roads.west - 20, z: 57, h: 2.4 },
    { id: 'ДЗ-2', type: 'soil', name: 'Датчик загрязнения в глубине поля', x: F.x1 - 40, z: -172, h: 2.4 },
    { id: 'АН-1', type: 'wind', name: 'Анемометр защиты трекеров, север', x: -30, z: F.z0 - 6, h: 5 },
    { id: 'АН-2', type: 'wind', name: 'Анемометр защиты трекеров, юг', x: 40, z: F.z1 + 6, h: 5 },
  ];
  const wind = (min, doy) => Math.max(0.4, 4.3 + 2.1 * Math.sin(2 * Math.PI * (min / 60 - 9) / 24) + 0.9 * Math.sin(doy * 1.7) + 0.5 * Math.sin(min / 37));
  const humidity = (min, doy) => Math.max(12, Math.min(92, 52 - 22 * Math.cos(2 * Math.PI * (doy - 201) / 365) - 14 * Math.cos(2 * Math.PI * (min / 60 - 15) / 24) * -1 * -1));

  /* ───────── накопитель: сценарий 10 МВт / 20 МВт·ч, в проекте первой очереди накопителя нет ───────── */
  const BESS = { p: 10, e: 20, eff: 0.94, socMin: 0.1 };
  function bess(mode, grid, free) {      // grid — выдача СЭС в сеть, free — возможная выдача без ограничения, МВт, шаг 10 минут
    const n = grid.length, out = new Array(n), soc = new Array(n), pb = new Array(n).fill(0), lo = BESS.e * BESS.socMin; let e = lo, charged = 0, given = 0, saved = 0;
    for (let i = 0; i < n; i++) {
      const hr = i / 6, cut = Math.max(0, free[i] - grid[i]); let p = 0;
      if (mode === 'cut' && cut > 0.02) p = -Math.min(BESS.p, cut, (BESS.e - e) / BESS.eff * 6);                                // заряд тем, что диспетчер не принял
      if (mode === 'shift' && hr >= 10 && hr < 15) p = -Math.min(BESS.p * 0.5, grid[i] * 0.6, (BESS.e - e) / BESS.eff * 6);       // заряд днём от СЭС
      if (mode !== 'off' && hr >= 18.5 && hr < 23 && cut < 0.02) p = Math.min(BESS.p * 0.5, Math.max(0, (e - lo)) * BESS.eff * 6); // разряд вечером
      if (p < 0) { e += -p * BESS.eff / 6; charged += -p / 6; if (mode === 'cut') saved += -p / 6; }
      if (p > 0) { e -= p / BESS.eff / 6; given += p / 6; }
      pb[i] = p; soc[i] = e / BESS.e; out[i] = grid[i] + (mode === 'cut' ? Math.max(0, p) : p);
    }
    return { out, soc, pb, charged, given, saved };
  }

  /* ───────── простои за последние 30 дней: какие инверторы и сколько стояли ───────── */
  const HISTORY = {
    '1.17': { days: 2.0, depth: 1, why: 'отключён, авария изоляции' }, '3.12': { days: 9, depth: 0.31, why: 'ограничен до 60 %, перегрев' },
    '2.6': { days: 3.5, depth: 1, why: 'простой 3,5 дня, заменён модуль связи', fixed: true }, '4.11': { days: 6, depth: 0.22, why: 'сгорел предохранитель двух стрингов', fixed: true },
    '1.4': { days: 30, depth: 0.045, why: 'загрязнение выше среднего, блок у проезда' },
  };

  window.OMS = { PRED, HIST, predict, SENSORS, wind, humidity, BESS, bess, HISTORY };
})();
