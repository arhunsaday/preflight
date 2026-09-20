# Skills

Skills **I own**. Third-party skills are not vendored here — they are installed
and updated by the `skills` CLI and recorded in
[`../../skills/THIRD-PARTY.md`](../../skills/THIRD-PARTY.md). That split is the
whole point: things I maintain live in git, things other people maintain get
updated by a tool.

## Layout

The folders below are for **browsing only**. Claude Code discovers skills one
level deep, so `bootstrap.sh` flattens the category away on install:
`skills/quality/verify-security/` becomes `~/.claude/skills/verify-security/`.
Two skills may therefore never share a name, whatever folder they sit in.

| Folder | What lives there |
| --- | --- |
| [`communication/`](communication/) | How the agent talks — verbosity, tone, language |
| [`delivery/`](delivery/) | Spec → plan → backlog → progress. The path from an idea to shipped work |
| [`quality/`](quality/) | Gates before something is called done — verify, review, debug |
| [`architecture/`](architecture/) | Diagrams, ADRs, C4 models |
| [`design/`](design/) | Interface and visual rules |
| [`tools/`](tools/) | Wrappers around a specific external tool |
| [`stack/`](stack/) | Framework patterns — NestJS, Drizzle, BullMQ, React admin, Expo |
| [`ai/`](ai/) | Building LLM features — RAG on pgvector, Langfuse observability |
| [`ops/`](ops/) | Observability and operations — LGTM stack, Alloy |

## The `source:` field

Every `SKILL.md` here carries provenance in its frontmatter:

```yaml
source:
  upstream: JuliusBrussee/caveman@7bb7130        # where it was originally written
  license: MIT (JuliusBrussee)
  imported: 2026-08-02
```

It exists because the first batch of skills arrived by copy-paste with no trace
at all, and it took a git-history dig to find out that eleven of them came from
one upstream tool and four from two MIT repos. The field travels with the file
when it is copied again — which a separate manifest would not.

## Adding a skill

```bash
npx -y skills@latest init my-skill     # scaffolds SKILL.md
```

Then move it into the right category, fill `source:`, and run `../../bootstrap.sh`.

Rules that keep a skill useful:

- **The `description` is the trigger.** It is the only part loaded until the
  skill fires, so it must say *when to use this* and *when not to*. Vague
  descriptions produce skills that never fire, or fire constantly.
- **One skill, one job.** Two jobs means two descriptions competing.
- **Say what not to do.** `pdf-inspector` explicitly says "not for small PDFs,
  native Read handles those" — that line is what stops it shadowing a built-in.
