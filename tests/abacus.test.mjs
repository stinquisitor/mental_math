import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyNumber, toRods, fromRods, buildConfig, generateSheet, fundamentals, THEMES, SIMPLE, describeFormula,
} from '../js/abacus.js';

const ops = (start, value, width = 3) => applyNumber(toRods(start, width), value).used.filter((u) => u !== SIMPLE);

test('классификация формул на 5 (младшие товарищи)', () => {
  assert.deepEqual(ops(3, 4), ['mt+4']); // +4 = +5 −1
  assert.deepEqual(ops(4, 1), ['mt+1']);
  assert.deepEqual(ops(2, 2), []); // напрямую
  assert.deepEqual(ops(7, -4), ['mt-4']); // −4 = −5 +1
  assert.deepEqual(ops(5, -1), ['mt-1']);
  assert.deepEqual(ops(9, -4), []);
});

test('классификация формул на 10 (старшие товарищи)', () => {
  assert.deepEqual(ops(4, 7), ['st+7']); // пример из ДЗ: 4 + 7 = 4 + 10 − 3
  assert.deepEqual(ops(8, 8), ['st+8']);
  assert.deepEqual(ops(9, 1), ['st+1']);
  assert.deepEqual(ops(15, -6), ['st-6']); // 5 + 4 напрямую
  assert.deepEqual(ops(10, -1), ['st-1']);
});

test('комбинированные формулы', () => {
  assert.deepEqual(ops(5, 6), ['combo+6']); // +6 = +10 −5 +1
  assert.deepEqual(ops(6, 8), ['combo+8']);
  assert.deepEqual(ops(11, -6), ['combo-6']); // −6 = −10 +5 −1
  assert.deepEqual(ops(12, -7), ['combo-7']);
});

test('переносы и заёмы классифицируются на соседней спице', () => {
  assert.deepEqual(ops(49, 1), ['st+1', 'mt+1']);
  assert.deepEqual(ops(99, 1), ['st+1', 'st+1']);
  assert.deepEqual(ops(50, -1), ['st-1', 'mt-1']);
  assert.equal(applyNumber(toRods(99, 2), 1).ok, false); // нет места на абакусе
  assert.equal(applyNumber(toRods(5, 2), -6).ok, false); // отрицательный результат
});

test('многоразрядные числа идут от старшего разряда', () => {
  const r = applyNumber(toRods(32, 3), 51);
  assert.equal(fromRods(r.rods), 83);
  assert.deepEqual(r.used, [SIMPLE, SIMPLE]);
  assert.deepEqual(ops(14, 47), ['mt+4', 'st+7']);
});

test('описания формул', () => {
  assert.equal(describeFormula('mt+4').full, '+4 = +5 −1');
  assert.equal(describeFormula('st-7').full, '−7 = −10 +3');
  assert.equal(describeFormula('combo+6').full, '+6 = +10 −5 +1');
  assert.equal(describeFormula('combo-8').full, '−8 = −10 +5 −3');
});

test('фундаментальное упражнение', () => {
  assert.deepEqual(fundamentals('mt+4'), ['1 + 4', '2 + 4', '3 + 4', '4 + 4']);
  assert.deepEqual(fundamentals('st+9'), ['1 + 9', '2 + 9', '3 + 9', '4 + 9', '6 + 9', '7 + 9', '8 + 9', '9 + 9']);
  assert.deepEqual(fundamentals('combo+6'), ['5 + 6', '6 + 6', '7 + 6', '8 + 6']);
});

