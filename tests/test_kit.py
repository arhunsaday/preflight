import importlib.util
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
import subprocess
import sys
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('kit', Path(__file__).resolve().parents[1] / 'scripts/kit.py')
kit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kit)


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.output = patch('builtins.print')
        self.output.start()
        self.addCleanup(self.output.stop)

    def args(self, path, **overrides):
        values = dict(path=str(path), packs='agent,quality,permissions', agents=','.join(kit.TARGETS),
                      profile='permissive', dry_run=False, with_stack_skills=False)
        values.update(overrides)
        return SimpleNamespace(**values)

    def test_install_repeat_and_all_pointer_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            kit.configure(self.args(root))
            kit.configure(self.args(root))
            self.assertFalse(kit.sync(root, True))
            for name in kit.TARGETS.values():
                path = root / name
                original = path.read_text()
                path.write_text('changed')
                self.assertTrue(kit.sync(root, True))
                path.write_text(original)

    def test_conflict_is_atomic(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'AGENTS.md').write_text('mine')
            with self.assertRaises(ValueError):
                kit.configure(self.args(root))
            self.assertEqual(list(root.iterdir()), [root / 'AGENTS.md'])

    def test_dry_run(self):
        with tempfile.TemporaryDirectory() as directory:
            kit.configure(self.args(directory, dry_run=True))
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_default_preserves_permissions(self):
        baseline = kit.read_json(kit.ROOT / 'claude-code/settings.json')['permissions']
        actual = kit.profile('permissive')['permissions']
        self.assertEqual(actual['allow'], baseline['allow'])
        self.assertEqual(actual['deny'], baseline['deny'])

    def test_commands_reflect_package_scripts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'package.json').write_text('{"packageManager":"pnpm@10.0.0","scripts":{"lint":"eslint"}}')
            result = kit.commands(root)
            self.assertEqual(result['lint'], 'pnpm run lint')
            self.assertIsNone(result['test'])

    def test_empty_verification_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            kit.configure(self.args(directory, packs='quality'))
            result = subprocess.run(['bash', directory + '/scripts/verify.sh'], capture_output=True)
            self.assertNotEqual(result.returncode, 0)

    def test_symlink_parent_rejected_before_writes(self):
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as other:
            root = Path(directory)
            (root / '.claude').symlink_to(other)
            with self.assertRaises(ValueError):
                kit.configure(self.args(root))
            self.assertEqual(list(Path(other).iterdir()), [])
            self.assertFalse((root / 'AGENTS.md').exists())

    def test_portable_pointer_checker(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            kit.configure(self.args(root, packs='agent', agents='claude,codex'))
            script = [sys.executable, str(root / 'scripts/sync-agent-files.py'), '--check']
            self.assertEqual(subprocess.run(script, capture_output=True).returncode, 0)
            (root / 'CODEX.md').write_text('drift')
            self.assertEqual(subprocess.run(script, capture_output=True).returncode, 1)

    def test_instinct_tools_are_portable_and_metadata_is_valid(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            kit.configure(self.args(root, packs='agent'))
            result = subprocess.run([sys.executable, 'scripts/instincts.py', 'check'], cwd=root, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            result = subprocess.run([sys.executable, 'scripts/instincts.py', 'select', '--task', 'writing unit tests'], cwd=root, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('testing-pattern', result.stdout)

    def test_new_dry_run_never_executes_starter(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(sys, 'argv', ['kit', 'new', 'vite-shadcn', directory + '/app', '--dry-run']), patch.object(kit.subprocess, 'run') as run:
                self.assertEqual(kit.main(), 0)
                run.assert_not_called()
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_flag_order_project_alias(self):
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run(['bash', str(kit.ROOT / 'bootstrap.sh'), '--dry-run', '--project', directory], capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_alternative_profiles_retain_denials(self):
        base = kit.profile('permissive')['permissions']
        for name in ('safe', 'developer', 'ops'):
            selected = kit.profile(name)['permissions']
            self.assertEqual(selected['deny'], base['deny'])
            self.assertNotEqual(selected['allow'], base['allow'])
