---
name: editorial-minimal-ui
description: Design and build editorial, monochromatic, minimalist UI inspired by catalog/magazine aesthetics (e.g. Goods site). Use when creating new UI from scratch, building landing pages, extension popups, dashboards, or settings screens — or when revamping existing UI to be more minimal, clean, or editorial. Covers full design system: tokens, typography, layout structure, page anatomy, component patterns, light/dark toggle, and WCAG AA contrast. Applies to HTML/CSS, React, and any component-based stack.
---

# Editorial Minimal UI

Inspired by the Goods catalog aesthetic: pure white/black, editorial typography, radical whitespace, no decorative borders or cards — only thin structural dividers.

Use this system both when **creating new UI** (start with the layout and anatomy templates below) and when **revamping existing UI** (use the checklist at the end).

## Building new UI — layout and anatomy

### Spacing scale

| Context | Outer padding | Section gap | Item gap |
|---------|--------------|-------------|----------|
| Popup / dense (≤400px) | `16–18px` | `14–16px` | `10–12px` |
| Web page | `24–28px` | `52–64px` | `16–20px` |

Wrap all content:
```css
.wrap { max-width: 680px; margin: 0 auto; padding: 0 28px; }
```

### Web page anatomy

```
nav        — brand mark + nav links, border-bottom: 1px solid var(--line)
hero       — label → headline → sub → CTA, border-bottom: 1px solid var(--line)
section×N  — section-label → divider list, border-bottom: 1px solid var(--line)
footer     — ✳ mark → italic tagline → muted desc → credit link
```

Each section opens with a label, then a list of items separated by dividers:
```html
<section>
  <p class="section-label">Label</p>
  <ul class="item-list">
    <li class="item">...</li>
    <li class="item">...</li>
  </ul>
</section>
```

### Popup / extension anatomy

```
app-header  — ✳ wordmark (uppercase, 0.7rem) + secondary link
tabs        — underline tabs (Chat / Settings)
tab-panel   — scrollable content area, flex-column
  chat-messages — flex-column gap, no border box
  chat-form     — thin border container, flat input + send button
settings    — stacked label/input pairs, flat inputs, bottom-border only
```

### Hero pattern

```html
<section class="hero">
  <p class="hero-label">Category · Qualifier</p>           <!-- muted label -->
  <h1 class="hero-headline">Short punchy<br>headline.</h1> <!-- weight 400, tight tracking -->
  <p class="hero-sub">One or two sentences max.</p>        <!-- muted, max-width 440px -->
  <a class="btn-primary" href="#">Call to action</a>
</section>
```

```css
.hero-label   { font-size: 0.62rem; letter-spacing: 0.1em; text-transform: uppercase;
                color: var(--muted); margin-bottom: 28px; }
.hero-headline { font-size: clamp(2.4rem, 7vw, 3.8rem); font-weight: 400;
                 letter-spacing: -0.025em; line-height: 1.08; margin-bottom: 22px; }
.hero-sub     { font-size: 1.05rem; color: var(--muted); line-height: 1.7;
                max-width: 440px; margin-bottom: 44px; }
```

### Numbered steps pattern

```html
<ol class="step-list">
  <li class="step-item">
    <span class="step-num">01</span>
    <p class="step-text">Action. <em>Secondary note.</em></p>
  </li>
</ol>
```

```css
.step-list { list-style: none; margin: 0; padding: 0; }
.step-item { display: grid; grid-template-columns: 28px 1fr; gap: 20px;
             padding: 16px 0; border-top: 1px solid var(--line); }
.step-item:first-child { border-top: 0; padding-top: 0; }
.step-num  { font-size: 0.62rem; font-weight: 500; color: var(--muted); }
.step-text em { font-style: normal; color: var(--muted); }
```

### Feature list pattern

```html
<ul class="feature-list">
  <li class="feature-item">
    <p class="feature-title">Title</p>
    <p class="feature-desc">Description sentence.</p>
  </li>
</ul>
```

