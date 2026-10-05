import {
  THEMES, themeById, describeFormula, generateSheet, fundamentals, formatNumber, parseFormula,
} from './abacus.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const DEFAULTS = {
  theme: 'mt', focus: ['mt+4'], allowTheme: false, allowPrev: true, lowerOnly: false,
  ops: 'mix', digits: 1, digitsMin: 1, rows: 4, count: 10, minFocus: 1,
};

const state = {
  settings: { ...DEFAULTS },
  seed: newSeed(),
  sheet: null,
};

function newSeed() {
  return 1 + Math.floor(Math.random() * 999_999);
}

// ---------- Ссылка с настройками (#t=mt&f=mt+4…) ----------

function writeHash() {
  const s = state.settings;
  const p = new URLSearchParams({
    t: s.theme, f: s.focus.map(encodeFormula).join('.'), a: +s.allowTheme, p: +s.allowPrev, l: +s.lowerOnly,
    o: s.ops, d: s.digits, dm: s.digitsMin, r: s.rows, n: s.count, m: s.minFocus, v: state.seed,
  });
  history.replaceState(null, '', `#${p}`);
}

// 'st+7' → 'p7', 'st-7' → 'm7': тема уже есть в ссылке, а «+» в адресе неудобен.
const encodeFormula = (f) => f.replace(/^\D+([+-])/, (_, sg) => (sg === '+' ? 'p' : 'm'));
const decodeFormula = (theme, code) => `${theme}${code[0] === 'p' ? '+' : '-'}${code.slice(1)}`;

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (!p.has('t')) return;
  const num = (k, def) => (p.has(k) && Number.isFinite(+p.get(k)) ? +p.get(k) : def);
  const theme = themeById(p.get('t')).id;
  const digits = clamp(num('d', DEFAULTS.digits), 1, 5);
  state.settings = {
    theme,
    focus: (p.get('f') ?? '').split('.').filter(Boolean).map((c) => decodeFormula(theme, c))
      .filter((f) => themeById(theme).formulas.includes(f)),
    allowTheme: p.get('a') === '1',
    allowPrev: p.get('p') !== '0',
    lowerOnly: p.get('l') === '1',
    ops: ['mix', 'add', 'sub'].includes(p.get('o')) ? p.get('o') : 'mix',
    digits,
    digitsMin: clamp(num('dm', digits), 1, digits),
    rows: num('r', DEFAULTS.rows),
    count: num('n', DEFAULTS.count),
    minFocus: num('m', DEFAULTS.minFocus),
  };
  state.seed = num('v', state.seed);
}

// ---------- Форма настроек ----------

const form = $('#settings');
const F = form.elements;

function renderThemes() {
  $('#themes').innerHTML = THEMES.map((t) => `
    <label class="seg">
      <input type="radio" name="theme" value="${t.id}">
      <span>${t.short}</span>
    </label>`).join('');
}

function renderChips() {
  const theme = themeById(state.settings.theme);
  const groups = [
    ['Сложение', theme.formulas.filter((f) => parseFormula(f).sign > 0)],
    ['Вычитание', theme.formulas.filter((f) => parseFormula(f).sign < 0)],
  ];
  $('#formulaChips').innerHTML = groups.map(([title, list]) => `
    <div class="chips-row">
      <span class="chips-title">${title}</span>
      <div class="chips">${list.map((f) => {
        const d = describeFormula(f);
        const on = state.settings.focus.includes(f);
        return `<button type="button" class="chip" data-formula="${f}" aria-pressed="${on}" title="${d.full}">
          <b>${d.op}</b><small>${d.expansion}</small></button>`;
      }).join('')}</div>
    </div>`).join('');
}

function syncForm() {
  const s = state.settings;
  const theme = themeById(s.theme);
  F.theme.value = s.theme;
  F.allowTheme.checked = s.allowTheme;
  F.allowPrev.checked = s.allowPrev;
  F.lowerOnly.checked = s.lowerOnly;
  F.ops.value = s.ops;
  F.digits.value = `${s.digitsMin}-${s.digits}`;
  F.rows.value = s.rows;
  F.count.value = s.count;
  F.minFocus.value = s.minFocus;
  $('#themeName').textContent = theme.name;
  $('#formulaBox').hidden = theme.id === 'simple';
  $('#simpleBox').hidden = theme.id !== 'simple';
  $('#allowPrevLabel').hidden = theme.id === 'mt'; // перед МТ формул нет
  $('#minFocusField').hidden = theme.id === 'simple';
  renderChips();
  updateCodeBadge();
}

function readForm() {
  const s = state.settings;
  s.theme = F.theme.value;
  s.allowTheme = F.allowTheme.checked;
  s.allowPrev = F.allowPrev.checked;
  s.lowerOnly = F.lowerOnly.checked;
  s.ops = F.ops.value;
  [s.digitsMin, s.digits] = F.digits.value.split('-').map(Number);
  s.rows = clamp(+F.rows.value, 2, 30);
  s.count = clamp(+F.count.value, 1, 200);
  s.minFocus = +F.minFocus.value;
}

