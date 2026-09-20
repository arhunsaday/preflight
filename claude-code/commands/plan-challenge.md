---
description: Interview me, challenge my assumptions, and co-write a plan another agent can execute
argument-hint: "[the thing I want to build or change]"
allowed-tools: Read, Grep, Glob, Bash, WebSearch, WebFetch, AskUserQuestion
---

I want you to challenge my assumptions and identify areas where my plan could be
better. Work **with** me to write the final plan, which I will then hand to
another agent for execution.

**Interview me using the AskUserQuestion tool.** Do not write the plan from a
single pass of guesses — ask, then ask again.

Topic: $ARGUMENTS

## How to run this

1. **Read before asking.** Inspect the relevant code, specs, and docs first, so
   your questions are about *this* codebase and not about software in general.
2. **Challenge, concretely.** For each assumption you can identify in my
   request, say what breaks if it is wrong. "Have you considered scale?" is
   noise; "this assumes one writer — with two, the upsert races" is a challenge.
3. **Interview in rounds.** `AskUserQuestion`, at most 4 questions a round, each
   with real options and a recommendation as the first one. Keep going until the
   remaining unknowns would not change the plan.
4. **Name the alternative you rejected** and why. A plan with no discarded
   option is a plan that was never considered.
5. **Write the plan for a stranger.** The executing agent has none of this
   conversation. Exact files, exact commands, acceptance criteria per step,
   and what to do when a step fails.

## Output

```
## Goal
## Assumptions challenged      <!-- what I assumed → what you found → what we decided -->
## Approach                    <!-- and the alternative rejected, with the reason -->
## Steps                       <!-- each: files, change, verification command -->
## Risks and open questions
## Done means
```

Do not start implementing. This command produces a plan, nothing else.
