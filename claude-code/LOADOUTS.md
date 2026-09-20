# Loadouts

Role × stack → what to install, with a reason per item.

```bash
python3 scripts/kit.py loadouts list
python3 scripts/kit.py loadouts show senior-platform
python3 scripts/kit.py loadouts show junior-frontend --explain   # + which layer contributed each item
python3 scripts/kit.py loadouts check                            # also runs in kit.py check
```

## Not the same axis as `profiles.json`

| | Decides | Example |
| --- | --- | --- |
| `profiles.json` | how much the agent is **allowed** to do | `safe`, `developer`, `ops` |
| `loadouts.json` | what it **can** do | `junior-frontend`, `senior-platform` |

Orthogonal on purpose. A junior on the `safe` permission profile still needs
React skills; a senior on `permissive` does not automatically need Kubernetes
ones.

## Composition

```
base  →  role (junior | senior)  →  stack:*        presets combine them
```

Later layers add. An item repeated in a later layer overrides the earlier
`why`, which is how a role sharpens a generic reason — `grilling` means
"ask what you did not know to ask" to a junior and "stress-test the plan before
it becomes someone's sprint" to a senior.

## `why` is mandatory

`loadouts check` fails on an item without one, and that rule is the point of the
format.

Handing a junior 40 skills teaches nothing and passes on someone else's 3%
utilisation rate. Handing them 12 with a reason each gives them something to
disagree with — which is how they learn what the setup is actually for.

It also forces the author to justify each addition. Several items were cut while
writing these loadouts simply because no honest sentence could be written for
them.

## Fields

| Field | On | Meaning |
| --- | --- | --- |
| `why` | everything | **Required.** One sentence, concrete |
| `scope` | skills | `global` or `project`. Required — a stack skill loaded globally competes in every unrelated session |
| `blocking` | hooks | Exits 2 and stops the call, rather than reporting |
| `needs` | mcp | Prerequisites the resolver *checks* and never installs — env vars, binaries, accounts |
| `maturity` | workflows | `L1` report-only → `L2` assisted → `L3` unattended |

## What `check` catches

Verified by test: a skill, subagent, hook or instinct that does not exist in the
repo; a missing `why`; a skill without a scope; an unknown category; a preset
naming a loadout that is gone; a cycle in `extends`.

This is the part that stops the file rotting — a loadout referencing a skill
somebody deleted fails CI rather than failing silently on a new machine.

## Status

**Prototype.** It resolves and explains; it does not install anything yet.
That is deliberate: the open question is whether the format is worth building a
TUI on, and installing would have hidden the answer behind plumbing.

The test it has to pass: can three loadouts be written by hand that someone
would actually accept? Read `loadouts show junior-frontend --explain` and judge.