// Обозначение как в сборниках: «1Д4Р», при разной разрядности — «1–2Д4Р».
const sheetCode = (min, max, rows) => `${min === max ? max : `${min}–${max}`}Д${rows}Р`;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v) || lo));

function updateCodeBadge() {
  const [min, max] = F.digits.value.split('-').map(Number);
  $('#codeBadge').textContent = sheetCode(min, max, F.rows.value || '?');
}

form.addEventListener('change', (e) => {
  if (e.target.name === 'theme') {
    // Новая тема — по умолчанию тренируем все её формулы.
    state.settings.theme = e.target.value;
    state.settings.focus = [...themeById(e.target.value).formulas];
  }
  readForm();
  syncForm();
  generate(); // настройки применяются сразу, номер варианта сохраняется
});
form.addEventListener('input', updateCodeBadge);

$('#formulaChips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const f = chip.dataset.formula;
  const focus = new Set(state.settings.focus);
  focus.has(f) ? focus.delete(f) : focus.add(f);
  state.settings.focus = themeById(state.settings.theme).formulas.filter((x) => focus.has(x));
  chip.setAttribute('aria-pressed', focus.has(f));
  generate();
});

$('#formulaBox').addEventListener('click', (e) => {
  const mode = e.target.dataset?.select;
  if (!mode) return;
  state.settings.focus = mode === 'all' ? [...themeById(state.settings.theme).formulas] : [];
  renderChips();
  generate();
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  readForm();
  state.seed = newSeed();
  generate();
});

// ---------- Лист примеров ----------

function generate() {
  stopFlash();
  state.sheet = generateSheet(state.settings, state.seed);
  writeHash();
  renderSheet();
  resetFlash();
}

function themeTitle(cfg) {
  const theme = themeById(cfg.theme);
  if (theme.id === 'simple') return cfg.lowerOnly ? 'Просто — нижние косточки' : 'Просто — все косточки';
  if (!cfg.focus.size) return theme.name;
  if (cfg.focus.size === theme.formulas.length) return `${theme.short}: все формулы`;
  return `${theme.short} ${[...cfg.focus].map((f) => describeFormula(f).op).join(', ')}`;
}

function renderSheet() {
  const { cfg, examples, failed } = state.sheet;
  const sheet = $('#sheet');
  sheet.style.setProperty('--digits', cfg.width);
  sheet.classList.toggle('mixed-digits', cfg.digitsMin < cfg.digits);

  const notice = $('#notice');
  const missing = cfg.count - examples.length;
  const weak = failed - missing;
  const msgs = [];
  if (missing > 0) msgs.push(`Удалось составить ${examples.length} из ${cfg.count} примеров.`);
  if (weak > 0) msgs.push(`В ${weak} примерах формула встречается реже, чем нужно.`);
  if (msgs.length) msgs.push('Попробуйте меньше чисел в примере, разрешить сложение и вычитание или формулы предыдущих тем.');
  notice.textContent = msgs.join(' ');
  notice.hidden = !msgs.length;

  const fund = cfg.focus.size && cfg.focus.size <= 4
    ? `<section class="fund">
        <h3>Фундаментальное упражнение</h3>
        ${[...cfg.focus].map((f) => `
          <div class="fund-row"><span class="fund-label" title="${describeFormula(f).full}">${describeFormula(f).full}</span>
          ${fundamentals(f, cfg.digits).map((x) => `<span class="fund-item">${x.replace(/-/g, '−')}</span>`).join('')}</div>`).join('')}
      </section>`
    : '';

  sheet.innerHTML = `
    <header class="sheet-head">
      <div>
        <h2>${themeTitle(cfg)}</h2>
        <p class="sheet-meta">${sheetCode(cfg.digitsMin, cfg.digits, cfg.rows)} · ${examples.length} примеров · вариант № ${state.seed}</p>
      </div>
      <p class="print-only sheet-name">Имя ____________________ &nbsp; Дата __________</p>
    </header>
    ${fund}
    <div class="examples">${examples.map(renderExample).join('')}</div>`;
  $('#score').textContent = '';
  applyToggles();
}

function renderExample(ex, i) {
  const rows = ex.rows.map((r) => {
    const tags = r.used.map((f) => {
      const d = describeFormula(f);
      return `<span class="tag tag-${parseFormula(f).theme}" title="${d.full}">${d.label}</span>`;
    }).join('');
    return `<div class="num"><span>${formatNumber(r.value)}</span><span class="tags">${tags}</span></div>`;
  }).join('');
  return `
    <div class="ex" data-i="${i}">
      <div class="ex-no">${i + 1}</div>
      <div class="ex-rows">${rows}</div>
      <div class="ex-ans">
        <input inputmode="numeric" aria-label="Ответ к примеру ${i + 1}" data-i="${i}">
        <span class="key">${ex.answer}</span>
      </div>
    </div>`;
}

