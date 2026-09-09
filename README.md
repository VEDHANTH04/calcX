# CalcX — Calculate Beyond Limits

A premium, glassmorphic **math + scientific calculator** that runs entirely in the browser. No backend, no dependencies — just HTML, CSS, and vanilla JavaScript.

Dark by default with a light mode, responsive from phone to desktop, powered by a safe custom expression parser (no `eval()`), with degree/radian support, persistent history, memory functions, a settings panel (sound, haptics, auto-copy), and full keyboard support.

## Features

- **Basic arithmetic** — `+ − × ÷`, decimals, `±`, `%`, parentheses, `00`, `AC`, backspace, and correct operator precedence (`2 + 3 × 4 = 14`).
- **Scientific functions** — `sin cos tan asin acos atan log ln √ ∛ x² x³ xʸ 10ˣ eˣ 1/x ! |x| mod π e EXP`, plus `Ans` and `rand`. Inverse trig (asin/acos/atan) are always one tap away.
- **DEG / RAD mode** — clearly visible toggle; `sin(30) = 0.5` in DEG, `sin(π/6) = 0.5` in RAD. Synced across the display chip, the scientific panel, the sidebar, and Settings.
- **Implicit multiplication** — `2π`, `2(3+4)`, `5sin(30)` all evaluate naturally.
- **Live display** — expression and result shown together on a large terminal-style readout; result updates as you type.
- **History** — every completed calculation is stored in `localStorage`, click an entry to reuse it, delete single entries, or clear all. Slides out as a drawer on mobile.
- **Memory** — `MC MR M+ M−` with an on-screen `M` indicator when a value is stored.
- **Settings panel** — theme, DEG/RAD, button sound (WebAudio), haptic feedback (`navigator.vibrate`), auto-copy result, clear history, and a keyboard-shortcuts reference. All persisted in `localStorage`.
- **Keyboard support** — full control from the physical keyboard (see below).
- **Friendly error handling** — *Cannot divide by zero*, *Invalid input*, *Invalid factorial*, *Overflow*, *Invalid expression* — with a subtle shake + error tone; the app never crashes.
- **Safe expression engine** — a hand-written tokenizer + recursive-descent parser; arbitrary user input is **never** passed to `eval()`.
- **Two modes** — BASIC and SCIENTIFIC, with a smooth transition between them.
- **Themes** — dark default, light available; toggle from the header, the sidebar, or Settings; remembers your choice and follows your system preference initially.
- **Precision handling** — no floating-point artifacts (`0.1 + 0.2 = 0.3`), scientific notation for very large/small numbers, fuzzy-zero for trig edge cases.
- **Copy result** — one click copies the result with a *Copied!* toast (or automatically after `=` when enabled).
- **Extra touches** — fullscreen mode, mobile history drawer, error shake, button press/hover animations.
- **Accessible** — semantic HTML, ARIA labels, visible focus states, `aria-live` result region, reduced-motion support.

## Technologies used

- HTML5
- CSS3 (custom properties, CSS grid, backdrop-filter glassmorphism, responsive design)
- Vanilla JavaScript (no frameworks, no build step)
- WebAudio (button sounds) and `localStorage` (persistence)

## Folder structure

```
calculator/
├── index.html    # Page structure, keypad, sidebar, settings modal
├── style.css     # Theming, glass UI, layout, responsive design
├── script.js     # Expression engine + UI logic
└── README.md     # You are here
```

## How to run locally (VS Code)

1. Open VS Code.
2. **File → Open Folder…** and select the `calculator` folder.
3. Install the **Live Server** extension (by Ritwick Dey) if you don't have it.
4. Right-click `index.html` → **Open with Live Server**.
5. The app opens at `http://127.0.0.1:5500`.

No Live Server handy? Any of these work too:

```bash
# Python 3
python -m http.server 8000

# or just double-click index.html — it runs entirely client-side
```

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `0`–`9` | Digits |
| `.` or `,` | Decimal point |
| `+` `-` `*` `/` | Add, subtract, multiply, divide |
| `( )` | Parentheses |
| `^` | Power (xʸ) |
| `%` | Percent |
| `!` | Factorial |
| `Enter` or `=` | Calculate |
| `Backspace` | Delete last input |
| `Escape` or `Delete` | Clear all (AC) — `Escape` closes Settings first |

## How the calculator works

- Buttons build a **display expression** (e.g. `sin(30) + √25`).
- As you type, the result line **evaluates live** so you always see where you're heading.
- Pressing `=` commits the result: it becomes the `Ans` value, is added to history, and you can keep chaining (`2 + 3 =`, then `× 4 =` gives `20`).
- Evaluation goes through a hand-written **tokenizer + recursive-descent parser** that understands precedence, parentheses, unary operators, implicit multiplication (`2π`, `2(3+4)`, `2√25`), postfix operators (`5!`, `50%`), and degree/radian conversion. Unmatched opening parentheses are auto-closed; stray closing ones are rejected with a friendly message.
- All preferences (history, theme, mode, DEG/RAD, memory, sound/haptics/auto-copy) persist in `localStorage`.

## How to deploy / publish online

The app is 100% static, so any static host works:

- **GitHub Pages** — push the `calculator` folder to a repo, then Settings → Pages → deploy from the branch (or use the `gh-pages` branch).
- **Netlify** — drag-and-drop the folder at [app.netlify.com/drop](https://app.netlify.com/drop).
- **Vercel** — `npx vercel` in the `calculator` folder (static output, no config needed).
- **Cloudflare Pages** — direct upload of the folder.

## Testing

The expression engine is exportable for Node. Run the built-in checks with:

```bash
node -e "const {evaluate, formatNumber} = require('./script.js'); const a=(e,d)=>{try{return evaluate(e,{deg:d!==false,ans:null})}catch(x){return 'ERR:'+x.message}}; const cases=[['2+2',4],['10-3',7],['5*8',40],['20/4',5],['2+3*4',14],['(2+3)*4',20],['100/4+5',30],['sin(30)',0.5],['cos(60)',0.5],['tan(45)',1],['sqrt(144)',12],['5^2',25],['2^3',8],['2^10',1024],['log(100)',2],['ln(e)',1],['5!',120],['2pi',2*Math.PI],['sin(30)+sqrt(25)',10.5]]; let fail=0; for(const [e,w] of cases){const g=a(e);const ok=Math.abs(g-w)<1e-9;if(!ok){fail++;console.log('FAIL',e,'=',g,'want',w)}} console.log(fail?fail+' failed':'all '+(cases.length)+' passed')"
```

## Future improvement ideas

- Unit conversions (length, mass, temperature, currency).
- Equation solving / graphing for common functions.
- Base conversion (binary / octal / hex).
- History search and export.
- User-defined variables and functions.