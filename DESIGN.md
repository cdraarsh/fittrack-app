# FitTrack Design System v1.0

> A training journal for serious lifters. Clean, honest numbers. Hairlines instead of shadows. The work speaks louder than the interface.

**Status:** locked 2026-04-17 · supersedes the v1.5 dark-green palette · all new UI must conform.

---

## 1. Principles

1. **Numbers are the hero.** Weights, reps, calories, streaks set the rhythm of the page. Everything else supports them.
2. **Hairlines over shadows.** One-pixel rules do the structural work. No drop shadows, no heavy fills.
3. **One voice, two jobs.** Barlow handles every headline, label, and paragraph. JetBrains Mono handles every number. No third font.
4. **Clay, used sparingly.** The rust accent is for PRs, the active state, and the one thing you want the user to tap. Never decoration.

---

## 2. Color

Warm off-white paper, near-black ink, single chromatic accent.

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#F5F1E8` | App background (paper) |
| `--bg-warm` | `radial-gradient(ellipse at top, #FAF6ED 0%, #F2EDE1 100%)` | Body wash |
| `--surface` | `#FFFDF7` | Cards, sheets, nav bar |
| `--surface-2` | `#EFEADC` | Inset rows, secondary surfaces |
| `--ink` | `#121110` | Primary text, primary buttons |
| `--ink-2` | `#4A453C` | Body copy, secondary text |
| `--ink-3` | `#8F877A` | Tertiary text, meta, labels |
| `--hairline` | `#E0D8C6` | All 1px dividers, card borders |
| `--hairline-2` | `#C9BFA7` | Stronger borders (ghost buttons, checkboxes) |
| `--accent` | `#B84B3A` | Clay rust — PRs, active tab, primary CTA |
| `--accent-hover` | `#9C3D2E` | Accent hover/pressed |
| `--accent-wash` | `#F7E6E0` | Accent pill background |
| `--accent-dim` | `#D69F94` | Accent border on washes |
| `--success` | `#5A7A3C` | Sage — completion, positive deltas |
| `--warn` | `#C68B1E` | Mustard — warnings, deficits |

**Rules:**
- Backgrounds use `--bg-warm` on `<body>`, `--surface` on cards.
- Default text is `--ink`. Body copy in cards is `--ink-2`. Meta/labels are `--ink-3`.
- `--accent` appears at most twice per screen. If three things are clay, two are wrong.
- No green anywhere except `--success` for binary completion states.
- No pure white (`#FFFFFF`) and no pure black (`#000000`).

---

## 3. Typography

Two families. Barlow for words, JetBrains Mono for numbers and meta.

```css
--sans: 'Barlow', system-ui, -apple-system, sans-serif;
--mono: 'JetBrains Mono', ui-monospace, 'SF Mono', monospace;
```

| Role | Family | Weight | Size | Tracking | Line-height |
|---|---|---|---|---|---|
| Display | Barlow | 800 | 56–88px | -0.04em to -0.045em | 0.95 |
| H1 (screen title) | Barlow | 700 | 28–34px | -0.025em | 1.05 |
| H2 (section) | Barlow | 700 | 22px | -0.015em | 1.1 |
| Body | Barlow | 500 | 15px | 0 | 1.55 |
| Body small | Barlow | 500 | 13px | 0 | 1.5 |
| Label / meta | JetBrains Mono | 500 | 10–11px | 0.15em–0.20em uppercase | 1.2 |
| Data (inline) | JetBrains Mono | 600 | 12–22px | -0.01em, tabular | 1.2 |
| Data (hero) | JetBrains Mono | 600 | 32–40px | -0.02em, tabular | 1.0 |

**Rules:**
- Always set `font-variant-numeric: tabular-nums` on JetBrains Mono number runs so columns line up.
- Eyebrows, card heads, nav labels, and pills are always uppercase mono with wide tracking.
- Headlines use Barlow `800` with tight negative tracking. Do not use italics for emphasis. Do not introduce a serif or display font.
- Body text never goes below 13px. Meta/labels never go below 10px.
- The wordmark is `FitTrack` in Barlow 800 with a clay period: `FitTrack<span class="accent">.</span>`

---

## 4. Spacing

4px base. Six stops. Same scale for card padding, vertical rhythm, and grid gaps.

| Token | Value |
|---|---|
| `4x-sm` | 4px |
| `x-sm` | 8px |
| `sm` | 12px |
| `md` | 16px |
| `lg` | 24px |
| `xl` | 40px |

