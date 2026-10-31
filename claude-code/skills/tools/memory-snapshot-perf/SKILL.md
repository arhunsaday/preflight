---
name: memory-snapshot-perf
description: Diagnose front-end memory leaks and memory-driven slowness using Chrome DevTools heap snapshots — detached DOM nodes, listener leaks, growing closures, retained caches. Use when a web app gets slower the longer it stays open, when a tab's memory climbs and never drops, or when asked to investigate front-end performance.
source:
  upstream: hand-authored in preflight
  imported: 2026-09-20
risk_level: medium
writes_files: false
---

# Memory snapshots for front-end performance

Most "the app gets slow after a while" reports are memory, not CPU. A leak
shows up as growing GC pause times and a heap that never returns to baseline.

## The only reliable measurement: three snapshots

A single snapshot tells you almost nothing — you cannot tell a legitimate cache
from a leak. The diff is the signal.

1. **Load the page, do nothing, force GC, take snapshot A.** This is baseline.
2. **Perform the suspect interaction ~10 times** — open/close the modal,
   navigate to the route and back, mount/unmount the list.
3. **Force GC, take snapshot B.**
4. Repeat the interaction 10 more times, force GC, **take snapshot C.**

Then compare B→C in **Comparison** view, sorted by *Delta*. Anything whose count
grows linearly with the repetitions is a leak. Something that grew A→B but is
flat B→C is a warm cache — leave it alone.

Force GC via the trash-can icon in the Memory panel, not by waiting.

## What to look for, in order

**Detached DOM nodes.** Filter the snapshot for `Detached`. A detached subtree
that is still retained means something holds a reference to a node no longer in
the document — nearly always an event listener, an observer, or a framework ref
that outlived the component.

**Listener counts.** In **Retainers**, look for `EventListener` growing. The
classic: `addEventListener` on `window`/`document` in a mount hook with no
matching `removeEventListener` on unmount.

**Timers and observers.** `setInterval` never cleared, `IntersectionObserver` /
`ResizeObserver` / `MutationObserver` never disconnected, a `WebSocket` or
`EventSource` reopened on each mount.

**Closures.** A `(closure)` entry with a large retained size usually means a
callback captured something big — often the whole props object or a component
instance — and was stored in a module-level array or map.

**Unbounded caches.** A `Map`/`Array` at module scope that only ever gets
`.set`/`.push`. Legitimate cache or leak depends entirely on whether anything
ever evicts.

## Reading the numbers

- **Shallow size** — the object itself. Usually uninteresting.
- **Retained size** — what would be freed if this object went away. **This is
  the column that matters.**
- **Distance** — hops from the GC root. A short distance on something that
  should be transient is suspicious.

Sort by retained size, then walk the **Retainers** tree *upward* to find who is
holding the reference. The leak is at the top of that chain, not the bottom.

## Framework-specific usual suspects

- **React** — a stale closure in `useEffect` with a wrong dependency array; a
  subscription without a cleanup return; `useRef` holding a DOM node after
  unmount; context values recreated each render and captured by memo'd children.
- **Vue** — a watcher created outside `setup` scope; `onUnmounted` missing.
- **Angular** — an unsubscribed `Observable`; the single most common one.
- **Any SPA router** — listeners registered per route visit, cleaned per app,
  never per visit.

## Beyond the heap

If the heap is flat but the app still degrades, look elsewhere:

- **Performance panel** recording during the slow interaction: long tasks, style
  recalculation, forced reflow.
- **Layout thrashing** — reading a layout property (`offsetHeight`) then writing
  a style, inside a loop.
- **DOM node count** climbing even without detachment — a virtualized list that
  is not actually virtualizing.

## Output

```markdown
## Memory findings — <app/route>, <date>

Baseline heap: X MB · after 10 iterations: Y MB · after 20: Z MB
Verdict: leak / bounded growth / no leak

### <finding>
- Growth: +N objects per iteration
- Retainer chain: <top> → <…> → <leaked object>
- Cause: file:line
- Fix: <the specific cleanup>
```

Report "no leak found" when the diff is flat and say what you measured. A clean
result is a real result, and the next person needs to know it was checked.
