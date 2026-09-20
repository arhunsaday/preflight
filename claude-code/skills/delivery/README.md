# delivery/

The path from an idea to shipped work. These chain in a specific order, and
using them out of order is what produces plans nobody can execute.

```
spec-workflow  →  implementation-planning  →  (build)  →  progress-audit  →  completion-plan
     ↑                                                          ↓
harvest-questions ←───────────── open questions ────────────────┘
```

| Skill | Input → output |
| --- | --- |
| [`spec-workflow`](spec-workflow/) | A vague idea → a spec with acceptance criteria |
| [`implementation-planning`](implementation-planning/) | A spec → a build-ready plan: exact files, schema, contracts, tests |
| [`progress-audit`](progress-audit/) | Specs + code → an honest, *verified* progress matrix |
| [`completion-plan`](completion-plan/) | Specs + audit → the backlog of what remains, each item with a plan and a ticket |
| [`harvest-questions`](harvest-questions/) | Specs → one RAID file per open question, risk, assumption |
| [`ai-time-estimates`](ai-time-estimates/) | A scope → effort in agent-sessions, with a confidence band |

`progress-audit` is the one worth reaching for even when nothing else is in
play: it measures completion against **wired, tested code**, never against a
tracker or a status doc. That distinction is the difference between a progress
report you can plan against and one that is decoration.