Section breaks between major content blocks: 56–96px on web, 32–48px on mobile. Card internal padding: 14–16px.

---

## 5. Shape

| Token | Value | Use |
|---|---|---|
| `--radius-card` | 14px | Cards, sheets |
| `--radius-sm` | 10px | Buttons, inputs, pills (>32px tall) |
| pill | 999px | Chips, status pills, streak badges |

No outer drop shadows on cards. The phone frame and modal sheets may use a soft `0 24px 64px -24px rgba(18,17,16,0.18)` for elevation. Everything else uses 1px hairlines.

---

## 6. Components

### Buttons

```
Primary       background: ink     · color: bg     · radius: 10px · padding: 12/20
Accent (CTA)  background: accent  · color: surface · same shape
Ghost         transparent · 1px hairline-2 · ink text
Mono link     uppercase mono · 1px ink border · 10/16 padding
```

Rules: one primary or accent button per view. Ghost is the default secondary. Mono link replaces "see more" / inline navigation.

### Pills

- Default: `surface` background, `hairline-2` border, mono uppercase text in `ink-2`.
- Active: `ink` background, `bg` text.
- Accent: `accent-wash` background, `accent-dim` border, `accent` text in 600 weight.

### Cards

`--surface` fill, 1px `--hairline` border, 14px radius. Card head is its own row with bottom hairline; inside, rows are separated by 1px hairlines, never by background swaps.

### Set rows (workout)

Grid: `[index 20px] [weight 1fr] [reps auto] [check 60px]`. All mono, tabular. Done state checks the box (ink fill). PR state recolors the entire row clay and adds a `PR` pill.

### Bottom nav

5 items. Icon (1.5px stroke, 20px square), uppercase mono label (9px), 4px dot under active item. Active color is clay. Sits on `--surface` with a top hairline.

---

## 7. Motion

Fast, restrained, one easing function: `cubic-bezier(0.2, 0.8, 0.2, 1)`.

| Token | Duration | Use |
|---|---|---|
| Instant | 80ms | Hover, focus, chip press |
| Default | 140ms | Buttons, card entrance |
| Slow | 240ms | Sheet open, drawer |
| Celebrate | 400ms | PR pulse, streak bump |

Reduce all motion to 0ms when `prefers-reduced-motion: reduce`.

---

## 8. Tailwind tokens

Map the system into `tailwind.config.ts` so utilities stay aligned. Keep the existing `Barlow` font family wiring.

```ts
theme: {
  extend: {
    colors: {
      bg: '#F5F1E8',
      surface: '#FFFDF7',
      'surface-2': '#EFEADC',
      ink: { DEFAULT: '#121110', 2: '#4A453C', 3: '#8F877A' },
      hairline: { DEFAULT: '#E0D8C6', 2: '#C9BFA7' },
      accent: { DEFAULT: '#B84B3A', hover: '#9C3D2E', wash: '#F7E6E0', dim: '#D69F94' },
      success: '#5A7A3C',
      warn: '#C68B1E',
    },
    fontFamily: {
      sans: ['Barlow', 'system-ui', 'sans-serif'],
      mono: ['JetBrains Mono', 'ui-monospace', 'SF Mono', 'monospace'],
    },
    borderRadius: { card: '14px', sm: '10px' },
    fontVariantNumeric: { tabular: 'tabular-nums' },
  },
}
```

`app/layout.tsx` should load Barlow (400/500/600/700/800) and JetBrains Mono (400/500/600/700) via `next/font/google`. Drop Barlow Condensed.

`metadata.themeColor` becomes `#F5F1E8`.

---

## 9. What this replaces

- Old `bg #080b10` dark theme → paper `#F5F1E8`.
- Old `accent #22c55e` Tailwind green-500 → clay `#B84B3A`.
- Barlow Condensed display → removed; Barlow 800 with tight tracking handles display.
- `gradient-text` green gradient → use `--accent` flat. Gradients are not part of this system.
- Lucide icons stay. No emojis.

---

## 10. Migration notes

1. Update `tailwind.config.ts` and `app/globals.css` to the tokens in §8.
2. Update `app/layout.tsx` font loading and `themeColor`.
3. Replace dark-theme utility classes screen by screen, starting with the Today tab (highest visibility).
4. Sweep for hex literals (`#080b10`, `#22c55e`, green-500/600) and replace with token classes.
5. Remove `gradient-text` and any other green gradient utilities.
6. Re-run Lighthouse a11y after migration; the new palette must keep contrast ≥ AA on all text.

