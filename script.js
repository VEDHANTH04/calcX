'use strict';

/* ============================================================
   CalcX — Calculate Beyond Limits
   - Expression engine: tokenizer + recursive-descent parser.
     No eval() is ever used on user input.
   - UI: display, scientific/basic modes, history, memory,
     themes, settings (sound/haptics/auto-copy), keyboard
     support, clipboard, fullscreen.
   ============================================================ */

/* ---------------- Expression engine (pure) ---------------- */

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

const FUNCTIONS = {
  sin: (x, ctx) => Math.sin(toRadians(x, ctx.deg)),
  cos: (x, ctx) => Math.cos(toRadians(x, ctx.deg)),
  tan: (x, ctx) => Math.tan(toRadians(x, ctx.deg)),
  asin: (x, ctx) => fromRadians(Math.asin(within(x, -1, 1)), ctx.deg),
  acos: (x, ctx) => fromRadians(Math.acos(within(x, -1, 1)), ctx.deg),
  atan: (x, ctx) => fromRadians(Math.atan(x), ctx.deg),
  log: (x) => { if (x <= 0) throw new Error('Invalid input'); return Math.log10(x); },
  ln: (x) => { if (x <= 0) throw new Error('Invalid input'); return Math.log(x); },
  sqrt: (x) => { if (x < 0) throw new Error('Invalid input'); return Math.sqrt(x); },
  cbrt: (x) => Math.cbrt(x),
  abs: (x) => Math.abs(x),
  exp: (x) => Math.exp(x),
};

const CONSTANTS = { pi: Math.PI, e: Math.E };

function toRadians(x, deg) { return deg ? x * DEG_TO_RAD : x; }
function fromRadians(x, deg) { return deg ? x * RAD_TO_DEG : x; }

function within(x, lo, hi) {
  if (x < lo || x > hi) throw new Error('Invalid input');
  return x;
}

function factorial(n) {
  if (!Number.isInteger(n) || n < 0) throw new Error('Invalid factorial');
  if (n > 170) throw new Error('Overflow');
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/* ----- Tokenizer ----- */

function tokenize(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;
  const isDigit = (c) => c >= '0' && c <= '9';
  const isLetter = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');

  while (i < n) {
    const c = src[i];

    if (c === ' ' || c === '\t') { i++; continue; }

    // Number: digits, optional single decimal point, optional exponent (2e3, 1.5e-10)
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] || ''))) {
      let j = i;
      while (j < n && (isDigit(src[j]) || src[j] === '.')) j++;
      if (j < n && (src[j] === 'e' || src[j] === 'E')) {
        let k = j + 1;
        if (src[k] === '+' || src[k] === '-') k++;
        if (k < n && isDigit(src[k])) {
          while (k < n && isDigit(src[k])) k++;
          j = k;
        }
      }
      const raw = src.slice(i, j);
      const value = Number(raw);
      if (Number.isNaN(value)) throw new Error('Invalid expression');
      tokens.push({ type: 'num', value });
      i = j;
      continue;
    }

    // Word: function / constant / mod
    if (isLetter(c)) {
      let j = i;
      while (j < n && isLetter(src[j])) j++;
      const word = src.slice(i, j).toLowerCase();
      if (word === 'mod') tokens.push({ type: 'op', op: 'mod' });
      else tokens.push({ type: 'ident', name: word });
      i = j;
      continue;
    }

    switch (c) {
      case '+': tokens.push({ type: 'op', op: '+' }); break;
      case '-': tokens.push({ type: 'op', op: '-' }); break;
      case '*': tokens.push({ type: 'op', op: '*' }); break;
      case '/': tokens.push({ type: 'op', op: '/' }); break;
      case '^': tokens.push({ type: 'op', op: '^' }); break;
      case '(': tokens.push({ type: 'lparen' }); break;
      case ')': tokens.push({ type: 'rparen' }); break;
      case '!': tokens.push({ type: 'fact' }); break;
      case '%': tokens.push({ type: 'pct' }); break;
      default: throw new Error('Invalid expression');
    }
    i++;
  }

  tokens.push({ type: 'eof' });
  return tokens;
}

