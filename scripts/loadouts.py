#!/usr/bin/env python3
"""Resolve role x stack loadouts into an explained install plan."""
import json
import os
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'claude-code/loadouts.json'
KINDS = ('skills', 'subagents', 'hooks', 'mcp', 'instincts', 'workflows')


def read():
    return json.loads(SOURCE.read_text())


def layers(data, name, seen=None):
    seen = seen or []
    if name in seen:
        raise ValueError('Cycle in extends: ' + ' -> '.join(seen + [name]))
    if name not in data['loadouts']:
        raise ValueError('Unknown loadout: ' + name)
    entry = data['loadouts'][name]
    parent = entry.get('extends')
    return (layers(data, parent, seen + [name]) if parent else []) + [name]


def resolve(data, names):
    """Later layers win on `why`; order of first appearance is preserved."""
    plan = {kind: {} for kind in KINDS}
    for name in names:
        for layer in layers(data, name):
            provides = data['loadouts'][layer].get('provides', {})
            for kind, items in provides.items():
                if kind not in KINDS:
                    continue  # check() reports it; resolving must not crash on it
                for item in items:
                    existing = plan[kind].get(item['id'], {})
                    plan[kind][item['id']] = {**existing, **item, 'from': layer}
    return plan


def vendored(kind):
    if kind == 'skills':
        return {p.parent.name for p in (ROOT / 'claude-code/skills').glob('*/*/SKILL.md')}
    if kind == 'subagents':
        return {p.stem for p in (ROOT / 'claude-code/agents').glob('*.md')}
    if kind == 'hooks':
        return {p.stem for p in (ROOT / 'claude-code/hooks').glob('*.sh')}
    if kind == 'instincts':
        return {p.stem for p in (ROOT / 'templates/shared/agent/instincts').glob('*.md')} - {'README'}
    return None  # mcp and workflows are not files in this repo


def known(kind):
    files = vendored(kind)
    if kind != 'skills' or files is None:
        return files
    store = Path.home() / '.agents/skills'
    # A parked skill is still installed, so it counts as known.
    return files | ({p.name for p in store.iterdir()} if store.exists() else set())


def installer_repos(source=None):
    """Repositories install-third-party.sh installs skills from."""
    text = (source or ROOT / 'skills/install-third-party.sh').read_text()
    block = text.partition('REPOS=(')[2].partition(')')[0]
    repos = set()
    for line in block.splitlines():
        name = line.split('#')[0].strip()
        if name:
            repos.add(name)
    for match in re.finditer(r'skills@latest add ([\w.-]+/[\w.-]+)', text):
        repos.add(match[1])
    return repos


def expand(data, target):
    return data['presets'][target] if target in data.get('presets', {}) else [target]


def show(target, explain=False):
    data = read()
    plan = resolve(data, expand(data, target))
    print(f"loadout: {target}")
    if target in data.get('presets', {}):
        print('  composed of: ' + ', '.join(data['presets'][target]))
    for kind in KINDS:
        items = plan[kind]
        if not items:
            continue
        print(f"\n{kind}")
        for item in items.values():
            scope = f" [{item['scope']}]" if item.get('scope') else ''
            gate = ' [blocking]' if item.get('blocking') else ''
            need = ' needs ' + ', '.join(item['needs']) if item.get('needs') else ''
            print(f"  {item['id']}{scope}{gate}{need}")
            print(f"    {item['why']}")
            if explain:
                print(f"    via {item['from']}")
    return 0


def missing_env(plan):
    return sorted({v for item in plan['mcp'].values() for v in item.get('needs', [])
                   if not os.environ.get(v)})


def check():
    data = read()
    problems = []
    repos = installer_repos()
    for name, entry in data['loadouts'].items():
        for kind, items in entry.get('provides', {}).items():
            if kind not in KINDS:
                problems.append(f'{name}: unknown kind {kind}')
                continue
            catalog = known(kind)
            files = vendored(kind)
            for item in items:
                if not item.get('why'):
                    problems.append(f'{name}: {kind}/{item["id"]} has no `why`')
                upstream = item.get('external')
                if upstream and kind != 'skills':
                    problems.append(f'{name}: {kind}/{item["id"]} cannot be external; only skills come from the store')
                elif upstream and item['id'] in (files or ()):
                    problems.append(f'{name}: {kind}/{item["id"]} is vendored in this repo; drop `external`')
                elif upstream and upstream not in repos:
                    problems.append(f'{name}: {kind}/{item["id"]} names {upstream}, which install-third-party.sh does not install')
                elif not upstream and catalog is not None and item['id'] not in catalog:
                    problems.append(f'{name}: {kind}/{item["id"]} does not exist in this repo')
                if kind == 'skills' and item.get('scope') not in ('global', 'project'):
                    problems.append(f'{name}: skills/{item["id"]} needs scope global or project')
    for name, parts in data.get('presets', {}).items():
        for part in parts:
            if part not in data['loadouts']:
                problems.append(f'preset {name}: unknown loadout {part}')
        try:
            resolve(data, parts)
        except ValueError as error:
            problems.append(f'preset {name}: {error}')
    for problem in problems:
        print('  ✗ ' + problem)
    if not problems:
        total = len(data['loadouts'])
        print(f'  ✓ {total} loadouts, {len(data.get("presets", {}))} presets, every item has a reason')
    return 1 if problems else 0


def main():
    args = sys.argv[1:]
    if not args or args[0] in ('-h', '--help'):
        print(__doc__)
        print('  loadouts list\n  loadouts show <name> [--explain]\n  loadouts check')
        return 0
    if args[0] == 'list':
        data = read()
        for name, entry in data['loadouts'].items():
            print(f"  {name:26} {entry.get('description', '')}")
        print()
        for name, parts in data.get('presets', {}).items():
            print(f"  {name:26} = {' + '.join(parts)}")
        return 0
    if args[0] == 'show' and len(args) > 1:
        return show(args[1], '--explain' in args)
    if args[0] == 'check':
        return check()
    print('Unknown command: ' + args[0], file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main())