---

## 11. Charts

Numbers carry the work, but trends need a visual shape. All charts share one language.

**Rules:**
- Background: card `--surface`, never gradient fills under lines.
- Grid: 1px dashed `--hairline` for intermediate lines, 1px solid for the baseline.
- Axis labels: JetBrains Mono 9px, `--ink-3`, uppercase, 0.1em tracking.
- Primary line/series: 1.5px solid `--ink`, `stroke-linecap: round`, `stroke-linejoin: round`.
- Current/active value: 4.5px circle, fill `--surface`, 2px stroke `--accent`.
- Target line: 1px dashed `--accent` at 0.5 opacity. Label inline at the right edge in mono 9px clay.
- Bar charts: 12px tall bars, 2px radius, full track in `--surface-2`. Fill in `--ink` by default, `--success` for under-target days, `--warn` for over-target days.
- Daily target marker on bars: 1px vertical line in `--accent`, 4px taller than the bar.
- No 3D, no gradients, no drop shadows, no rounded line endcaps on bars.

**Layout:**
- Chart card has a head (`Title · Range` / unit), a meta block (big tabular value + delta), the SVG, then a legend strip at the bottom.
- Delta colors: `--success` for favorable change (▼ for weight loss, ▲ for PR), `--accent` for unfavorable.
- Charts always include a legend if more than one series is shown.

---

## 12. Progress photos

The app has a `progress-photos` Storage bucket. Photos render in dedicated cards.

- Container: 1px `--hairline` border, `--radius-card` corners.
- Frame: aspect-ratio `3/4`, fills the card width. Paired before/after photos sit side by side, separated by a 1px `--hairline` divider (not gap).
- Tag overlay: bottom-left of each frame, `rgba(18,17,16,0.55)` background with 4px backdrop blur, 4/7px padding, 3px radius. JetBrains Mono 9px in `rgba(255,253,247,0.95)`, 0.18em tracking, uppercase. Format: `MMM DD · WEIGHT`.
- Card meta row below the photos: 12/16px padding, JetBrains Mono 10px `--ink-3` on the left (range like "8 weeks"), `--success` on the right (delta like "−6.2 lb · −3.3%").
- No filters, no auto-color-correction, no decorative borders. The photo IS the content.

---

## 13. Iconography

Lucide React. Period.