/* ----- Recursive-descent parser -----
   Precedence (low → high):
     expression : term (('+'|'-') term)*
     term       : unary (('*'|'/'|'mod'| implicit-mult) unary)*
     unary      : ('-'|'+')* power
     power      : postfix ('^' unary)?          (right associative)
     postfix    : primary ('!'|'%')*
     primary    : number | '(' expression ')' | constant | function(arg)
*/

class Parser {
  constructor(tokens, ctx) {
    this.tokens = tokens;
    this.pos = 0;
    this.ctx = ctx || { deg: true, ans: null };
  }

  peek() { return this.tokens[this.pos]; }
  next() { return this.tokens[this.pos++]; }

  expect(type) {
    const t = this.next();
    if (t.type !== type) throw new Error('Invalid expression');
    return t;
  }

  atEnd() { return this.peek().type === 'eof'; }

  parseExpression() {
    let value = this.parseTerm();
    while (this.peek().type === 'op' && (this.peek().op === '+' || this.peek().op === '-')) {
      const op = this.next().op;
      const rhs = this.parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  parseTerm() {
    let value = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t.type === 'op' && (t.op === '*' || t.op === '/' || t.op === 'mod')) {
        const op = this.next().op;
        const rhs = this.parseUnary();
        if (op === '*') {
          value *= rhs;
        } else if (op === '/') {
          if (rhs === 0) throw new Error('Cannot divide by zero');
          value /= rhs;
        } else {
          if (rhs === 0) throw new Error('Cannot divide by zero');
          value %= rhs;
        }
        continue;
      }
      // Implicit multiplication: 2π, 2(3+4), (2+3)(4), 2√25, 2sin(30)
      if (t.type === 'lparen' || t.type === 'num' ||
          (t.type === 'ident' && t.name !== 'mod')) {
        value *= this.parseUnary();
        continue;
      }
      break;
    }
    return value;
  }

  parseUnary() {
    const t = this.peek();
    if (t.type === 'op' && (t.op === '-' || t.op === '+')) {
      this.next();
      const v = this.parseUnary();
      return t.op === '-' ? -v : v;
    }
    return this.parsePower();
  }

  parsePower() {
    const base = this.parsePostfix();
    const t = this.peek();
    if (t.type === 'op' && t.op === '^') {
      this.next();
      const exp = this.parseUnary();
      return Math.pow(base, exp);
    }
    return base;
  }

  parsePostfix() {
    let value = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      if (t.type === 'fact') { this.next(); value = factorial(value); }
      else if (t.type === 'pct') { this.next(); value = value / 100; }
      else break;
    }
    return value;
  }

  parsePrimary() {
    const t = this.peek();

    if (t.type === 'num') { this.next(); return t.value; }

    if (t.type === 'lparen') {
      this.next();
      const v = this.parseExpression();
      this.expect('rparen');
      return v;
    }

    if (t.type === 'ident') {
      this.next();
      const name = t.name.toLowerCase();

      if (name === 'ans') {
        if (this.ctx.ans == null) throw new Error('No previous answer');
        return this.ctx.ans;
      }
      if (name === 'rand') return Math.random();
      if (name in CONSTANTS) return CONSTANTS[name];

      if (name in FUNCTIONS) {
        const next = this.peek();
        if (next.type === 'lparen') {
          this.next();
          const arg = this.parseExpression();
          this.expect('rparen');
          return FUNCTIONS[name](arg, this.ctx);
        }
        // Bare application: √25, sinπ, sin√2, sin(30) via implicit chain
        if (next.type === 'num' || next.type === 'ident' ||
            (next.type === 'op' && (next.op === '-' || next.op === '+'))) {
          const arg = this.parseUnary();
          return FUNCTIONS[name](arg, this.ctx);
        }
        throw new Error('Invalid expression');
      }
      throw new Error('Invalid expression');
    }

    throw new Error('Invalid expression');
  }
}

/* ----- Evaluate entry point ----- */

function normalizeInput(input) {
  return input
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/√/g, 'sqrt')
    .replace(/∛/g, 'cbrt')
    .replace(/π/g, 'pi')
    .replace(/\s+/g, '');
}

function balanceParens(input) {
  let opens = 0;
  for (const ch of input) {
    if (ch === '(') opens++;
    else if (ch === ')') opens--;
  }
  return opens > 0 ? input + ')'.repeat(opens) : input;
}

