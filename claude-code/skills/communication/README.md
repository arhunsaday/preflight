# communication/

How the agent talks. These are style modes, not capabilities — they change the
shape of the output, never what gets built.

| Skill | Effect |
| --- | --- |
| [`caveman`](caveman/) | Ultra-compressed English, ~75% fewer output tokens. Six intensity levels |
| [`caveman-commit`](caveman-commit/) | Conventional Commit messages, subject ≤50 chars, body only when the *why* is not obvious |
| [`caveman-review`](caveman-review/) | One line per review comment: location, problem, fix |
| [`ponytail`](ponytail/) | Forces the laziest solution that works. YAGNI, stdlib before custom, one line before fifty |
| [`abrege-frere`](abrege-frere/) | Same idea as `caveman`, in French, without the caveman grammar |

All five are **explicit modes** — they activate on request and stay on until
asked otherwise. None of them should ever fire on their own.

One caveat worth knowing: `ponytail` argues against adding dependencies, while
`~/.claude/CLAUDE.md` says to prefer well-maintained libraries over custom code.
The global file wins; the ordering is stdlib → dependency → custom.
