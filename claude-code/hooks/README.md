# Hooks

Shell commands Claude Code runs at fixed points in its own loop. A hook is the
only mechanism that is **deterministic** — `CLAUDE.md` asks the model to behave,
a hook makes the behaviour happen whether the model cooperates or not.

`bootstrap.sh` links these into `~/.claude/hooks/` and `chmod +x` them. They do
nothing until `settings.json` references them — see [`../settings.json`](../settings.json).

## The exit-code contract

This is the whole mechanism, and it is worth knowing by heart:

| Exit | Effect |
| --- | --- |
| `0` | Allow. stdout is shown in the transcript, not fed to the model |
| `2` | **Block.** The tool call does not run, and **stderr is fed back to Claude** so it can course-correct |
| other | Non-blocking warning, logged only |

So a blocking hook's stderr is a message *to the model*: say what was blocked
and what to do instead, not just "denied".

## What runs when

| Hook | Event | Matcher | Blocks? | What it does |
| --- | --- | --- | --- | --- |
| `block-dangerous.sh` | `PreToolUse` | `Bash` | **yes** | Refuses `rm -rf /`, `git reset --hard`, force-push, `DROP TABLE`, `curl … \| sh`, fork bombs |
| `block-secret-reads.sh` | `PreToolUse` | `Read\|Grep` | **yes** | Keeps `.env`, `*.pem`, private keys out of the context window |
| `protect-files.sh` | `PreToolUse` | `Edit\|Write` | **yes** | Refuses writes to secrets, lockfiles, `.git/` |
| `require-tests-for-pr.sh` | `PreToolUse` | `Bash` | **yes** | No green suite, no `gh pr create` |
| `log-commands.sh` | `PreToolUse` | `Bash` | no | Appends every command to `.claude/command-log.txt` with a timestamp |
| `format-after-edit.sh` | `PostToolUse` | `Write\|Edit` | no | Prettier / ruff / gofmt / rustfmt / shfmt on the touched file |
| `lint-after-edit.sh` | `PostToolUse` | `Write\|Edit` | no | ESLint / ruff / shellcheck, output capped at 20 lines |
| `test-after-edit.sh` | `PostToolUse` | `Write\|Edit` | no | Runs the suite, reports the last 8 lines. **Off by default** |
| `notify-sound.sh` | `Notification`, `Stop`, `SubagentStop` | — | no | One macOS sound per event so you can look away |

Two hooks are deliberately left out of `settings.json`:

**`test-after-edit.sh`** — on a suite slower than about ten seconds it fires on
every edit and makes the session unusable. Enable it per project, where the
suite is fast.

**`notify-sound.sh`** — a sound on every turn end gets old fast. Both scripts
stay linked and executable; re-enabling either is one block of JSON, documented
in the file's own header.

## Sounds

`notify-sound.sh` picks the sound from the event, so you can tell what happened
without looking: **Funk** = Claude needs you, **Glass** = turn finished,
**Pop** = a subagent finished. macOS only (`afplay`); on Linux swap in `paplay`.

## Two rules learned the hard way

**Warn rather than block, unless the cost of being wrong is real.** A hook that
blocks on a documentation typo is a hook the team disables within a week, and
then it protects nothing. Block destructive and irreversible things; report
everything else. (This principle is lifted straight from the hook comments in
a vendored toolkit whose hook comments say it better than I can.)

**Cap every output.** A `PostToolUse` hook that dumps 200 lines of test output
evicts the context Claude needs to act on it. `tail -8`, `head -20`. The model
needs "3 failed, here they are", not the full run.

## Testing a hook without Claude

Hooks read the tool payload as JSON on stdin:

```bash
echo '{"tool_input":{"command":"rm -rf /tmp/x"}}' | ~/.claude/hooks/block-dangerous.sh; echo "exit=$?"
```

Expect `exit=2` and a message on stderr. Same shape for the others —
`.tool_input.file_path` for the file hooks, `.hook_event_name` for the sound.

## Reference

- [Hooks reference](https://code.claude.com/docs/en/hooks) — every event, matcher, and field
- [Hooks guide](https://code.claude.com/docs/en/hooks-guide) — worked examples
