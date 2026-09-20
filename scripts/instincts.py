#!/usr/bin/env python3
"""Local, reviewed lessons. No model calls, automatic promotion, or global writes."""
import argparse
from datetime import date
import json
import os
from pathlib import Path
import re
import sys
import tempfile

SLUG = re.compile(r'[a-z0-9]+(?:-[a-z0-9]+)*')
REQUIRED = ('id', 'trigger', 'domain', 'scope', 'status', 'source', 'evidence')
STOP = {'a', 'an', 'the', 'when', 'before', 'after', 'to', 'in', 'of', 'for', 'and', 'or', 'with', 'your',
        'write', 'writing', 'read', 'reading', 'use', 'using'}


def safe_path(directory, name):
    if not SLUG.fullmatch(name):
        raise ValueError('ID must be a lowercase kebab-case slug')
    directory = Path(directory).expanduser().absolute()
    if directory.is_symlink() or directory.parent.is_symlink():
        raise ValueError('Symlinked instinct directories are not supported')
    path = directory / (name + '.md')
    if path.is_symlink():
        raise ValueError('Symlinked instincts are not supported: ' + str(path))
    return path


def read(path):
    """Parse deliberately limited flat scalar frontmatter, not arbitrary YAML."""
    if path.is_symlink():
        raise ValueError('Symlinked instinct: ' + str(path))
    text = path.read_text()
    if not text.startswith('---\n') or '\n---\n' not in text[4:]:
        raise ValueError('Missing frontmatter')
    front, body = text[4:].split('\n---\n', 1)
    record = {}
    for line in front.splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        key, sep, value = line.partition(':')
        if not sep or not re.fullmatch(r'[a-z_]+', key) or key in record:
            raise ValueError('Invalid or duplicate metadata key: ' + key)
        value = value.strip()
        if value.startswith('"'):
            value = json.loads(value)
        elif value.startswith("'"):
            if not value.endswith("'") or len(value) < 2:
                raise ValueError('Unclosed quoted value: ' + key)
            value = value[1:-1].replace("''", "'")
        if not isinstance(value, str):
            raise ValueError('Metadata must be scalar strings: ' + key)
        record[key] = value
    record['_body'] = body
    validate(record)
    if record['id'] != path.stem:
        raise ValueError('ID must match filename')
    return record


def validate(record):
    for key in REQUIRED:
        if not isinstance(record.get(key), str) or not record[key].strip():
            raise ValueError('Missing metadata: ' + key)
    for key in ('id', 'scope', 'domain'):
        if not SLUG.fullmatch(record[key]):
            raise ValueError('Invalid slug: ' + key)
    if record['status'] not in ('proposed', 'accepted', 'retired'):
        raise ValueError('Invalid status')
    if not record.get('_body', '').strip():
        raise ValueError('Missing rule body')
    if record['status'] != 'proposed':
        if not record.get('reviewed_by', '').strip():
            raise ValueError('Accepted/retired rules need reviewed_by')
        reviewed = date.fromisoformat(record.get('last_reviewed', ''))
        if reviewed > date.today():
            raise ValueError('Review date cannot be in the future')
    if 'confidence' in record and not 0 <= float(record['confidence']) <= 1:
        raise ValueError('Confidence must be between 0 and 1; it is not policy priority')


def render(record):
    return '---\n' + ''.join(f'{key}: {json.dumps(value, ensure_ascii=False)}\n'
                            for key, value in record.items() if not key.startswith('_')) + '---\n' + record['_body']


def propose(directory, name, *, trigger, domain, scope, action, evidence, source):
    path = safe_path(directory, name)
    record = dict(id=name, trigger=trigger, domain=domain, scope=scope, status='proposed',
                  source=source, evidence=evidence, _body='\n# ' + name + '\n\n' + action.strip() + '\n')
    if not action.strip():
        raise ValueError('Action must not be empty')
    validate(record)
    if path.exists():
        raise ValueError('Already exists; existing lesson preserved: ' + str(path))
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x') as output:
        output.write(render(record))
    return path


