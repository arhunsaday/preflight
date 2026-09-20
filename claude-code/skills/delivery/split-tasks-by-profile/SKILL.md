---
name: split-tasks-by-profile
description: Split delivery work across the project's personas (profiles) and write the assignment plan as validated JSON. Use when the user asks who does what, to dispatch or assign tasks, to split work by profile or role, to build a work-breakdown per developer, or to produce an assignment brief per team member.
license: MIT
allowed-tools: Read Write Edit Glob Grep Bash(python3:*) Bash(ls:*)
metadata:
  version: "1"
source:
  upstream: vendored, third-party
  imported: 2026-09-20
---

# Split tasks by profile

Turn what has to be built into **one self-contained scope per profile**, written to
the document the the host project **Assignments** tab renders.

The profiles are the project's **personas** — they already exist, with a daily rate.
Never invent a role that is not in the personas file; if the work needs a profile
that is missing, say so and leave `personaId` empty rather than fabricating one.

## Inputs — read these before writing anything

| Source | Path | What you take from it |
| --- | --- | --- |
| Personas | `{{PERSONAS_FILE}}` | the **only** allowed set of profiles (`id`, `name`, `description`, `tjm`) |
| Costing sheets | `{{COSTING_DIR}}/*.json` | existing features/tasks, `mandays`, `complexity`, `moscow`, `priority`, `personaId`, `predecessorId` |
| Specs | `{{OPENSPEC_DIR}}/` | the requirements that define the work |
| Decisions | `{{ADR_DIR}}/` | constraints already settled — do not re-open them |
| Diagrams | `{{DIAGRAMS_DIR}}/` | the module/component boundaries that scopes should follow |
| Code | the repository | the real directories, so every `scope` entry is a path that exists |

If a costing sheet already sets `personaId` on a task, that assignment **wins**.
Your job there is to group and sequence it, not to reassign it.

## Method

1. **Assign by module/domain tree, not by task.** Give each profile a
   self-contained set of directories. **One writer per file at any time** — if two
   profiles would touch the same file, that is a design error, fix the split.
2. **Sequence the foundations first.** Shared pieces everyone consumes (auth,
   contracts, shared types, event cores) go to whoever unblocks the rest, and
   their items come first.
3. **Name every coordination seam.** Where two scopes meet, apply
   *owner exposes (service + shared contract), consumer wires on top*. List the
   seam explicitly with the contract that crosses it.
4. **Carry the numbers through.** When a costing task exists, reuse its
   `mandays`; do not re-estimate silently. When you do estimate, say so in `why`.
5. **Mark what is blocked.** A missing credential, a pending decision or an
   unanswered question is a **gate**, not a task. Gates name what unblocks them
   and who approves.
6. **Write a brief per profile** that is safe to send as-is: scope, items, first
   steps, seams. Never put private judgements about a person in the file.

## Output

File: `{{DELIVERY_DIR}}/assignments.json` — a single JSON object.

```json
{
  "version": 1,
  "generatedAt": "{{DATE}}",
  "sources": [],
  "assignments": [
    {
      "personaId": "",
      "personaName": "",
      "scope": [],
      "brief": "",
      "items": [
        {
          "id": "A1",
          "title": "",
          "why": "",
          "firstSteps": [],
          "specRef": "",
          "taskRef": "",
          "mandays": 0,
          "gate": ""
        }
      ],
      "seams": [{ "with": "", "contract": "", "rule": "" }]
    }
  ],
  "gates": [{ "what": "", "blocks": [], "unblockedBy": "", "approver": "" }],
  "overlapRisk": ""
}
```

Rules:

- `personaId` — an `id` from `{{PERSONAS_FILE}}`, or `""` when no persona fits
  (then explain the missing profile in `brief`).
- `personaName` — the persona's `name`, or the profile you would need.
- `scope` — repository-relative directory paths that exist. No globs, no `..`.
- `items[].id` — `A1`, `A2`, … unique across the **whole** document.
- `items[].firstSteps` — 1 to 3 concrete actions, each naming a file or a command.
- `items[].mandays` — a number; `0` when unknown. Never a string.
- `items[].gate` — the `what` of a gate in `gates[]`, or `""`.
- `seams[].with` — the `personaName` on the other side of the seam.
- `gates[].blocks` — item ids that cannot start until the gate clears.
- Every key is always present; use `""` / `[]` / `0` for unknowns, never `null`.

If the file already exists, **read it first**. Keep existing `items[].id` values
stable so links from elsewhere keep resolving; add, update or remove entries
rather than regenerating fresh ids.

## Procedure

1. Read `{{PERSONAS_FILE}}`. If it is missing or empty, stop and tell the user to
   create personas first — there is nothing to split work across.
2. Read the costing sheets and the specs; list the work items.
3. Group items into per-profile scopes following the Method above.
4. Read the existing `{{DELIVERY_DIR}}/assignments.json` if present, and merge.
5. Write the document.
6. **Validate**:

   ```bash
   python3 scripts/validate_assignments.py {{DELIVERY_DIR}}/assignments.json {{PERSONAS_FILE}}
   ```

   Fix everything it reports and re-run until it prints `OK`.
7. Report: how many profiles, how many items, the single biggest overlap risk,
   and every open gate with its approver.

## Boundaries

- Do not commit or push. The user commits from the Assignments tab.
- Do not change `{{PERSONAS_FILE}}` or the costing sheets from this skill.
- Do not write private notes about individuals — this file is shared.
