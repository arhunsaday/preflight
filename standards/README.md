# Standards

Language- and stack-level conventions that outlive any one project.

The difference from the rest of the kit:

| | Scope | Enforced by |
| --- | --- | --- |
| `claude-code/CLAUDE.md` | how the agent works with me, everywhere | the model, per session |
| `templates/.../instincts/` | one rule, one trigger, per project | the model, on match |
| **`standards/`** | how *code* should look in a language | lint config + review |

A standard belongs here when it is true across projects and expressible as a
lint rule or a review check. Anything project-specific goes in that project's
`AGENTS.md`.

- [typescript.md](typescript.md)