/** Evaluate an expression string. Throws Error with a friendly message. */
function evaluate(input, ctx) {
  if (typeof input !== 'string' || input.trim() === '') throw new Error('Invalid expression');

  const src = normalizeInput(input);

  // Stray closing parens are invalid; unmatched opening parens are auto-closed.
  let opens = 0;
  for (const ch of src) {
    if (ch === '(') opens++;
    else if (ch === ')') {
      opens--;
      if (opens < 0) throw new Error('Invalid expression');
    }
  }
  const balanced = opens > 0 ? src + ')'.repeat(opens) : src;

  const tokens = tokenize(balanced);
  const parser = new Parser(tokens, ctx || { deg: true, ans: null });
  const value = parser.parseExpression();
  if (!parser.atEnd()) throw new Error('Invalid expression');

  if (Number.isNaN(value)) throw new Error('Invalid input');
  if (!isFinite(value)) throw new Error('Overflow');
  return value;
}

/* ----- Number formatting (no floating-point artifacts) ----- */

function toExponentialString(n) {
  const parts = n.toExponential(10).split('e');
  const mantissa = parts[0].replace(/\.?0+$/, '');
  const exponent = parts[1].replace('+', '');
  return mantissa + 'e' + exponent;
}

function formatNumber(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 'Error';
  if (n === 0) return '0';
  if (!isFinite(n)) return n > 0 ? '∞' : '-∞';
  if (Math.abs(n) < 1e-12) return '0'; // fuzzy zero (sin(π) → 0)

  if (Math.abs(n) >= 1e15 || Math.abs(n) < 1e-9) return toExponentialString(n);

  let s = n.toPrecision(12);
  if (/e/i.test(s)) s = String(parseFloat(s)); // large-but-shown numbers
  s = s.replace(/\.?0+$/, '');
  return s;
}

/* ---------------- State ---------------- */

const state = {
  expr: '',
  result: null,      // last committed result (after =)
  liveResult: null,  // live evaluation while typing
  ans: null,         // value for the Ans button
  error: null,
  justEvaluated: false,
  deg: true,
  mode: 'scientific',
  mem: null,
  history: [],
  settings: { sound: true, haptic: false, autoCopy: false },
};

const STORE_KEYS = {
  history: 'calcpro.history',
  theme: 'calcpro.theme',
  mode: 'calcpro.mode',
  deg: 'calcpro.deg',
  mem: 'calcpro.mem',
  settings: 'calcx.settings',
};

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  },
};

/* ---------------- Settings & button feedback ---------------- */

const SETTINGS_DEFAULTS = { sound: true, haptic: false, autoCopy: false };

function saveSettings() { store.set(STORE_KEYS.settings, state.settings); }

let audioCtx = null;

function playClick() {
  if (!state.settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const t = audioCtx.currentTime;
    osc.type = 'sine';
    osc.frequency.value = 720;
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.09);
  } catch { /* audio unavailable */ }
}

function playErrorSound() {
  if (!state.settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const t = audioCtx.currentTime;
    osc.type = 'square';
    osc.frequency.value = 150;
    gain.gain.setValueAtTime(0.04, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  } catch { /* audio unavailable */ }
}

function hapticFeedback() {
  if (state.settings.haptic && navigator.vibrate) navigator.vibrate(12);
}

function buttonFeedback() { playClick(); hapticFeedback(); }

function shakeDisplay() {
  els.calcCard.classList.remove('shake');
  void els.calcCard.offsetWidth; // restart the animation
  els.calcCard.classList.add('shake');
}

/* ---------------- DOM references & helpers ---------------- */

let els = {};

function $(id) { return document.getElementById(id); }

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => els.toast.classList.remove('show'), 1600);
}

function currentValue() {
  if (state.result != null) return state.result;
  if (state.liveResult != null) return state.liveResult;
  return 0;
}

function isValueEnding(expr) {
  if (!expr) return false;
  const last = expr[expr.length - 1];
  return /[0-9.)!%]/.test(last) || last === 'π' || last === 'e';
}

const LONE_NUMBER = /^-?\d+(\.\d+)?$/;

const DISPLAY_FN = {
  sin: 'sin(', cos: 'cos(', tan: 'tan(',
  asin: 'asin(', acos: 'acos(', atan: 'atan(',
  log: 'log(', ln: 'ln(',
  sqrt: '√(', cbrt: '∛(', abs: 'abs(',
};

/* ---------------- Input handlers ---------------- */

