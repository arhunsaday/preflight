---
name: codebase-to-specs
description: Read an existing codebase and draft the specifications, decision records and architecture sketch it never had, each marked as inferred and awaiting review. Use when adopting a third-party, legacy or maintenance project into the host project, when the user asks to document an existing application, to reverse-engineer specs from code, or says a repository has code but no specifications.
license: MIT
allowed-tools: Read Write Edit Glob Grep Bash(git:*) Bash(ls:*) Bash(cat:*)
metadata:
  version: "1"
source:
  upstream: vendored, third-party
  imported: 2026-09-20
---

# Codebase to specifications

A repository arrives with code and no specifications. the host project equips it with the
agent contract in minutes, and then every other screen is empty, because every
other screen reads documents that nobody ever wrote.

This skill writes the first draft of those documents **from the code that is
already there**.

## The one rule that matters

**Everything you write here is inferred, and it says so.**

You are reading an implementation and describing what it appears to do. That is
evidence, not intent. The person who asked for the feature is not in the
repository, and the code cannot tell you which behaviour is deliberate and which
is an accident nobody noticed.

So every document carries this line under its title, and none of them is
presented as agreed:

```markdown
> **Inferred from code, not reviewed.** Drafted by `codebase-to-specs` from
> `<commit sha>`. Read it against your own understanding before you rely on it.
```

Never delete that line yourself. The person who reviews the document deletes it.

## 1. Read the layout, then the ground truth

`.agents/the host project.json` says where documents go. Read it first — see
`the host project-workflows`. If `specs_from` names another repository, **stop**: the
specifications belong to that repository, and this one holds code only. Report
that, and ask which repository to write into.

Then read, in this order, and stop at what exists:

1. `README.md`, `CONTRIBUTING.md` and anything under `docs/`. A project usually
   knows more about itself than its maintainers remember.
2. The manifest — `package.json`, `pyproject.toml`, `pom.xml`, `go.mod`,
   `Cargo.toml`, `*.csproj`. It names the toolchain and often the entry points.
3. The routes, the handlers, the jobs, the migrations. These are the observable
   surface: what the system accepts, and what it stores.
4. `git log --oneline -50`. Commit subjects name the features in the words the
   team actually uses. Use their words, not yours.

## 2. Bound the work before you write

A large repository will not fit in one pass, and a specification per file is
worthless. Group the code into **capabilities** — the handful of things this
system does for somebody — and write one specification per capability.

Say how many you found, and write the specifications for the largest ones first.
If there are more than eight, write eight and list the rest by name. A reviewer
can read eight documents; nobody reads forty drafts.

## 3. What to write

| Document | Where | Content |
| --- | --- | --- |
| Specification, one per capability | the `openspec` path | What the capability does, its inputs, its outputs, its rules, and the behaviour you could not explain |
| Decision record | the `adr` path | A choice the code clearly made and cannot easily reverse: the datastore, the auth model, the transport, the deployment shape |
| Architecture sketch | the `c4` path | The containers you can actually see, and how they talk |

Two sections are mandatory in **every** specification, and they are the reason
this is useful rather than decorative:

### Open questions

What the code does not answer. A magic number with no source. A branch no caller
reaches. Two code paths that disagree. Behaviour that looks like a bug but may be
a requirement.

Write these as questions addressed to a person, not as findings. Each one is a
thing the team must decide, and listing it is the point of the exercise.

### Not covered

What you did not read, and why. A module you ran out of budget for. Generated
code. A vendored tree. A test suite you skipped.

An honest gap is useful. Silence reads as coverage, and a reviewer who believes
the specifications are complete will trust them where they must not.

## 4. Never do these

1. **Never invent a requirement** to make a specification look finished. If the
   rule is not in the code, it goes under *Open questions*.
2. **Never describe a bug as intended behaviour.** If it looks wrong, say both:
   what the code does, and that it looks wrong.
3. **Never overwrite an existing document.** A repository that already has a
   specification has a source of truth, and it is not you. Write beside it and
   name the conflict.
4. **Never commit.** Leave the files for review — the whole value of this draft
   is that a person reads it before it becomes the project's memory.

## 5. Report

Finish with a short report to the person who ran this:

1. How many capabilities you found, and how many you wrote.
2. The documents written, by path.
3. The open questions, gathered into one list, with the most consequential first.
4. What you did not read.

Then say the next step plainly: **read the open questions and answer them.**
Those answers turn an inferred draft into the project's specifications, and no
tool can produce them.