def transition(directory, name, status, reviewer):
    if status not in ('accepted', 'retired') or not reviewer.strip():
        raise ValueError('A valid state and reviewer are required')
    path = safe_path(directory, name)
    record = read(path)
    if record['status'] == 'retired' and status == 'accepted':
        raise ValueError('Retired lessons stay retired; propose a revised lesson with a new ID')
    record.update(status=status, reviewed_by=reviewer, last_reviewed=date.today().isoformat())
    validate(record)
    # Replace atomically, so interrupted reviews leave the old file intact.
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, delete=False) as output:
            temporary = Path(output.name)
            output.write(render(record))
        temporary.chmod(path.stat().st_mode & 0o777)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()
    return path


def inventory(directory):
    directory = Path(directory).expanduser()
    if not directory.is_dir():
        raise ValueError('Instinct directory does not exist: ' + str(directory))
    records = []
    for path in sorted(directory.glob('*.md')):
        if path.name == 'README.md':
            continue
        safe_path(directory, path.stem)
        record = read(path)
        record['path'] = str(path)
        records.append(record)
    return records


def tokens(text):
    return set(re.findall(r'[a-z0-9]+', text.lower())) - STOP


def select(directory, task, scope='universal', limit=5):
    if not 1 <= limit <= 20:
        raise ValueError('Limit must be between 1 and 20')
    query = tokens(task)
    ranked = []
    for record in inventory(directory):
        if record['status'] != 'accepted' or record['scope'] not in ('universal', scope):
            continue
        score = len(query & tokens(' '.join(record[key] for key in ('id', 'trigger', 'domain'))))
        if score:
            ranked.append((score, record))
    ranked.sort(key=lambda pair: (-pair[0], pair[1]['id']))
    return [{key: value for key, value in record.items() if not key.startswith('_')}
            for _, record in ranked[:limit]]


def check(directory, max_age=180):
    errors, warnings = [], []
    directory = Path(directory).expanduser()
    if not directory.is_dir():
        return ['Missing instinct directory: ' + str(directory)], warnings
    for path in sorted(directory.glob('*.md')):
        if path.name == 'README.md':
            continue
        try:
            safe_path(directory, path.stem)
            record = read(path)
            if record['status'] == 'accepted' and (date.today() - date.fromisoformat(record['last_reviewed'])).days > max_age:
                warnings.append(f'{path.name}: stale review (older than {max_age} days)')
        except (ValueError, OSError) as error:
            errors.append(f'{path.name}: {error}')
    return errors, warnings


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    for command in ('list', 'select', 'check', 'propose', 'accept', 'retire'):
        p = sub.add_parser(command)
        p.add_argument('--directory', default='.claude/instincts')
        if command == 'select':
            p.add_argument('--task', required=True)
            p.add_argument('--scope', default='universal')
            p.add_argument('--limit', type=int, default=5)
        elif command == 'propose':
            p.add_argument('id')
            for field in ('trigger', 'domain', 'action', 'evidence', 'source'):
                p.add_argument('--' + field, required=True)
            p.add_argument('--scope', default='universal')
        elif command in ('accept', 'retire'):
            p.add_argument('id')
            p.add_argument('--reviewed-by', required=True)
    args = parser.parse_args(argv)
    if args.command == 'check':
        errors, warnings = check(args.directory)
        print(json.dumps({'errors': errors, 'warnings': warnings}, indent=2))
        return bool(errors)
    if args.command == 'propose':
        print(propose(args.directory, args.id, **{key: getattr(args, key) for key in ('trigger', 'domain', 'scope', 'action', 'evidence', 'source')}))
    elif args.command in ('accept', 'retire'):
        print(transition(args.directory, args.id, 'accepted' if args.command == 'accept' else 'retired', args.reviewed_by))
    else:
        records = select(args.directory, args.task, args.scope, args.limit) if args.command == 'select' else inventory(args.directory)
        print(json.dumps([{k: v for k, v in r.items() if not k.startswith('_')} for r in records], indent=2))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, OSError) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