function appendText(text) {
  state.expr += text;
  state.justEvaluated = false;
  updateLive();
}

function handleDigit(d) {
  if (state.justEvaluated) {
    state.expr = d;
    state.justEvaluated = false;
  } else {
    state.expr += d;
  }
  updateLive();
}

function handleDecimal() {
  if (state.justEvaluated) {
    state.expr = '0.';
    state.justEvaluated = false;
  } else if (!state.expr) {
    state.expr = '0.';
  } else {
    const last = state.expr[state.expr.length - 1];
    if (/[+\-×÷^%]/.test(last) || /mod$/.test(state.expr)) state.expr += '0.';
    else state.expr += '.';
  }
  updateLive();
}

function handleOperator(op) {
  if (state.justEvaluated && state.result != null) {
    state.expr = formatNumber(state.result) + op;
    state.justEvaluated = false;
    updateLive();
    return;
  }
  if (!state.expr) {
    if (op === '-' || op === '+') state.expr = op;
    updateLive();
    return;
  }
  const last = state.expr[state.expr.length - 1];
  if (/[+\-×÷^]/.test(last)) {
    state.expr = state.expr.slice(0, -1) + op;
  } else if (/mod$/.test(state.expr)) {
    state.expr = state.expr.slice(0, -3) + op;
  } else if (last === '(') {
    if (op === '-' || op === '+') state.expr += op;
  } else {
    state.expr += op;
  }
  updateLive();
}

function handleParen(p) {
  if (state.justEvaluated && state.result != null) {
    state.expr = p;
    state.justEvaluated = false;
    updateLive();
    return;
  }
  if (p === '(') {
    state.expr += '(';
  } else {
    let opens = 0;
    for (const ch of state.expr) {
      if (ch === '(') opens++;
      else if (ch === ')') opens--;
    }
    const last = state.expr[state.expr.length - 1];
    if (state.expr && opens > 0 && last !== '(' && !/[+\-×÷^%]/.test(last) && !/mod$/.test(state.expr)) {
      state.expr += ')';
    }
  }
  updateLive();
}

function handleFunction(name) {
  const open = DISPLAY_FN[name] || name + '(';
  if (state.justEvaluated && state.result != null) {
    state.expr = open + formatNumber(state.result) + ')';
    state.justEvaluated = false;
  } else if (isValueEnding(state.expr)) {
    state.expr += '×' + open;
  } else {
    state.expr += open;
  }
  updateLive();
}

/** Wrap the whole current expression: x², x³, 10ˣ, eˣ, 1/x */
function wrapExpression(suffix, prefix, emptyFallback) {
  let target;
  if (state.justEvaluated && state.result != null) target = formatNumber(state.result);
  else if (state.expr) target = state.expr;
  else {
    if (emptyFallback) { state.expr = emptyFallback; updateLive(); }
    return;
  }
  state.expr = LONE_NUMBER.test(target)
    ? prefix + target + suffix
    : prefix + '(' + target + ')' + suffix;
  state.justEvaluated = false;
  updateLive();
}

function handleConstant(name) {
  const text = name === 'pi' ? 'π' : name === 'rand' ? 'rand' : name;
  if (state.justEvaluated && state.result != null) {
    state.expr = text;
    state.justEvaluated = false;
  } else if (isValueEnding(state.expr)) {
    state.expr += '×' + text;
  } else {
    state.expr += text;
  }
  updateLive();
}

function handleAns() {
  if (state.ans == null) { showToast('No previous answer'); return; }
  handleConstant('ans');
}

function handleFactorial() {
  if (state.justEvaluated && state.result != null) {
    state.expr = formatNumber(state.result) + '!';
    state.justEvaluated = false;
  } else {
    const last = state.expr[state.expr.length - 1];
    if (state.expr && /[0-9)!]/.test(last)) state.expr += '!';
  }
  updateLive();
}

function handlePercent() {
  if (state.justEvaluated && state.result != null) {
    state.expr = formatNumber(state.result) + '%';
    state.justEvaluated = false;
  } else {
    const last = state.expr[state.expr.length - 1];
    if (state.expr && /[0-9)!]/.test(last)) state.expr += '%';
  }
  updateLive();
}

