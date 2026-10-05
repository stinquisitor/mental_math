// Модель соробана (абакуса) и генератор примеров на сложение/вычитание.
//
// Спица хранит цифру 0..9: верхняя косточка (5) + до четырёх нижних (по 1).
// Каждое действие над спицей классифицируется так, как его выполняет ребёнок:
//   's'        — «просто»: косточки прибавляются/убираются напрямую;
//   'mt±k'     — младшие товарищи (формулы на 5):  +k = +5 −(5−k),  −k = −5 +(5−k);
//   'st±k'     — старшие товарищи (формулы на 10): +k = +10 −(10−k), −k = −10 +(10−k);
//   'combo±k'  — комбинированные (СТ + МТ): та же формула на 10, но её часть
//                на спице единиц сама требует формулы на 5.
// Перенос/заём в следующий разряд — это отдельное действие ±1 на соседней спице,
// и оно тоже классифицируется (например, 49 + 1 даёт СТ+1 и МТ+1).

export const SIMPLE = 's';

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const signed = (prefix, ks) => [...ks.map((k) => `${prefix}+${k}`), ...ks.map((k) => `${prefix}-${k}`)];

export const THEMES = [
  { id: 'simple', short: 'Просто', name: 'Просто (без формул)', formulas: [] },
  { id: 'mt', short: 'МТ', name: 'Младшие товарищи — формулы на 5', formulas: signed('mt', range(1, 4)) },
  { id: 'st', short: 'СТ', name: 'Старшие товарищи — формулы на 10', formulas: signed('st', range(1, 9)) },
  { id: 'combo', short: 'СТ+МТ', name: 'Комбинированные формулы', formulas: signed('combo', range(6, 9)) },
];

export const themeById = (id) => THEMES.find((t) => t.id === id) ?? THEMES[0];

/** Разбирает id формулы: 'st+7' → { theme: 'st', sign: 1, k: 7 }. */
export function parseFormula(id) {
  const m = /^(mt|st|combo)([+-])(\d)$/.exec(id);
  if (!m) return null;
  return { theme: m[1], sign: m[2] === '+' ? 1 : -1, k: Number(m[3]) };
}

const MINUS = '−';
const sgn = (s) => (s > 0 ? '+' : MINUS);

/** Человекочитаемое описание формулы: подпись и раскладка по косточкам. */
export function describeFormula(id) {
  const f = parseFormula(id);
  if (!f) return { label: 'Просто', expansion: '' };
  const { theme, sign: s, k } = f;
  const op = `${sgn(s)}${k}`;
  let expansion;
  if (theme === 'mt') expansion = `${sgn(s)}5 ${sgn(-s)}${5 - k}`;
  else if (theme === 'st') expansion = `${sgn(s)}10 ${sgn(-s)}${10 - k}`;
  else expansion = `${sgn(s)}10 ${sgn(-s)}5 ${sgn(s)}${k - 5}`;
  return { label: `${themeById(theme).short} ${op}`, op, expansion, full: `${op} = ${expansion}` };
}

// ---------- Действия над спицами ----------

const canAddDirect = (d, k) => !(d >= 5 && k >= 5) && (d % 5) + (k % 5) <= 4;
const canSubDirect = (d, k) => (k < 5 || d >= 5) && d % 5 >= k % 5;

/** Прибавить k (1..9) на спице i. Пишет действия в used. false — переполнение абакуса. */
export function addAt(rods, i, k, used) {
  if (i >= rods.length) return false;
  const d = rods[i];
  if (d + k <= 9) {
    used.push(canAddDirect(d, k) ? SIMPLE : `mt+${k}`);
    rods[i] = d + k;
    return true;
  }
  const m = 10 - k;
  used.push(canSubDirect(d, m) ? `st+${k}` : `combo+${k}`);
  rods[i] = d - m;
  return addAt(rods, i + 1, 1, used);
}

/** Отнять k (1..9) на спице i. false — результат стал бы отрицательным. */
export function subAt(rods, i, k, used) {
  if (i >= rods.length) return false;
  const d = rods[i];
  if (d >= k) {
    used.push(canSubDirect(d, k) ? SIMPLE : `mt-${k}`);
    rods[i] = d - k;
    return true;
  }
  const m = 10 - k;
  used.push(canAddDirect(d, m) ? `st-${k}` : `combo-${k}`);
  rods[i] = d + m;
  return subAt(rods, i + 1, 1, used);
}

export const toRods = (value, width) => Array.from({ length: width }, (_, i) => Math.floor(value / 10 ** i) % 10);
export const fromRods = (rods) => rods.reduce((acc, d, i) => acc + d * 10 ** i, 0);

