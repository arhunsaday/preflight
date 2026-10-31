#!/usr/bin/env python3
"""Starter recipes, additive project configuration, and repository checks."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
TARGETS = {"claude": "CLAUDE.md", "codex": "CODEX.md", "gemini": "GEMINI.md",
           "copilot": ".github/copilot-instructions.md", "cursor": ".cursor/rules/project.mdc",
           "windsurf": ".windsurfrules", "zed": ".rules", "cline": ".clinerules",
           "aider": "CONVENTIONS.md"}


def read_json(path):
    return json.loads(path.read_text())


def encoded(value):
    return json.dumps(value, indent=2) + "\n"


def pointer(target):
    header = '---\ndescription: Project conventions\nalwaysApply: true\n---\n\n' if target == 'cursor' else ''
    return header + 'Read `AGENTS.md` for project instructions and `agent-commands.json` for available commands.\n'


def profile(name):
    profiles = read_json(ROOT / 'claude-code/profiles.json')['profiles']
    if name not in profiles:
        raise ValueError('Unknown profile: ' + name)
    settings = read_json(ROOT / 'claude-code/settings.json')
    selected = profiles[name]
    if not selected.get('inheritAllow'):
        settings['permissions']['allow'] = selected['allow']
    settings['permissions']['ask'] = selected.get('ask', [])
    return settings


def put(path, content, dry=False):
    if path.is_symlink() or path.exists():
        if path.is_file() and path.read_text() == content:
            return
        raise ValueError(f'Conflict: {path}; existing content preserved')
    print(f'create {path}')
    if not dry:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)


def commands(project):
    package = read_json(project / 'package.json') if (project / 'package.json').exists() else {}
    scripts = package.get('scripts', {})
    pm = package.get('packageManager', '').split('@')[0] or ('pnpm' if (project / 'pnpm-lock.yaml').exists() else 'npm')
    if pm not in ('pnpm', 'npm', 'yarn', 'bun'):
        raise ValueError('Unsupported package manager: ' + pm)
    return {'schema': 1, 'packageManager': pm, 'install': f'{pm} install',
            **{key: f'{pm} run {key}' if key in scripts else None
               for key in ('dev', 'build', 'lint', 'typecheck', 'test', 'check')}}


def configure(args):
    project = Path(args.path).expanduser().resolve()
    if not project.is_dir():
        raise ValueError('Project directory does not exist: ' + str(project))
    packs = args.packs.split(',')
    targets = args.agents.split(',')
    if set(packs) - {'agent', 'quality', 'permissions', 'github'}:
        raise ValueError('Unknown configuration pack')
    if set(targets) - TARGETS.keys():
        raise ValueError('Unknown agent target')
    registry = commands(project)
    files = {}
    if args.with_stack_skills:
        scoped = read_json(ROOT / 'skills/registry.json')['mine']['projectScoped']
        for skill in scoped:
            for folder in (ROOT / 'claude-code/skills').glob('*/' + skill):
                for source in folder.rglob('*'):
                    if source.is_file():
                        files['.claude/skills/' + skill + '/' + str(source.relative_to(folder))] = source.read_text()
    if 'agent' in packs:
        files['scripts/instincts.py'] = (ROOT / 'scripts/instincts.py').read_text()
        files['.claudeignore'] = (ROOT / 'templates/shared/agent/.claudeignore').read_text()
        for source in (ROOT / 'templates/shared/agent/instincts').glob('*.md'):
            files['.claude/instincts/' + source.name] = source.read_text()
        files['AGENTS.md'] = (f'# {project.name}\n\nRead `agent-commands.json` before choosing commands. Null means unavailable.\n'
            'Before non-trivial work, run `python3 scripts/instincts.py select --task "brief task description"` '
            '(add `--scope react` for React-specific rules), then read the returned files. '
            'Selection is keyword-based; check `.claude/instincts/README.md` if nothing matches. '
            'Only accepted lessons are active; explicit user instructions and project policy take precedence.\n'
            '\nUse existing conventions. Make scoped changes and verify with available checks.\n'
            'Report the commands run, results, and any checks unavailable or skipped.\n'
            'Do not commit, push, deploy, or publish unless asked.\n'
            '\n## UI conventions\n\nUse TypeScript, semantic Tailwind tokens, shadcn primitives and Lucide icons where installed.\n'
            'Keep reusable UI separate from features. Respect keyboard access and reduced motion.\n')
        files['agent-commands.json'] = encoded(registry)
        files.update({TARGETS[t]: pointer(t) for t in targets})
        files['scripts/sync-agent-files.py'] = (
            '#!/usr/bin/env python3\nimport pathlib, sys\n'
            'root = pathlib.Path(__file__).resolve().parents[1]\n'
            f'files = { {TARGETS[t]: pointer(t) for t in targets}!r}\n'
            'stale = []\nfor name, content in files.items():\n'
            '    p = root / name\n    if "--check" in sys.argv:\n'
            '        if not p.is_file() or p.read_text() != content: stale.append(name)\n'
            '    else:\n        p.parent.mkdir(parents=True, exist_ok=True)\n        p.write_text(content)\n'
            'if stale: print("Stale pointers: " + ", ".join(stale), file=sys.stderr)\n'
            'sys.exit(bool(stale))\n')
    if 'permissions' in packs:
        settings = profile(args.profile)
        # Project hooks are self-contained; no dependency on a global kit install.
        settings.pop('statusLine', None)
        for groups in settings['hooks'].values():
            for group in groups:
                for hook in group['hooks']:
                    hook['command'] = hook['command'].replace('~/.claude/hooks/', '"$CLAUDE_PROJECT_DIR"/.claude/hooks/')
        files['.claude/settings.json'] = encoded(settings)
        for path in (ROOT / 'claude-code/hooks').glob('*.sh'):
            files['.claude/hooks/' + path.name] = path.read_text()
    if 'quality' in packs:
        checks = [registry[key] for key in ('lint', 'typecheck', 'test', 'build', 'check') if registry[key]]
        files['scripts/verify.sh'] = '#!/usr/bin/env bash\nset -euo pipefail\ncd "$(dirname "$0")/.."\n' + ''.join(
            value + '\n' for value in checks)
        if not checks:
            files['scripts/verify.sh'] += 'echo "No verification scripts available; add checks before relying on verification." >&2\nexit 1\n'
        files['docs/development.md'] = '# Development\n\nRun `bash scripts/verify.sh` for the checks this project exposes.\n\n' + '\n'.join(
            f'- {key}: `{registry[key]}`' if registry[key] else f'- {key}: unavailable; configure before relying on this check.'
            for key in ('lint', 'typecheck', 'test', 'build')) + '\n'
    if 'github' in packs:
        if 'quality' not in packs:
            raise ValueError('github pack requires quality pack')
        pm = registry['packageManager']
        if pm not in ('pnpm', 'npm'):
            raise ValueError('github pack currently supports npm and pnpm only')
        package = read_json(project / 'package.json') if (project / 'package.json').exists() else {}
        version = package.get('packageManager', '').partition('@')[2].split('+')[0] or '10'
        if not re.fullmatch(r'[0-9]+(?:\.[0-9]+){0,2}(?:-[a-zA-Z0-9.-]+)?', version):
            raise ValueError('Invalid package manager version for CI')
        setup = f'      - uses: pnpm/action-setup@v4\n        with:\n          version: "{version}"\n' if pm == 'pnpm' else ''
        files['.github/workflows/verify.yml'] = ('name: Verify\non: [push, pull_request]\njobs:\n  verify:\n'
            '    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n' + setup +
            '      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n'
            f'      - run: {pm} install\n      - run: bash scripts/verify.sh\n')
    # Preflight every conflict before writing anything.
    for name, content in files.items():
        p = project / name
        if any(parent.is_symlink() for parent in p.parents if parent != project and project in parent.parents):
            raise ValueError(f'Conflict: symlinked parent of {p}; no configuration files written')
        if p.is_symlink() or (p.exists() and (not p.is_file() or p.read_text() != content)):
            raise ValueError(f'Conflict: {p}; no configuration files written')
    for name, content in files.items():
        put(project / name, content, args.dry_run)
    if not args.dry_run:
        for name in files:
            if name.endswith('.sh'):
                (project / name).chmod(0o755)


def check():
    errors = []
    # A loadout naming a skill that no longer exists is the way this rots.
    if subprocess.call([sys.executable, str(ROOT / 'scripts/loadouts.py'), 'check']):
        errors.append('Loadouts do not resolve; see the report above')
    for directory, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in {'node_modules', '.git', '.next', '.source', 'build', '__pycache__'}]
        for name in files:
            p = Path(directory) / name
            if p.suffix == '.json':
                try:
                    read_json(p)
                except ValueError:
                    errors.append(f'Invalid JSON: {p.relative_to(ROOT)}')
            elif p.suffix == '.sh':
                result = subprocess.run(['bash', '-n', str(p)], capture_output=True, text=True)
                if result.returncode:
                    errors.append(f'Invalid shell syntax: {p.relative_to(ROOT)}: {result.stderr}')
    skills = list((ROOT / 'claude-code/skills').glob('*/*/SKILL.md'))
    names = [p.parent.name for p in skills]
    readme = (ROOT / 'README.md').read_text()
    counts = {'Skills (mine)': len(skills),
              'Subagents': len(list((ROOT / 'claude-code/agents').glob('*.md'))),
              'Hooks': len(list((ROOT / 'claude-code/hooks').glob('*.sh'))),
              'Slash commands': len(list((ROOT / 'claude-code/commands').glob('*.md'))),
              'Tool pointers': len(TARGETS),
              'Instincts': len([p for p in (ROOT / 'templates/shared/agent/instincts').glob('*.md') if p.name != 'README.md'])}
    for label, expected in counts.items():
        match = re.search(r'\|\s*' + re.escape(label) + r'\s*\|\s*\**(\d+)', readme)
        if not match or int(match[1]) != expected:
            errors.append(f'README count drift: {label} should be {expected}')
    if len(names) != len(set(names)):
        errors.append('Duplicate skill directory names')
    for scope in ('parked', 'projectScoped'):
        for name in read_json(ROOT / 'skills/registry.json')['mine'][scope]:
            if name not in names:
                errors.append(f'Registry references missing skill: {name}')
    for p in skills:
        front = p.read_text().split('---', 2)
        for field in ('name', 'description', 'source'):
            if len(front) < 3 or not re.search(r'^' + field + ':', front[1], re.M):
                errors.append(f'{p.relative_to(ROOT)} missing {field}')
    for name in read_json(ROOT / 'claude-code/profiles.json')['profiles']:
        profile(name)
    settings = profile('permissive')
    for groups in settings['hooks'].values():
        for group in groups:
            for hook in group['hooks']:
                p = ROOT / 'claude-code/hooks' / Path(hook['command']).name
                if not p.is_file() or not os.access(p, os.X_OK):
                    errors.append(f'Missing or nonexecutable hook: {p}')
    for target, name in TARGETS.items():
        p = ROOT / 'templates/shared/agent' / name
        if not p.is_file() or p.read_text() != pointer(target):
            errors.append(f'Stale canonical pointer: {name}')
    for error in errors:
        print(error, file=sys.stderr)
    result = subprocess.run([sys.executable, str(ROOT / 'scripts/instincts.py'), 'check',
                             '--directory', str(ROOT / 'templates/shared/agent/instincts')], capture_output=True, text=True)
    if result.returncode:
        errors.append('Instinct metadata validation failed')
        print(result.stdout + result.stderr, file=sys.stderr)
    else:
        for warning in json.loads(result.stdout)['warnings']:
            print('Warning: ' + warning, file=sys.stderr)
    print(f'Repository checks: {len(errors)} problem(s); {len(skills)} skills, {len(list((ROOT / "claude-code/agents").glob("*.md")))} agents')
    return bool(errors)


def sync(root, checking):
    stale = []
    for target, name in TARGETS.items():
        p = root / name
        content = pointer(target)
        if checking:
            if not p.is_file() or p.read_text() != content:
                stale.append(name)
        else:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content)
    if stale:
        print('Stale pointers: ' + ', '.join(stale), file=sys.stderr)
    return bool(stale)


def main():
    raw = sys.argv[1:]
    delegated = {'instincts': 'instincts.py', 'evals': 'behavior_evals.py',
                 'loadouts': 'loadouts.py'}
    if raw and raw[0] in delegated:
        return subprocess.call([sys.executable, str(ROOT / 'scripts' / delegated[raw[0]]), *raw[1:]])
    if '--project' in raw:
        index = raw.index('--project')
        raw[index] = 'configure'
        if index + 1 == len(raw) or raw[index + 1].startswith('--'):
            raw.insert(index + 1, '.')
    if raw and raw[0] == 'sync':
        return sync(Path(raw[1]).resolve(), '--check' in raw)
    if raw == ['check']:
        return check()
    if raw == ['--list-presets']:
        for name, value in read_json(ROOT / 'templates/recipes.json').items():
            print(name, value['source'])
        return 0
    if '--profile' in raw and not any(action in raw for action in ('new', 'configure')):
        parser = argparse.ArgumentParser()
        parser.add_argument('--profile', required=True)
        parser.add_argument('--dry-run', action='store_true')
        args = parser.parse_args(raw)
        # Render only: never replace an existing global configuration implicitly.
        print(encoded(profile(args.profile)), end='')
        return 0
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['new', 'configure'])
    parser.add_argument('path')
    parser.add_argument('destination', nargs='?')
    parser.add_argument('--profile', default='permissive')
    parser.add_argument('--packs', default='agent,quality,permissions')
    parser.add_argument('--agents', default=','.join(TARGETS))
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--starter-version', default='latest')
    parser.add_argument('--with-stack-skills', action='store_true')
    if raw and raw[0] == '--project':
        raw[0] = 'configure'
        if len(raw) == 1 or raw[1].startswith('--'):
            raw.insert(1, '.')
    args = parser.parse_args(raw)
    profile(args.profile)
    recipes = read_json(ROOT / 'templates/recipes.json')
    if set(args.packs.split(',')) - {'agent', 'quality', 'permissions', 'github'}:
        raise ValueError('Unknown configuration pack')
    if set(args.agents.split(',')) - TARGETS.keys():
        raise ValueError('Unknown agent target')
    if 'github' in args.packs.split(',') and 'quality' not in args.packs.split(','):
        raise ValueError('github pack requires quality pack')
    if args.action == 'new':
        if args.path not in recipes or not args.destination:
            raise ValueError('Usage: bootstrap.sh new PRESET DESTINATION')
        recipe = recipes[args.path]
        dest = Path(args.destination).expanduser().resolve()
        if dest.exists():
            raise ValueError('New project destination must not exist')
        cmd = ['pnpm', 'dlx', 'shadcn@' + args.starter_version, 'init', '--template', recipe['template'],
               '--base', 'radix', '--preset', 'nova', '--name', dest.name,
               '--monorepo' if recipe['monorepo'] else '--no-monorepo']
        print('Starter:', ' '.join(cmd), 'in', dest.parent, flush=True)
        if args.dry_run:
            print('Then apply packs:', args.packs, '; profile:', args.profile)
            return 0
        if not dest.parent.is_dir():
            raise ValueError('Destination parent must exist')
        subprocess.run(cmd, cwd=dest.parent, check=True)
        args.path = str(dest)
    configure(args)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
