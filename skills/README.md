# Skills

Three files govern every skill on this machine.

| File                                               | Governs                                     |
| -------------------------------------------------- | ------------------------------------------- |
| [`registry.json`](registry.json)                   | **Which skills are active.** Edit this one  |
| [`install-third-party.sh`](install-third-party.sh) | Which repos get installed                   |
| [`THIRD-PARTY.md`](THIRD-PARTY.md)                 | What is installed, and what is worth adding |

## Active vs parked

**Parked never means deleted.** A parked skill stays in `~/.agents/skills/`; only
the symlinks that make agents see it are removed. Re-activating is instant and
works offline.

```bash
./skills/apply-registry.sh --status     # what is active, what is parked, and why
./skills/apply-registry.sh --dry-run    # what would change
./skills/apply-registry.sh              # apply
```

`bootstrap.sh` reads the same file for the skills in `claude-code/skills/`, so
one file decides both.

## Why park anything

Every active skill's name and description is loaded into context **at the start
of every session**. At 167 active skills that was ~12,000 tokens before typing a
word — and, worse, a dozen skills competing for the same trigger, which makes
the model's choice arbitrary rather than informed.

Measured on this machine:

|        | Skills | Tokens per session |
| ------ | ------ | ------------------ |
| Before | 167    | ~12,100            |
| After  | 128    | ~8,800             |

The token saving is the smaller half. The real gain is that eleven skills no
longer all claim "interview the user to stress-test a plan".

## Changing your mind

Open [`registry.json`](registry.json), move a name out of `parked`, re-run:

```bash
./skills/apply-registry.sh && ./bootstrap.sh
```

Each parked entry carries the reason it was parked, so the list reads as a
decision record rather than a pile of names.

## Adding something new

```bash
npx -y skills@latest add <owner>/<repo> --all -g
```

Anything absent from `registry.json` defaults to **active**, so a new install
works without editing anything. Add it to `install-third-party.sh` so a fresh
machine gets it too.

Some repos nest skills in subdirectories — `--full-depth` is required there, and
without it the install reports success while installing nothing.

## When to park versus uninstall

Park when the skill is good but not for today's work: `pptx` when no deck is
due, `write-swift` until there is Swift. Uninstall only when it is actively
wrong for you — and even then, parking costs nothing and keeps the option.
