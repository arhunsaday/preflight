<!-- Paste into the project's AGENTS.md, under Conventions. -->

## React conventions

### Structure

```
src/
├── app/            routing, providers, layout shell
├── features/<f>/   one folder per feature — components, hooks, api, types
├── components/ui/  shared primitives only; nothing feature-aware
├── lib/            framework-agnostic helpers
└── types/          shared types
```

A component in `components/ui/` that imports from `features/` is in the wrong
folder. That is the one structural rule worth enforcing.

### State — pick by lifetime, not by habit

| State | Tool |
| --- | --- |
| Server data | **TanStack Query.** Never mirror it into a store |
| URL-shaped (filters, tabs, pagination) | **the URL.** Survives reload and is shareable |
| Global client state | Zustand — sparingly |
| Local | `useState` |

Copying server data into Zustand is the most common avoidable bug in this stack:
two sources of truth, and the stale one wins.

### Components

- Server Components by default in Next; `'use client'` only where interactivity
  needs it, and as far down the tree as possible.
- No `useEffect` for data fetching. Query handles it.
- `useEffect` is for synchronising with something outside React. If it is not,
  it probably should not exist.
- Every list gets a stable `key`; never the array index.

### Styling

- Design tokens, never primitives: `text-muted-foreground`, not `text-gray-500`.
- `cn()` (clsx + tailwind-merge) for conditional classes.
- Dark mode is its own palette, not an inversion.
- Follow `skills:interface-cheatsheet` — concentric radii, optical alignment,
  `:focus-visible`, 24px minimum hit areas, `@media (hover: hover)`.

### Performance

- Measure before memoising. `React.memo` everywhere is its own problem.
- Route-level code splitting by default.
- Long lists virtualised (`@tanstack/react-virtual`).
- Images: explicit dimensions, modern format, lazy below the fold.

### Accessibility — non-negotiable

Native elements, labelled inputs, `:focus-visible` styled, icon-only buttons
with `aria-label`, `prefers-reduced-motion` respected, never colour alone for
status.

### Validation matrix

| Changed | Run |
| --- | --- |
| `src/**` | `pnpm lint` · `pnpm typecheck` · `pnpm test -- <spec>` |
| `src/app/**` routing | the above **plus** a Playwright smoke run |
| `components/ui/**` | the above plus every feature importing it |