function applyToggles() {
  const sheet = $('#sheet');
  sheet.classList.toggle('show-answers', $('#showAnswers').checked);
  sheet.classList.toggle('show-formulas', $('#showFormulas').checked);
}

$('#showAnswers').addEventListener('change', applyToggles);
$('#showFormulas').addEventListener('change', applyToggles);

function checkAnswers() {
  const inputs = $$('.ex-ans input');
  let right = 0;
  let filled = 0;
  for (const input of inputs) {
    const ex = state.sheet.examples[+input.dataset.i];
    const cell = input.closest('.ex');
    const raw = input.value.trim();
    cell.classList.remove('ok', 'bad');
    if (!raw) continue;
    filled++;
    const ok = parseAnswer(raw) === ex.answer;
    if (ok) right++;
    cell.classList.add(ok ? 'ok' : 'bad');
  }
  $('#score').textContent = filled
    ? `Верно ${right} из ${inputs.length}${filled < inputs.length ? ` (не заполнено: ${inputs.length - filled})` : ''}`
    : 'Впишите ответы под примерами и нажмите «Проверить».';
}

const parseAnswer = (s) => Number(s.replace(/\s/g, '').replace('−', '-'));

$('#checkBtn').addEventListener('click', checkAnswers);

$('#sheet').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !e.target.matches('.ex-ans input')) return;
  e.preventDefault();
  const inputs = $$('.ex-ans input');
  const next = inputs[inputs.indexOf(e.target) + 1];
  next ? next.focus() : checkAnswers();
});

$('#sheet').addEventListener('input', (e) => {
  if (e.target.matches('.ex-ans input')) e.target.closest('.ex').classList.remove('ok', 'bad');
});

$('#newVariantBtn').addEventListener('click', () => {
  readForm();
  state.seed = newSeed();
  generate();
});

$('#printBtn').addEventListener('click', () => window.print());

$('#copyLinkBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  try {
    await navigator.clipboard.writeText(location.href);
    flashLabel(btn, 'Скопировано');
  } catch {
    prompt('Ссылка на этот вариант:', location.href);
  }
});

function flashLabel(btn, text) {
  const old = btn.textContent;
  btn.textContent = text;
  setTimeout(() => (btn.textContent = old), 1500);
}

// ---------- Вкладки ----------

function selectTab(name) {
  for (const tab of $$('[role="tab"]')) {
    const on = tab.id === `tab-${name}`;
    tab.setAttribute('aria-selected', on);
    $(`#${tab.getAttribute('aria-controls')}`).hidden = !on;
  }
  if (name !== 'flash') stopFlash();
}

$('#tab-sheet').addEventListener('click', () => selectTab('sheet'));
$('#tab-flash').addEventListener('click', () => selectTab('flash'));

// ---------- Флеш-анзан ----------

const flash = { token: 0, running: false };
const speech = 'speechSynthesis' in window ? window.speechSynthesis : null;
const speedInput = $('#speed');

speedInput.addEventListener('input', () => {
  $('#speedOut').textContent = (+speedInput.value).toFixed(1).replace('.', ',');
});
if (!speech) {
  $('#voice').disabled = true;
  $('#voiceLabel').title = 'Браузер не поддерживает озвучивание';
}

class Aborted extends Error {}

function sleep(ms, token) {
  return new Promise((resolve, reject) => setTimeout(() => (token === flash.token ? resolve() : reject(new Aborted())), ms));
}

function speak(text, token) {
  if (!speech || !$('#voice').checked) return Promise.resolve();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ru-RU';
    u.rate = Math.min(2, Math.max(0.8, 1.4 / +speedInput.value));
    const voice = speech.getVoices().find((v) => v.lang.startsWith('ru'));
    if (voice) u.voice = voice;
    u.onend = u.onerror = () => resolve();
    speech.speak(u);
    setTimeout(resolve, 6000); // страховка, если onend не придёт
  }).then(() => {
    if (token !== flash.token) throw new Aborted();
  });
}

function waitFor(el, event, token, filter = () => true) {
  return new Promise((resolve, reject) => {
    const handler = (e) => {
      if (!filter(e)) return;
      cleanup();
      resolve(e);
    };
    const abort = () => {
      cleanup();
      reject(new Aborted());
    };
    const cleanup = () => {
      el.removeEventListener(event, handler);
      flash.abortHandlers.delete(abort);
    };
    el.addEventListener(event, handler);
    flash.abortHandlers.add(abort);
    if (token !== flash.token) abort();
  });
}
flash.abortHandlers = new Set();

