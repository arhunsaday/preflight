---
title: "Code review"
---
## Three depths

| Depth | Use | For |
| --- | --- | --- |
| Terse | `caveman-review` | One line per finding: location, problem, fix |
| Standard | `reviewer` subagent | Correctness, regressions, wiring, tests, docs |
| Governance | `pr-review-governance` | Code vs spec, security, repo rules, docs sync, UI evidence |

Plus `security` for anything touching a trust boundary.

## What makes a review finding real

```
file:line — <one-sentence claim>
  Failure: <concrete inputs/state → wrong result>
  Fix:     <smallest correct change>
```

If you cannot write the *Failure* line, it is not a finding. "Consider adding
error handling" is noise; "on an empty array this throws before the guard on
line 40" is a finding.

## Review the merge base, not the working tree

`git diff` against your local state answers the wrong question on a branch that
has moved. Use the PR's `base..head`, or GitHub review positions / GitLab
`base_sha`, `start_sha`, `head_sha`.

## Read around the diff

A diff read in isolation produces confident, wrong findings. The reviewer needs
the calling code, the module registration, and the test file — which is exactly
why a subagent with its own context is a better shape than pasting a diff.

## Order

1. **Correctness** — concrete failing input
2. **Regressions** — follow the call sites
3. **Boot and wiring** — does it still start?
4. **Security** — authz on by-id paths, validation running, no leaked fields
5. **Tests** — does a test *fail* without this change?
6. **Docs** — did a contract go stale?

Style opinions go last, labelled `nit:`.

## Gate before the PR

`require-tests-for-pr.sh` blocks `gh pr create` while the suite is red. No green
tests, no PR — so a reviewer never sees red CI on a fresh PR.

## Self-review first

Before handing anything over, review your own diff with the same adversarial
lens — and **fix the findings inline**, do not just list them. The
`self-review-before-done` instinct covers the failure classes a green typecheck
cannot see.