- Stroke width: **1.75px** at the default 24px size (Lucide's stock weight).
- Sizes: 18px (inline within text), 24px (default for nav, buttons, controls), 32px (hero / empty-state lead).
- Color: `--ink` by default. `--accent` only when the icon represents an active state, a PR, or a streak. `--ink-3` when muted/secondary. Never filled.
- Stroke caps and joins: `round`.
- No custom-drawn icons unless a domain concept genuinely lacks a Lucide equivalent. If you need one, draw it in the Lucide style (1.75px, round caps, 24px box, no fills).
- No emoji as iconography anywhere in the product.

---

## 14. Celebration moments

PRs, streak milestones, program completion. Pull out one stop, never two.

**Visual:**
- Container: full card width, `--radius-card`, padding 24px.
- Background: `linear-gradient(135deg, var(--accent-wash) 0%, var(--surface) 100%)` for PRs. For streak/program milestones, swap to `linear-gradient(135deg, #F0EAD8 0%, var(--surface) 100%)` (warm neutral).
- Border: 1px `--accent-dim` for PRs, `--hairline-2` for milestones.
- Pulse rings: two absolutely-positioned circles in the top-right corner, 120px and 180px diameter, 1px `--accent` border at 0.15 and 0.08 opacity.
- Eyebrow: JetBrains Mono 10px `--accent` 600 weight, 0.22em tracking, uppercase. Includes a 10px sparkle/star SVG glyph inline.
- Hero number: JetBrains Mono 600 at 64px, tabular, `-0.03em` tracking. The multiplier (×) renders in clay at lighter weight.
- Name: Barlow 700 18px, `-0.015em` tracking.
- Meta row: top-bordered with `--accent-dim`, 14px padding-top, mono 11px between previous value and delta.

**Motion:**
- Card scale: 0.96 → 1.0 over 400ms `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- Pulse rings opacity: 0 → 0.15 (outer) and 0 → 0.08 (inner), staggered 80ms apart.
- Honor `prefers-reduced-motion`.

**Frequency:**
- One celebration moment per session maximum. If a user PRs three lifts in one workout, show one combined celebration on save, not three sequential modals.

---

## 15. Completion rings

The most legible at-a-glance summary in the product. Three concentric rings = three daily goals.

**Color allocation (fixed):**
- **Outer ring** — Workout (binary, the headline goal) — `--accent` (clay).
- **Middle ring** — Calories on target — `--ink` (the discipline goal).
- **Inner ring** — Protein hit — `--success` (sage, the supporting goal).

The center number is the average percent completion across the three rings, in JetBrains Mono 28px, with a 8px mono `% complete` label below.

**Today's rings (hero card):**
- SVG canvas: 180×180px.
- Ring radii: 74px (outer), 58px (middle), 42px (inner).
- Stroke width: 10px on all three.
- Track: same color as fill, `opacity: 0.18`.
- Fill: `stroke-linecap: round`, rotated `-90deg` (12-o'clock start). Length controlled by `stroke-dasharray: <progress> <circumference>`.
- Layout: 180px ring on the left, legend column on the right showing colored swatch + goal name + raw value (e.g., `2,140 of 2,600 kcal`) + percent.

**Week-at-a-glance:**
- 7 mini ring stacks in a row. Each is 38×38px with 3.5px stroke, radii 15/11/7.
- Today's column: clay 4px dot underneath, mono day label switches to `--accent` at 600 weight.
- Future days: tracks only, no fills.
- Header shows `Daily completion` title + `avg X%` mono meta.
- Color legend strip at the bottom matches the today's-rings legend.

**Motion:**
- Each ring fills with a 600ms ease-out arc on mount.
- Stagger outer→middle→inner by 120ms.
- On goal completion (a ring closes), pulse the ring scale 1.0 → 1.05 → 1.0 over 300ms.
- Honor `prefers-reduced-motion`.

**Rules:**
- Never add a 4th ring. If a 4th metric matters, surface it in a different component.
- The three metrics are fixed: Workout, Calories, Protein. Don't let users reorder; consistency is the value.
- On rest days, the workout ring shows as track-only (no fill needed) — the day is still considered "complete" if calories + protein close.

---

## 16. Illustrations

A small line-drawing vocabulary. Used sparingly: empty states, onboarding screens, milestone celebrations.

**Rules:**
- Single 96×96px canvas (SVG).
- Stroke width: 1.5px, `--ink` color, `stroke-linecap: round`, `stroke-linejoin: round`. No fills.
- One — exactly one — clay accent stroke per illustration at 2px width. The accent points to the meaningful element (the missing first set, the target on the scale, the milestone on the climb).
- No faces, no human figures (other than abstract silhouettes), no text inside the illustration.
- No shadows, no fills, no gradients, no perspective, no ornament.
- Card layout: illustration centered, 18px gap, Barlow 700 16px title, 13px body copy max-width 240px below.

**The starter set (extend with care):**
- **Barbell** — empty workout, "no sets logged yet."
- **Plate / scale** — empty weigh-in, "log your first weigh-in."
- **Mountain peak with flag** — milestone reached, "halfway through week 7."

When adding new illustrations, sketch first, get them into the preview file, and iterate before merging. The bar is high — bad illustrations look worse than no illustrations.

---

## 17. Migration notes (graphics)

After §10 is complete, layer in the graphics:

1. Replace any existing chart implementations with the §11 spec. If using Recharts/Chart.js, override defaults with the token system.
2. Re-skin the progress-photo card to match §12.
3. Audit Lucide icon usage — verify stroke width (1.75) and color allocation (§13). Remove any non-Lucide icons.
4. Build a `<CompletionRings />` component per §15. Place it on the Today tab as the hero card above the workout card. Build a `<WeekRings />` component for the streak surface.
5. Build a `<CelebrationCard />` component per §14. Trigger from PR detection in `lib/aggregators.ts` and from the streak/milestone logic.
6. Build the three starter illustrations as React components in `components/illustrations/`. Use them in empty states for the workout, weight, and program-progress surfaces.

Reference preview (canonical render of the full system, including the graphics layer):
`~/.gstack/projects/cdraarsh-fittrack-app/designs/design-system-20260416/preview.html`
