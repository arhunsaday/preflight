# design/

| Skill | What it gives you |
| --- | --- |
| [`interface-cheatsheet`](interface-cheatsheet/) | ~60 concrete, checkable UI rules — radii, optical alignment, animation timings, type, color tokens, a11y, microcopy |

The rules come from [interfaces.dev/cheat-sheet](https://interfaces.dev/cheat-sheet).
What makes them useful to an agent is that **every one has a number or a
property name in it**. "Improve the spacing" is unactionable; "leave twice as
much space between groups as between items in a group" is a check.

Use it two ways: as a checklist while writing components, and as a review grid
when a UI looks wrong and nobody can say why.

## More design coverage

Deliberately not vendored here — these are other people's, so they are installed
by the CLI and listed in [`../../../skills/THIRD-PARTY.md`](../../../skills/THIRD-PARTY.md):

```bash
npx -y skills@latest add elayadesign/ai-design-skills   # design system generation
npx -y skills@latest add jakubkrehel/skills -s better-ui
npx -y skills@latest add dmmulroy/anti-slop             # oxlint rules rejecting low-evidence code
```