function handleSign() {
  if (state.justEvaluated && state.result != null) {
    state.expr = formatNumber(-state.result);
    state.justEvaluated = false;
  } else if (LONE_NUMBER.test(state.expr)) {
    state.expr = state.expr.startsWith('-') ? state.expr.slice(1) : '-' + state.expr;
  } else if (!state.expr || state.expr === '-' || state.expr === '+') {
    state.expr = state.expr === '-' ? '' : '-';
  } else {
    state.expr = '-(' + state.expr + ')';
  }
  updateLive();
}

function handleMod() {
  if (state.justEvaluated && state.result != null) {
    state.expr = formatNumber(state.result) + 'mod';
    state.justEvaluated = false;
  } else {
    const last = state.expr[state.expr.length - 1];
    if (state.expr && !/[+\-×÷^%]/.test(last) && !/mod$/.test(state.expr) && last !== '(') {
      state.expr += 'mod';
    }
  }
  updateLive();
}

function handleExp() {
  if (state.justEvaluated && state.result != null) {
    state.expr = formatNumber(state.result) + '×10^';
    state.justEvaluated = false;
  } else if (isValueEnding(state.expr)) {
    state.expr += '×10^';
  } else if (!state.expr) {
    state.expr = '10^';
  }
  updateLive();
}

function handleBackspace() {
  if (state.justEvaluated) {
    state.expr = '';
    state.result = null;
    state.justEvaluated = false;
    updateLive();
    return;
  }
  if (!state.expr) return;
  const last = state.expr[state.expr.length - 1];
  if (/[a-z]/i.test(last)) {
    // Remove the whole word token (sin, mod, ans, …)
    while (state.expr && /[a-z]/i.test(state.expr[state.expr.length - 1])) {
      state.expr = state.expr.slice(0, -1);
    }
  } else {
    state.expr = state.expr.slice(0, -1);
  }
  updateLive();
}

function handleClear() {
  state.expr = '';
  state.result = null;
  state.liveResult = null;
  state.error = null;
  state.justEvaluated = false;
  renderDisplay();
}

function handleEquals() {
  if (!state.expr.trim()) {
    setError('Invalid expression');
    return;
  }
  try {
    const value = evaluate(state.expr, { deg: state.deg, ans: state.ans });
    const balanced = balanceParens(state.expr);
    addHistory(balanced, value);
    state.result = value;
    state.ans = value;
    state.justEvaluated = true;
    state.expr = balanced;
    state.error = null;
    if (state.settings.autoCopy) {
      navigator.clipboard.writeText(formatNumber(value)).then(
        () => showToast('Copied!'),
        () => {}
      );
    }
  } catch (err) {
    setError(err.message);
    playErrorSound();
    shakeDisplay();
  }
  renderDisplay();
}

/* ---------------- Live evaluation & display ---------------- */

function updateLive() {
  state.error = null;
  state.liveResult = null;
  if (state.expr.trim()) {
    try {
      state.liveResult = evaluate(state.expr, { deg: state.deg, ans: state.ans });
    } catch { /* silent while typing */ }
  }
  renderDisplay();
}

function setError(msg) {
  state.error = msg;
  state.liveResult = null;
}

function renderDisplay() {
  const expr = state.expr;
  els.exprEl.textContent = expr || '0';
  els.exprEl.classList.toggle('long', expr.length > 26);
  els.exprEl.scrollLeft = els.exprEl.scrollWidth;

  const shown = state.error
    ? state.error
    : state.justEvaluated && state.result != null
      ? formatNumber(state.result)
      : state.liveResult != null
        ? formatNumber(state.liveResult)
        : '';
  els.resultEl.textContent = shown;
  els.resultEl.classList.toggle('error', !!state.error);
  els.resultEl.classList.toggle('long', shown.length > 14);

  els.modeChip.textContent = state.deg ? 'DEG' : 'RAD';
  els.modeChip.setAttribute('aria-pressed', String(state.deg));
  const degRadBtn = $('deg-rad-btn');
  degRadBtn.textContent = state.deg ? 'DEG' : 'RAD';
  degRadBtn.setAttribute('aria-pressed', String(state.deg));

  els.memIndicator.hidden = state.mem == null;

  syncAngleControls();
}

function renderAll() {
  renderDisplay();
  renderHistory();
}

/* ---------------- History ---------------- */