function setDisplay(text, cls = '') {
  const d = $('#flashDisplay');
  d.textContent = text;
  d.className = `flash-display ${cls}`;
}

function resetFlash() {
  setDisplay(state.sheet?.examples.length ? 'Готовы?' : '—', 'muted');
  $('#flashProgress').textContent = state.sheet ? `${state.sheet.examples.length} примеров на листе` : '';
  $('#flashAnswer').hidden = true;
  $('#flashFeedback').hidden = true;
  $('#flashStart').textContent = 'Старт';
}

function stopFlash() {
  if (!flash.running) return;
  flash.token++;
  flash.running = false;
  speech?.cancel();
  [...flash.abortHandlers].forEach((abort) => abort());
  resetFlash();
}

$('#flashAnswer').addEventListener('submit', (e) => e.preventDefault());
$('#flashStart').addEventListener('click', () => (flash.running ? stopFlash() : runFlash()));

async function runFlash() {
  const examples = state.sheet?.examples ?? [];
  if (!examples.length) return;
  const token = ++flash.token;
  flash.running = true;
  $('#flashStart').textContent = 'Стоп';
  const results = [];
  try {
    for (let i = 0; i < examples.length; i++) {
      results.push(await flashExample(examples[i], i, examples.length, token));
    }
    showSummary(results, examples);
  } catch (err) {
    if (!(err instanceof Aborted)) throw err;
  } finally {
    if (token === flash.token) {
      flash.running = false;
      $('#flashStart').textContent = 'Старт';
    }
  }
}

async function flashExample(ex, i, total, token) {
  const showMs = +speedInput.value * 1000;
  $('#flashProgress').textContent = `Пример ${i + 1} из ${total}`;
  $('#flashFeedback').hidden = true;
  $('#flashAnswer').hidden = true;
  for (const n of ['3', '2', '1']) {
    setDisplay(n, 'muted countdown');
    await sleep(450, token);
  }
  for (const row of ex.rows) {
    setDisplay(formatNumber(row.value), row.value < 0 ? 'neg' : '');
    const spoken = row.value < 0 ? `минус ${-row.value}` : String(row.value);
    await Promise.all([sleep(showMs * 0.8, token), speak(spoken, token)]);
    // Короткая пустая пауза, чтобы два одинаковых числа подряд были различимы.
    setDisplay('', '');
    await sleep(Math.max(120, showMs * 0.2), token);
  }
  setDisplay('?', 'muted');
  const answerForm = $('#flashAnswer');
  const input = $('#flashInput');
  input.value = '';
  answerForm.hidden = false;
  input.focus();
  await waitFor(answerForm, 'submit', token, (e) => {
    e.preventDefault();
    return input.value.trim() !== '';
  });
  answerForm.hidden = true;
  const given = parseAnswer(input.value.trim());
  const ok = given === ex.answer;
  setDisplay(String(ex.answer), ok ? 'ok' : 'bad');
  const fb = $('#flashFeedback');
  fb.innerHTML = `
    <p class="verdict ${ok ? 'ok' : 'bad'}">${ok ? 'Верно!' : `Ваш ответ: ${given}`}</p>
    <p class="flash-example">${ex.rows.map((r, j) => (j === 0 ? r.value : formatNumber(r.value).replace(/^(\d)/, '+$1'))).join(' ')} = ${ex.answer}</p>
    <button type="button" class="btn primary" id="flashNext">${i + 1 < total ? 'Дальше' : 'Итоги'}</button>`;
  fb.hidden = false;
  const next = $('#flashNext');
  next.focus();
  await waitFor(next, 'click', token);
  return { ok, given };
}

function showSummary(results, examples) {
  const right = results.filter((r) => r.ok).length;
  setDisplay(`${right} / ${results.length}`, right === results.length ? 'ok' : '');
  $('#flashProgress').textContent = 'Итоги';
  const wrong = results
    .map((r, i) => ({ ...r, ex: examples[i], i }))
    .filter((r) => !r.ok)
    .map((r) => `<li>№ ${r.i + 1}: ${r.ex.rows.map((x) => formatNumber(x.value)).join(', ')} → ${r.ex.answer} (ваш ответ ${r.given})</li>`)
    .join('');
  const fb = $('#flashFeedback');
  fb.innerHTML = `
    <p class="verdict ${right === results.length ? 'ok' : ''}">Верно ${right} из ${results.length}</p>
    ${wrong ? `<ul class="wrong-list">${wrong}</ul>` : ''}`;
  fb.hidden = false;
}

// ---------- Старт ----------

renderThemes();
readHash();
syncForm();
generate();
// Пользователь вставил другую ссылку в адресную строку (replaceState это событие не вызывает).
window.addEventListener('hashchange', () => {
  readHash();
  syncForm();
  generate();
});