// Проверяем сгенерированные листы независимым пересчётом по абакусу.
function verifySheet(settings, seed) {
  const { cfg, examples } = generateSheet(settings, seed);
  for (const ex of examples) {
    assert.equal(ex.rows.length, cfg.rows);
    let rods = new Array(cfg.width).fill(0);
    let sum = 0;
    let hits = 0;
    ex.rows.forEach((row, i) => {
      const abs = Math.abs(row.value);
      const len = String(abs).length;
      if (i === 0) assert.equal(len, cfg.digits, `разрядность первого числа ${row.value}`);
      else assert.ok(len >= cfg.digitsMin && len <= cfg.digits, `разрядность ${row.value}`);
      if (i === 0) assert.ok(row.value > 0);
      if (i > 0 && cfg.ops === 'add') assert.ok(row.value > 0);
      if (i > 0 && cfg.ops === 'sub') assert.ok(row.value < 0);
      const res = applyNumber(rods, row.value);
      assert.ok(res.ok);
      for (const u of res.used) assert.ok(cfg.allowed.has(u), `запрещённая формула ${u} в ${ex.rows.map((r) => r.value)}`);
      if (cfg.lowerOnly) assert.ok(res.rods.every((d) => d <= 4));
      hits += res.used.filter((u) => cfg.focus.has(u)).length;
      rods = res.rods;
      sum += row.value;
    });
    assert.equal(ex.answer, sum);
    assert.equal(fromRods(rods), sum);
    if (ex.ok) assert.ok(hits >= cfg.minFocus);
  }
  return examples;
}

test('генератор соблюдает правила для всех тем', () => {
  const cases = [];
  for (const theme of THEMES) {
    const subsets = theme.formulas.length ? [theme.formulas, [theme.formulas[0]], [theme.formulas.at(-1)]] : [[]];
    for (const focus of subsets) {
      for (const digits of [1, 2, 3]) {
        for (const opsMode of ['mix', 'add']) {
          for (const allowPrev of [true, false]) {
            cases.push({ theme: theme.id, focus, digits, ops: opsMode, allowPrev, rows: 5, count: 8, minFocus: 1 });
          }
        }
      }
    }
  }
  cases.push({ theme: 'simple', lowerOnly: true, digits: 2, rows: 6, count: 10 });
  cases.push({ theme: 'st', focus: ['st+7'], allowPrev: true, digits: 1, rows: 4, count: 10, ops: 'mix', minFocus: 2 });
  cases.push({ theme: 'mt', focus: ['mt-3'], digits: 1, rows: 10, count: 10, ops: 'mix', minFocus: 3 });
  cases.push({ theme: 'st', focus: ['st+7', 'st-7'], allowPrev: true, digits: 2, digitsMin: 1, rows: 6, count: 20 });
  cases.push({ theme: 'mt', focus: ['mt+3'], digits: 3, digitsMin: 1, rows: 5, count: 20 });
  cases.push({ theme: 'simple', digits: 4, digitsMin: 2, rows: 5, count: 20 });
  let total = 0;
  cases.forEach((c, i) => (total += verifySheet(c, 1000 + i).length));
  assert.ok(total > 0);
});

test('один номер варианта даёт один и тот же лист', () => {
  const s = { theme: 'st', focus: ['st+7'], allowPrev: true, digits: 1, rows: 4, count: 10 };
  assert.deepEqual(generateSheet(s, 42).examples, generateSheet(s, 42).examples);
  assert.notDeepEqual(generateSheet(s, 42).examples, generateSheet(s, 43).examples);
});

test('формула встречается в примерах', () => {
  const { examples, failed } = generateSheet({ theme: 'mt', focus: ['mt+4'], digits: 1, rows: 4, count: 20, minFocus: 1 }, 7);
  assert.equal(failed, 0);
  assert.ok(examples.every((ex) => ex.rows.some((r) => r.used.includes('mt+4'))));
  assert.ok(buildConfig({ theme: 'mt', focus: ['mt+4'] }).width === 1);
});

test('разная разрядность внутри примера', () => {
  const { examples } = generateSheet({ theme: 'st', focus: ['st+7'], allowPrev: true, digits: 2, digitsMin: 1, rows: 6, count: 20 }, 5);
  const lengths = new Set(examples.flatMap((ex) => ex.rows.slice(1).map((r) => String(Math.abs(r.value)).length)));
  assert.deepEqual([...lengths].sort(), [1, 2]);
  assert.equal(buildConfig({ digits: 2, digitsMin: 5 }).digitsMin, 2);
  assert.equal(buildConfig({ digits: 3 }).digitsMin, 3);
});