function addHistory(expr, value) {
  const last = state.history[0];
  if (last && last.expr === expr && last.value === value) return; // dedupe repeats
  state.history.unshift({ expr, value });
  if (state.history.length > 100) state.history.length = 100;
  store.set(STORE_KEYS.history, state.history);
  renderHistory();
}

function renderHistory() {
  els.historyList.innerHTML = '';
  els.historyEmpty.hidden = state.history.length > 0;

  for (const item of state.history) {
    const li = document.createElement('li');

    const row = document.createElement('div');
    row.className = 'history-item';
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-label', 'Reuse ' + item.expr + ' = ' + formatNumber(item.value));

    const body = document.createElement('span');
    body.className = 'history-item-body';
    const exprSpan = document.createElement('span');
    exprSpan.className = 'history-item-expr';
    exprSpan.textContent = item.expr;
    const resSpan = document.createElement('span');
    resSpan.className = 'history-item-result';
    resSpan.textContent = formatNumber(item.value);
    body.append(exprSpan, resSpan);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'history-item-del';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Remove from history');
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      state.history = state.history.filter((h) => h !== item);
      store.set(STORE_KEYS.history, state.history);
      renderHistory();
    });

    const reuse = () => {
      buttonFeedback();
      state.expr = item.expr;
      state.result = item.value;
      state.ans = item.value;
      state.justEvaluated = true;
      state.error = null;
      renderDisplay();
      closeHistory();
    };
    row.addEventListener('click', reuse);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reuse(); }
    });

    row.append(body, del);
    li.append(row);
    els.historyList.append(li);
  }
}

function clearHistory() {
  state.history = [];
  store.set(STORE_KEYS.history, state.history);
  renderHistory();
}

/* ---------------- Memory ---------------- */

function saveMemory() { store.set(STORE_KEYS.mem, state.mem); }

function memoryAdd(subtract) {
  const v = currentValue();
  state.mem = (state.mem == null ? 0 : state.mem) + (subtract ? -v : v);
  saveMemory();
  renderDisplay();
  showToast('Memory: ' + formatNumber(state.mem));
}

function memoryRecall() {
  if (state.mem == null) return;
  const text = formatNumber(state.mem);
  if (state.justEvaluated || !state.expr) {
    state.expr = text;
    state.justEvaluated = false;
  } else if (isValueEnding(state.expr)) {
    state.expr += '×' + text;
  } else {
    state.expr += text;
  }
  updateLive();
}

function memoryClear() {
  state.mem = null;
  saveMemory();
  renderDisplay();
}

/* ---------------- Mode / DEG-RAD / theme / fullscreen ---------------- */

