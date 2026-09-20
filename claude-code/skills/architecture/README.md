# architecture/

Turning diagrams and decisions into artifacts that stay in sync with the code.

| Skill | Converts |
| --- | --- |
| [`diagram-to-adr`](diagram-to-adr/) | A diagram file → an Architecture Decision Record (MADR) |
| [`diagram-to-likec4`](diagram-to-likec4/) | A diagram (Excalidraw, draw.io, …) → a LikeC4 model (`.c4`) |
| [`likec4-to-openspec`](likec4-to-openspec/) | A LikeC4 model → an OpenSpec change proposal + spec deltas + tasks |

Chained, these take a whiteboard photo through to a reviewable change proposal:

```
diagram → diagram-to-likec4 → .c4 model → likec4-to-openspec → proposal + tasks
        ↘ diagram-to-adr → ADR (the decision and its alternatives)
```

All three were vendored from an upstream toolkit and adapted: references to
that application's own UI tabs were replaced with plain repo paths, so they
work in any project.

[LikeC4](https://likec4.dev) is the C4-model-as-code tool these target.
