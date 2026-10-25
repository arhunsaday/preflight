---
name: interface-cheatsheet
description: Concrete, checkable interface rules for building or reviewing UI — border radius, optical alignment, animation, typography, color tokens, accessibility, layout and microcopy. Use when writing frontend components, reviewing a UI diff, fixing something that "looks off" but you cannot name why, or setting up a design system's tokens.
source:
  upstream: hand-authored in preflight, rules from https://interfaces.dev/cheat-sheet
  imported: 2026-09-20
risk_level: low
writes_files: false
---

# Interface cheat sheet

Specific rules with numbers in them. Use it as a checklist when writing UI and
as a review grid when something looks wrong and you cannot name the reason.

Source: [interfaces.dev/cheat-sheet](https://interfaces.dev/cheat-sheet).

## Visual

- **Concentric radii when nesting.** Outer radius = inner radius + the padding
  between them.
- **Optical alignment beats geometric alignment.** Trust the eye over the box.
- A button with **text + icon** gets slightly less padding on the icon side.
- Depth comes from a **layered `box-shadow`**, not a border.
- Images get a `1px` outline offset by `-1px` — black at 8% opacity in light
  mode, white at 8% in dark.
- **Match the icon's stroke weight to the text beside it.**

## Animation

- Animate **from the trigger**, not from the center: set `transform-origin` from
  the trigger's position.
- For menus opened often, **skip the opening animation**; animate only the close.
- **Exits are subtler than entrances** — shorter distance, `opacity` plus a
  `4px` blur.
- **Never `transition: all`.** Name the properties.
- Buttons scale to `0.95`–`0.98` when pressed, `transition: scale 200ms ease-out`.
- Icon swaps cross-fade: new icon scale `0.25 → 1`, opacity `0 → 1`, blur
  `4px → 0`.
- **Transitions** for interactions (they can reverse mid-flight); **keyframes**
  for one-shot sequences.
- **Disable every transition while switching light/dark mode.**
- Element jitters by 1–2px mid-animation? `will-change: transform` — especially
  Safari on iOS.
- Entering elements animate in **small groups with a short delay**, never one
  giant block.
- Nothing animates on page load unless that is deliberate.
- Frequent interactions (hover colour change) are **instant**.

## Typography

- `.woff2` only on the web. Never `.ttf`, never `.otf`.
- `font-variant-numeric: tabular-nums` in timers, counters, prices, tables.
- Long-form lines: **60–75 characters**.
- `text-wrap: balance` on headings, `pretty` on descriptions, **neither** on
  long form.
- `overflow-wrap: break-word` for long words/links/IDs; `white-space: nowrap`
  so labels and badges never wrap.
- Root layout: `-webkit-font-smoothing: antialiased` +
  `-moz-osx-font-smoothing: grayscale`.
- Write text in **normal capitalization**; uppercase via `text-transform`.
- Smart punctuation: curly quotes, en dash (–) for ranges, em dash (—) for
  asides, ellipsis (…) not three dots.
- Underlines clear descenders: `text-underline-position: from-font` +
  `text-decoration-skip-ink: auto`.
- Truncated with an ellipsis? The full text must be reachable — tooltip or
  expanded view.

## Color

- **Every step in the palette has a job** — page background, component hover,
  border, solid fill, body text. No step that nothing uses.
- Components consume **semantic tokens** (`--color-text-secondary`), never
  primitives (`--blue-500`).
- Name by purpose: `--color-accent-solid`, not `--color-blue-button`.
- **`accent` is the brand colour**, so `primary` never means both the brand and
  the body text.
- Measure contrast against **the background directly behind** the element.
- Dark mode gets **its own palette**, not an inversion of light.
- Pick **one** theme switch: `prefers-color-scheme` or a `.dark` class. Never
  both.
- Gradient interpolation: `in oklab` for even brightness, `in oklch` for vivid
  midpoints, `in srgb` for muted ones.

## Accessibility

- **Native elements**: `<button>` for buttons, `<a>` for links.
- Style `:focus-visible`, not `:focus`. Never remove the outline without a
  replacement.
- `tabindex` is only ever `0` or `-1`. Positive values break the expected order.
- Icon-only buttons need a descriptive `aria-label`. **Never `aria-hidden="true"`
  on something focusable.**
- Alt text states the image's purpose and content; decorative images get `alt=""`.
- Every input gets a visible `<label>`, plus `type` and `inputmode` matching the
  expected entry.
- **Never block paste.** People paste passwords and one-time codes.
- Submit stays enabled until the request starts; validate on submit; mark bad
  fields `aria-invalid="true"`.
- Hit areas ≥ `24×24px`; aim for `44×44` on touch, `40×40` on desktop.
- `pointer-events: none` on decorative glows and gradients so they never swallow
  events.
- Hover styles live inside `@media (hover: hover)` — on touch, `:hover` sticks
  after a tap and looks selected.
- Animations live inside `@media (prefers-reduced-motion: no-preference)`.
- `role="status"` for routine updates; `role="alert"` **only** for urgent errors.
- **Never colour alone** for a status change — add an icon, label or underline.
- The skip-to-content link is the **first** Tab stop.

## Layout

- `scroll-margin-top` so anchored headings are not flush against the viewport.
- **Twice as much space between groups as between items** inside a group.

## Microcopy

- Button labels start with a **verb**: "Save draft", "Delete project" — never
  "OK!" or a bare "Yes".
- Confirmation buttons say what happens: "Delete project" next to "Cancel".
- **One word for "next" across a whole flow** — pick "Continue" or "Next" and
  keep it.
- Say where a link goes.
- Capitalize buttons, headings and labels **consistently**; sentence case is the
  safer default.
- Toggles are labelled by what happens when **on**: "Send read receipts", not
  "Disable read receipts".
- Empty views explain what belongs there and offer **one** action.
- Address the reader as **"you"**, never "the user".

## Using this in review

Go section by section against the diff. Report findings as
`file:line — rule broken → fix`. Do not report a rule the code already follows,
and do not invent rules that are not on this list — its value is that every item
is checkable.
