---
name: ai-time-estimates
description: Produce realistic effort estimates for work that an AI agent will do, instead of estimating as if a human were typing every line. Use when asked how long something will take, for sprint planning, for a quote, or when a plan needs effort numbers attached.
source:
  upstream: hand-authored in ai-dev-kit, informed by ZhangHanDong/agent-estimation
  imported: 2026-09-20
risk_level: medium
writes_files: false
---

# Estimating agent-assisted work

Default estimates are wrong in **both directions** when an agent does the work,
and the errors do not cancel out.

- **Overestimated**: mechanical volume. Boilerplate, CRUD layers, test scaffolds,
  migrations, renames across 200 files, translating a spec into code. What costs
  a human a day costs an agent minutes.
- **Underestimated**: everything that is not typing. Deciding *what* to build,
  waiting on credentials and access, review cycles, integration with a system
  nobody has documented, flaky environments, and the loops where the agent is
  confidently wrong and a human has to notice.

Estimating agent work with human units produces a number that is too large on
the easy half and far too small on the hard half.

## Method

### 1. Split the work by what actually limits it

| Class | What limits it | Agent effect |
| --- | --- | --- |
| **Mechanical** | typing volume | **5–20× faster** |
| **Comprehension** | reading an unfamiliar codebase | 2–4× faster |
| **Decision** | humans agreeing | **unchanged** |
| **Integration** | someone else's system | unchanged, often worse |
| **Access** | credentials, permissions, environments | unchanged — pure waiting |
| **Review** | human attention | **often slower** (more diff to read) |

Estimate each class separately. A task that is 80% mechanical and 20% decision
does not get a single multiplier.

### 2. Estimate in agent-sessions, not hours

The natural unit is a **session**: one focused stretch with a clear goal, ending
in something verifiable. Roughly 1–3 hours of wall-clock with a human in the
loop.

- Small: 1 session — one module, one endpoint, one bug with a known cause
- Medium: 2–4 sessions — a feature across a layer, with tests
- Large: 5–10 sessions — a feature across several layers, or a migration
- Anything over 10: **not an estimate, a plan.** Break it down first.

### 3. Apply the three multipliers people forget

- **Unknown codebase**: ×1.5 on comprehension for the first two sessions.
- **No test suite**: ×2 on everything. Without tests the agent cannot verify,
  so every change needs human verification.
- **Blocked on access**: add the *calendar* time honestly. "2 sessions, starting
  whenever the Grafana token arrives" is a real estimate. "3 days" is not.

### 4. State the confidence band

One number is a lie. Give `[optimistic – likely – pessimistic]` and say what
moves it:

> **3–5 sessions.** Optimistic if the existing payment module is a usable
> template; pessimistic if the provider sandbox is not already provisioned.

## Output

```
## Estimate: <scope>

| Work item | Class | Sessions | Confidence | Blocked on |
|---|---|---|---|---|

**Total: N–M sessions** (~X–Y calendar days at Z sessions/day)

### What makes this cheaper
### What makes this more expensive
### What I need before starting
```

## Rules

- **Never give a single number** without a band.
- **Never estimate work you have not scoped.** Read the code first; an estimate
  from a ticket title is a guess with a decimal point on it.
- **Name every assumption** — they are what the estimate is actually made of.
- Calendar time ≠ effort time. Say which one you are giving.
- If the honest answer is "I cannot estimate this until X is known", say that
  instead of producing a number to be helpful.
