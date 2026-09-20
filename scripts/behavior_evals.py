#!/usr/bin/env python3
"""Prepare isolated behavioral trials and grade human review plus file outcomes.

Never launches a model or executes commands from a fixture or transcript.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]


def cases():
    return json.loads((ROOT / 'evals/cases.json').read_text())


def digest(content):
    return hashlib.sha256(content).hexdigest()


def snapshot(workspace):
    result = {}
    for path in sorted(workspace.rglob('*')):
        relative = str(path.relative_to(workspace))
        if path.is_symlink():
            result[relative] = 'symlink'
        elif path.is_file():
            result[relative] = digest(path.read_bytes())
    return result


def child(root, name):
    relative = Path(name)
    if relative.is_absolute() or not relative.parts or '..' in relative.parts:
        raise ValueError('Paths must stay inside the trial: ' + name)
    path = root / relative
    if path.is_symlink() or any(p.is_symlink() for p in path.parents if p != root and root in p.parents):
        raise ValueError('Symlinked trial paths are not supported')
    return path


def prepare(name, destination):
    catalog = cases()
    if name not in catalog:
        raise ValueError('Unknown scenario: ' + name)
    run = Path(destination).expanduser().absolute()
    if run.exists() or run.is_symlink():
        raise ValueError('Trial directory must not already exist')
    case = catalog[name]
    for relative in case['files']:
        child(run / 'workspace', relative)
    run.mkdir(parents=True)
    workspace = run / 'workspace'
    workspace.mkdir()
    subprocess.run([sys.executable, str(ROOT / 'scripts/kit.py'), 'configure', str(workspace),
                    '--packs', 'agent'], check=True, capture_output=True, text=True)
    for relative, content in case['files'].items():
        target = child(workspace, relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
    trial_id = str(uuid.uuid4())
    manifest = dict(schema=1, trial_id=trial_id, case_id=name, case=case, baseline=snapshot(workspace))
    (run / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (run / 'PROMPT.md').write_text(case['prompt'] + '\n')
    review = dict(trial_id=trial_id, reviewer='', agent='', transcript='transcript.txt',
                  criteria={key: dict(passed=None, evidence='', rubric=value) for key, value in case['criteria'].items()})
    (run / 'review.json').write_text(json.dumps(review, indent=2) + '\n')
    return run


def grade(directory, review_path):
    run = Path(directory).expanduser().resolve()
    manifest = json.loads((run / 'manifest.json').read_text())
    review = json.loads(Path(review_path).read_text())
    case = manifest['case']
    issues = []
    complete = True
    if review.get('trial_id') != manifest['trial_id']:
        issues.append('Review belongs to a different trial')
        complete = False
    if not review.get('reviewer', '').strip() or not review.get('agent', '').strip():
        issues.append('Reviewer and agent/model identification required')
        complete = False
    transcript = child(run, review.get('transcript', 'transcript.txt'))
    transcript_hash = None
    if not transcript.is_file() or not transcript.stat().st_size:
        issues.append('Nonempty transcript required')
        complete = False
    else:
        transcript_hash = digest(transcript.read_bytes())
    for key in case['criteria']:
        item = review.get('criteria', {}).get(key, {})
        if type(item.get('passed')) is not bool or not item.get('evidence', '').strip():
            issues.append('Incomplete review criterion: ' + key)
            complete = False
        elif item['passed'] is False:
            issues.append('Failed review criterion: ' + key)
    current = snapshot(run / 'workspace')
    if case.get('unchanged') and current != manifest['baseline']:
        issues.append('Workspace changed during a read-only trial')
    for name, content in case.get('expected', {}).items():
        if current.get(name) != digest(content.encode()):
            issues.append('Expected artifact missing or incorrect: ' + name)
    return dict(case_id=manifest['case_id'], trial_id=manifest['trial_id'],
                method='human-review-and-artifact-checks', passed=not issues,
                review_status='complete' if complete else 'incomplete',
                agent=review.get('agent'), reviewer=review.get('reviewer'),
                transcript_sha256=transcript_hash, issues=issues)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('list')
    p = sub.add_parser('prepare')
    p.add_argument('case', choices=sorted(cases()))
    p.add_argument('destination')
    p = sub.add_parser('grade')
    p.add_argument('directory')
    p.add_argument('--review', required=True)
    args = parser.parse_args(argv)
    if args.command == 'list':
        print('\n'.join(cases()))
    elif args.command == 'prepare':
        print(prepare(args.case, args.destination))
    else:
        report = grade(args.directory, args.review)
        print(json.dumps(report, indent=2))
        return not report['passed']
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, OSError, KeyError, TypeError, AttributeError, subprocess.CalledProcessError) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
