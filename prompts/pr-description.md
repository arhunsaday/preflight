# Write the PR description

---

Write the pull request description for the change on this branch.

Read the actual diff against the merge base — not the working tree, not the
commit messages. The commit messages say what was done; the description must say
**why**, and what a reviewer should look at.

```markdown
## What
<one paragraph. the change, in plain language, for someone who did not see the ticket>

## Why
<the problem. link the ticket/spec. if there is no ticket, say so>

## How
<the approach, and the alternative you rejected with the reason>

## Review guidance
<where to look hardest, and what you are least sure about>

## Validation
| Command | Result |
<exact commands run, and passed / failed / not run + reason>

## Risk
<what could break, and the rollback>
```

No AI attribution — no `Co-Authored-By`, no "Generated with", no 🤖.

If the diff does more than one thing, say so plainly at the top and suggest the
split rather than writing a description that hides it.
