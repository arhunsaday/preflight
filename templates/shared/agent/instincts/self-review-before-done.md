---
id: self-review-before-done
status: accepted
scope: universal
last_reviewed: 2026-09-20
reviewed_by: ai-dev-kit-maintainer-agent
evidence: Existing hand-authored review checklist; retained during lifecycle migration, not empirically scored.
trigger: 'before declaring your own change/feature done, or preparing it to commit or open for review'
confidence: 0.9
domain: delivery
source: hand-authored
---

# Review your own change like an MR before calling it done

## Action

Before you report a change complete, review your own diff with the adversarial
lens you would apply to a colleague's merge request. Target the failure classes a
green typecheck and passing unit mocks **cannot** see, because they only surface
at runtime:

- **Boot / wiring.** A new component's transitive dependencies must resolve in
  the module or container that registers it. A type-check never proves the app
  starts. Confirm against a working sibling that already provides the same thing,
  or actually build-and-boot. Adding a controller/service/handler is not done
  until its registration is verified.
- **Input validation actually runs.** Confirm the validation layer is registered,
  so request schemas are enforced and unknown keys are stripped — no
  mass-assignment of server-owned fields (`id`, `userId`, `source`, status). A
  schema that is never validated is decoration.
- **Response shape.** Serialized output must not leak internal columns; read
  schemas must be permissive enough for rows written by other sources.
- **Scope on every by-id path.** Reads/writes are scoped from the caller's token,
  not from the request body, and missing-vs-forbidden is masked as 404.

Run the *fuller* checks, not the minimal ones: a full build (not only a
type-check), the **whole** surrounding test suite (not only your new specs, so
you catch regressions your change caused elsewhere), and lint exactly as the
pre-commit hook runs it.

Then **fix the findings inline before reporting done** — do not just enumerate
them. Triage honestly: close real correctness/security gaps even when "the client
never takes that path" (the API is a trust boundary and other callers exist), and
do **not** manufacture fixes to look thorough — state plainly what you judged not
worth changing and why.

## Why

Code that compiles and has green unit tests can still fail to boot, silently skip
body validation, leak fields, or expose another tenant's row — every one of those
passes a type-check and mocked specs. A self-review aimed squarely at those blind
spots is what separates "compiles and tests pass" from "works and is safe." It is
the same discipline as [[verified-progress-signal]] — trust wired, verified
behavior over the green signal — applied to your own change before you hand it
off.