function setMode(mode) {
  state.mode = mode;
  store.set(STORE_KEYS.mode, mode);
  document.body.classList.toggle('sci-mode', mode === 'scientific');
  els.segBtns.forEach((b) => {
    const active = b.dataset.mode === mode;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
}

function toggleDegRad() {
  state.deg = !state.deg;
  store.set(STORE_KEYS.deg, state.deg);
  updateLive();
}

function syncAngleControls() {
  els.degOpts.forEach((b) => {
    const active = (b.dataset.degOpt === 'true') === state.deg;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
}

function setAngleMode(deg) {
  state.deg = deg;
  store.set(STORE_KEYS.deg, state.deg);
  updateLive();
}

/* ---------------- Settings modal ---------------- */

function isSettingsOpen() {
  return els.settingsModal && !els.settingsModal.hidden;
}

function openSettings() {
  els.settingsModal.hidden = false;
  els.settingsBackdrop.hidden = false;
  requestAnimationFrame(() => {
    els.settingsModal.classList.add('show');
    els.settingsBackdrop.classList.add('show');
  });
  els.settingSound.checked = state.settings.sound;
  els.settingHaptic.checked = state.settings.haptic;
  els.settingAutoCopy.checked = state.settings.autoCopy;
  syncThemeOpts();
  syncAngleControls();
}

function closeSettings() {
  els.settingsModal.classList.remove('show');
  els.settingsBackdrop.classList.remove('show');
  setTimeout(() => {
    els.settingsModal.hidden = true;
    els.settingsBackdrop.hidden = true;
  }, 200);
}

function syncThemeOpts() {
  const theme = document.documentElement.dataset.theme;
  els.themeOpts.forEach((b) => {
    const active = b.dataset.themeOpt === theme;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  els.themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  els.themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  syncThemeOpts();
}

function initTheme() {
  const saved = store.get(STORE_KEYS.theme, null);
  if (saved) {
    applyTheme(saved);
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(prefersDark.matches ? 'dark' : 'light');
    prefersDark.addEventListener('change', (e) => {
      if (!store.get(STORE_KEYS.theme, null)) applyTheme(e.matches ? 'dark' : 'light');
    });
  }
  els.themeToggle.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    store.set(STORE_KEYS.theme, next);
    applyTheme(next);
  });
}

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
}

/* ---------------- History drawer (mobile) ---------------- */

function openHistory() {
  els.history.classList.add('open');
  els.backdrop.hidden = false;
  requestAnimationFrame(() => els.backdrop.classList.add('show'));
  els.historyToggle.setAttribute('aria-expanded', 'true');
}

function closeHistory() {
  els.history.classList.remove('open');
  els.backdrop.classList.remove('show');
  els.backdrop.hidden = true;
  els.historyToggle.setAttribute('aria-expanded', 'false');
}

/* ---------------- Copy ---------------- */

function handleCopy() {
  const value = state.result != null
    ? formatNumber(state.result)
    : state.liveResult != null
      ? formatNumber(state.liveResult)
      : state.expr;
  if (!value) return;
  navigator.clipboard.writeText(value).then(
    () => showToast('Copied!'),
    () => showToast('Copied!') // fallback message even if clipboard denied
  );
}

/* ---------------- Button wiring ---------------- */

const actions = {
  digit: (btn) => handleDigit(btn.dataset.value),
  decimal: handleDecimal,
  op: (btn) => handleOperator(btn.dataset.value),
  paren: (btn) => handleParen(btn.dataset.value),
  fn: (btn) => handleFunction(btn.dataset.fn),
  pow2: () => wrapExpression('^2', '', null),
  pow3: () => wrapExpression('^3', '', null),
  pow: () => {
    if (state.justEvaluated && state.result != null) {
      state.expr = formatNumber(state.result) + '^';
      state.justEvaluated = false;
      updateLive();
    } else if (isValueEnding(state.expr)) {
      state.expr += '^';
      updateLive();
    }
  },
  pow10: () => wrapExpression('', '10^', '10^('),
  powe: () => wrapExpression('', 'e^', 'e^('),
  recip: () => wrapExpression('', '1/', '1/'),
  fact: handleFactorial,
  pct: handlePercent,
  mod: handleMod,
  const: (btn) => handleConstant(btn.dataset.value),
  ans: handleAns,
  exp: handleExp,
  sign: handleSign,
  degrad: toggleDegRad,
  clear: handleClear,
  backspace: handleBackspace,
  equals: handleEquals,
  mc: memoryClear,
  mr: memoryRecall,
  mplus: () => memoryAdd(false),
  mminus: () => memoryAdd(true),
};

function bindButtons() {
  document.querySelectorAll('.btn[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      buttonFeedback();
      const fn = actions[btn.dataset.action];
      if (fn) fn(btn);
    });
  });

  els.copyBtn.addEventListener('click', () => { buttonFeedback(); handleCopy(); });
  els.modeChip.addEventListener('click', () => { buttonFeedback(); toggleDegRad(); });
  els.historyClear.addEventListener('click', clearHistory);
  els.historyToggle.addEventListener('click', () => {
    els.history.classList.contains('open') ? closeHistory() : openHistory();
  });
  els.backdrop.addEventListener('click', closeHistory);
  els.fullscreenToggle.addEventListener('click', toggleFullscreen);

  els.settingsToggle.addEventListener('click', openSettings);
  els.prefsSettingsBtn.addEventListener('click', openSettings);
  els.settingsClose.addEventListener('click', closeSettings);
  els.settingsBackdrop.addEventListener('click', closeSettings);

  els.settingSound.addEventListener('change', () => {
    state.settings.sound = els.settingSound.checked;
    saveSettings();
  });
  els.settingHaptic.addEventListener('change', () => {
    state.settings.haptic = els.settingHaptic.checked;
    saveSettings();
  });
  els.settingAutoCopy.addEventListener('change', () => {
    state.settings.autoCopy = els.settingAutoCopy.checked;
    saveSettings();
  });
  els.settingsClearHistory.addEventListener('click', () => {
    clearHistory();
    showToast('History cleared');
  });

  els.themeOpts.forEach((b) =>
    b.addEventListener('click', () => {
      buttonFeedback();
      store.set(STORE_KEYS.theme, b.dataset.themeOpt);
      applyTheme(b.dataset.themeOpt);
    })
  );

  els.degOpts.forEach((b) =>
    b.addEventListener('click', () => {
      buttonFeedback();
      setAngleMode(b.dataset.degOpt === 'true');
    })
  );

  els.segBtns.forEach((b) =>
    b.addEventListener('click', () => { buttonFeedback(); setMode(b.dataset.mode); })
  );
}

