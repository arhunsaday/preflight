---
name: diagram-to-likec4
description: Convert a diagram file in the repo into a LikeC4 model file (.c4). Reads Excalidraw (.excalidraw), draw.io (.drawio and .drawio.svg), and Mermaid (.mmd). Use when the user wants to turn a hand-drawn or text architecture sketch into a LikeC4 C4 model, or mentions excalidraw, drawio, mermaid, c4 or likec4.
license: MIT
allowed-tools: Read Write Bash(python3:*) Bash(ls:*)
metadata:
  version: "2"
source:
  upstream: vendored, third-party
  imported: 2026-09-20
---

# Board → LikeC4

Turn a board into a LikeC4 model that LikeC4 renders.

## Inputs

Diagram files under `docs/diagrams/` (override with $ARGUMENTS), in four formats the tooling
edits:

| Extension | Format | Where the intent is |
|---|---|---|
| `.excalidraw` | Excalidraw JSON | shape labels and arrow labels |
| `.drawio` | draw.io mxGraph XML | the `value` attribute of each `mxCell` |
| `.drawio.svg` | a picture carrying the same XML | the `content` attribute of the root `<svg>` |
| `.mmd`, `.mermaid` | Mermaid text | node declarations and `-->` links |

`.bpmn` is **not** an input. A BPMN board is a process model: its boxes are tasks
in a sequence, not systems that call each other, and turning one into a C4 model
produces a diagram that looks like an architecture and describes none. If the user
asks, say that, and offer `diagram-to-adr` instead — a process decision belongs in
a decision record.

If the user names a file, use that one. Otherwise list the folder and ask which
board to convert, or convert each one.

## Output

`{{DIAGRAMS_DIR}}/<name>.c4` — one LikeC4 file per board (`<name>` = the board's
base name). Never modify the source board.

## Excalidraw and draw.io: run the script

These formats hold their nodes and edges as structured data, so a script converts
them exactly. Do not read them by hand.

```bash
python3 scripts/diagram_to_likec4.py <input> {{DIAGRAMS_DIR}}/<name>.c4
```

Mapping performed by the script:

- **Excalidraw** — `rectangle`, `ellipse` and `diamond` become elements of kind
  `node`, titled by the shape's bound text. An `arrow` or `line` with both a start
  and an end binding becomes `a -> b 'label'`.
- **draw.io** — an `mxCell` with `vertex="1"` becomes an element of kind `node`,
  titled by its `value` with any HTML markup removed. An `mxCell` with
  `edge="1"` and both a `source` and a `target` becomes `a -> b 'label'`. Every
  page of a multi-page file contributes to the one model. A deflated
  `<diagram>` body is expanded first, so a file written by the draw.io desktop
  application converts as well as one written by hand.
- **`.drawio.svg`** — the same, after the model is unwrapped from the picture. An
  SVG that carries no model is refused rather than reported as an empty diagram:
  it is somebody's picture, not a board.

A `views { view index { include * } }` landscape view is always emitted.

## Mermaid: read the source

Both are text. The source already names every node and every edge, so read it and
write the model directly — the script refuses both on purpose.

- A `flowchart` / `graph` node `A[Payment API]` becomes
  `payment_api = node 'Payment API'`. A link `A -->|charges| B` becomes
  `payment_api -> b 'charges'`.
- A node with no label takes its identifier as the title.
- Ignore styling: `classDef`, `style` and `linkStyle` say nothing about the
  architecture. A `subgraph` **name**, however, is often a boundary worth keeping —
  mention it to the user rather than dropping it in silence.
- A `sequenceDiagram` or a `classDiagram` is not a component diagram. Say so
  rather than flattening it into elements and relations that misread it.

## Refine (optional)

Every path above emits the single element kind `node`. If the board clearly
distinguishes systems, containers and components, edit the generated `.c4` to add
richer kinds in the `specification { }` block and change the element kinds to
match. Keep the element ids and the relationships as they were produced.

## Validation

After writing, confirm the file carries all three blocks:

```bash
grep -q 'specification' F && grep -q 'model' F && grep -q 'views' F && echo OK   # F = the output path
```

Every relationship's `a` and `b` must be ids declared in the `model { }` block.