```css
.feature-list { list-style: none; margin: 0; padding: 0; }
.feature-item { padding: 20px 0; border-top: 1px solid var(--line); }
.feature-item:first-child { border-top: 0; padding-top: 0; }
.feature-title { font-size: 0.92rem; font-weight: 500; margin: 0 0 5px; }
.feature-desc  { font-size: 0.84rem; color: var(--muted); line-height: 1.65; margin: 0; }
```

### Chat bubble pattern (dense UI)

```css
.chat-message { display: flex; flex-direction: column; gap: 4px; font-size: 0.84rem; }
.chat-message-label { font-size: 0.62rem; letter-spacing: 0.09em;
                      text-transform: uppercase; color: var(--muted); }
.chat-text { background: var(--surface-sub); border-radius: 4px 14px 14px 14px;
             padding: 9px 13px; }
.chat-message.user .chat-text { background: var(--accent); color: var(--on-accent);
                                 border-radius: 14px 4px 14px 14px; }
```

---

## Color tokens

```css
/* Light (default) */
:root {
  --bg: #ffffff;
  --surface: #ffffff;
  --surface-sub: #f5f5f5;
  --text: #0d0d0d;
  --muted: #666666;    /* 5.74:1 on #fff — WCAG AA */
  --line: #e8e8e8;
  --accent: #0d0d0d;   /* monochromatic — NO blue/color accents */
  --on-accent: #ffffff;
}

/* Dark */
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d0d0d;
    --surface: #0d0d0d;
    --surface-sub: #161616;
    --text: #f0f0f0;
    --muted: #888888;  /* 5.46:1 on #0d0d0d — WCAG AA */
    --line: #1f1f1f;
    --accent: #f0f0f0;
    --on-accent: #0d0d0d;
  }
}
```

Never introduce blue, purple, green, or any hue. Monochromatic only.

## Typography

```css
body {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text",
    "Helvetica Neue", Arial, sans-serif;
  font-size: 13px;          /* popup/dense UI */
  /* font-size: 15px;       web/landing */
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
```

**Label style** — section headers, tabs, metadata, step numbers:
```css
font-size: 0.62–0.72rem;
font-weight: 500;
letter-spacing: 0.08–0.1em;
text-transform: uppercase;
color: var(--muted);
```

**Large headings** (hero/page title):
```css
font-weight: 400;
letter-spacing: -0.02em to -0.025em;
line-height: 1.08;
```

**Body**: weight 400, `line-height: 1.55–1.7`
**Monospace**: `"SF Mono", "Cascadia Mono", "Fira Mono", Menlo, monospace`

## The core pattern — dividers instead of cards

Replace every card/box with a top-border divider. This is the single most important rule.

```css
.item {
  border-top: 1px solid var(--line);
  padding: 16px 0;
}
.item:first-child { border-top: 0; padding-top: 0; }
```

Strip: box-shadow, card background-color fills, `border-radius > 6px` on containers, gradient backgrounds.

## Interactive elements

**Primary button** (inverts on hover):
```css
.btn {
  border: 1px solid var(--text);
  border-radius: 4px;
  background: var(--text);
  color: var(--bg);
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  padding: 10px 20px;
  transition: background 100ms, color 100ms;
}
.btn:hover { background: transparent; color: var(--text); }
```

**Secondary / nav links**:
```css
color: var(--muted);
text-decoration: underline;
text-decoration-color: var(--line);
text-underline-offset: 2px;
/* hover: */ color: var(--text); text-decoration-color: var(--text);
```

**Tabs** — underline indicator, no box:
```css
.tab { border-bottom: 1.5px solid transparent; margin-bottom: -1px;
       padding: 0 0 10px; color: var(--muted); font-size: 0.7rem;
       letter-spacing: 0.08em; text-transform: uppercase; }
.tab.active { color: var(--text); border-bottom-color: var(--text); }
/* container: */ border-bottom: 1px solid var(--line);
```

**Inputs** (flat, no box):
```css
input, select {
  border: 0;
  border-bottom: 1px solid var(--line);
  border-radius: 0;
  background: transparent;
  color: var(--text);
  padding: 8px 0;
  appearance: none;
}
input:focus, select:focus { border-bottom-color: var(--text); outline: none; }
```