/* ---------------- Keyboard support ---------------- */

function bindKeyboard() {
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;

    // Escape closes the settings modal first, otherwise it clears the display.
    if (k === 'Escape') {
      e.preventDefault();
      if (isSettingsOpen()) { closeSettings(); return; }
      handleClear();
      return;
    }

    // While settings are open, let modal controls work natively but keep
    // calculator keys from leaking through.
    if (isSettingsOpen()) {
      if (e.target && e.target.closest && e.target.closest('#settings-modal')) return;
      e.preventDefault();
      return;
    }

    if (k >= '0' && k <= '9') { handleDigit(k); e.preventDefault(); return; }
    if (k === '00') { handleDigit('00'); e.preventDefault(); return; }

    switch (k) {
      case '.': case ',': handleDecimal(); e.preventDefault(); break;
      case '+': handleOperator('+'); e.preventDefault(); break;
      case '-': handleOperator('-'); e.preventDefault(); break;
      case '*': handleOperator('×'); e.preventDefault(); break;
      case '/': handleOperator('÷'); e.preventDefault(); break;
      case '(': handleParen('('); e.preventDefault(); break;
      case ')': handleParen(')'); e.preventDefault(); break;
      case '%': handlePercent(); e.preventDefault(); break;
      case '!': handleFactorial(); e.preventDefault(); break;
      case '^': actions.pow(); e.preventDefault(); break;
      case 'Enter': case '=': handleEquals(); e.preventDefault(); break;
      case 'Backspace': handleBackspace(); e.preventDefault(); break;
      case 'Delete': handleClear(); e.preventDefault(); break;
    }
  });
}

/* ---------------- Init ---------------- */

function loadPreferences() {
  state.history = store.get(STORE_KEYS.history, []);
  state.mode = store.get(STORE_KEYS.mode, 'scientific');
  state.deg = store.get(STORE_KEYS.deg, true);
  state.mem = store.get(STORE_KEYS.mem, null);
  state.settings = Object.assign({}, SETTINGS_DEFAULTS, store.get(STORE_KEYS.settings, {}));
}

function initApp() {
  els = {
    calcCard: $('calculator-card'),
    exprEl: $('display-expr'),
    resultEl: $('display-result'),
    modeChip: $('mode-chip'),
    memIndicator: $('mem-indicator'),
    copyBtn: $('copy-btn'),
    history: $('history'),
    historyList: $('history-list'),
    historyEmpty: $('history-empty'),
    historyClear: $('history-clear'),
    historyToggle: $('history-toggle'),
    backdrop: $('backdrop'),
    themeToggle: $('theme-toggle'),
    fullscreenToggle: $('fullscreen-toggle'),
    toast: $('toast'),
    segBtns: Array.from(document.querySelectorAll('.seg-btn')),
    settingsToggle: $('settings-toggle'),
    prefsSettingsBtn: $('prefs-settings-btn'),
    settingsModal: $('settings-modal'),
    settingsBackdrop: $('settings-backdrop'),
    settingsClose: $('settings-close'),
    settingSound: $('setting-sound'),
    settingHaptic: $('setting-haptic'),
    settingAutoCopy: $('setting-autocopy'),
    settingsClearHistory: $('settings-clear-history'),
    themeOpts: Array.from(document.querySelectorAll('.opt-btn[data-theme-opt]')),
    degOpts: Array.from(document.querySelectorAll('.opt-btn[data-deg-opt]')),
  };

  loadPreferences();
  setMode(state.mode);
  initTheme();
  bindButtons();
  bindKeyboard();
  renderAll();
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initApp);
}

/* ---------------- Node export (for tests) ---------------- */

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { evaluate, formatNumber, balanceParens, tokenize, normalizeInput };
}