/**
 * Применяет число к абакусу так, как это делает ребёнок: от старшего разряда к младшему.
 * Возвращает { ok, rods, used } — used содержит все действия, включая переносы.
 */
export function applyNumber(rods, value) {
  const r = rods.slice();
  const used = [];
  const digits = String(Math.abs(value)).split('').map(Number).reverse();
  for (let pos = digits.length - 1; pos >= 0; pos--) {
    if (!digits[pos]) continue;
    const ok = value > 0 ? addAt(r, pos, digits[pos], used) : subAt(r, pos, digits[pos], used);
    if (!ok) return { ok: false, rods: r, used };
  }
  return { ok: true, rods: r, used };
}

// ---------- Случайные числа ----------

/** Детерминированный ГПСЧ: один и тот же номер варианта даёт тот же лист. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Генератор ----------

/**
 * Нормализует настройки генератора.
 * @param {object} s
 * @param {string}   s.theme        id темы
 * @param {string[]} s.focus        формулы, которые тренируем (из выбранной темы)
 * @param {boolean}  s.allowPrev    разрешить формулы предыдущих тем
 * @param {boolean}  s.allowTheme   разрешить остальные формулы текущей темы
 * @param {boolean}  s.lowerOnly    «Просто»: только нижние косточки
 * @param {string}   s.ops          'mix' | 'add' | 'sub'
 * @param {number}   s.digits       разрядность чисел (наибольшая)
 * @param {number}   [s.digitsMin]  наименьшая разрядность — если меньше digits, разрядность чисел в примере разная
 * @param {number}   s.rows         чисел в примере
 * @param {number}   s.count        количество примеров
 * @param {number}   s.minFocus     минимум применений тренируемых формул в примере
 */
export function buildConfig(s) {
  const themeIdx = Math.max(0, THEMES.findIndex((t) => t.id === s.theme));
  const theme = THEMES[themeIdx];
  const focus = new Set((s.focus ?? []).filter((f) => theme.formulas.includes(f)));
  const allowed = new Set([SIMPLE, ...focus]);
  if (s.allowTheme) theme.formulas.forEach((f) => allowed.add(f));
  if (s.allowPrev) THEMES.slice(0, themeIdx).forEach((t) => t.formulas.forEach((f) => allowed.add(f)));
  const digits = clampInt(s.digits, 1, 6, 1);
  const digitsMin = clampInt(s.digitsMin ?? digits, 1, digits, digits);
  const carries = [...allowed].some((f) => f.startsWith('st') || f.startsWith('combo'));
  return {
    theme: theme.id,
    focus,
    allowed,
    lowerOnly: theme.id === 'simple' && !!s.lowerOnly,
    ops: ['add', 'sub'].includes(s.ops) ? s.ops : 'mix',
    digits,
    digitsMin,
    // Формулы на 10 переносят единицу в следующий разряд — даём абакусу одну спицу в запас.
    width: digits + (carries ? 1 : 0),
    rows: clampInt(s.rows, 2, 30, 4),
    count: clampInt(s.count, 1, 200, 10),
    minFocus: focus.size ? clampInt(s.minFocus, 0, 30, 1) : 0,
  };
}

function clampInt(v, lo, hi, def) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
}

const FOCUS_CHANCE = 0.6; // как часто разряд старается задействовать тренируемую формулу
const ZERO_CHANCE = 0.08; // нули в середине числа редки (как 60, −50 в сборниках)

/**
 * Подбирает очередное слагаемое со знаком sign поразрядно (от старшего к младшему):
 * для каждого разряда перебираются все цифры, допустимые в текущем состоянии абакуса.
 */
function chooseOperand(rng, rods, cfg, sign, focus, digits) {
  let work = rods;
  let value = 0;
  const used = [];
  const maxDigit = cfg.lowerOnly ? 4 : 9;
  for (let pos = digits - 1; pos >= 0; pos--) {
    const options = [];
    for (let d = 1; d <= maxDigit; d++) {
      const r = work.slice();
      const u = [];
      if (!(sign > 0 ? addAt(r, pos, d, u) : subAt(r, pos, d, u))) continue;
      if (!u.every((f) => cfg.allowed.has(f))) continue;
      if (cfg.lowerOnly && r.some((x) => x > 4)) continue;
      options.push({ d, rods: r, used: u, hits: u.filter((f) => focus.has(f)).length });
    }
    const top = pos === digits - 1;
    let choice;
    if (!options.length || (!top && rng() < ZERO_CHANCE)) {
      if (top) return null; // старший разряд не может быть нулём
      choice = { d: 0, rods: work, used: [] };
    } else {
      const focused = options.filter((o) => o.hits > 0);
      const pool = focused.length && rng() < FOCUS_CHANCE ? focused : options;
      choice = pool[Math.floor(rng() * pool.length)];
    }
    work = choice.rods;
    used.push(...choice.used);
    value = value * 10 + choice.d;
  }
  return { value: sign * value, rods: work, used };
}