## Light/dark manual toggle

Three-layer cascade — manual class wins over system preference:

```css
/* 1. :root = light default */
/* 2. @media (prefers-color-scheme: dark) — system fallback */
/* 3. Manual override — higher specificity (0,1,1) beats :root (0,0,1) */
html.theme-light { --bg: #ffffff; --text: #0d0d0d; --muted: #666666;
                   --line: #e8e8e8; --surface-sub: #f5f5f5; }
html.theme-dark  { --bg: #0d0d0d; --text: #f0f0f0; --muted: #888888;
                   --line: #1f1f1f; --surface-sub: #161616; }

/* Enable transitions only after first paint — prevents flash on load */
html.transitions-ready body {
  transition: background-color 200ms ease, color 200ms ease;
}
```

Prevent flash-of-wrong-theme — inline script in `<head>` before CSS:
```html
<script>
  (function(){
    var t = localStorage.getItem("theme");
    if (t === "dark" || t === "light")
      document.documentElement.classList.add("theme-" + t);
  }());
</script>
```

Enable transitions after first frame using double-rAF (not setTimeout):
```js
requestAnimationFrame(() => requestAnimationFrame(() =>
  document.documentElement.classList.add("transitions-ready")
));
```

Toggle logic:
```js
function effectiveTheme() {
  var h = document.documentElement;
  if (h.classList.contains("theme-dark")) return "dark";
  if (h.classList.contains("theme-light")) return "light";
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function setTheme(t) {
  document.documentElement.classList.remove("theme-dark", "theme-light");
  document.documentElement.classList.add("theme-" + t);
  localStorage.setItem("theme", t);
}
btn.addEventListener("click", () =>
  setTheme(effectiveTheme() === "dark" ? "light" : "dark")
);
```

Toggle button — `◐` (U+25D0, not an emoji), styled as muted link, `aria-label` synced to current state.

## Brand conventions

- Mark: `✳` (U+2733) in header/nav and footer
- Header: `<span class="brand-mark">✳</span> Name` — `0.7rem / 500 / 0.1em tracking / uppercase`
- Footer pattern: `✳` at `1.4–1.5rem / opacity 0.45`, then italic tagline, short muted desc, small credit link

## Contrast reference

| Token     | Light value | On bg     | Ratio  | Dark value | On bg    | Ratio  |
|-----------|------------|-----------|--------|------------|----------|--------|
| `--muted` | `#666666`  | `#ffffff` | 5.74:1 | `#888888`  | `#0d0d0d`| 5.46:1 |
| `--text`  | `#0d0d0d`  | `#ffffff` | 19.6:1 | `#f0f0f0`  | `#0d0d0d`| 18.1:1 |

Never use a gray lighter than `#666666` on white or darker than `#888888` on `#0d0d0d` for readable text.

## Checklists

### New build
- [ ] Paste color tokens into `:root` and dark media query
- [ ] Set body font stack, `font-size`, `line-height`, `antialiased`
- [ ] Add `.wrap` container with correct `max-width` and padding
- [ ] Build page/popup anatomy from the templates above
- [ ] Every list uses the divider pattern (`border-top`, `:first-child` exception)
- [ ] All interactive elements follow the button/link/tab/input patterns
- [ ] Muted text only uses `#666666`+ light / `#888888`+ dark
- [ ] Add light/dark toggle with localStorage + double-rAF transitions

### Revamp existing
- [ ] Replace all colored accents with `var(--text)` / `var(--muted)`
- [ ] Replace all card borders/backgrounds with the divider pattern
- [ ] Strip box-shadows and gradient backgrounds
- [ ] Convert boxed tabs to underline-indicator style
- [ ] Flatten all form inputs to bottom-border only
- [ ] Verify muted text contrast (≥ `#666666` light, ≥ `#888888` dark)
- [ ] Add `antialiased` font smoothing
- [ ] Add `letter-spacing` to all uppercase label elements
