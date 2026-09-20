---
name: diagram-to-adr
description: Draft an Architecture Decision Record (MADR format) from a diagram file in the repo. Reads Excalidraw (.excalidraw), draw.io (.drawio and .drawio.svg), Mermaid (.mmd) and BPMN (.bpmn). Use when the user wants to capture the decision behind a sketch as an ADR, or mentions excalidraw, drawio, mermaid or bpmn together with ADR or decision record.
license: MIT
allowed-tools: Read Write Bash(ls:*)
metadata:
  version: "2"
source:
  upstream: vendored, third-party
  imported: 2026-09-20
---

# Board → ADR (MADR)

Read a board, infer the architectural decision it depicts, and write a Markdown
Architecture Decision Record in the [MADR 4.0](https://adr.github.io/madr/)
format.

## Inputs

A board under `{{DRAWINGS_DIR}}`, or one the user names. Where the intent lives
depends on the format:

| Extension | Format | Read this |
|---|---|---|
| `.excalidraw` | Excalidraw JSON | `elements`: shape labels, arrow labels, free text |
| `.drawio` | draw.io mxGraph XML | the `value` attribute of each `mxCell`, and every page |
| `.drawio.svg` | a picture carrying the same XML | the `content` attribute of the root `<svg>` |
| `.mmd`, `.mermaid` | Mermaid text | node text, link labels, `subgraph` names |
| `.bpmn` | BPMN 2.0 XML | task and event `name` attributes, gateway names, lane names |

Three notes on the structured formats:

- A draw.io `value` may hold HTML. Read the words and ignore the tags.
- A draw.io `<diagram>` body may be deflated rather than plain XML. If it is not
  readable XML, convert the board with `diagram-to-likec4` first and read the
  model it writes, rather than guessing at the compressed text.
- A BPMN board describes a **process**, so the decision it carries is usually about
  sequence, ownership or an exception path. Read the gateways: a gateway is where
  the process chose something, and that is what the ADR is about.

## Output

`{{ADR_DIR}}/NNNN-<kebab-title>.md`, where `NNNN` is the next zero-padded
4-digit number after the highest existing ADR in `{{ADR_DIR}}` (start at `0001`).
Do not renumber or edit existing ADRs.

## Template (MADR 4.0 — fill every field)

```markdown
---
status: "proposed"
date: {{DATE}}
decision-makers: []
consulted: []
informed: []
---

# {short title of the decision}

## Context and Problem Statement

{Describe the context and problem — 2-3 sentences, or a question. Reference the board.}

## Decision Drivers

* {driver 1, e.g. a force, a concern}
* {driver 2}

## Considered Options

* {option 1}
* {option 2}
* {option 3}

## Decision Outcome

Chosen option: "{option 1}", because {justification}.

### Consequences

* Good, because {positive consequence}
* Bad, because {negative consequence}

## Pros and Cons of the Options

### {option 1}

* Good, because {argument}
* Neutral, because {argument}
* Bad, because {argument}

### {option 2}

* Good, because {argument}
* Bad, because {argument}

## More Information

{Links, follow-ups, or the source board path.}
```

## Procedure

1. Read the board. Identify the **decision**, the **options** it shows (often
   parallel boxes, alternative paths, or two `subgraph` blocks), and the
   **drivers** (labels and annotations).
2. Determine `NNNN` by listing `{{ADR_DIR}}`.
3. Write the ADR from the template above. Keep `status: "proposed"`. Set `date` to
   today (`{{DATE}}`). Fill any section you cannot infer with an explicit `TODO:`
   rather than inventing facts.
4. Reference the source board path under **More Information**.

Never fabricate decision-makers or outcomes the board does not support — leave a
`TODO:` for the human.
