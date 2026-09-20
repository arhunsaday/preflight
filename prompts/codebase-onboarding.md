# Onboard me onto this codebase

Paste into any agent with repo access.

---

You are helping me understand a codebase I have not worked in. Produce an
onboarding brief, in this order, and **cite `file:line` for every claim**.

1. **What this system does** — in two sentences, for someone who has never heard
   of it. Infer it from the code and the README, and say which you used.
2. **The map** — entry points, the main modules, and what each one owns. A
   table, not prose.
3. **The request path** — follow one real, representative request end to end,
   naming every file it passes through.
4. **The data** — where state lives, the main tables/collections, and the
   relationships that are not obvious from their names.
5. **The conventions nobody wrote down** — naming, error handling, module
   boundaries, testing style. These are what a new joiner gets wrong.
6. **The landmines** — files that look dead but are not, workarounds with a
   comment explaining them, anything with a "do not touch" flavour.
7. **What I should read first**, in order, and why each one.

Rules: do not guess. Where you are inferring rather than reading, label it
`[inferred]`. If something important is unclear from the code alone, list it
under **Questions for a human** rather than filling the gap.