const countHits = (rows, focus) => rows.reduce((n, r) => n + r.used.filter((f) => focus.has(f)).length, 0);

/**
 * Генерирует один пример: { rows: [{ value, used }], answer, hits, ok }.
 * ok = false, если за отведённые попытки не удалось набрать minFocus применений формулы.
 */
export function generateExample(rng, cfg) {
  let best = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    const ex = tryExample(rng, cfg);
    if (!ex) continue;
    if (ex.hits >= cfg.minFocus) return { ...ex, ok: true };
    if (!best || ex.hits > best.hits) best = ex;
  }
  return best ? { ...best, ok: false } : null;
}

function tryExample(rng, cfg) {
  const empty = new Array(cfg.width).fill(0);
  // Первое число просто набирается на пустом абакусе; оно всегда наибольшей разрядности,
  // чтобы при разной разрядности было из чего вычитать.
  const first = chooseOperand(rng, empty, cfg, 1, new Set(), cfg.digits);
  if (!first) return null;
  const rows = [{ value: first.value, used: [] }];
  let rods = first.rods;
  for (let i = 1; i < cfg.rows; i++) {
    const prev = rows[i - 1].value;
    const signs = cfg.ops === 'add' ? [1] : cfg.ops === 'sub' ? [-1] : rng() < 0.5 ? [1, -1] : [-1, 1];
    const lengths = digitLengths(rng, cfg);
    let next = null;
    for (const s of signs) {
      for (const len of lengths) {
        // Пара «+x, −x» подряд обнуляет шаг — пробуем избежать.
        for (let t = 0; t < 4 && (!next || next.value === -prev); t++) next = chooseOperand(rng, rods, cfg, s, cfg.focus, len);
        if (next) break;
      }
      if (next) break;
    }
    if (!next) return null;
    rows.push({ value: next.value, used: next.used.filter((f) => f !== SIMPLE) });
    rods = next.rods;
  }
  return { rows, answer: fromRods(rods), hits: countHits(rows, cfg.focus) };
}

/** Разрядности для очередного числа: случайная первой, остальные — запасные варианты. */
function digitLengths(rng, cfg) {
  const all = [];
  for (let n = cfg.digitsMin; n <= cfg.digits; n++) all.push(n);
  const first = all.splice(Math.floor(rng() * all.length), 1);
  return [...first, ...all];
}

/** Генерирует лист примеров. Возвращает { examples, failed } (failed — сколько примеров вышли без формулы). */
export function generateSheet(settings, seed) {
  const cfg = buildConfig(settings);
  const rng = mulberry32(seed);
  const examples = [];
  let failed = 0;
  for (let i = 0; i < cfg.count; i++) {
    const ex = generateExample(rng, cfg);
    if (!ex) {
      failed++;
      continue;
    }
    if (!ex.ok) failed++;
    examples.push(ex);
  }
  return { cfg, examples, failed };
}

/**
 * Фундаментальное упражнение для формулы: все однозначные (или из второго десятка
 * для вычитания на 10) числа a, к которым действие ±k применяется именно по этой формуле.
 */
export function fundamentals(formulaId, digits = 1) {
  const f = parseFormula(formulaId);
  if (!f) return [];
  const matches = (a) => {
    const res = applyNumber(toRods(a, 3), f.sign * f.k);
    return res.ok && res.used[0] === formulaId && res.used.slice(1).every((u) => u === SIMPLE);
  };
  const fmt = (a) => `${a} ${f.sign > 0 ? '+' : MINUS} ${f.k}`;
  let base = range(1, 9).filter(matches);
  if (!base.length) base = range(10, 19).filter(matches);
  const out = base.map(fmt);
  if (digits >= 2) {
    const two = range(10, 99).filter((a) => !base.includes(a) && matches(a));
    for (let i = 0; i < 6 && two.length; i++) out.push(fmt(two.splice(Math.floor((i * two.length) / 6), 1)[0]));
  }
  return out;
}

export const formatNumber = (v) => (v < 0 ? `${MINUS}${-v}` : String(v));
