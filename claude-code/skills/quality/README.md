# quality/

Gates between "it compiles" and "it is done".

| Skill | Question it answers |
| --- | --- |
| [`verify-change`](verify-change/) | What does this diff actually affect, and did the docs follow? |
| [`verify-module`](verify-module/) | Is this module structurally complete — docs, tests, wiring? |
| [`verify-quality`](verify-quality/) | Complexity, duplication, naming, function length |
| [`verify-security`](verify-security/) | Vulnerabilities, dangerous patterns, undocumented security decisions |
| [`debug-loop`](debug-loop/) | Build a tight failing feedback loop *before* diagnosing |
| [`pr-workflow`](pr-workflow/) | Create a PR, review one, implement submitted fixes (`gh`) |
| [`pr-review-governance`](pr-review-governance/) | Deep review: code vs spec, security, repo rules, tests, docs |

The four `verify-*` skills ship real analyzers in `scripts/*.cjs` (8–13 KB of
Node each, no dependencies beyond builtins) — they are not prompt-only.

`debug-loop` is the one people skip and should not: it insists on a reproducible
failure *before* any diagnosis. Most long debugging sessions are long because
that step was skipped.
